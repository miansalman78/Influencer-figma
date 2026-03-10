const Campaign = require('../models/Campaign');
const User = require('../models/User');
const { successResponse, errorResponse, createdResponse, notFoundResponse } = require('../utils/response');
const { applyPagination } = require('../utils/pagination');
const { sanitizeString } = require('../utils/helpers');
const { createNotification } = require('../utils/notificationHelpers');
const { getConnectedCreatorIds } = require('./connectionController');

// Create campaign
const createCampaign = async (req, res) => {
  try {
    const campaignData = sanitizeCampaignData(req.body);
    campaignData.brandId = req.user._id;

    const campaign = await createNewCampaign(campaignData);

    // Notify creators connected to this brand about the new campaign
    try {
      const creatorIds = await getConnectedCreatorIds(req.user._id);
      const brandName = req.user.companyName || req.user.name || 'A brand';
      for (const creatorId of creatorIds) {
        await createNotification({
          userId: creatorId,
          type: 'campaign_new_from_connection',
          title: 'New campaign from a brand you\'re connected with',
          body: `${brandName} posted a new campaign: ${(campaign.name || 'New campaign').slice(0, 60)}`,
          data: { campaignId: campaign._id.toString(), brandId: req.user._id.toString() },
          actorId: req.user._id,
          dedupeData: { campaignId: campaign._id },
        });
      }
    } catch (notifErr) {
      console.warn('[createCampaign] Failed to notify connected creators:', notifErr.message);
    }

    return createdResponse(res, campaign, 'Campaign created successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get all campaigns (public - for creators to browse)
const getCampaigns = async (req, res) => {
  try {
    const {
      page, limit, status, platform, budget, city, state, country, radius, latitude, longitude,
      mainGoal, compensationType, search, serviceType, service, deliverables, niche, minFollowers, minEngagement
    } = req.query;
    // Support both "service" and "deliverables" for filtering by deliverable type
    const serviceFilter = service || deliverables;
    const query = buildCampaignQuery({
      status, platform, budget, city, state, country, radius, latitude, longitude,
      mainGoal, compensationType, search, serviceType, service: serviceFilter, niche, minFollowers, minEngagement
    })
      .populate('brandId', 'name profileImage companyName companyLogo category industry')
      // Include applicants to accurately compute applicantCount for listing, then strip it before responding
      .select('name description budget budgetRange currency platform status location brandId applicants applicantCount applicationDeadline deliverables niche requirements media');

    const { data, pagination } = await applyPagination(query, page, limit);

    // Post-process to supply correct applicantCount while hiding applicants array from public listing
    const campaigns = (data || []).map(doc => {
      const obj = doc.toObject ? doc.toObject({ virtuals: true }) : doc;
      const applicantCount =
        Array.isArray(obj.applicants) ? obj.applicants.length :
        (typeof obj.applicantCount === 'number' ? obj.applicantCount : 0);
      if (obj.applicants !== undefined) delete obj.applicants;
      return { ...obj, applicantCount };
    });

    return successResponse(res, { campaigns, pagination }, 'Campaigns retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get brand's own campaigns
const getMyCampaigns = async (req, res) => {
  try {
    const brandId = req.user._id;
    const { page, limit, status } = req.query;
    const Proposal = require('../models/Proposal');

    let query = Campaign.find({ brandId })
      .populate('hiredCreators', 'name email profileImage')
      .sort({ createdAt: -1 });

    if (status) {
      query = query.where({ status });
    }

    const { data, pagination } = await applyPagination(query, page, limit);

    // Add proposals count to each campaign
    const campaignsWithProposals = await Promise.all(
      data.map(async (campaign) => {
        // Convert Mongoose document to plain object to ensure all fields (including media) are included
        const campaignObj = campaign.toObject ? campaign.toObject({ virtuals: true }) : campaign;
        const proposalsCount = await Proposal.countDocuments({
          campaignId: campaign._id,
          status: { $ne: 'withdrawn' } // Exclude withdrawn proposals
        });
        return {
          ...campaignObj,
          proposalsCount,
          // Ensure media is included
          media: campaignObj.media || campaign.media || []
        };
      })
    );

    return successResponse(res, { campaigns: campaignsWithProposals, pagination }, 'Campaigns retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get campaign by ID
const getCampaignById = async (req, res) => {
  try {
    const campaignId = req.params.id;
    let campaign = await Campaign.findById(campaignId)
      .populate('brandId', 'name email profileImage companyName brandTagline industry');

    if (!campaign) {
      return notFoundResponse(res, 'Campaign not found');
    }

    const campaignObj = campaign.toObject({ virtuals: true });

    // Privacy Logic: Only show applicant/hired lists to the brand that owns the campaign
    // For others, only the virtual counts (applicantCount, hiredCount) will be visible
    const isOwner = req.user && campaign.brandId &&
      (campaign.brandId._id || campaign.brandId).toString() === req.user._id.toString();

    if (isOwner) {
      // If owner, populate the full lists
      const populatedCampaign = await Campaign.findById(campaignId)
        .populate('brandId', 'name email profileImage companyName brandTagline industry')
        .populate('applicants', 'name email profileImage ratings services socialAccounts location')
        .populate('hiredCreators', 'name email profileImage ratings services socialAccounts location');

      const Proposal = require('../models/Proposal');
      const proposalsCount = await Proposal.countDocuments({
        campaignId: campaign._id,
        status: { $ne: 'withdrawn' }
      });

      const fullCampaignObj = populatedCampaign.toObject({ virtuals: true });
      return successResponse(res, { ...fullCampaignObj, proposalsCount }, 'Campaign retrieved successfully');
    }

    // For non-owners (creators/public), strip the applicants and hiredCreators lists
    // The virtual virtuals applicantCount and hiredCount will still remain in campaignObj
    delete campaignObj.applicants;
    delete campaignObj.hiredCreators;

    return successResponse(res, campaignObj, 'Campaign retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Update campaign
const updateCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;
    const userId = req.user._id;

    const campaign = await findCampaignById(campaignId);
    if (!campaign) {
      return notFoundResponse(res, 'Campaign not found');
    }

    // Handle populated brandId (object) or plain ObjectId
    const brandIdStr = (campaign.brandId && campaign.brandId._id)
      ? campaign.brandId._id.toString()
      : campaign.brandId.toString();

    if (brandIdStr !== userId.toString()) {
      return errorResponse(res, 'Not authorized to update this campaign', 403);
    }

    const updateData = sanitizeCampaignData(req.body);
    const updatedCampaign = await updateCampaignById(campaignId, updateData);

    return successResponse(res, updatedCampaign, 'Campaign updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Delete campaign
const deleteCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;
    const userId = req.user._id;

    const campaign = await findCampaignById(campaignId);
    if (!campaign) {
      return notFoundResponse(res, 'Campaign not found');
    }

    // Handle populated brandId (object) or plain ObjectId
    const brandIdStr = (campaign.brandId && campaign.brandId._id)
      ? campaign.brandId._id.toString()
      : campaign.brandId.toString();

    if (brandIdStr !== userId.toString()) {
      return errorResponse(res, 'Not authorized to delete this campaign', 403);
    }

    await deleteCampaignById(campaignId);
    return successResponse(res, null, 'Campaign deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Publish campaign (change status from draft to open)
const publishCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;
    const userId = req.user._id;

    const campaign = await findCampaignById(campaignId);
    if (!campaign) {
      return notFoundResponse(res, 'Campaign not found');
    }

    // Handle populated brandId (object) or plain ObjectId
    const brandIdStr = (campaign.brandId && campaign.brandId._id)
      ? campaign.brandId._id.toString()
      : campaign.brandId.toString();

    if (brandIdStr !== userId.toString()) {
      return errorResponse(res, 'Not authorized to publish this campaign', 403);
    }

    if (campaign.status !== 'draft') {
      return errorResponse(res, `Campaign cannot be published. Current status: ${campaign.status}`, 400);
    }

    // Validate required fields before publishing
    const missingFields = [];
    if (!campaign.name) missingFields.push('name');
    if (!campaign.description) missingFields.push('description');
    if (!campaign.platform || campaign.platform.length === 0) missingFields.push('platform');
    if (!campaign.deliverables || campaign.deliverables.length === 0) missingFields.push('deliverables');
    if (!campaign.dueDate) missingFields.push('dueDate');
    if (!campaign.mainGoal) missingFields.push('mainGoal');
    if (!campaign.compensationType) missingFields.push('compensationType');
    if ((campaign.compensationType === 'paid' || campaign.compensationType === 'both') && !campaign.budget) {
      missingFields.push('budget');
    }

    if (missingFields.length > 0) {
      return errorResponse(res, `Campaign is missing required fields: ${missingFields.join(', ')}. Please complete all fields before publishing.`, 400);
    }

    // Validate dueDate is in the future
    if (campaign.dueDate && campaign.dueDate <= new Date()) {
      return errorResponse(res, 'Due date must be in the future', 400);
    }

    // Change status to 'open' (published)
    const updatedCampaign = await updateCampaignById(campaignId, { status: 'open' });

    return successResponse(res, updatedCampaign, 'Campaign published successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Save campaign (bookmark for creators)
const saveCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;
    const userId = req.user._id;

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return notFoundResponse(res, 'Campaign not found');
    }

    // Check if campaign is public and not draft
    if (campaign.status === 'draft' || !campaign.isPublic) {
      return errorResponse(res, 'Campaign is not available to save', 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      return notFoundResponse(res, 'User not found', 404);
    }

    // Check if already saved
    if (!user.savedCampaigns) {
      user.savedCampaigns = [];
    }

    if (user.savedCampaigns.includes(campaignId)) {
      return errorResponse(res, 'Campaign is already saved', 400);
    }

    // Add to saved campaigns
    user.savedCampaigns.push(campaignId);
    await user.save();

    return successResponse(res, { campaignId, saved: true }, 'Campaign saved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Unsave campaign (remove bookmark)
const unsaveCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return notFoundResponse(res, 'User not found', 404);
    }

    if (!user.savedCampaigns || !user.savedCampaigns.includes(campaignId)) {
      return errorResponse(res, 'Campaign is not saved', 400);
    }

    // Remove from saved campaigns
    user.savedCampaigns = user.savedCampaigns.filter(id => id.toString() !== campaignId.toString());
    await user.save();

    return successResponse(res, { campaignId, saved: false }, 'Campaign unsaved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get saved campaigns
const getSavedCampaigns = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit } = req.query;

    const user = await User.findById(userId).select('savedCampaigns');
    if (!user) {
      return notFoundResponse(res, 'User not found', 404);
    }

    if (!user.savedCampaigns || user.savedCampaigns.length === 0) {
      return successResponse(res, { campaigns: [], pagination: { totalItems: 0, page: 1, limit: 10, totalPages: 0 } }, 'No saved campaigns');
    }

    const query = Campaign.find({
      _id: { $in: user.savedCampaigns },
      status: { $ne: 'draft' }, // Don't show draft campaigns
      isPublic: true
    })
      .populate('brandId', 'name email profileImage')
      .sort({ createdAt: -1 });

    const { data, pagination } = await applyPagination(query, page, limit);

    return successResponse(res, { campaigns: data, pagination }, 'Saved campaigns retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Apply to campaign
const applyToCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;
    const userId = req.user._id;

    const campaign = await findCampaignById(campaignId);
    if (!campaign) {
      return notFoundResponse(res, 'Campaign not found');
    }

    if (!campaign.isOpenForApplications()) {
      return errorResponse(res, 'Campaign is not accepting applications', 400);
    }

    await campaign.addApplicant(userId);
    return successResponse(res, null, 'Application submitted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get campaign applicants
const getCampaignApplicants = async (req, res) => {
  try {
    const campaignId = req.params.id;
    const userId = req.user._id;

    const campaign = await findCampaignById(campaignId);
    if (!campaign) {
      return notFoundResponse(res, 'Campaign not found');
    }

    // Handle populated brandId (object) or plain ObjectId
    const brandIdStr = (campaign.brandId && campaign.brandId._id)
      ? campaign.brandId._id.toString()
      : campaign.brandId.toString();

    if (brandIdStr !== userId.toString()) {
      return errorResponse(res, 'Not authorized to view applicants', 403);
    }

    const applicants = await getCampaignApplicantsById(campaignId);
    return successResponse(res, { applicants }, 'Applicants retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Hire creator for campaign (brand can hire multiple creators; update proposal status so hired creator's proposal shows as accepted)
const hireCreator = async (req, res) => {
  try {
    const { campaignId, creatorId } = req.params;
    const userId = req.user._id;

    const campaign = await findCampaignById(campaignId);
    if (!campaign) {
      return notFoundResponse(res, 'Campaign not found');
    }

    // Handle populated brandId (object) or plain ObjectId
    const brandIdStr = (campaign.brandId && campaign.brandId._id)
      ? campaign.brandId._id.toString()
      : campaign.brandId.toString();

    if (brandIdStr !== userId.toString()) {
      return errorResponse(res, 'Not authorized to hire for this campaign', 403);
    }

    await campaign.hireCreator(creatorId);

    // Update the hired creator's proposal status to 'accepted' so it's consistent (one proposal per campaign per creator)
    const Proposal = require('../models/Proposal');
    await Proposal.findOneAndUpdate(
      { campaignId, creatorId, status: 'pending' },
      { status: 'accepted', reviewedAt: new Date(), reviewedBy: userId }
    );

    // Keep campaign status in sync: if still open/accepting_bids, set to in_progress (same as accept proposal flow)
    if (campaign.status === 'open' || campaign.status === 'accepting_bids') {
      campaign.status = 'in_progress';
      await campaign.save();
    }

    return successResponse(res, null, 'Creator hired successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Helper functions
const createNewCampaign = async (campaignData) => {
  const campaign = new Campaign(campaignData);
  return await campaign.save();
};

const findCampaignById = async (campaignId) => {
  return await Campaign.findById(campaignId)
    .populate('brandId', 'name email profileImage companyName brandTagline industry');
};

const updateCampaignById = async (campaignId, updateData) => {
  return await Campaign.findByIdAndUpdate(campaignId, updateData, { new: true, runValidators: true });
};

const deleteCampaignById = async (campaignId) => {
  return await Campaign.findByIdAndDelete(campaignId);
};

const getCampaignApplicantsById = async (campaignId) => {
  return await User.find({ _id: { $in: await getCampaignApplicantIds(campaignId) } })
    .select('name email profileImage ratings services socialAccounts');
};

const getCampaignApplicantIds = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId).select('applicants');
  return campaign ? campaign.applicants : [];
};

const buildCampaignQuery = ({ status, platform, budget, city, state, country, radius, latitude, longitude, mainGoal, compensationType, search, serviceType, service, niche, minFollowers, minEngagement }) => {
  // Include in_progress so campaigns that continue hiring remain visible
  const query = Campaign.find({ isPublic: true, status: { $in: ['open', 'accepting_bids', 'in_progress'] } });

  if (status) {
    query.where({ status });
  }

  if (platform) {
    query.where({ platform: { $in: Array.isArray(platform) ? platform : [platform] } });
  }

  if (mainGoal) {
    query.where({ mainGoal });
  }

  if (compensationType) {
    query.where({ compensationType });
  }

  // Service Type filter
  if (serviceType) {
    query.where({ serviceType });
  }

  // Service/Deliverables filter
  if (service) {
    const services = Array.isArray(service) ? service : [service];
    query.where({ deliverables: { $in: services } });
  }

  // Niche filter (from requirements.niche)
  if (niche) {
    const niches = Array.isArray(niche) ? niche : [niche];
    query.where({ 'requirements.niche': { $in: niches } });
  }

  // Minimum Followers filter (from requirements.followers.min or requirements.followerRange.min)
  if (minFollowers) {
    const minFollowersNum = Number(minFollowers);
    query.or([
      { 'requirements.followers.min': { $lte: minFollowersNum } },
      { 'requirements.followerRange.min': { $lte: minFollowersNum } }
    ]);
  }

  // Minimum Engagement filter (if campaigns have engagement requirements)
  // Note: This might need to be handled client-side as campaigns may not store engagement requirements
  // For now, we'll leave this for client-side filtering if needed

  if (budget) {
    const budgetRange = parseBudgetRange(budget);
    if (budgetRange.min && budgetRange.max) {
      // Check both budget field and budgetRange field
      query.or([
        { budget: { $gte: budgetRange.min, $lte: budgetRange.max } },
        {
          $and: [
            { 'budgetRange.min': { $lte: budgetRange.max } },
            { 'budgetRange.max': { $gte: budgetRange.min } }
          ]
        }
      ]);
    } else if (budgetRange.min) {
      query.or([
        { budget: { $gte: budgetRange.min } },
        { 'budgetRange.max': { $gte: budgetRange.min } }
      ]);
    } else if (budgetRange.max) {
      query.or([
        { budget: { $lte: budgetRange.max } },
        { 'budgetRange.min': { $lte: budgetRange.max } }
      ]);
    }
  }

  // Search functionality
  if (search) {
    const searchRegex = new RegExp(search, 'i');
    query.or([
      { name: searchRegex },
      { description: searchRegex },
      { tags: { $in: [searchRegex] } }
    ]);
  }

  // Location filtering (case-insensitive; country-only or country+state or city all work)
  // Check both location object and requirements.location array
  const toLocationRegex = (val) => (val && typeof val === 'string' && val.trim())
    ? new RegExp(`^${String(val).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    : null;
  if (city) {
    const re = toLocationRegex(city);
    if (re) {
      query.or([
        { 'location.city': re },
        { 'requirements.location': re }
      ]);
    }
  }
  if (state) {
    const re = toLocationRegex(state);
    if (re) {
      query.or([
        { 'location.state': re },
        { 'requirements.location': re }
      ]);
    }
  }
  if (country) {
    const re = toLocationRegex(country);
    if (re) {
      query.or([
        { 'location.country': re },
        { 'requirements.location': re }
      ]);
    }
  }

  // Geo-location filtering (within radius)
  if (latitude && longitude && radius) {
    const radiusInMeters = Number(radius) * 1000; // Convert km to meters
    query.where({
      'location.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [Number(longitude), Number(latitude)]
          },
          $maxDistance: radiusInMeters
        }
      }
    });
  }

  return query.sort({ createdAt: -1 });
};

const parseBudgetRange = (budget) => {
  if (typeof budget === 'string' && budget.includes('-')) {
    const [min, max] = budget.split('-').map(Number);
    return { min, max };
  }
  return { min: Number(budget) };
};

const sanitizeCampaignData = (data) => {
  const allowedFields = [
    'name', 'description', 'budget', 'budgetRange', 'currency', 'platform', 'goals', 'mainGoal',
    'deliverables', 'dueDate', 'startDate', 'endDate', 'applicationDeadline',
    'tags', 'location', 'media', 'requirements', 'status', 'isPublic', 'isUrgent',
    'maxApplicants', 'serviceType', 'campaignDuration', 'postVisibilityDuration',
    'compensationType'
  ];
  const sanitized = {};

  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      if (field === 'name' || field === 'description' || field === 'campaignDuration' || field === 'postVisibilityDuration') {
        sanitized[field] = sanitizeString(data[field]);
      } else if (field === 'location') {
        sanitized[field] = sanitizeLocationData(data[field]);
      } else if (field === 'budgetRange' && data[field] && typeof data[field] === 'object') {
        // Ensure budgetRange has currency if not provided
        sanitized[field] = {
          ...data[field],
          currency: data[field].currency || data.currency || 'NGN'
        };
      } else {
        sanitized[field] = data[field];
      }
    }
  });

  // Set default currency if not provided
  if (!sanitized.currency) {
    sanitized.currency = 'NGN';
  }

  // Ensure budgetRange has currency
  if (sanitized.budgetRange && !sanitized.budgetRange.currency) {
    sanitized.budgetRange.currency = sanitized.currency;
  }

  return sanitized;
};

const sanitizeLocationData = (location) => {
  if (!location || typeof location !== 'object') return location;

  const sanitized = {};
  if (location.city) sanitized.city = sanitizeString(location.city);
  if (location.state) sanitized.state = sanitizeString(location.state);
  if (location.country) sanitized.country = sanitizeString(location.country);
  if (location.coordinates) {
    sanitized.coordinates = {
      latitude: location.coordinates.latitude,
      longitude: location.coordinates.longitude
    };
  }

  return sanitized;
};

module.exports = {
  createCampaign,
  getCampaigns,
  getMyCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  publishCampaign,
  saveCampaign,
  unsaveCampaign,
  getSavedCampaigns,
  applyToCampaign,
  getCampaignApplicants,
  hireCreator
};
