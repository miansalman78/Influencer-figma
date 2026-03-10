import { apiRequest } from './api';

/**
 * Services - Creator focused (for setup/onboarding)
 */

// 8.1 Role Specific Services - influencer
export const getInfluencerServices = async () => {
  return apiRequest('/services/role/influencer', {
    method: 'GET',
  });
};

// 8.2 Role Specific Services - generic helper
export const getServicesByRole = async (role) => {
  return apiRequest(`/services/role/${role}`, {
    method: 'GET',
  });
};

// 8.2 Role Specific Services - service_creator
export const getServiceCreatorServices = async () => {
  return getServicesByRole('service_creator');
};

// 8.3 All Services
export const getAllServices = async () => {
  return apiRequest('/services/all', {
    method: 'GET',
  });
};

// 8.4 User Current Services
export const getUserServices = async () => {
  return apiRequest('/services/user', {
    method: 'GET',
  });
};

// 8.5 User Current Services - Update
export const updateUserServices = async (services) => {
  return apiRequest('/services/user', {
    method: 'PUT',
    body: { services },
  });
};




























