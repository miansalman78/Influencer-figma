const Portfolio = require('../models/Portfolio');
const { successResponse, errorResponse, createdResponse, notFoundResponse, forbiddenResponse } = require('../utils/response');
const { applyPagination } = require('../utils/pagination');
const { sanitizeString } = require('../utils/helpers');

// Get public portfolio for a user
const getUserPortfolio = async (req, res) => {
  try {
    const { userId } = req.params;
    const { type } = req.query;
    const query = Portfolio.find({ userId, isPublic: true });
    if (type) query.where({ type });
    const { data, pagination } = await applyPagination(query.sort({ order: 1, createdAt: -1 }), req.query.page, req.query.limit);
    return successResponse(res, { items: data, pagination }, 'Portfolio retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Create portfolio item (owner)
const createPortfolioItem = async (req, res) => {
  try {
    const userId = req.user._id;
    const payload = sanitizePayload({ ...req.body, userId });
    const item = await Portfolio.create(payload);
    return createdResponse(res, item, 'Portfolio item created');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Update portfolio item (owner)
const updatePortfolioItem = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const item = await Portfolio.findById(id);
    if (!item) return notFoundResponse(res, 'Portfolio item not found');
    if (item.userId.toString() !== userId.toString()) return forbiddenResponse(res, 'Not allowed');

    const updates = sanitizePayload(req.body, true);
    Object.assign(item, updates);
    await item.save();
    return successResponse(res, item, 'Portfolio item updated');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Delete portfolio item (owner)
const deletePortfolioItem = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const item = await Portfolio.findById(id);
    if (!item) return notFoundResponse(res, 'Portfolio item not found');
    if (item.userId.toString() !== userId.toString()) return forbiddenResponse(res, 'Not allowed');
    await item.deleteOne();
    return successResponse(res, null, 'Portfolio item deleted');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Helpers
const sanitizePayload = (data, partial = false) => {
  const allowed = ['type', 'url', 'thumbnail', 'title', 'description', 'tags', 'order', 'isPublic', 'metadata'];
  const payload = {};
  if (!partial) payload.userId = data.userId;
  allowed.forEach((field) => {
    if (data[field] !== undefined) {
      if (['title', 'description'].includes(field)) {
        payload[field] = sanitizeString(data[field]);
      } else if (field === 'tags' && Array.isArray(data[field])) {
        payload[field] = data[field].map((t) => sanitizeString(t));
      } else {
        payload[field] = data[field];
      }
    }
  });
  return payload;
};

module.exports = {
  getUserPortfolio,
  createPortfolioItem,
  updatePortfolioItem,
  deletePortfolioItem
};
