import { apiRequest } from './api';

/**
 * Reviews Services - Both Brand & Creator
 */

// 7.1 Create Review
export const createReview = async (reviewData) => {
  return apiRequest('/reviews', {
    method: 'POST',
    body: reviewData,
  });
};

// 7.2 Update Review
export const updateReview = async (reviewId, updateData) => {
  return apiRequest(`/reviews/${reviewId}`, {
    method: 'PUT',
    body: updateData,
  });
};

// 7.3 Delete Review
export const deleteReview = async (reviewId) => {
  return apiRequest(`/reviews/${reviewId}`, {
    method: 'DELETE',
  });
};

// 7.4 Vote Review Helpful
export const voteReviewHelpful = async (reviewId, helpful) => {
  return apiRequest(`/reviews/${reviewId}/vote`, {
    method: 'POST',
    body: { helpful },
  });
};

// 7.5 Respond to Review
export const respondToReview = async (reviewId, comment) => {
  return apiRequest(`/reviews/${reviewId}/respond`, {
    method: 'POST',
    body: { comment },
  });
};

// Get Reviews for a User (helper function - may need to check if this endpoint exists)
export const getUserReviews = async (userId, params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append('page', params.page);
  if (params.limit) queryParams.append('limit', params.limit);
  if (params.type) queryParams.append('type', params.type); // 'received' or 'given'

  const queryString = queryParams.toString();
  // Note: This endpoint might be /reviews/user/:userId or similar - adjust based on backend
  return apiRequest(`/reviews/user/${userId}${queryString ? `?${queryString}` : ''}`, {
    method: 'GET',
  });
};




























