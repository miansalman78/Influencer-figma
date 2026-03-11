/**
 * API Constants - Aligned with Postman Collections
 * This file contains all valid enum values and API specifications
 */

/**
 * Valid Categories for User Profile
 * Source: User Profile.postman_collection.json
 */
export const USER_PROFILE_CATEGORIES = [
  'fashion_beauty',
  'tech_gadgets',
  'fitness_health',
  'travel_lifestyle',
  'food_drink',
  'entertainment_media',
  'sports',
  'education',
  'business',
  'parenting',
  'automotive',
  'gaming',
  'music',
  'art_design',
];

/**
 * Service Types / Creator Roles
 * Source: /api/creator-roles
 */
export const CREATOR_ROLES = [
  'influencer_service',
  'service_creator',
  'ugc_creator',
  'other',
];

/**
 * Valid Categories for Offers
 * Source: Offers by Creators-Influencers.postman_collection.json
 * Note: Offers API only accepts 2 categories based on examples
 */
export const OFFER_CATEGORIES = USER_PROFILE_CATEGORIES;

/**
 * Valid Platforms
 * Source: User Profile.postman_collection.json
 */
export const VALID_PLATFORMS = [
  'instagram',
  'tiktok',
  'youtube',
  'twitter',
  'facebook',
];

/**
 * Map UI category names to User Profile backend categories
 */
export const mapCategoryToUserProfile = (uiCategory) => {
  if (!uiCategory) return 'fashion_beauty';

  const mapping = {
    'Food': 'food_drink',
    'Tech': 'tech_gadgets',
    'Health & Wellness': 'fitness_health',
    'Fashion': 'fashion_beauty',
    'Beauty': 'fashion_beauty',
    'Fashion & Beauty': 'fashion_beauty',
    'Tech & Gadgets': 'tech_gadgets',
    'Fitness & Health': 'fitness_health',
    'Travel & Lifestyle': 'travel_lifestyle',
    'Travel': 'travel_lifestyle',
    'Lifestyle': 'travel_lifestyle',
    'Food & Drink': 'food_drink',
    'Entertainment & Media': 'entertainment_media',
    'Sports': 'sports',
    'Education': 'education',
    'Business': 'business',
    'Parenting': 'parenting',
    'Automotive': 'automotive',
    'Gaming': 'gaming',
    'Music': 'music',
    'Art & Design': 'art_design',
    'Art': 'art_design',
    'Design': 'art_design',
  };
  return mapping[uiCategory] || uiCategory.toLowerCase().replace(/ & /g, '_').replace(/ /g, '_');
};

/**
 * Map UI category names to Offer backend categories
 * Now supports ALL User Profile categories
 */
export const mapCategoryToOffer = (uiCategory) => {
  // Use the same mapping logic as User Profile to ensure consistency
  return mapCategoryToUserProfile(uiCategory);
};

/**
 * Map backend category to UI display name
 */
export const mapBackendCategoryToUI = (backendCategory) => {
  if (!backendCategory) return 'General';

  const reverseMapping = {
    'fashion_beauty': 'Fashion & Beauty',
    'tech_gadgets': 'Tech & Gadgets',
    'fitness_health': 'Fitness & Health',
    'travel_lifestyle': 'Travel & Lifestyle',
    'food_drink': 'Food & Drink',
    'entertainment_media': 'Entertainment & Media',
    'sports': 'Sports',
    'education': 'Education',
    'business': 'Business',
    'parenting': 'Parenting',
    'automotive': 'Automotive',
    'gaming': 'Gaming',
    'music': 'Music',
    'art_design': 'Art & Design',
  };

  return reverseMapping[backendCategory] || backendCategory.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

/**
 * Map UI role names to backend creator roles
 */
export const mapRoleToBackend = (uiRole) => {
  const mapping = {
    'Influencer Service': 'influencer_service',
    'Service Creator': 'service_creator',
    'UGC Creator': 'ugc_creator',
    'Other': 'other',
  };
  return mapping[uiRole] || 'other';
};

/**
 * Map backend creator roles to UI role names
 */
export const mapBackendRoleToUI = (backendRole) => {
  const mapping = {
    'influencer_service': 'Influencer Service',
    'service_creator': 'Service Creator',
    'ugc_creator': 'UGC Creator',
    'other': 'Other',
  };
  return mapping[backendRole] || 'Other';
};




