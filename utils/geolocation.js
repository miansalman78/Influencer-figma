/**
 * Geolocation Utility
 * 
 * Optional utility for getting user's current location
 * Requires: @react-native-community/geolocation (optional dependency)
 * 
 * Usage:
 *   import { getCurrentLocation } from '../utils/geolocation';
 *   const location = await getCurrentLocation();
 */

/**
 * Get current user location
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
export const getCurrentLocation = async () => {
  try {
    // Check if geolocation is available
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          },
          (error) => {
            console.warn('[Geolocation] Error getting location:', error.message);
            resolve(null);
          },
          {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 300000, // 5 minutes
          }
        );
      });
    }

    // Try React Native Geolocation if available
    try {
      const Geolocation = require('@react-native-community/geolocation');
      return new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          },
          (error) => {
            console.warn('[Geolocation] Error getting location:', error.message);
            resolve(null);
          },
          {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 300000,
          }
        );
      });
    } catch (e) {
      // Geolocation library not installed
      console.log('[Geolocation] Geolocation library not available');
      return null;
    }
  } catch (error) {
    console.warn('[Geolocation] Error:', error);
    return null;
  }
};

/**
 * Request location permission (for React Native)
 * @returns {Promise<boolean>}
 */
export const requestLocationPermission = async () => {
  try {
    // Try React Native Permissions if available
    const { PERMISSIONS, request } = require('react-native-permissions');
    
    const result = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION || PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
    return result === 'granted';
  } catch (e) {
    // Permissions library not installed
    console.log('[Geolocation] Permissions library not available');
    return false;
  }
};




























