import { apiRequest } from './api';

/**
 * Offers Services - Creator/Influencer focused
 */

// 3.1 Create Offer (JSON or FormData with field 'media' for images, max 5)
export const createOffer = async (offerData) => {
  const isFormData = offerData instanceof FormData;
  return apiRequest('/offers', {
    method: 'POST',
    body: offerData,
    headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
  });
};

// 3.2 Create Offer Copy (same endpoint, different payload structure)
export const createOfferCopy = async (offerData) => {
  return apiRequest('/offers', {
    method: 'POST',
    body: offerData,
  });
};

// 3.3 Get All Offers
export const getAllOffers = async (params = {}) => {
  const queryParams = new URLSearchParams();
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      queryParams.append(key, params[key]);
    }
  });
  const queryString = queryParams.toString();
  return apiRequest(`/offers${queryString ? `?${queryString}` : ''}`, {
    method: 'GET',
  });
};

// 3.4 Get All Offers - Filters (same as 3.3 but with extensive filters)
export const getOffersWithFilters = async (filters = {}) => {
  const {
    page,
    limit,
    serviceType,
    platform,
    minRate,
    maxRate,
    city,
    state,
    country,
    latitude,
    longitude,
    radius,
    category,
    sortBy,
  } = filters;

  const queryParams = new URLSearchParams();
  if (page) queryParams.append('page', page);
  if (limit) queryParams.append('limit', limit);
  if (serviceType) queryParams.append('serviceType', serviceType);
  if (platform) queryParams.append('platform', platform);
  if (minRate) queryParams.append('minRate', minRate);
  if (maxRate) queryParams.append('maxRate', maxRate);
  if (city) queryParams.append('city', city);
  if (state) queryParams.append('state', state);
  if (country) queryParams.append('country', country);
  if (latitude) queryParams.append('latitude', latitude);
  if (longitude) queryParams.append('longitude', longitude);
  if (radius) queryParams.append('radius', radius);
  if (category) queryParams.append('category', category);
  if (sortBy) queryParams.append('sortBy', sortBy);

  const queryString = queryParams.toString();
  return apiRequest(`/offers${queryString ? `?${queryString}` : ''}`, {
    method: 'GET',
  });
};

// 3.5 Search Offers
export const searchOffers = async (searchQuery, params = {}) => {
  const queryParams = new URLSearchParams();
  queryParams.append('q', searchQuery);
  if (params.page) queryParams.append('page', params.page);
  if (params.limit) queryParams.append('limit', params.limit);

  return apiRequest(`/offers/search?${queryParams.toString()}`, {
    method: 'GET',
  });
};

// 3.6 Get Offer by ID
export const getOfferById = async (offerId) => {
  return apiRequest(`/offers/${offerId}`, {
    method: 'GET',
  });
};

// 3.7 Get User Offers (Creator's own offers)
export const getUserOffers = async (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append('page', params.page);
  if (params.limit) queryParams.append('limit', params.limit);
  if (params.status) queryParams.append('status', params.status);

  const queryString = queryParams.toString();
  return apiRequest(`/offers/user/my-offers${queryString ? `?${queryString}` : ''}`, {
    method: 'GET',
  });
};

// 3.8 Get Featured Offers
export const getFeaturedOffers = async (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append('page', params.page);
  if (params.limit) queryParams.append('limit', params.limit);

  const queryString = queryParams.toString();
  return apiRequest(`/offers/featured${queryString ? `?${queryString}` : ''}`, {
    method: 'GET',
  });
};

// 3.9 Update Offer (JSON or FormData; use 'media' for new files, 'existingMedia' for URLs to keep)
export const updateOffer = async (offerId, updateData) => {
  const isFormData = updateData instanceof FormData;
  return apiRequest(`/offers/${offerId}`, {
    method: 'PUT',
    body: updateData,
    headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
  });
};

// 3.10 Delete Offer
export const deleteOffer = async (offerId) => {
  return apiRequest(`/offers/${offerId}`, {
    method: 'DELETE',
  });
};

// 3.11 Publish Offer (Creator)
export const publishOffer = async (offerId) => {
  return apiRequest(`/offers/${offerId}/publish`, {
    method: 'PUT',
  });
};

// 3.12 Create Custom Offer
export const createCustomOffer = async (offerData) => {
  const isFormData = offerData instanceof FormData;
  return apiRequest('/offers/custom', {
    method: 'POST',
    body: offerData,
    headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
  });
};

// 3.13 Send Offer to Brand
// This sends an offer link/reference to a brand via the messaging system
export const sendOfferToBrand = async (offerId, brandId, message = '') => {
  return apiRequest('/offers/send-to-brand', {
    method: 'POST',
    body: {
      offerId,
      brandId,
      message,
    },
  });
};
