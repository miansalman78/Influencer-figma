/**
 * Helper functions for service validation
 * Uses services from serviceController
 */

const { getServicesForRole } = require('../controllers/serviceController');

/**
 * Get all valid service IDs for a given creator role
 * @param {string} creatorRole - 'influencer' or 'service_creator'
 * @returns {string[]} Array of valid service IDs
 */
const getValidServiceIds = (creatorRole) => {
  const services = getServicesForRole(creatorRole);
  return services.map(service => service.id);
};

/**
 * Get all valid service IDs (both influencer and service_creator)
 * @returns {string[]} Array of all valid service IDs
 */
const getAllValidServiceIds = () => {
  const influencerServices = getServicesForRole('influencer');
  const serviceCreatorServices = getServicesForRole('service_creator');
  return [
    ...influencerServices.map(s => s.id),
    ...serviceCreatorServices.map(s => s.id)
  ];
};

/**
 * Validate if a service ID is valid for a given creator role
 * @param {string} serviceId - Service ID to validate
 * @param {string} creatorRole - 'influencer' or 'service_creator'
 * @returns {boolean}
 */
const isValidServiceForRole = (serviceId, creatorRole) => {
  const validIds = getValidServiceIds(creatorRole);
  return validIds.includes(serviceId);
};

/**
 * Validate if a service ID is valid (any role)
 * Also allows custom services prefixed with "custom_"
 * @param {string} serviceId - Service ID to validate
 * @returns {boolean}
 */
const isValidService = (serviceId) => {
  // Allow custom services (prefixed with "custom_")
  if (serviceId && serviceId.startsWith('custom_')) {
    const customServiceName = serviceId.replace('custom_', '');
    // Custom service name must be non-empty and reasonable length
    return customServiceName.trim().length > 0 && customServiceName.length <= 100;
  }
  
  // Check against predefined services
  const allIds = getAllValidServiceIds();
  return allIds.includes(serviceId);
};

module.exports = {
  getValidServiceIds,
  getAllValidServiceIds,
  isValidServiceForRole,
  isValidService
};

