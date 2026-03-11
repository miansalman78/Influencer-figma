/**
 * Environment Configuration
 *
 * All frontend API calls use API_CONFIG.BASE_URL. In dev, if .env is not loaded,
 * DEV_API_BASE_URL is used so the app hits your local backend (e.g. physical device).
 */

// Dev fallback: use deployed API by default to avoid local IPs
const DEV_API_BASE_URL = 'https://adpartnr.onrender.com/api';
const PRODUCTION_API_URL = 'https://adpartnr.onrender.com/api';

// Check if react-native-config is available
let Config;
try {
  Config = require('react-native-config').default;
} catch (e) {
  Config = {};
}

// Environment detection
const isDevelopment = __DEV__;
const isProduction = !isDevelopment;

/**
 * Get environment variable with fallback
 */
const getEnvVar = (key, fallback = null) => {
  return Config[key] || process.env[key] || fallback;
};

/** Normalize API base URL (no trailing slash). Single source for all frontend API calls. */
const getApiBaseUrl = () => {
  const defaultUrl = isDevelopment ? DEV_API_BASE_URL : PRODUCTION_API_URL;
  let url = getEnvVar('API_BASE_URL', defaultUrl);
  if (!url || typeof url !== 'string') url = defaultUrl;
  url = url.trim().replace(/\/+$/, '') || PRODUCTION_API_URL;
  // In dev, use production API if FORCE_PRODUCTION=true (set in .env)
  const forceProduction = getEnvVar('FORCE_PRODUCTION', 'false') === 'true';
  if (isDevelopment && !forceProduction && url === PRODUCTION_API_URL) {
    url = DEV_API_BASE_URL;
  }
  return url;
};

/**
 * API Configuration (all frontend API clients use API_CONFIG.BASE_URL from .env)
 */
export const API_CONFIG = {
  BASE_URL: getApiBaseUrl(),
  TIMEOUT: parseInt(getEnvVar('API_TIMEOUT', '60000'), 10),
  RETRY_ATTEMPTS: parseInt(getEnvVar('API_RETRY_ATTEMPTS', '1'), 10),
  RETRY_DELAY: parseInt(getEnvVar('API_RETRY_DELAY', '2000'), 10),
};

/**
 * Payment Configuration
 */
export const PAYMENT_CONFIG = {
  STRIPE_PUBLIC_KEY: getEnvVar('STRIPE_PUBLIC_KEY', ''),
  STRIPE_TEST_PUBLIC_KEY: getEnvVar('STRIPE_TEST_PUBLIC_KEY', ''),
  STRIPE_USE_TEST: getEnvVar('STRIPE_USE_TEST', 'false'),
  PAYSTACK_PUBLIC_KEY: getEnvVar('PAYSTACK_PUBLIC_KEY', ''),
  PAYPAL_CLIENT_ID: getEnvVar('PAYPAL_CLIENT_ID', ''),
  PAYPAL_CLIENT_SECRET: getEnvVar('PAYPAL_CLIENT_SECRET', ''),
  PAYPAL_MODE: getEnvVar('PAYPAL_MODE', 'sandbox'), // 'sandbox' or 'live'
  FLUTTERWAVE_PUBLIC_KEY: getEnvVar('FLUTTERWAVE_PUBLIC_KEY', ''),
};


/**
 * App Configuration
 */
export const APP_CONFIG = {
  ENV: getEnvVar('ENV', isDevelopment ? 'development' : 'production'),
  APP_NAME: getEnvVar('APP_NAME', 'InfluencerNative'),
  VERSION: getEnvVar('APP_VERSION', '0.0.1'),
  IS_DEVELOPMENT: isDevelopment,
  IS_PRODUCTION: isProduction,
  /** Support user ID for "Chat with support" – must exist in DB/Firestore. Set in .env as SUPPORT_USER_ID. */
  SUPPORT_USER_ID: getEnvVar('SUPPORT_USER_ID', ''),
};

/**
 * Feature Flags
 */
export const FEATURE_FLAGS = {
  ENABLE_ANALYTICS: getEnvVar('ENABLE_ANALYTICS', 'false') === 'true',
  ENABLE_CRASH_REPORTING: getEnvVar('ENABLE_CRASH_REPORTING', 'false') === 'true',
  ENABLE_OFFLINE_MODE: getEnvVar('ENABLE_OFFLINE_MODE', 'false') === 'true',
  ENABLE_DEBUG_MODE: isDevelopment || getEnvVar('ENABLE_DEBUG_MODE', 'false') === 'true',
};

/**
 * Security Configuration
 */
export const SECURITY_CONFIG = {
  TOKEN_STORAGE_KEY: '@adpartnr_token',
  USER_STORAGE_KEY: '@adpartnr_user',
  SESSION_TIMEOUT: parseInt(getEnvVar('SESSION_TIMEOUT', '3600000'), 10), // 1 hour
};

/**
 * Logging Configuration
 */
export const LOGGING_CONFIG = {
  LOG_LEVEL: getEnvVar('LOG_LEVEL', isDevelopment ? 'debug' : 'error'),
  ENABLE_CONSOLE: isDevelopment || getEnvVar('ENABLE_CONSOLE_LOGS', 'false') === 'true',
  ENABLE_REMOTE_LOGGING: getEnvVar('ENABLE_REMOTE_LOGGING', 'false') === 'true',
};

// Export all config (include SUPPORT_USER_ID via APP_CONFIG)
export default {
  API_CONFIG,
  PAYMENT_CONFIG,
  APP_CONFIG,
  FEATURE_FLAGS,
  SECURITY_CONFIG,
  LOGGING_CONFIG,
};
