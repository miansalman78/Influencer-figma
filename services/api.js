import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from '../utils/logger';
import { API_CONFIG } from '../config/env.config';

let authToken = null;

/** Base URL for all API requests – from .env (API_BASE_URL) via config/env.config.js */
const API_BASE_URL = API_CONFIG.BASE_URL;

export const apiRequest = async (path, { method = 'GET', body, token, retries = 1, headers: customHeaders } = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...customHeaders,
  };

  if (customHeaders && customHeaders['Content-Type'] === 'multipart/form-data') {
    delete headers['Content-Type']; // Let fetch handle boundary
  }

  // Resolve token from explicit arg, in‑memory cache, global, or AsyncStorage (shared with axios client)
  let resolvedToken = token ?? authToken ?? globalThis.__AUTH_TOKEN__;

  if (!resolvedToken && AsyncStorage) {
    try {
      // Reuse the same storage key as apiClient.js
      resolvedToken = await AsyncStorage.getItem('@adpartnr_token');
      if (resolvedToken) {
        authToken = resolvedToken;
        globalThis.__AUTH_TOKEN__ = resolvedToken;
      }
    } catch (storageError) {
      logger.error('[API] Error reading token from AsyncStorage in apiRequest', storageError);
    }
  }

  if (resolvedToken) {
    headers.Authorization = `Bearer ${resolvedToken}`;
    logger.debug('[API] Token attached', { tokenPrefix: resolvedToken.substring(0, 20) + '...' });
  } else {
    logger.warn('[API] No token available for authenticated request');
  }

  const url = `${API_BASE_URL}${path}`;
  logger.api(method, url);

  let response;
  let lastError;

  // Retry logic for Render.com free tier (servers can sleep and take time to wake up)
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      logger.debug(`[API] Retry attempt ${attempt}/${retries}...`);
      // Wait before retry (exponential backoff: 2s, 4s, etc.)
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }

    let timeoutId;
    try {
      // Create abort controller for timeout (60 seconds for Render.com cold starts)
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      console.log(`[API Request] Method: ${method}, URL: ${url}`);
      // console.log(`[API Request] Headers:`, JSON.stringify(headers));

      const fetchPromise = fetch(url, {
        method,
        headers,
        ...(body ? { body: (body instanceof FormData) ? body : JSON.stringify(body) } : {}),
        signal: controller.signal,
      });

      response = await fetchPromise;
      if (timeoutId) clearTimeout(timeoutId);

      // If we got a response, break out of retry loop
      lastError = null;
      break;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      lastError = error;
      logger.error(`[API] Attempt ${attempt + 1} failed`, error);

      // Don't retry on last attempt
      if (attempt === retries) {
        let errorMessage = 'Unable to reach the server.';

        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
          errorMessage = 'Request timed out after multiple attempts. The server may be sleeping (Render.com free tier). Please try again in a few moments.';
        } else if (error.message && error.message.includes('Network request failed')) {
          errorMessage = `Network request failed after ${retries + 1} attempts. Please check:\n1. Your internet connection\n2. Backend server is running at ${API_BASE_URL}\n3. If using Render.com, wait a moment as free tier servers can take 30-60s to wake up`;
        } else if (error.message) {
          errorMessage = `Network error: ${error.message}. Please check your internet connection.`;
        } else {
          errorMessage = `Cannot connect to server at ${API_BASE_URL} after ${retries + 1} attempts.\n\nPlease ensure:\n1. You have an active internet connection\n2. The backend server is running\n3. Your device can access the server URL\n4. If using Render.com, wait 30-60 seconds for cold start`;
        }

        const networkError = new Error(errorMessage);
        networkError.cause = error;
        networkError.isNetworkError = true;
        throw networkError;
      }
      // Continue to retry
      continue;
    }
  }

  // If all retries failed and we don't have a response, throw error
  if (!response && lastError) {
    throw lastError;
  }

  let data;
  try {
    const text = await response.text();
    data = text ? JSON.parse(text) : {};
  } catch (parseError) {
    logger.error('[API] JSON parse error', parseError);
    data = {};
  }

  if (!response.ok || data.success === false) {
    const message = data.message || data.error || data.msg || `Server error: ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    error.isNetworkError = false;
    throw error;
  }

  return data;
};

export const getApiBaseUrl = () => API_BASE_URL;

export const setAuthToken = (token) => {
  authToken = token || null;
  if (token) {
    globalThis.__AUTH_TOKEN__ = token;
  }
};

export const clearAuthToken = () => {
  authToken = null;
  delete globalThis.__AUTH_TOKEN__;
};

export const getAuthToken = () => authToken ?? globalThis.__AUTH_TOKEN__ ?? null;

