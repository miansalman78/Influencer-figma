/**
 * Axios API Client for Backend Integration
 * 
 * Base URL comes from .env (API_BASE_URL) via config/env.config.js.
 * Automatic JWT token attachment, interceptors, and token refresh on 401.
 */

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAuthToken } from './api';
import { API_CONFIG } from '../config/env.config';
import logger from '../utils/logger';

/** Base URL from .env (API_BASE_URL) – single source for all frontend API */
const BASE_URL = API_CONFIG.BASE_URL;

/**
 * Public API client – no auth token, no 401 logout.
 * Use for endpoints that are intentionally public (e.g. /location/countries, states, cities).
 * Ensures these work everywhere: before login, on public screens, etc.
 */
export const publicApiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

publicApiClient.interceptors.response.use(
  (response) => {
    if (response.data?.success === false) {
      const err = new Error(response.data?.message || 'Request failed');
      err.status = response.status || 400;
      err.data = response.data;
      return Promise.reject(err);
    }
    return response;
  },
  (error) => {
    const message = error.response?.data?.message || error.response?.data?.error || error.message || 'Request failed';
    const apiError = new Error(message);
    apiError.status = error.response?.status;
    apiError.data = error.response?.data;
    return Promise.reject(apiError);
  }
);

// Create axios instance (authenticated)
const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 300000, // 5 minutes timeout for large file uploads
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Storage keys for token and user
const STORAGE_KEYS = {
  TOKEN: '@adpartnr_token',
  USER: '@adpartnr_user',
};

/**
 * Request Interceptor
 * Automatically attaches JWT token to Authorization header if available
 */
apiClient.interceptors.request.use(
  async (config) => {
    try {
      // Get token from AsyncStorage
      const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);

      // If token exists, attach it to Authorization header
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      logger.api(config.method?.toUpperCase(), config.url);
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
 * Handles 401 errors (unauthorized) by clearing token and redirecting to login
 */
apiClient.interceptors.response.use(
  (response) => {
    // Check if backend returned success: false
    // Backend response: { success: true/false, message: "...", data: {...} }
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

        // Clear token from api.js (for fetch-based API calls)
        clearAuthToken();

        // Emit event to notify app that user should be logged out
        // This will be handled by AuthContext
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
 * Get token from AsyncStorage
 */
export const getToken = async () => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
  } catch (error) {
    logger.error('[API] Error getting token', error);
    return null;
  }
};

/**
 * Set token in AsyncStorage
 */
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

/**
 * Get user from AsyncStorage
 */
export const getUser = async () => {
  try {
    const userStr = await AsyncStorage.getItem(STORAGE_KEYS.USER);
    return userStr ? JSON.parse(userStr) : null;
  } catch (error) {
    logger.error('[API] Error getting user', error);
    return null;
  }
};

/**
 * Set user in AsyncStorage
 */
export const setUser = async (user) => {
  try {
    if (user) {
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.USER);
    }
  } catch (error) {
    logger.error('[API] Error setting user', error);
  }
};

/**
 * Clear all auth data from AsyncStorage
 */
export const clearAuthData = async () => {
  try {
    await AsyncStorage.multiRemove([STORAGE_KEYS.TOKEN, STORAGE_KEYS.USER]);
  } catch (error) {
    logger.error('[API] Error clearing auth data', error);
  }
};

/**
 * Set logout callback function
 * This will be called when token expires (401 error)
 */
export const setAuthLogoutCallback = (callback) => {
  global.authLogoutCallback = callback;
};

export default apiClient;

