/**
 * Auth Context for Authentication State Management
 * 
 * This context provides:
 * - user: Current authenticated user object
 * - token: JWT authentication token
 * - loading: Loading state for async operations
 * - signUp: Function to register new user
 * - signIn: Function to login user
 * - signOut: Function to logout user
 * - restoreSession: Function to restore session from AsyncStorage
 */

import React, { createContext, useState, useEffect, useCallback } from 'react';
import apiClient, { getToken, getUser, setToken, setUser, clearAuthData, setAuthLogoutCallback } from '../services/apiClient';
import { setAuthToken, clearAuthToken } from '../services/api';
import { clearCache, clearAllAppStorage } from '../utils/cache';
import messaging from '@react-native-firebase/messaging';
import auth from '@react-native-firebase/auth';
import { Alert, Platform } from 'react-native';

// Create Auth Context
export const AuthContext = createContext({
  user: null,
  token: null,
  loading: true,
  signUp: async () => { },
  signIn: async () => { },
  signOut: async () => { },
  restoreSession: async () => { },
  refreshUser: async () => { },
  googleOAuth: async () => { },
  appleOAuth: async () => { },
});

/**
 * Auth Provider Component
 * Wraps the app and provides authentication state and methods
 */
export const AuthProvider = ({ children }) => {
  const [user, setUserState] = useState(null);
  const [token, setTokenState] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * Initialize Firebase Messaging and Auth
   */
  const setupFirebase = useCallback(async () => {
    try {
      // 1. Get Firebase custom token from backend
      try {
        const tokenResponse = await apiClient.get('/messages/token');
        if (tokenResponse.data && tokenResponse.data.success && tokenResponse.data.data?.token) {
          // Sign in with custom token
          await auth().signInWithCustomToken(tokenResponse.data.data.token);
          console.log('[Auth] Firebase Auth successful');
        }
      } catch (tokenErr) {
        console.warn('[Auth] Firebase custom token failed:', tokenErr.message);
      }

      // 2. Register device and handle permissions (Android/iOS safe)
      try {
        await messaging().registerDeviceForRemoteMessages();
      } catch (_) { /* ignore */ }
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      if (!enabled) {
        console.warn('[Auth] Notifications permission not granted');
      }

      // 3. Get and Update FCM Token
      const fcmToken = await messaging().getToken();
      if (fcmToken) {
        console.log('[Auth] FCM Token generated');
        await apiClient.put('/auth/fcm-token', { fcmToken });
      }
      // 3b. Handle token refresh
      messaging().onTokenRefresh(async (newToken) => {
        try {
          await apiClient.put('/auth/fcm-token', { fcmToken: newToken });
          console.log('[Auth] FCM Token refreshed');
        } catch (e) {
          console.warn('[Auth] Failed to update refreshed FCM token');
        }
      });

      // 4. Set up message listeners – show system notification in foreground
      const notifee = require('@notifee/react-native').default;
      const { AndroidImportance } = require('@notifee/react-native');
      try {
        // Android 13+ requires runtime POST_NOTIFICATIONS permission
        await notifee.requestPermission();
      } catch (_) {}
      // Ensure channel
      try {
        await notifee.createChannel({
          id: 'default',
          name: 'General Notifications',
          // Use HIGH to show heads-up notifications
          importance: AndroidImportance.HIGH,
        });
      } catch (_) {}
      const unsubscribe = messaging().onMessage(async remoteMessage => {
        try {
          const title = remoteMessage?.notification?.title || remoteMessage?.data?.title || 'Notification';
          const body = remoteMessage?.notification?.body || remoteMessage?.data?.body || '';
          await notifee.displayNotification({
            title,
            body,
            android: { channelId: 'default', pressAction: { id: 'default' } },
          });
        } catch (e) {
          console.warn('[Auth] Foreground notification display error:', e?.message);
        }
      });

      // 5. Handle notification taps when app in background
      messaging().onNotificationOpenedApp(remoteMessage => {
        console.log('[Auth] Notification caused app to open from background:', remoteMessage?.data);
      });
      // 6. Handle notification that opened the app from quit state
      messaging().getInitialNotification().then(remoteMessage => {
        if (remoteMessage) {
          console.log('[Auth] App opened from quit by notification:', remoteMessage?.data);
        }
      });

      return unsubscribe;
    } catch (error) {
      console.warn('[Auth] Firebase setup error:', error.message);
    }
  }, []);

  /**
   * Sign Up Function
   * Calls POST /auth/signup API
   * Saves token and user in AsyncStorage
   * Updates context state
   */
  const signUp = useCallback(async (payload) => {
    try {
      setLoading(true);
      console.log('[Auth] Signing up with payload:', payload);

      // Call signup API
      const response = await apiClient.post('/auth/signup', payload);

      // Extract token and user from response
      // Backend returns: { success: true, message: "...", data: { user: {...}, token: "..." } }
      // Axios response: response.data = { success: true, message: "...", data: { user: {...}, token: "..." } }
      const responseData = response.data;

      // Check if request was successful
      if (responseData?.success === false) {
        const errorMessage = responseData?.message || 'Signup failed';
        throw new Error(errorMessage);
      }

      // Extract token and user from response.data.data
      const authToken = responseData?.data?.token;
      const userData = responseData?.data?.user;

      if (!authToken || !userData) {
        console.error('[Auth] Invalid response structure:', JSON.stringify(responseData, null, 2));
        throw new Error(responseData?.message || 'Invalid response from server');
      }

      // Save token and user to AsyncStorage
      await setToken(authToken);
      await setUser(userData);

      // Update token in api.js (for fetch-based API calls)
      setAuthToken(authToken);

      // Update context state
      setTokenState(authToken);
      setUserState(userData);

      // Setup Firebase for new user
      setupFirebase();

      console.log('[Auth] Signup successful:', userData);

      return {
        token: authToken,
        user: userData,
        message: responseData?.message || 'Account created successfully',
      };
    } catch (error) {
      console.error('[Auth] Signup error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Sign In Function
   * Calls POST /auth/login API
   * Saves token and user in AsyncStorage
   * Updates context state
   */
  const signIn = useCallback(async (email, password) => {
    try {
      setLoading(true);
      console.log('[Auth] Signing in with email:', email);

      // Clear any previous user's cache so we don't show stale data
      try {
        await clearCache(true, true);
      } catch (cacheErr) {
        console.warn('[Auth] Cache clear on login:', cacheErr?.message);
      }

      // Call login API
      const response = await apiClient.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      });

      // Extract token and user from response
      // Backend returns: { success: true, message: "...", data: { user: {...}, token: "..." } }
      // Axios response: response.data = { success: true, message: "...", data: { user: {...}, token: "..." } }
      const responseData = response.data;

      // Check if request was successful
      if (responseData?.success === false) {
        const errorMessage = responseData?.message || 'Login failed';
        throw new Error(errorMessage);
      }

      // Extract token and user from response.data.data
      const authToken = responseData?.data?.token;
      const userData = responseData?.data?.user;

      if (!authToken || !userData) {
        console.error('[Auth] Invalid response structure:', JSON.stringify(responseData, null, 2));
        throw new Error(responseData?.message || 'Invalid response from server');
      }

      // Save token and user to AsyncStorage
      await setToken(authToken);
      await setUser(userData);

      // Update token in api.js (for fetch-based API calls)
      setAuthToken(authToken);

      // Update context state
      setTokenState(authToken);
      setUserState(userData);

      // Setup Firebase for logged in user
      setupFirebase();

      console.log('[Auth] Login successful:', userData);

      return {
        token: authToken,
        user: userData,
        message: responseData?.message || 'Login successful',
      };
    } catch (error) {
      console.error('[Auth] Login error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Sign Out Function
   * Deep clean: clears ALL app storage (cache, token, user), in-memory state, and Firebase.
   * So the next user never sees previous user's data.
   */
  const signOut = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[Auth] Signing out – deep clear');

      // 1. Wipe all app-related AsyncStorage (every key starting with @) and in-memory cache
      try {
        await clearAllAppStorage();
      } catch (e) {
        console.warn('[Auth] clearAllAppStorage:', e?.message);
      }
      // 2. Explicit auth keys in case they use a different format
      try {
        await clearAuthData();
      } catch (e) {
        console.warn('[Auth] clearAuthData:', e?.message);
      }
      // 3. Clear in-memory token used by api.js and fetch
      clearAuthToken();
      // 4. Sign out from Firebase so next user doesn't get previous Firebase session
      try {
        await auth().signOut();
      } catch (e) {
        console.warn('[Auth] Firebase signOut:', e?.message);
      }

      // 5. Update context state
      setTokenState(null);
      setUserState(null);

      console.log('[Auth] Signout successful – storage and state cleared');
    } catch (error) {
      console.error('[Auth] Signout error:', error);
      setTokenState(null);
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Restore Session Function
   * Gets token and user from AsyncStorage
   * Validates token by calling GET /auth/me
   * Updates context state
   */
  const restoreSession = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[Auth] Restoring session');

      // Clear cache so no stale data from a previous user affects this session
      try {
        await clearCache(true, true);
      } catch (cacheErr) {
        console.warn('[Auth] Cache clear on restore:', cacheErr?.message);
      }

      // Get token and user from AsyncStorage
      const storedToken = await getToken();
      const storedUser = await getUser();

      if (!storedToken || !storedUser) {
        console.log('[Auth] No stored session found');
        setTokenState(null);
        setUserState(null);
        return { restored: false, user: null };
      }

      // Validate token by calling /auth/me (server is source of truth for role)
      try {
        // Token is already set in axios interceptor from AsyncStorage
        const response = await apiClient.get('/auth/me');

        // Extract user data from response
        // Backend returns: { success: true, data: user } or { success: true, data: { user } }
        const responseData = response.data;

        // Check if request was successful
        if (responseData?.success === false) {
          throw new Error(responseData?.message || 'Token validation failed');
        }

        // Extract user from response.data.data or response.data
        const userData = responseData?.data?.user || responseData?.data || responseData?.user || responseData;

        if (!userData || !userData.email) {
          throw new Error('No user data in response');
        }

        // Update token in api.js (for fetch-based API calls)
        setAuthToken(storedToken);

        // Update context state with validated token and user
        setTokenState(storedToken);
        setUserState(userData);

        // Update stored user data (in case it changed on server)
        await setUser(userData);

        // Setup Firebase for restored session
        setupFirebase();

        console.log('[Auth] Session restored successfully, role:', userData?.role);
        return { restored: true, user: userData };
      } catch (error) {
        // Token is invalid, clear stored data
        console.log('[Auth] Token validation failed:', error.message || error);
        await clearAuthData();
        clearAuthToken();
        setTokenState(null);
        setUserState(null);
        return { restored: false, user: null };
      }
    } catch (error) {
      console.error('[Auth] Restore session error:', error);
      clearAuthToken();
      setTokenState(null);
      setUserState(null);
      return { restored: false, user: null };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Set up logout callback for 401 errors
   * This will be called when token expires
   */
  useEffect(() => {
    setAuthLogoutCallback(() => {
      console.log('[Auth] Token expired, logging out');
      signOut();
    });
  }, [signOut]);

  /**
   * Refresh User Profile
   * Fetches the latest user profile from the server and updates context state
   */
  const refreshUser = useCallback(async () => {
    try {
      const userService = await import('../services/user');
      const profileResponse = await userService.getMyProfile();

      if (profileResponse && profileResponse.data) {
        const userData = profileResponse.data;
        setUserState(userData);
        await setUser(userData);
        console.log('[Auth] User profile refreshed');
        return userData;
      }
      return null;
    } catch (error) {
      console.error('[Auth] Error refreshing user profile:', error);
      return null;
    }
  }, []);

  /**
   * Google OAuth Sign-In/Sign-Up
   * Calls POST /api/auth/google API
   * Saves token and user in AsyncStorage
   * Updates context state
   */
  const googleOAuth = useCallback(async ({ idToken, role, creatorRole }) => {
    try {
      setLoading(true);
      console.log('[Auth] Google OAuth sign-in');

      // Import auth service
      const { googleOAuth: googleOAuthService } = await import('../services/auth');

      // Call Google OAuth API
      const response = await googleOAuthService({ idToken, role, creatorRole });

      // Save token and user to AsyncStorage
      await setToken(response.token);
      await setUser(response.user);

      // Update token in api.js (for fetch-based API calls)
      setAuthToken(response.token);

      // Update context state
      setTokenState(response.token);
      setUserState(response.user);

      // Setup Firebase for OAuth session (register FCM, permissions, token update)
      setupFirebase();

      console.log('[Auth] Google OAuth successful:', response.user);

      return response;
    } catch (error) {
      console.error('[Auth] Google OAuth error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Apple OAuth Sign-In/Sign-Up
   * Calls POST /api/auth/apple API
   * Saves token and user in AsyncStorage
   * Updates context state
   */
  const appleOAuth = useCallback(async ({ identityToken, authorizationCode, user, role, creatorRole }) => {
    try {
      setLoading(true);
      console.log('[Auth] Apple OAuth sign-in');

      // Import auth service
      const { appleOAuth: appleOAuthService } = await import('../services/auth');

      // Call Apple OAuth API
      const response = await appleOAuthService({ identityToken, authorizationCode, user, role, creatorRole });

      // Save token and user to AsyncStorage
      await setToken(response.token);
      await setUser(response.user);

      // Update token in api.js (for fetch-based API calls)
      setAuthToken(response.token);

      // Update context state
      setTokenState(response.token);
      setUserState(response.user);

      // Setup Firebase for OAuth session (register FCM, permissions, token update)
      setupFirebase();

      console.log('[Auth] Apple OAuth successful:', response.user);

      return response;
    } catch (error) {
      console.error('[Auth] Apple OAuth error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Value object for context
   */
  const value = {
    user,
    token,
    loading,
    signUp,
    signIn,
    signOut,
    restoreSession,
    refreshUser,
    googleOAuth,
    appleOAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;

