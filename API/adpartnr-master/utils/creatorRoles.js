/**
 * Central creator roles configuration
 * Predefined roles for service creators
 */

const predefinedRoles = [
  'UGC Creator',
  'Graphics Designer',
  'Videographer',
  'Social Media Manager',
  'Photographer',
  'Video Editor',
  'Animator',
  'Voiceover Artist',
  'Copywriter',
  'Web Designer'
];

module.exports = {
  predefinedRoles,
  getRoleLabel: (role) => role, // Roles are already human-readable, so return as-is
  isValidPredefinedRole: (role) => predefinedRoles.includes(role),
  // For influencers, creatorRole is always "influencer"
  INFLUENCER_ROLE: 'influencer'
};

