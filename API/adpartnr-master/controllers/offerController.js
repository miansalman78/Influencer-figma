const Offer = require('../models/Offer');
const User = require('../models/User');
const { successResponse, errorResponse, createdResponse, notFoundResponse } = require('../utils/response');
const { createNotification } = require('../utils/notificationHelpers');
const { getConnectedBrandIds } = require('./connectionController');
const mongoose = require('mongoose');
const { applyPagination } = require('../utils/pagination');
const { sanitizeString } = require('../utils/helpers');

// Create offer
const createOffer = async (req, res) => {
  try {
    const offerData = sanitizeOfferData(req.body);
    offerData.creatorId = req.user._id;

    // Handle file uploads (if any)
    if (req.files && req.files.length > 0) {
      const mediaFiles = req.files.map(file => ({
        url: file.path,
        type: file.mimetype.startsWith('video') ? 'video' : 'image',
        caption: '' // Default empty caption
      }));

      // If media already exists (from body), append new files, otherwise set as media
      if (offerData.media && Array.isArray(offerData.media)) {
        offerData.media = [...offerData.media, ...mediaFiles];
      } else {
        offerData.media = mediaFiles;
      }
    }

    const offer = await createNewOffer(offerData);

    // Notify brands connected to this creator when they publish a public offer
    const isPublicOffer = offer.status === 'active' && !offer.isCustom;
    if (isPublicOffer) {
      try {
        const brandIds = await getConnectedBrandIds(req.user._id);
        const creator = await User.findById(req.user._id).select('name').lean();
        const creatorName = creator?.name || 'A creator';
        const offerTitle = (offer.title || 'New offer').slice(0, 60);
        for (const brandId of brandIds) {
          await createNotification({
            userId: brandId,
            type: 'offer_new_from_connection',
            title: 'New offer from a creator you\'re connected with',
            body: `${creatorName} published a new offer: ${offerTitle}`,
            data: { offerId: offer._id.toString(), creatorId: req.user._id.toString() },
            actorId: req.user._id,
            dedupeData: { offerId: offer._id },
          });
        }
      } catch (notifErr) {
        console.warn('[createOffer] Failed to notify connected brands:', notifErr.message);
      }
    }

    return createdResponse(res, offer, 'Offer created successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// ... existing code ...

// Get all offers (brands see non-custom + custom sent to them; creators see non-custom + their own custom)
const getOffers = async (req, res) => {
  try {
    const { page, limit, serviceType, platform, category, minRate, maxRate, city, state, country, radius, latitude, longitude, creatorId, status } = req.query;
    const userId = req.user ? req.user._id : null;
    const query = buildOfferQuery({ serviceType, platform, category, minRate, maxRate, city, state, country, radius, latitude, longitude, userId, creatorId, status });

    const { data, pagination } = await applyPagination(query, page, limit);
    return successResponse(res, { offers: data, pagination }, 'Offers retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get offer by ID (custom offers: only creator or brands in sentToBrands can view)
const getOfferById = async (req, res) => {
  try {
    const offer = await findOfferById(req.params.id);
    if (!offer) {
      return notFoundResponse(res, 'Offer not found');
    }

    const userId = req.user && req.user._id;
    const isCreator = userId && offer.creatorId && (offer.creatorId._id ? offer.creatorId._id.toString() : offer.creatorId.toString()) === userId.toString();
    if (offer.isCustom && !isCreator) {
      const sentTo = offer.sentToBrands || [];
      const isSentToBrand = userId && (req.user.role || '').toLowerCase() === 'brand' && sentTo.some(id => (id && id.toString()) === userId.toString());
      if (!isSentToBrand) {
        return notFoundResponse(res, 'Offer not found');
      }
    }

    await offer.incrementViews();
    return successResponse(res, offer, 'Offer retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Update offer
const updateOffer = async (req, res) => {
  try {
    const offerId = req.params.id;
    const userId = req.user._id;

    const offer = await findOfferByIdForAuth(offerId);
    if (!offer) {
      return notFoundResponse(res, 'Offer not found');
    }

    if (offer.creatorId.toString() !== userId.toString()) {
      return errorResponse(res, 'Not authorized to update this offer', 403);
    }

    let updateData = sanitizeOfferData(req.body);

    // Handle file uploads (if any)
    if (req.files && req.files.length > 0) {
      const newMedia = req.files.map(file => ({
        url: file.path,
        type: file.mimetype.startsWith('video') ? 'video' : 'image',
        caption: ''
      }));

      // With multipart, 'media' field is consumed by multer for files; use existingMedia for list to keep
      let currentMedia = updateData.media ?? req.body.existingMedia;

      if (typeof currentMedia === 'string') {
        try {
          currentMedia = JSON.parse(currentMedia);
        } catch (e) {
          currentMedia = [];
        }
      }

      if (currentMedia === undefined) {
        currentMedia = offer.media || [];
      }

      updateData.media = [...(Array.isArray(currentMedia) ? currentMedia : []), ...newMedia];
    } else if (updateData.media && typeof updateData.media === 'string') {
      // Handle case where specific media update (e.g. delete) is sent as string without new files
      try {
        updateData.media = JSON.parse(updateData.media);
      } catch (e) {
        // ignore
      }
    }

    const updatedOffer = await updateOfferById(offerId, updateData);

    return successResponse(res, updatedOffer, 'Offer updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Delete offer
const deleteOffer = async (req, res) => {
  try {
    const offerId = req.params.id;
    const userId = req.user._id;

    const offer = await findOfferByIdForAuth(offerId);
    if (!offer) {
      return notFoundResponse(res, 'Offer not found');
    }

    if (offer.creatorId.toString() !== userId.toString()) {
      return errorResponse(res, 'Not authorized to delete this offer', 403);
    }

    await deleteOfferById(offerId);
    return successResponse(res, null, 'Offer deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Publish offer (change status from draft to active)
const publishOffer = async (req, res) => {
  try {
    const offerId = req.params.id;
    const userId = req.user._id;

    const offer = await findOfferByIdForAuth(offerId);
    if (!offer) {
      return notFoundResponse(res, 'Offer not found');
    }

    if (offer.creatorId.toString() !== userId.toString()) {
      return errorResponse(res, 'Not authorized to publish this offer', 403);
    }

    if (offer.status !== 'draft') {
      return errorResponse(res, `Offer cannot be published. Current status: ${offer.status}`, 400);
    }

    // Validate required fields before publishing
    const missingFields = [];
    if (!offer.title) missingFields.push('title');
    if (!offer.serviceType) missingFields.push('serviceType');
    if (!offer.platform || offer.platform.length === 0) missingFields.push('platform');
    if (!offer.rate || (!offer.rate.ngn && !offer.rate.usd)) missingFields.push('rate');
    if (!offer.deliveryDays) missingFields.push('deliveryDays');
    if (!offer.duration) missingFields.push('duration');
    if (!offer.quantity) missingFields.push('quantity');
    if (!offer.description) missingFields.push('description');

    if (missingFields.length > 0) {
      return errorResponse(res, `Offer is missing required fields: ${missingFields.join(', ')}. Please complete all fields before publishing.`, 400);
    }

    // Change status to 'active' (published)
    const updatedOffer = await updateOfferById(offerId, { status: 'active' });

    return successResponse(res, updatedOffer, 'Offer published successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Create custom offer
const createCustomOffer = async (req, res) => {
  try {
    const customOfferData = sanitizeOfferData(req.body);
    customOfferData.creatorId = req.user._id;
    customOfferData.isCustom = true;

    // Handle file uploads (if any)
    if (req.files && req.files.length > 0) {
      const mediaFiles = req.files.map(file => ({
        url: file.path,
        type: file.mimetype.startsWith('video') ? 'video' : 'image',
        caption: ''
      }));

      if (customOfferData.media && Array.isArray(customOfferData.media)) {
        customOfferData.media = [...customOfferData.media, ...mediaFiles];
      } else {
        customOfferData.media = mediaFiles;
      }
    }

    const offer = await createNewOffer(customOfferData);
    return createdResponse(res, offer, 'Custom offer created successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get user's offers
const getUserOffers = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, status } = req.query;

    const query = buildUserOffersQuery(userId, { status });
    const { data, pagination } = await applyPagination(query, page, limit);

    return successResponse(res, { offers: data, pagination }, 'User offers retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get featured offers
const getFeaturedOffers = async (req, res) => {
  try {
    const { page, limit } = req.query;
    const userId = req.user ? req.user._id : null;
    const query = buildFeaturedOffersQuery(userId);

    const { data, pagination } = await applyPagination(query, page, limit);
    return successResponse(res, { offers: data, pagination }, 'Featured offers retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Search offers
const searchOffers = async (req, res) => {
  try {
    const { q, page, limit } = req.query;
    const userId = req.user ? req.user._id : null;
    const query = buildSearchQuery(q, userId);

    const { data, pagination } = await applyPagination(query, page, limit);
    return successResponse(res, { offers: data, pagination }, 'Search results retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Helper functions
const createNewOffer = async (offerData) => {
  const offer = new Offer(offerData);
  return await offer.save();
};

const findOfferById = async (offerId) => {
  return await Offer.findById(offerId)
    .populate('creatorId', 'name email profileImage ratings services socialAccounts');
};

const findOfferByIdForAuth = async (offerId) => {
  return await Offer.findById(offerId);
};

const updateOfferById = async (offerId, updateData) => {
  return await Offer.findByIdAndUpdate(offerId, updateData, { new: true, runValidators: true });
};

const deleteOfferById = async (offerId) => {
  return await Offer.findByIdAndDelete(offerId);
};

const buildOfferQuery = ({ serviceType, platform, category, minRate, maxRate, city, state, country, radius, latitude, longitude, userId, creatorId, status }) => {
  const baseConditions = {};

  if (creatorId && mongoose.Types.ObjectId.isValid(creatorId)) {
    if (status && ['active', 'draft'].includes(String(status).toLowerCase())) {
      baseConditions.status = status.toLowerCase();
    } else {
      baseConditions.status = { $in: ['active', 'draft'] };
    }
  } else {
    baseConditions.status = 'active';
  }

  const visibilityFilter = [
    { isCustom: { $ne: true } }
  ];

  if (userId) {
    visibilityFilter.push({ isCustom: true, creatorId: userId });
    visibilityFilter.push({ isCustom: true, sentToBrands: userId });
  }

  baseConditions.$or = visibilityFilter;
  const query = Offer.find(baseConditions);

  if (creatorId && mongoose.Types.ObjectId.isValid(creatorId)) {
    query.where({ creatorId });
  }

  if (serviceType) {
    query.where({ serviceType });
  }

  if (platform) {
    query.where({ platform: { $in: Array.isArray(platform) ? platform : [platform] } });
  }

  if (category) {
    query.where({ category });
  }

  // Rate filtering - check both NGN and USD rates
  if (minRate || maxRate) {
    const rateQuery = {
      $or: []
    };
    if (minRate && maxRate) {
      rateQuery.$or.push(
        { 'rate.ngn': { $gte: Number(minRate), $lte: Number(maxRate) } },
        { 'rate.usd': { $gte: Number(minRate), $lte: Number(maxRate) } }
      );
    } else if (minRate) {
      rateQuery.$or.push(
        { 'rate.ngn': { $gte: Number(minRate) } },
        { 'rate.usd': { $gte: Number(minRate) } }
      );
    } else if (maxRate) {
      rateQuery.$or.push(
        { 'rate.ngn': { $lte: Number(maxRate) } },
        { 'rate.usd': { $lte: Number(maxRate) } }
      );
    }
    if (rateQuery.$or.length > 0) {
      query.where(rateQuery);
    }
  }

  // Location filtering (case-insensitive so "Nigeria" matches "nigeria" and "NIGERIA")
  const toLocationRegex = (val) => (val && typeof val === 'string' && val.trim())
    ? new RegExp(`^${String(val).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    : null;
  if (city) {
    const re = toLocationRegex(city);
    if (re) query.where({ 'location.city': re });
  }
  if (state) {
    const re = toLocationRegex(state);
    if (re) query.where({ 'location.state': re });
  }
  if (country) {
    const re = toLocationRegex(country);
    if (re) query.where({ 'location.country': re });
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

  query.populate('creatorId', 'name profileImage socialAccounts')
    .select('title description serviceType platform rate currency deliveryDays duration quantity location creatorId status media isCustom');
  return query.sort({ featured: -1, createdAt: -1 });
};

const buildUserOffersQuery = (userId, { status }) => {
  const query = Offer.find({ creatorId: userId });

  if (status) {
    query.where({ status });
  }

  return query.sort({ createdAt: -1 }).populate('creatorId', 'name profileImage socialAccounts');
};

const buildFeaturedOffersQuery = (userId) => {
  const baseConditions = {
    status: 'active',
    featured: true
  };

  const visibilityFilter = [
    { isCustom: { $ne: true } }
  ];

  if (userId) {
    visibilityFilter.push({ isCustom: true, creatorId: userId });
    visibilityFilter.push({ isCustom: true, sentToBrands: userId });
  }

  baseConditions.$or = visibilityFilter;

  return Offer.find(baseConditions).sort({ rating: -1, createdAt: -1 }).populate('creatorId', 'name profileImage socialAccounts');
};

const buildSearchQuery = (searchTerm, userId) => {
  const baseConditions = { status: 'active' };

  const visibilityFilter = [
    { isCustom: { $ne: true } }
  ];

  if (userId) {
    visibilityFilter.push({ isCustom: true, creatorId: userId });
    visibilityFilter.push({ isCustom: true, sentToBrands: userId });
  }

  baseConditions.$or = visibilityFilter;

  if (!searchTerm) {
    return Offer.find(baseConditions).sort({ createdAt: -1 });
  }

  const regex = new RegExp(searchTerm, 'i');
  return Offer.find({
    ...baseConditions,
    $or: [
      { title: regex },
      { description: regex },
      { tags: { $in: [regex] } },
      { serviceType: regex }
    ]
  }).sort({ rating: -1, createdAt: -1 }).populate('creatorId', 'name profileImage socialAccounts');
};

const sanitizeOfferData = (data) => {
  const allowedFields = ['title', 'serviceType', 'platform', 'rate', 'currency', 'deliveryDays', 'duration', 'quantity', 'description', 'category', 'tags', 'requirements', 'location', 'status', 'isNegotiable', 'media', 'portfolio', 'isCustom'];
  const sanitized = {};

  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      if (field === 'title' || field === 'description' || field === 'requirements') {
        sanitized[field] = sanitizeString(data[field]);
      } else if (field === 'location') {
        sanitized[field] = sanitizeLocationData(data[field]);
      } else if (field === 'rate') {
        let rateValue = data[field];
        if (typeof rateValue === 'string') {
          try {
            rateValue = JSON.parse(rateValue);
          } catch (e) {
            rateValue = data[field];
          }
        }
        // Handle both rate formats:
        // Option A: { rate: { ngn: 25000, usd: 100 } }
        // Option B: { rate: 300, currency: "NGN" }
        if (typeof rateValue === 'object' && rateValue !== null && (rateValue.ngn !== undefined || rateValue.usd !== undefined)) {
          // Option A: Already in correct format
          sanitized[field] = rateValue;
        } else if (typeof rateValue === 'number' && data.currency) {
          // Option B: Convert to Option A format
          const currency = data.currency.toUpperCase();
          if (currency === 'NGN') {
            sanitized[field] = { ngn: rateValue, usd: null };
          } else if (currency === 'USD') {
            sanitized[field] = { ngn: null, usd: rateValue };
          } else {
            throw new Error('Invalid currency. Must be NGN or USD');
          }
        } else {
          sanitized[field] = rateValue;
        }
      } else {
        sanitized[field] = data[field];
      }
    }
  });

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

// Send offer to brand – creates notification for the brand (creator-only)
const sendOfferToBrand = async (req, res) => {
  try {
    const creatorId = req.user._id;
    const { offerId, brandId, message } = req.body;

    if (!offerId || !brandId) {
      return errorResponse(res, 'offerId and brandId are required', 400);
    }

    if (!mongoose.Types.ObjectId.isValid(offerId) || !mongoose.Types.ObjectId.isValid(brandId)) {
      return errorResponse(res, 'Invalid offerId or brandId', 400);
    }

    const offer = await Offer.findById(offerId);
    if (!offer) return notFoundResponse(res, 'Offer not found');
    if (offer.creatorId.toString() !== creatorId.toString()) {
      return errorResponse(res, 'Not authorized to send this offer', 403);
    }

    const brandIdObj = mongoose.Types.ObjectId.isValid(brandId) ? new mongoose.Types.ObjectId(brandId) : null;
    if (brandIdObj) {
      const sentTo = offer.sentToBrands || [];
      const alreadySent = sentTo.some(id => id && id.toString() === brandId.toString());
      if (!alreadySent) {
        offer.sentToBrands = [...sentTo, brandIdObj];
        await offer.save();
      }
    }

    const brand = await User.findById(brandId).select('role name');
    if (!brand) return notFoundResponse(res, 'Brand not found');
    if (brand.role !== 'brand') {
      return errorResponse(res, 'Target user is not a brand', 400);
    }

    const creator = await User.findById(creatorId).select('name');
    const creatorName = creator?.name || 'A creator';
    const offerTitle = offer.title || 'Offer';
    const title = `${creatorName} shared an offer with you`;
    const body = (message && String(message).trim()) || `${offerTitle}`;

    await createNotification({
      userId: brandId,
      type: 'offer_sent',
      title,
      body: body.slice(0, 500),
      data: { offerId, brandId, creatorId: creatorId.toString(), message: message || '' },
      actorId: creatorId,
      dedupeData: { offerId },
    });

    return successResponse(res, { sent: true, offerId, brandId }, 'Offer sent to brand; they have been notified.');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

module.exports = {
  createOffer,
  getOffers,
  getOfferById,
  updateOffer,
  deleteOffer,
  publishOffer,
  createCustomOffer,
  getUserOffers,
  getFeaturedOffers,
  searchOffers,
  sendOfferToBrand
};
