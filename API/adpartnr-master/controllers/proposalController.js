const Proposal = require('../models/Proposal');
const Campaign = require('../models/Campaign');
const Order = require('../models/Order');
const User = require('../models/User');
const { successResponse, errorResponse, createdResponse, notFoundResponse, forbiddenResponse } = require('../utils/response');
const { applyPagination } = require('../utils/pagination');
const { sanitizeString } = require('../utils/helpers');
const { createNotification } = require('../utils/notificationHelpers');

// Create proposal/bid for campaign
const createProposal = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const creatorId = req.user._id;
    const { message, proposedDeliverables, compensation, estimatedDeliveryDays, duration } = req.body;

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return notFoundResponse(res, 'Campaign not found');
    }

    // Handle populated or plain ObjectId
    const campaignBrandId = (campaign.brandId && campaign.brandId._id)
      ? campaign.brandId._id.toString()
      : campaign.brandId.toString();

    if (campaignBrandId === creatorId.toString()) {
      return errorResponse(res, 'Cannot apply to your own campaign', 400);
    }

    if (campaign.status !== 'open' && campaign.status !== 'accepting_bids' && campaign.status !== 'in_progress') {
      return errorResponse(res, 'Campaign is not accepting proposals', 400);
    }

    // Validate duration for influencer services
    if (campaign.serviceType === 'influencer_service' && !duration) {
      return errorResponse(res, 'Duration is required for influencer service proposals (days content will stay visible)', 400);
    }

    // Check if already proposed
    const existingProposal = await Proposal.findOne({ campaignId, creatorId });
    if (existingProposal) {
      return errorResponse(res, 'You have already submitted a proposal for this campaign', 400);
    }

    const proposalData = {
      campaignId,
      creatorId,
      message: sanitizeString(message),
      proposedDeliverables,
      compensation,
      estimatedDeliveryDays,
      currency: campaign.currency || 'NGN'
    };

    // Add duration for influencer services
    if (campaign.serviceType === 'influencer_service' && duration) {
      proposalData.duration = Number(duration);
    }

    const proposal = await Proposal.create(proposalData);

    // Synchronize applicants array in Campaign model for consistent count and backwards compatibility
    await Campaign.findByIdAndUpdate(campaignId, {
      $addToSet: { applicants: creatorId }
    });

    await createNotification({
      userId: campaign.brandId,
      type: 'proposal_submitted',
      title: 'New proposal received',
      body: `A creator submitted a proposal for "${campaign.name}".`,
      data: { campaignId, proposalId: proposal._id },
      actorId: creatorId,
      dedupeData: { proposalId: proposal._id },
    });

    return createdResponse(res, proposal, 'Proposal submitted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get proposals for a campaign (brand only)
const getCampaignProposals = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const brandId = req.user._id;
    const { page, limit, sortBy = 'best_match' } = req.query;

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return notFoundResponse(res, 'Campaign not found');
    }

    // Handle populated or plain ObjectId
    const campaignBrandId = (campaign.brandId && campaign.brandId._id)
      ? campaign.brandId._id.toString()
      : campaign.brandId.toString();

    if (campaignBrandId !== brandId.toString()) {
      return forbiddenResponse(res, 'Not authorized to view proposals for this campaign');
    }

    let query = Proposal.find({ campaignId }).populate({
      path: 'creatorId',
      select: 'name email profileImage ratings totalReviews services socialAccounts location'
    });

    // Apply sorting
    if (sortBy === 'best_match') {
      query = query.sort({ createdAt: -1 });
    } else if (sortBy === 'rating') {
      query = query.sort({ 'creatorId.ratings': -1 });
    } else if (sortBy === 'price_low') {
      query = query.sort({ 'compensation.amount': 1 });
    } else if (sortBy === 'price_high') {
      query = query.sort({ 'compensation.amount': -1 });
    } else {
      query = query.sort({ createdAt: -1 });
    }

    const { data, pagination } = await applyPagination(query, page, limit);

    // Enrich with creator metrics
    const enrichedProposals = await Promise.all(data.map(async (proposal) => {
      const creator = proposal.creatorId;
      const proposalObj = proposal.toObject();

      // Calculate engagement rates and followers from profile or social accounts
      let totalFollowers = 0;
      let avgEngagementRate = 0;
      const platformMetrics = [];

      if (creator.socialAccounts) {
        Object.keys(creator.socialAccounts).forEach(platform => {
          const account = creator.socialAccounts[platform];
          if (account && account.username) {
            const followers = account.followers || 0;
            const engagement = account.engagement || 0;
            totalFollowers += followers;
            platformMetrics.push({
              platform,
              username: account.username,
              followers,
              engagementRate: engagement,
              verified: account.verified || false
            });
          }
        });
      }

      if (platformMetrics.length > 0) {
        avgEngagementRate = platformMetrics.reduce((sum, p) => sum + p.engagementRate, 0) / platformMetrics.length;
      }

      return {
        ...proposalObj,
        creatorMetrics: {
          totalFollowers,
          avgEngagementRate,
          platformMetrics,
          rating: creator.ratings || 0,
          totalReviews: creator.totalReviews || 0
        }
      };
    }));

    return successResponse(res, { proposals: enrichedProposals, pagination }, 'Proposals retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get creator's proposals
const getMyProposals = async (req, res) => {
  try {
    const creatorId = req.user._id;
    const { page, limit, status } = req.query;
    const { getPaginationParams, createPaginationMeta } = require('../utils/pagination');

    // Build query object
    const queryObj = { creatorId };
    if (status) {
      queryObj.status = status;
    }

    // Get pagination parameters
    const { skip, limit: finalLimit, page: finalPage } = getPaginationParams(page, limit);

    // Execute queries in parallel
    const [data, total] = await Promise.all([
      // Data query with populate and sort
      Proposal.find(queryObj)
        .populate('campaignId', 'name description budget compensationType status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(finalLimit)
        .exec(),
      // Count query
      Proposal.countDocuments(queryObj).exec()
    ]);

    // Create pagination metadata
    const pagination = createPaginationMeta(finalPage, finalLimit, total || 0, data || []);

    return successResponse(res, { proposals: data || [], pagination }, 'Proposals retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get proposal by ID
const getProposalById = async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id)
      .populate('campaignId')
      .populate('creatorId', 'name email profileImage ratings socialAccounts');

    if (!proposal) {
      return notFoundResponse(res, 'Proposal not found');
    }

    return successResponse(res, proposal, 'Proposal retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Withdraw proposal (creator only)
const withdrawProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const creatorId = req.user._id;

    const proposal = await Proposal.findById(id);
    if (!proposal) {
      return notFoundResponse(res, 'Proposal not found');
    }

    if (proposal.creatorId.toString() !== creatorId.toString()) {
      return forbiddenResponse(res, 'Not authorized to withdraw this proposal');
    }

    if (proposal.status !== 'pending') {
      return errorResponse(res, 'Cannot withdraw a proposal that has been reviewed', 400);
    }

    proposal.status = 'withdrawn';
    await proposal.save();

    return successResponse(res, proposal, 'Proposal withdrawn successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Accept proposal and create order (brand only)
const acceptProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const brandId = req.user._id;

    const proposal = await Proposal.findById(id)
      .populate('campaignId')
      .populate('creatorId');

    if (!proposal) {
      return notFoundResponse(res, 'Proposal not found');
    }

    const campaign = proposal.campaignId;

    // Handle populated or plain ObjectId
    const campaignBrandId = (campaign.brandId && campaign.brandId._id)
      ? campaign.brandId._id.toString()
      : campaign.brandId.toString();

    if (campaignBrandId !== brandId.toString()) {
      return forbiddenResponse(res, 'Not authorized to accept this proposal');
    }

    if (proposal.status !== 'pending') {
      return errorResponse(res, 'Proposal has already been reviewed', 400);
    }

    // Update proposal status
    proposal.status = 'accepted';
    proposal.reviewedAt = new Date();
    proposal.reviewedBy = brandId;
    await proposal.save();

    // Create order
    const order = await Order.create({
      campaignId: campaign._id,
      proposalId: proposal._id,
      brandId: campaign.brandId,
      creatorId: proposal.creatorId._id,
      title: campaign.name,
      deliverables: proposal.proposedDeliverables,
      compensation: proposal.compensation,
      timeline: {
        startDate: new Date(),
        dueDate: new Date(Date.now() + proposal.estimatedDeliveryDays * 24 * 60 * 60 * 1000)
      },
      payment: {
        amount: proposal.compensation.amount || 0,
        currency: proposal.currency || campaign.currency || 'NGN'
      },
      creatorPaid: {
        status: 'pending'
      },
      brief: campaign.description
    });

    // Update campaign to add hired creator
    await campaign.hireCreator(proposal.creatorId._id);
    if (campaign.status === 'open' || campaign.status === 'accepting_bids') {
      campaign.status = 'in_progress';
      // Set serviceType if not already set (infer from first deliverable if available)
      if (!campaign.serviceType && proposal.proposedDeliverables && proposal.proposedDeliverables.length > 0) {
        const firstDeliverable = proposal.proposedDeliverables[0];
        if (firstDeliverable.type) {
          campaign.serviceType = firstDeliverable.type;
        }
      }
      await campaign.save();
    }

    await createNotification({
      userId: proposal.creatorId._id || proposal.creatorId,
      type: 'proposal_accepted',
      title: 'Your proposal was accepted',
      body: `Your bid on "${campaign.name}" was accepted. Check your orders.`,
      data: { campaignId: campaign._id, proposalId: proposal._id, orderId: order._id },
      actorId: brandId,
      dedupeData: { proposalId: proposal._id },
    });

    return createdResponse(res, order, 'Proposal accepted and order created successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Reject proposal (brand only)
const rejectProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const brandId = req.user._id;

    const proposal = await Proposal.findById(id).populate('campaignId');
    if (!proposal) {
      return notFoundResponse(res, 'Proposal not found');
    }

    // Handle populated or plain ObjectId
    const campaignBrandId = (proposal.campaignId.brandId && proposal.campaignId.brandId._id)
      ? proposal.campaignId.brandId._id.toString()
      : proposal.campaignId.brandId.toString();

    if (campaignBrandId !== brandId.toString()) {
      return forbiddenResponse(res, 'Not authorized to reject this proposal');
    }

    if (proposal.status !== 'pending') {
      return errorResponse(res, 'Proposal has already been reviewed', 400);
    }

    proposal.status = 'rejected';
    proposal.reviewedAt = new Date();
    proposal.reviewedBy = brandId;
    await proposal.save();

    const creatorId = proposal.creatorId && (proposal.creatorId._id || proposal.creatorId);
    if (creatorId) {
      await createNotification({
        userId: creatorId,
        type: 'proposal_rejected',
        title: 'Proposal not accepted',
        body: `Your proposal for "${proposal.campaignId.name}" was not accepted.`,
        data: { campaignId: proposal.campaignId._id, proposalId: proposal._id },
        actorId: brandId,
        dedupeData: { proposalId: proposal._id },
      });
    }

    return successResponse(res, proposal, 'Proposal rejected successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

module.exports = {
  createProposal,
  getCampaignProposals,
  getMyProposals,
  getProposalById,
  withdrawProposal,
  acceptProposal,
  rejectProposal
};

