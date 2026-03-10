import { apiRequest } from './api';

/**
 * User Profile Services
 */

// 10.1 Get Own Profile
export const getMyProfile = async () => {
    return apiRequest('/user/profile', {
        method: 'GET',
    });
};

// 10.2 Get Profile By UserID
export const getProfileByUserId = async (userId) => {
    return apiRequest(`/user/profile/${userId}`, {
        method: 'GET',
    });
};

// 10.3 Update Profile (Complex Payload)
export const updateProfile = async (profileData) => {
    return apiRequest('/user/profile', {
        method: 'PUT',
        body: profileData,
    });
};

// 10.4 Update Profile - Partials
// Note: Backend might use the same endpoint for both full and partial updates.
// If explicitly different in backend implementation or if just partial fields are sent, utilize updateProfile.
export const updateProfilePartial = async (partialData) => {
    return apiRequest('/user/profile', {
        method: 'PUT',
        body: partialData,
    });
};

// 10.5 Change Password
// Endpoint: PUT /api/auth/change-password
// Payload: { oldPassword: string, newPassword: string }
export const changePassword = async (oldPassword, newPassword) => {
    return apiRequest('/auth/change-password', {
        method: 'PUT',
        body: {
            oldPassword,
            newPassword,
        },
    });
};

// 10.6 Get Creators/Influencers List
// Endpoint: GET /api/users/creators
// Query Parameters: page, limit, category, location, minFollowers, maxFollowers, platform, minRating, search, sortBy, sortOrder
export const getCreators = async (params = {}) => {
    const queryParams = new URLSearchParams();

    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    // Backend expects "categories" (array or single value)
    if (params.categories && params.categories.length > 0) {
        params.categories.forEach(c => queryParams.append('categories', c));
    } else if (params.category) {
        queryParams.append('categories', params.category);
    }
    if (params.city) queryParams.append('city', params.city);
    if (params.state) queryParams.append('state', params.state);
    if (params.country) queryParams.append('country', params.country);
    if (params.location) queryParams.append('location', params.location);
    if (params.minFollowers) queryParams.append('minFollowers', params.minFollowers);
    if (params.maxFollowers) queryParams.append('maxFollowers', params.maxFollowers);
    if (params.platform) queryParams.append('platform', params.platform);
    if (params.minRating) queryParams.append('minRating', params.minRating);
    if (params.search) queryParams.append('search', params.search);
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const url = `/users/creators${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    return apiRequest(url, {
        method: 'GET',
    });
};

// 10.7 Get Brands List
// Endpoint: GET /api/brands
// Query Parameters: page, limit, q (search), industry, country
export const getBrands = async (params = {}) => {
    const queryParams = new URLSearchParams();

    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.q) queryParams.append('q', params.q);
    if (params.search) queryParams.append('q', params.search);
    if (params.industry) queryParams.append('industry', params.industry);
    if (params.country) queryParams.append('country', params.country);
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const queryString = queryParams.toString();
    const url = `/brands${queryString ? `?${queryString}` : ''}`;

    return apiRequest(url, { method: 'GET' });
};
