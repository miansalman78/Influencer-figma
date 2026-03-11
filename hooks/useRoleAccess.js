import { useMemo } from 'react';
import { useAuth } from './useAuth';

/**
 * useRoleAccess Hook
 * 
 * Hook to check user role and access permissions
 * 
 * @returns {Object} Role access utilities
 */
export const useRoleAccess = () => {
  const { user } = useAuth();
  
  const userRole = user?.role?.toLowerCase();
  const creatorRole = user?.creatorRole?.toLowerCase();
  
  // Normalize role - treat 'influencer' as 'creator'
  const normalizedRole = useMemo(() => {
    if (userRole === 'brand') return 'brand';
    if (userRole === 'creator' || userRole === 'influencer' || creatorRole === 'influencer' || creatorRole === 'creator') {
      return 'creator';
    }
    return userRole || null;
  }, [userRole, creatorRole]);
  
  const isBrand = normalizedRole === 'brand';
  const isCreator = normalizedRole === 'creator';
  const isInfluencer = userRole === 'influencer' || creatorRole === 'influencer';
  
  /**
   * Check if user has access to a role
   * @param {string|string[]} allowedRoles - Single role or array of roles
   * @returns {boolean} True if user has access
   */
  const hasRole = (allowedRoles) => {
    if (!normalizedRole) return false;
    
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    return rolesArray.some(role => {
      const normalizedAllowedRole = role.toLowerCase();
      if (normalizedAllowedRole === 'influencer') {
        return normalizedRole === 'creator';
      }
      return normalizedRole === normalizedAllowedRole;
    });
  };
  
  /**
   * Check if user can access brand-only content
   * @returns {boolean}
   */
  const canAccessBrandContent = () => hasRole('brand');
  
  /**
   * Check if user can access creator-only content
   * @returns {boolean}
   */
  const canAccessCreatorContent = () => hasRole(['creator', 'influencer']);
  
  return {
    userRole: normalizedRole,
    isBrand,
    isCreator,
    isInfluencer,
    hasRole,
    canAccessBrandContent,
    canAccessCreatorContent,
  };
};

export default useRoleAccess;

