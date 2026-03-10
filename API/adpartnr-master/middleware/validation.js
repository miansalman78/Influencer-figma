const { body, param, query, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));
    
    return res.status(400).json({
      message: 'Validation failed',
      errors: errorMessages
    });
  }
  
  next();
};

// User validation rules
const validateUserSignup = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 50 })
    .withMessage('Name cannot exceed 50 characters'),
  
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  
  body('role')
    .isIn(['brand', 'creator'])
    .withMessage('Role must be either brand or creator'),
  
  body('creatorRole')
    .optional()
    .custom((value, { req }) => {
      // If role is brand, creatorRole should not be provided
      if (req.body.role === 'brand' && value) {
        throw new Error('Creator role should not be provided when role is brand');
      }
      
      // If role is creator, creatorRole is required
      if (req.body.role === 'creator') {
        if (!value || !value.trim()) {
          throw new Error('Creator role is required when role is creator');
        }
        
        // For influencers, creatorRole must be exactly "influencer"
        // For service creators, creatorRole can be any non-empty string (e.g., "UGC Creator", "Graphics Designer", etc.)
        // We don't restrict service creator roles to specific values to allow custom roles
        if (value.trim().toLowerCase() === 'influencer') {
          // Valid influencer role
          return true;
        } else {
          // Service creator role - must be non-empty string
          if (value.trim().length === 0) {
            throw new Error('Creator role cannot be empty');
          }
          // Allow any non-empty string for service creators
          return true;
        }
      }
      
      return true;
    }),
  
  body('location.city')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('City cannot exceed 50 characters'),
  
  body('location.state')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('State cannot exceed 50 characters'),
  
  body('location.country')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Country cannot exceed 50 characters'),
  
  body('location.coordinates.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  body('location.coordinates.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  
  handleValidationErrors
];

const validateUserLogin = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  handleValidationErrors
];

const validateForgotPassword = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  handleValidationErrors
];

const validateResetPassword = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  
  handleValidationErrors
];

const validateChangePassword = [
  body('oldPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number'),
  
  handleValidationErrors
];

// Campaign validation rules
const validateCampaign = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Campaign name is required')
    .isLength({ max: 100 })
    .withMessage('Campaign name cannot exceed 100 characters'),
  
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Campaign description is required')
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  
  body('status')
    .optional()
    .isIn(['draft', 'open', 'accepting_bids', 'in_progress', 'completed', 'cancelled'])
    .withMessage('Invalid status'),
  
  body('mainGoal')
    .optional()
    .custom((value, { req }) => {
      const status = req.body.status || 'draft';
      
      // Main goal is required if status is not 'draft'
      if (status !== 'draft') {
        if (!value) {
          throw new Error('Main goal is required');
        }
        const validGoals = ['brand_awareness', 'content_creation', 'sales', 'lead_generation'];
        if (!validGoals.includes(value)) {
          throw new Error(`Main goal must be one of: ${validGoals.join(', ')}`);
        }
      }
      return true;
    }),
  
  body('compensationType')
    .optional()
    .custom((value, { req }) => {
      const status = req.body.status || 'draft';
      
      // Compensation type is required if status is not 'draft'
      if (status !== 'draft') {
        if (!value) {
          throw new Error('Compensation type is required');
        }
        const validTypes = ['paid', 'free_product', 'both'];
        if (!validTypes.includes(value)) {
          throw new Error(`Compensation type must be one of: ${validTypes.join(', ')}`);
        }
      }
      return true;
    }),
  
  body('budget')
    .optional({ checkFalsy: true })
    .custom((value, { req }) => {
      // Budget is required if compensationType is 'paid' or 'both' and status is not 'draft'
      const status = req.body.status || 'draft';
      const compensationType = req.body.compensationType;
      
      if (status !== 'draft' && (compensationType === 'paid' || compensationType === 'both')) {
        if (!value) {
          throw new Error('Budget is required for paid campaigns');
        }
      }
      
      if (value !== undefined && value !== null && value !== '') {
        if (isNaN(value)) {
          throw new Error('Budget must be a number');
        }
        if (parseFloat(value) < 1) {
          throw new Error('Budget must be at least 1');
        }
      }
      return true;
    }),
  
  body('platform')
    .optional()
    .custom((platforms, { req }) => {
      const status = req.body.status || 'draft';
      
      // Platform is required if status is not 'draft'
      if (status !== 'draft') {
        if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
          throw new Error('At least one platform is required');
        }
      }
      
      // If platforms are provided, validate them
      if (platforms !== undefined && platforms !== null) {
        if (!Array.isArray(platforms)) {
          throw new Error('Platform must be an array');
        }
        if (platforms.length > 0) {
          const validPlatforms = ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'];
          const invalidPlatforms = platforms.filter(p => !validPlatforms.includes(p));
          if (invalidPlatforms.length > 0) {
            throw new Error(`Invalid platforms: ${invalidPlatforms.join(', ')}`);
          }
        }
      }
      return true;
    }),
  
  body('goals')
    .optional()
    .custom((goals, { req }) => {
      const status = req.body.status || 'draft';
      
      // Goals are required if status is not 'draft'
      if (status !== 'draft') {
        if (!goals || !Array.isArray(goals) || goals.length === 0) {
          throw new Error('At least one goal is required');
        }
      }
      return true;
    }),
  
  body('deliverables')
    .optional()
    .custom((deliverables, { req }) => {
      const status = req.body.status || 'draft';
      
      // Deliverables are required if status is not 'draft'
      if (status !== 'draft') {
        if (!deliverables || !Array.isArray(deliverables) || deliverables.length === 0) {
          throw new Error('At least one deliverable is required');
        }
      }
      return true;
    }),
  
  body('dueDate')
    .optional()
    .custom((value, { req }) => {
      const status = req.body.status || 'draft';
      
      // Due date is required if status is not 'draft'
      if (status !== 'draft') {
        if (!value) {
          throw new Error('Due date is required');
        }
      }
      
      // If dueDate is provided, validate it
      if (value) {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          throw new Error('Due date must be a valid date');
        }
        if (status !== 'draft' && date <= new Date()) {
          throw new Error('Due date must be in the future');
        }
      }
      return true;
    }),
  
  body('location.city')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('City cannot exceed 50 characters'),
  
  body('location.state')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('State cannot exceed 50 characters'),
  
  body('location.country')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Country cannot exceed 50 characters'),
  
  body('location.coordinates.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  body('location.coordinates.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  
  handleValidationErrors
];

// Offer validation rules
const validateOffer = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Offer title is required')
    .isLength({ max: 100 })
    .withMessage('Title cannot exceed 100 characters'),
  
  body('status')
    .optional()
    .isIn(['draft', 'active', 'accepted', 'completed', 'cancelled'])
    .withMessage('Invalid status'),
  
  body('serviceType')
    .optional()
    .custom((value, { req }) => {
      const status = req.body.status || 'draft';
      
      // Service type is required if status is not 'draft'
      if (status !== 'draft') {
        if (!value) {
          throw new Error('Service type is required');
        }
      }
      return true;
    }),
  
  body('platform')
    .optional()
    .custom((platforms, { req }) => {
      const status = req.body.status || 'draft';
      
      // Platform is required if status is not 'draft'
      if (status !== 'draft') {
        if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
          throw new Error('At least one platform is required');
        }
      }
      
      // If platforms are provided, validate them
      if (platforms !== undefined && platforms !== null) {
        if (!Array.isArray(platforms)) {
          throw new Error('Platform must be an array');
        }
        if (platforms.length > 0) {
          const validPlatforms = ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'];
          const invalidPlatforms = platforms.filter(p => !validPlatforms.includes(p));
          if (invalidPlatforms.length > 0) {
            throw new Error(`Invalid platforms: ${invalidPlatforms.join(', ')}`);
          }
        }
      }
      return true;
    }),
  
  body('rate')
    .optional()
    .custom((value, { req }) => {
      const status = req.body.status || 'draft';
      
      // Rate is required if status is not 'draft'
      if (status !== 'draft') {
        if (!value || typeof value !== 'object') {
          throw new Error('Rate must be an object with ngn and/or usd properties');
        }
        if (!value.ngn && !value.usd) {
          throw new Error('At least one currency rate (NGN or USD) is required');
        }
      }
      
      // If rate is provided, validate it
      if (value && typeof value === 'object') {
        if (value.ngn !== undefined && value.ngn !== null && value.ngn !== '') {
          if (isNaN(value.ngn) || parseFloat(value.ngn) < 1) {
            throw new Error('NGN rate must be at least 1');
          }
        }
        if (value.usd !== undefined && value.usd !== null && value.usd !== '') {
          if (isNaN(value.usd) || parseFloat(value.usd) < 1) {
            throw new Error('USD rate must be at least 1');
          }
        }
      }
      return true;
    }),
  
  body('deliveryDays')
    .optional()
    .custom((value, { req }) => {
      const status = req.body.status || 'draft';
      
      // Delivery days is required if status is not 'draft'
      if (status !== 'draft') {
        if (!value) {
          throw new Error('Delivery days is required');
        }
      }
      
      // If deliveryDays is provided, validate it
      if (value !== undefined && value !== null && value !== '') {
        const days = parseInt(value);
        if (isNaN(days) || days < 1 || days > 30) {
          throw new Error('Delivery days must be between 1 and 30');
        }
      }
      return true;
    }),
  
  body('duration')
    .optional()
    .custom((value, { req }) => {
      const status = req.body.status || 'draft';
      
      // Duration is required if status is not 'draft'
      if (status !== 'draft') {
        if (!value) {
          throw new Error('Duration is required');
        }
      }
      
      // If duration is provided, validate it
      if (value !== undefined && value !== null && value !== '') {
        const days = parseInt(value);
        if (isNaN(days) || days < 1 || days > 365) {
          throw new Error('Duration must be between 1 and 365 days');
        }
      }
      return true;
    }),
  
  body('quantity')
    .optional()
    .custom((value, { req }) => {
      const status = req.body.status || 'draft';
      
      // Quantity is required if status is not 'draft'
      if (status !== 'draft') {
        if (!value) {
          throw new Error('Quantity is required');
        }
      }
      
      // If quantity is provided, validate it
      if (value !== undefined && value !== null && value !== '') {
        const qty = parseInt(value);
        if (isNaN(qty) || qty < 1 || qty > 100) {
          throw new Error('Quantity must be between 1 and 100');
        }
      }
      return true;
    }),
  
  body('description')
    .optional()
    .custom((value, { req }) => {
      const status = req.body.status || 'draft';
      
      // Description is required if status is not 'draft'
      if (status !== 'draft') {
        if (!value || !value.trim()) {
          throw new Error('Description is required');
        }
      }
      
      // If description is provided, validate it
      if (value && value.trim()) {
        if (value.length > 1000) {
          throw new Error('Description cannot exceed 1000 characters');
        }
      }
      return true;
    }),
  
  body('location.city')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('City cannot exceed 50 characters'),
  
  body('location.state')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('State cannot exceed 50 characters'),
  
  body('location.country')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Country cannot exceed 50 characters'),
  
  body('location.coordinates.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  body('location.coordinates.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  
  handleValidationErrors
];

// Payment validation rules
const validatePayment = [
  body('amount')
    .isNumeric()
    .withMessage('Amount must be a number')
    .isFloat({ min: 1 })
    .withMessage('Amount must be at least 1'),
  
  body('type')
    .isIn(['deposit', 'withdrawal', 'payment'])
    .withMessage('Invalid payment type'),
  
  handleValidationErrors
];

// Review validation rules
const validateReview = [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  
  body('comment')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Comment cannot exceed 500 characters'),
  
  body('professionalism')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Professionalism rating must be between 1 and 5'),
  
  body('communication')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Communication rating must be between 1 and 5'),
  
  body('quality')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Quality rating must be between 1 and 5'),
  
  handleValidationErrors
];

// Parameter validation
const validateObjectId = (paramName) => [
  param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName} ID`),
  
  handleValidationErrors
];

// Platform parameter validation
const validatePlatformParam = [
  param('platform')
    .isIn(['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'])
    .withMessage('Platform must be one of: instagram, tiktok, youtube, twitter, facebook'),
  
  handleValidationErrors
];

// Query validation
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  handleValidationErrors
];

// Social media validation
const validateSocialMedia = [
  body('platform')
    .notEmpty()
    .withMessage('Platform is required')
    .isIn(['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'])
    .withMessage('Platform must be one of: instagram, tiktok, youtube, twitter, facebook'),
  
  body('username')
    .notEmpty()
    .withMessage('Username is required')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Username must be between 1 and 100 characters'),
  
  body('followers')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Followers must be a non-negative integer'),
  
  body('engagement')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Engagement must be a non-negative number'),
  
  body('avgViews')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Average views must be a non-negative integer'),
  
  body('audienceInsights.topLocations')
    .optional()
    .isArray()
    .withMessage('Top locations must be an array'),
  
  body('audienceInsights.genderDistribution')
    .optional()
    .isObject()
    .withMessage('Gender distribution must be an object'),
  
  body('audienceInsights.ageGroups')
    .optional()
    .isArray()
    .withMessage('Age groups must be an array'),
  
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateUserSignup,
  validateUserLogin,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
  validateCampaign,
  validateOffer,
  validatePayment,
  validateReview,
  validateSocialMedia,
  validateObjectId,
  validatePlatformParam,
  validatePagination
};
