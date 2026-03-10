// Admin configuration for platform features
// These can be toggled via environment variables

const ENABLE_CURRENCY_CONVERSION = process.env.ENABLE_CURRENCY_CONVERSION === 'true' || process.env.ENABLE_CURRENCY_CONVERSION === '1';

module.exports = {
  ENABLE_CURRENCY_CONVERSION
};

