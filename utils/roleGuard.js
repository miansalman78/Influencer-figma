/**
 * Role-based access control utilities
 * Prevents brands from accessing creator pages and vice versa
 */

import { getUser } from '../services/apiClient';

/**
 * Get current user role from storage
 * @returns {Promise<string|null>} User role ('brand', 'creator', etc.) or null
 */
export const getCurrentUserRole = async () => {
  try {
    const user = await getUser();
    if (!user) return null;
    
    // Normalize role - backend returns 'brand' or 'creator'
    const role = user.role?.toLowerCase();
    return role || null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
};

/**
 * Check if current user is a brand
 * @returns {Promise<boolean>}
 */
export const isBrand = async () => {
  const role = await getCurrentUserRole();
  return role === 'brand';
};

/**
 * Check if current user is a creator/influencer
 * @returns {Promise<boolean>}
 */
export const isCreator = async () => {
  const role = await getCurrentUserRole();
  return role === 'creator' || role === 'influencer';
};

/**
 * Guard function to prevent navigation if user doesn't have required role
 * @param {string} requiredRole - 'brand' or 'creator'
 * @param {Function} navigation - Navigation object
 * @param {Function} onDenied - Callback when access is denied
 * @returns {Promise<boolean>} true if allowed, false if denied
 */
export const checkRoleAndNavigate = async (requiredRole, navigation, onDenied = null) => {
  const userRole = await getCurrentUserRole();
  const normalizedRequired = requiredRole.toLowerCase();
  const normalizedUser = userRole?.toLowerCase();
  
  if (normalizedRequired === 'brand' && normalizedUser !== 'brand') {
    if (onDenied) {
      onDenied('This page is only available for brands.');
    } else {
      // Default: redirect to appropriate dashboard
      if (normalizedUser === 'creator' || normalizedUser === 'influencer') {
        navigation?.navigate('AppNavigator', { role: 'Creator' });
      } else {
        navigation?.navigate('Login');
      }
    }
    return false;
  }
  
  if (normalizedRequired === 'creator' && normalizedUser !== 'creator' && normalizedUser !== 'influencer') {
    if (onDenied) {
      onDenied('This page is only available for creators/influencers.');
    } else {
      // Default: redirect to appropriate dashboard
      if (normalizedUser === 'brand') {
        navigation?.navigate('DashboardNew', { role: 'Brand' });
      } else {
        navigation?.navigate('Login');
      }
    }
    return false;
  }
  
  return true;
};

