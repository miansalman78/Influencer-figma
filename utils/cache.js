/**
 * Cache Utility
 * 
 * Provides centralized caching functionality using AsyncStorage for persistence
 * and in-memory cache for fast access.
 * 
 * Features:
 * - TTL (Time To Live) support
 * - Automatic cache expiration
 * - In-memory cache for fast access
 * - AsyncStorage persistence for offline support
 * - Cache invalidation helpers
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// In-memory cache for fast access
const memoryCache = new Map();

// Default TTL values (in milliseconds)
const DEFAULT_TTL = {
  SHORT: 5 * 60 * 1000,      // 5 minutes
  MEDIUM: 30 * 60 * 1000,    // 30 minutes
  LONG: 60 * 60 * 1000,      // 1 hour
  VERY_LONG: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Set cache value
 * @param {string} key - Cache key
 * @param {any} value - Value to cache (will be JSON stringified)
 * @param {number|null} ttl - Time to live in milliseconds (null = no expiration)
 * @param {boolean} persist - Whether to persist to AsyncStorage (default: true)
 */
export const setCache = async (key, value, ttl = DEFAULT_TTL.MEDIUM, persist = true) => {
  try {
    const cacheItem = {
      value,
      timestamp: Date.now(),
      ttl: ttl ? Date.now() + ttl : null,
    };

    // Store in memory cache
    memoryCache.set(key, cacheItem);

    // Store in AsyncStorage if persist is true
    if (persist) {
      await AsyncStorage.setItem(`@cache_${key}`, JSON.stringify(cacheItem));
    }
  } catch (error) {
    console.error(`[Cache] Error setting cache for key "${key}":`, error);
  }
};

/**
 * Get cache value
 * @param {string} key - Cache key
 * @param {boolean} useMemory - Use memory cache first (default: true)
 * @returns {any|null} Cached value or null if not found/expired
 */
export const getCache = async (key, useMemory = true) => {
  try {
    // Try memory cache first if enabled
    if (useMemory) {
      const memoryItem = memoryCache.get(key);
      if (memoryItem) {
        // Check if expired
        if (memoryItem.ttl && Date.now() > memoryItem.ttl) {
          memoryCache.delete(key);
          await AsyncStorage.removeItem(`@cache_${key}`);
          return null;
        }
        return memoryItem.value;
      }
    }

    // Try AsyncStorage
    const stored = await AsyncStorage.getItem(`@cache_${key}`);
    if (stored) {
      const cacheItem = JSON.parse(stored);
      
      // Check if expired
      if (cacheItem.ttl && Date.now() > cacheItem.ttl) {
        await AsyncStorage.removeItem(`@cache_${key}`);
        memoryCache.delete(key);
        return null;
      }

      // Update memory cache
      memoryCache.set(key, cacheItem);
      return cacheItem.value;
    }

    return null;
  } catch (error) {
    console.error(`[Cache] Error getting cache for key "${key}":`, error);
    return null;
  }
};

/**
 * Remove cache value
 * @param {string} key - Cache key
 */
export const removeCache = async (key) => {
  try {
    memoryCache.delete(key);
    await AsyncStorage.removeItem(`@cache_${key}`);
  } catch (error) {
    console.error(`[Cache] Error removing cache for key "${key}":`, error);
  }
};

/**
 * Clear all cache
 * @param {boolean} clearMemory - Clear memory cache (default: true)
 * @param {boolean} clearStorage - Clear AsyncStorage cache (default: true)
 */
export const clearCache = async (clearMemory = true, clearStorage = true) => {
  try {
    if (clearMemory) {
      memoryCache.clear();
    }

    if (clearStorage) {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith('@cache_'));
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch (error) {
    console.error('[Cache] Error clearing cache:', error);
  }
};

/**
 * Deep clear: remove ALL app-related data from memory and AsyncStorage.
 * Use on logout so the next user never sees previous user's data.
 * - Clears in-memory cache
 * - Removes every AsyncStorage key that starts with @ (e.g. @adpartnr_token, @adpartnr_user, @cache_*)
 */
export const clearAllAppStorage = async () => {
  try {
    memoryCache.clear();
    const keys = await AsyncStorage.getAllKeys();
    const appKeys = keys.filter(key => typeof key === 'string' && key.startsWith('@'));
    if (appKeys.length > 0) {
      await AsyncStorage.multiRemove(appKeys);
    }
  } catch (error) {
    console.error('[Cache] Error clearing all app storage:', error);
    throw error;
  }
};

/**
 * Clear cache by pattern
 * @param {string} pattern - Pattern to match (e.g., 'user_', 'campaign_')
 */
export const clearCachePattern = async (pattern) => {
  try {
    // Clear from memory
    const memoryKeys = Array.from(memoryCache.keys());
    memoryKeys.forEach(key => {
      if (key.includes(pattern)) {
        memoryCache.delete(key);
      }
    });

    // Clear from AsyncStorage
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(key => key.startsWith('@cache_') && key.includes(pattern));
    await AsyncStorage.multiRemove(cacheKeys);
  } catch (error) {
    console.error(`[Cache] Error clearing cache pattern "${pattern}":`, error);
  }
};

/**
 * Check if cache key exists and is valid (not expired)
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} True if cache exists and is valid
 */
export const hasCache = async (key) => {
  const value = await getCache(key);
  return value !== null;
};

/**
 * Cache helper for API responses
 * @param {string} cacheKey - Cache key
 * @param {Function} fetchFunction - Function that returns Promise with data
 * @param {number|null} ttl - Time to live in milliseconds
 * @param {boolean} forceRefresh - Force refresh even if cache exists
 * @returns {Promise<any>} Cached or fresh data
 */
export const getCachedData = async (cacheKey, fetchFunction, ttl = DEFAULT_TTL.MEDIUM, forceRefresh = false) => {
  // Return cached data if available and not forcing refresh
  if (!forceRefresh) {
    const cached = await getCache(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  // Fetch fresh data
  try {
    const data = await fetchFunction();
    await setCache(cacheKey, data, ttl);
    return data;
  } catch (error) {
    // On error, try to return cached data as fallback
    const cached = await getCache(cacheKey);
    if (cached !== null) {
      console.warn(`[Cache] Error fetching data, using cached version for "${cacheKey}"`);
      return cached;
    }
    throw error;
  }
};

// Export TTL constants
export { DEFAULT_TTL };


