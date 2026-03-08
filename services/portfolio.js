import { apiRequest } from './api';

/**
 * Portfolio Services
 */

// 5.1 Get User Portfolio
// Note: userId is required - use actual user ID, not 'me'
// Backend endpoint: /api/user/profile/:userId/portfolio
export const getUserPortfolio = async (userId, options = {}) => {
  if (!userId || userId === 'me') {
    throw new Error('getUserPortfolio requires a valid userId. Use getMyPortfolio() for current user.');
  }
  
  const { type, page, limit } = options;
  const params = new URLSearchParams();
  if (type) params.append('type', type);
  if (page) params.append('page', page);
  if (limit) params.append('limit', limit);
  
  const queryString = params.toString();
  const endpoint = `/user/profile/${userId}/portfolio${queryString ? `?${queryString}` : ''}`;
  
  return apiRequest(endpoint, {
    method: 'GET',
  });
};

// Helper function to get current user's portfolio
export const getMyPortfolio = async (options = {}) => {
  // First get current user's profile to get their ID
  const profileResponse = await apiRequest('/user/profile', { method: 'GET' });
  const userId = profileResponse?.data?.id || profileResponse?.data?._id;
  
  if (!userId) {
    throw new Error('Unable to get user ID from profile');
  }
  
  // Then fetch their portfolio using their ID
  return getUserPortfolio(userId, options);
};

// 5.2 Create Portfolio Item
// Unified function that accepts type in portfolioData
// Payload structure matches Postman: { type, url, thumbnail, title, description, tags, order, isPublic, metadata }
export const createPortfolioItem = async (portfolioData) => {
  return apiRequest('/user/profile/portfolio', {
    method: 'POST',
    body: portfolioData,
  });
};

// 5.3 Create Portfolio (Photo) - Convenience function
export const createPortfolioPhoto = async (portfolioData) => {
  return createPortfolioItem({
    ...portfolioData,
    type: 'photo',
  });
};

// 5.4 Create Portfolio (Video) - Convenience function
export const createPortfolioVideo = async (portfolioData) => {
  return createPortfolioItem({
    ...portfolioData,
    type: 'video',
  });
};

// 5.5 Create Portfolio (Link) - Convenience function
export const createPortfolioLink = async (portfolioData) => {
  return createPortfolioItem({
    ...portfolioData,
    type: 'link',
  });
};

// 5.6 Update Portfolio
export const updatePortfolio = async (portfolioId, updateData) => {
  return apiRequest(`/user/profile/portfolio/${portfolioId}`, {
    method: 'PUT',
    body: updateData,
  });
};

// 5.7 Delete Portfolio
export const deletePortfolio = async (portfolioId) => {
  return apiRequest(`/user/profile/portfolio/${portfolioId}`, {
    method: 'DELETE',
  });
};






