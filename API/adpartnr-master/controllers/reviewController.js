const Review = require('../models/Review');
const User = require('../models/User');
const { successResponse, errorResponse, createdResponse, notFoundResponse } = require('../utils/response');
const { applyPagination } = require('../utils/pagination');
const { sanitizeString } = require('../utils/helpers');

// Create review
const createReview = async (req, res) => {
  try {
    const { revieweeId, rating, comment, professionalism, communication, quality, context } = req.body;
    const reviewerId = req.user._id;

    if (reviewerId.toString() === revieweeId.toString()) {
      return errorResponse(res, 'Cannot review yourself', 400);
    }

    const canReview = await Review.canUserReview(reviewerId, revieweeId, context || {});
    if (!canReview) {
      return errorResponse(res, 'You have already reviewed this order/context', 400);
    }

    const review = await createNewReview({
      reviewerId,
      revieweeId,
      rating,
      comment,
      professionalism,
      communication,
      quality,
      context
    });

    await updateUserRatings(revieweeId, rating);
    return createdResponse(res, review, 'Review created successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get user reviews
const getUserReviews = async (req, res) => {
  try {
    const userId = req.params.userId;
    const { page, limit, type } = req.query;

    const query = buildUserReviewsQuery(userId, type);
    const { data, pagination } = await applyPagination(query, page, limit);

    return successResponse(res, { reviews: data, pagination }, 'User reviews retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get review by ID
const getReviewById = async (req, res) => {
  try {
    const review = await findReviewById(req.params.id);
    if (!review) {
      return notFoundResponse(res, 'Review not found');
    }

    return successResponse(res, review, 'Review retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Update review
const updateReview = async (req, res) => {
  try {
    const reviewId = req.params.id;
    const userId = req.user._id;

    const review = await findReviewById(reviewId);
    if (!review) {
      return notFoundResponse(res, 'Review not found');
    }

    // Allow update only by the original reviewer
    const reviewerIdStr = (review.reviewerId && review.reviewerId._id)
      ? review.reviewerId._id.toString()
      : review.reviewerId.toString();
    if (reviewerIdStr !== userId.toString()) {
      return errorResponse(res, 'Not authorized to update this review', 403);
    }

    const updateData = sanitizeReviewData(req.body);
    const updatedReview = await updateReviewById(reviewId, updateData);

    return successResponse(res, updatedReview, 'Review updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Delete review
const deleteReview = async (req, res) => {
  try {
    const reviewId = req.params.id;
    const userId = req.user._id;

    const review = await findReviewById(reviewId);
    if (!review) {
      return notFoundResponse(res, 'Review not found');
    }

    // Allow delete only by the original reviewer
    const reviewerIdStr = (review.reviewerId && review.reviewerId._id)
      ? review.reviewerId._id.toString()
      : review.reviewerId.toString();
    if (reviewerIdStr !== userId.toString()) {
      return errorResponse(res, 'Not authorized to delete this review', 403);
    }

    await deleteReviewById(reviewId);
    return successResponse(res, null, 'Review deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Vote on review helpfulness
const voteReviewHelpful = async (req, res) => {
  try {
    const reviewId = req.params.id;
    const { helpful } = req.body; // true for helpful, false for not helpful
    // Normalize to strict boolean to handle strings like "true"/"false" and 1/0
    const isHelpful = (helpful === true) ||
      (typeof helpful === 'string' && helpful.toLowerCase() === 'true') ||
      (helpful === 1) ||
      (typeof helpful === 'string' && helpful === '1');
    const isNotHelpful = (helpful === false) ||
      (typeof helpful === 'string' && helpful.toLowerCase() === 'false') ||
      (helpful === 0) ||
      (typeof helpful === 'string' && helpful === '0');

    if (!isHelpful && !isNotHelpful) {
      return errorResponse(res, 'Invalid helpful flag. Use true/false or 1/0.', 400);
    }

    const review = await findReviewById(reviewId);
    if (!review) {
      return notFoundResponse(res, 'Review not found');
    }

    await review.applyUserVote(req.user._id, isHelpful);

    return successResponse(res, review, 'Vote recorded successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Respond to review
const respondToReview = async (req, res) => {
  try {
    const reviewId = req.params.id;
    const { comment } = req.body;
    const userId = req.user._id;

    const review = await findReviewById(reviewId);
    if (!review) {
      return notFoundResponse(res, 'Review not found');
    }

    // Only the reviewee (the person being reviewed) can respond
    const revieweeIdStr = (review.revieweeId && review.revieweeId._id)
      ? review.revieweeId._id.toString()
      : review.revieweeId.toString();
    if (revieweeIdStr !== userId.toString()) {
      return errorResponse(res, 'Not authorized to respond to this review', 403);
    }

    await review.addResponse(comment);
    return successResponse(res, review, 'Response added successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get user average ratings
const getUserAverageRatings = async (req, res) => {
  try {
    const userId = req.params.userId;
    const averageRatings = await Review.getUserAverageRatings(userId);

    return successResponse(res, averageRatings, 'Average ratings retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Helper functions
const POPULATE_FIELDS = 'name companyName username profileImage avatar role';

const createNewReview = async (reviewData) => {
  const review = new Review({
    reviewerId: reviewData.reviewerId,
    revieweeId: reviewData.revieweeId,
    rating: reviewData.rating,
    comment: sanitizeString(reviewData.comment),
    professionalism: reviewData.professionalism,
    communication: reviewData.communication,
    quality: reviewData.quality,
    context: reviewData.context
  });

  const savedReview = await review.save();
  return await Review.findById(savedReview._id)
    .populate('reviewerId', POPULATE_FIELDS)
    .populate('revieweeId', POPULATE_FIELDS);
};

const findReviewById = async (reviewId) => {
  return await Review.findById(reviewId)
    .populate('reviewerId', POPULATE_FIELDS)
    .populate('revieweeId', POPULATE_FIELDS);
};

const updateReviewById = async (reviewId, updateData) => {
  const updatedReview = await Review.findByIdAndUpdate(reviewId, updateData, { new: true, runValidators: true });
  if (updatedReview) {
    return await Review.findById(updatedReview._id)
      .populate('reviewerId', POPULATE_FIELDS)
      .populate('revieweeId', POPULATE_FIELDS);
  }
  return updatedReview;
};

const deleteReviewById = async (reviewId) => {
  return await Review.findByIdAndDelete(reviewId);
};

// Build query: type='given' => reviews written BY userId, type='received' (default) => reviews FOR userId
const buildUserReviewsQuery = (userId, type) => {
  const isGiven = type === 'given';
  const filter = isGiven
    ? { reviewerId: userId }                        // reviews the user gave to others
    : { revieweeId: userId, isPublic: true };        // reviews the user received

  return Review.find(filter)
    .populate('reviewerId', POPULATE_FIELDS)
    .populate('revieweeId', POPULATE_FIELDS)
    .sort({ createdAt: -1 });
};

const updateUserRatings = async (userId, rating) => {
  const user = await User.findById(userId);
  if (user) {
    user.ratings += rating;
    user.totalReviews += 1;
    await user.save();
  }
};

const sanitizeReviewData = (data) => {
  const allowedFields = ['rating', 'comment', 'professionalism', 'communication', 'quality'];
  const sanitized = {};

  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      if (field === 'comment') {
        sanitized[field] = sanitizeString(data[field]);
      } else {
        sanitized[field] = data[field];
      }
    }
  });

  return sanitized;
};

module.exports = {
  createReview,
  getUserReviews,
  getReviewById,
  updateReview,
  deleteReview,
  voteReviewHelpful,
  respondToReview,
  getUserAverageRatings
};
