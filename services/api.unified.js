/**
 * Unified API Client
 * 
 * Enhanced API client that combines the best features of apiClient.js and api.js
 * Provides consistent error handling, retry logic, and token management
 * 
 * This is the recommended API client going forward
 * Gradually migrate services to use this client
 */

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, SECURITY_CONFIG } from '../config/env.config';
import logger from '../utils/logger';
import { handleApiError, isNetworkError, isTimeoutError } from '../utils/errorHandler';

// Create axios instance with default config
const apiUnified = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Storage keys
const STORAGE_KEYS = {
  TOKEN: SECURITY_CONFIG.TOKEN_STORAGE_KEY,
  USER: SECURITY_CONFIG.USER_STORAGE_KEY,
};

/**
 * Request Interceptor
 * Automatically attaches JWT token and handles request logging
 */
apiUnified.interceptors.request.use(
  async (config) => {
    try {
      // Get token from AsyncStorage
      const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
      
      // If token exists, attach it to Authorization header
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      
      // Log API request (development only)
      logger.api(config.method?.toUpperCase(), config.url, config.data);
      
      return config;
    } catch (error) {
      logger.error('[API] Error getting token from storage', error);
      return config;
    }
  },
  (error) => {
    logger.error('[API] Request error', error);
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor
 * Handles response validation, error formatting, and 401 handling
 */
apiUnified.interceptors.response.use(
  (response) => {
    // Check if backend returned success: false
    if (response.data?.success === false) {
      const errorMessage = response.data?.message || 'Request failed';
      const error = new Error(errorMessage);
      error.status = response.status || 400;
      error.data = response.data;
      error.isNetworkError = false;
      return Promise.reject(error);
    }
    
    // Return successful response
    return response;
  },
  async (error) => {
    // Handle 401 Unauthorized - token expired or invalid
    if (error.response?.status === 401) {
      logger.warn('[API] 401 Unauthorized - Token expired or invalid');
      
      try {
        // Clear token and user from storage
        await AsyncStorage.multiRemove([STORAGE_KEYS.TOKEN, STORAGE_KEYS.USER]);
        
        // Clear token from other API clients if they exist
        if (global.clearAuthToken) {
          global.clearAuthToken();
        }
        
        // Emit event to notify app that user should be logged out
        if (global.authLogoutCallback) {
          global.authLogoutCallback();
        }
      } catch (storageError) {
        logger.error('[API] Error clearing storage', storageError);
      }
    }
    
    // Handle network errors
    if (!error.response) {
      const networkError = new Error(
        error.message || 'Network request failed. Please check your internet connection.'
      );
      networkError.isNetworkError = true;
      networkError.isTimeoutError = isTimeoutError(error);
      return Promise.reject(networkError);
    }
    
    // Handle other errors
    let errorMessage = 'An unexpected error occurred';
    
    if (error.response?.data) {
      errorMessage = error.response.data.message || 
                     error.response.data.error || 
                     error.response.data.msg ||
                     error.message || 
                     'An unexpected error occurred';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    const apiError = new Error(errorMessage);
    apiError.status = error.response?.status;
    apiError.data = error.response?.data;
    apiError.isNetworkError = false;
    return Promise.reject(apiError);
  }
);

/**
 * Retry logic for failed requests
 * Retries network errors and 5xx server errors
 */
const retryRequest = async (config, retries = API_CONFIG.RETRY_ATTEMPTS) => {
  let lastError;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff
        const delay = API_CONFIG.RETRY_DELAY * attempt;
        logger.debug(`[API] Retry attempt ${attempt}/${retries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      return await apiUnified(config);
    } catch (error) {
      lastError = error;
      
      // Don't retry on last attempt
      if (attempt === retries) {
        break;
      }
      
      // Only retry network errors and 5xx errors
      const shouldRetry = isNetworkError(error) || 
                         (error.response?.status >= 500 && error.response?.status < 600);
      
      if (!shouldRetry) {
        break;
      }
    }
  }
  
  throw lastError;
};

/**
 * Enhanced request method with retry logic
 */
apiUnified.requestWithRetry = async (config, retries = API_CONFIG.RETRY_ATTEMPTS) => {
  return retryRequest(config, retries);
};

/**
 * Get request with retry
 */
export const get = async (url, config = {}) => {
  return apiUnified.requestWithRetry({
    ...config,
    method: 'GET',
    url,
  });
};

/**
 * Post request with retry
 */
export const post = async (url, data, config = {}) => {
  return apiUnified.requestWithRetry({
    ...config,
    method: 'POST',
    url,
    data,
  });
};

/**
 * Put request with retry
 */
export const put = async (url, data, config = {}) => {
  return apiUnified.requestWithRetry({
    ...config,
    method: 'PUT',
    url,
    data,
  });
};

/**
 * Patch request with retry
 */
export const patch = async (url, data, config = {}) => {
  return apiUnified.requestWithRetry({
    ...config,
    method: 'PATCH',
    url,
    data,
  });
};

/**
 * Delete request with retry
 */
export const del = async (url, config = {}) => {
  return apiUnified.requestWithRetry({
    ...config,
    method: 'DELETE',
    url,
  });
};

/**
 * Token management functions (for compatibility)
 */
export const getToken = async () => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
  } catch (error) {
    logger.error('[API] Error getting token', error);
    return null;
  }
};

export const setToken = async (token) => {
  try {
    if (token) {
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, token);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
    }
  } catch (error) {
    logger.error('[API] Error setting token', error);
  }
};

export const clearAuthData = async () => {
  try {
    await AsyncStorage.multiRemove([STORAGE_KEYS.TOKEN, STORAGE_KEYS.USER]);
  } catch (error) {
    logger.error('[API] Error clearing auth data', error);
  }
};

/**
 * Set logout callback
 */
export const setAuthLogoutCallback = (callback) => {
  global.authLogoutCallback = callback;
};

// Export default instance
export default apiUnified;

