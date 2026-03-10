/**
 * useAuth Hook
 * 
 * Custom hook to access authentication context
 * Provides easy access to auth state and methods
 */

import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

/**
 * useAuth Hook
 * Returns authentication context values
 * 
 * @returns {Object} Auth context with user, token, loading, signUp, signIn, signOut, restoreSession
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  
  return context;
};

export default useAuth;

