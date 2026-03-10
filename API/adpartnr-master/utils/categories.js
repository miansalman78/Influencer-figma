/**
 * Central categories configuration
 * Update this file to change categories across the entire platform
 */

const categories = [
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
  'art_design'
];

const categoryLabels = {
  fashion_beauty: 'Fashion & Beauty',
  tech_gadgets: 'Tech & Gadgets',
  fitness_health: 'Fitness & Health',
  travel_lifestyle: 'Travel & Lifestyle',
  food_drink: 'Food & Drink',
  entertainment_media: 'Entertainment & Media',
  sports: 'Sports',
  education: 'Education',
  business: 'Business',
  parenting: 'Parenting',
  automotive: 'Automotive',
  gaming: 'Gaming',
  music: 'Music',
  art_design: 'Art & Design'
};

module.exports = {
  categories,
  categoryLabels,
  getCategoryLabel: (category) => categoryLabels[category] || category,
  isValidCategory: (category) => categories.includes(category)
};

