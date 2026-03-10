import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { View, Text, StyleSheet } from 'react-native';

/**
 * RoleGuard Component
 * 
 * Protects content based on user role. Only renders children if user has required role.
 * 
 * @param {string[]} allowedRoles - Array of allowed roles ('brand', 'creator', 'influencer')
 * @param {ReactNode} children - Content to render if access granted
 * @param {ReactNode} fallback - Content to render if access denied (optional)
 * @param {boolean} showError - Show error message if access denied (default: false)
 */
const RoleGuard = ({ allowedRoles = [], children, fallback = null, showError = false }) => {
  const { user } = useAuth();
  
  // Normalize roles - treat 'influencer' as 'creator'
  const userRole = user?.role?.toLowerCase();
  const normalizedUserRole = userRole === 'influencer' ? 'creator' : userRole;
  
  // Check if user role is in allowed roles
  const normalizedAllowedRoles = allowedRoles.map(role => role.toLowerCase());
  const hasAccess = normalizedAllowedRoles.some(role => {
    const normalizedRole = role === 'influencer' ? 'creator' : role;
    return normalizedUserRole === normalizedRole;
  });
  
  if (hasAccess) {
    return <>{children}</>;
  }
  
  // Show error message if requested
  if (showError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          Access denied. This content is only available for {allowedRoles.join(' or ')}.
        </Text>
      </View>
    );
  }
  
  // Return fallback or null
  return fallback || null;
};

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    textAlign: 'center',
  },
});

export default RoleGuard;

