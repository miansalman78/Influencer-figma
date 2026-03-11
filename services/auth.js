import { apiRequest, setAuthToken } from './api';

const mapRoleForApi = (role) => {
  if (role === 'brand') {
    return 'brand';
  }
  return role === 'creator' ? 'creator' : 'influencer';
};

export const register = async ({
  firstName,
  lastName,
  email,
  password,
  role,
  creatorRole,
  city,
  state,
  country,
  latitude,
  longitude,
}) => {
  const fullName = `${firstName || ''} ${lastName || ''}`.trim() || email.split('@')[0];
  const apiRole = mapRoleForApi(role || 'creator');

  const payload = {
    name: fullName,
    email: email.trim().toLowerCase(),
    password,
    role: apiRole,
    ...((apiRole !== 'brand') && {
      creatorRole: creatorRole || (apiRole === 'creator' ? 'Content Creator' : 'Influencer')
    }),
  };

  // Only include location if at least city is provided
  // Location is optional - user can provide it or skip
  if (city || state || country || (latitude && longitude)) {
    payload.location = {
      ...(city && { city: city.trim() }),
      ...(state && { state: state.trim() }),
      ...(country && { country: country.trim() }),
      ...((latitude && longitude) && {
        coordinates: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        },
      }),
    };
  }

  const response = await apiRequest('/auth/signup', {
    method: 'POST',
    body: payload,
  });

  // Backend returns { data: { token, user }, message }
  if (response?.data?.token) {
    setAuthToken(response.data.token);
  }

  // Normalize response to match expected format
  return {
    token: response?.data?.token,
    user: response?.data?.user,
    message: response?.message || 'Account created successfully',
  };
};

export const login = async ({ email, password }) => {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), password },
  });

  // Backend returns { data: { token, user }, message }
  if (response?.data?.token) {
    setAuthToken(response.data.token);
  }

  // Normalize response to match expected format
  return {
    token: response?.data?.token,
    user: response?.data?.user,
    message: response?.message || 'Login successful',
  };
};

export const getCurrentUser = async (token) => {
  return apiRequest('/auth/me', {
    method: 'GET',
    token,
  });
};

export const forgotPassword = async ({ email }) => {
  const response = await apiRequest('/auth/forgot-password', {
    method: 'POST',
    body: { email: email.trim().toLowerCase() },
  });

  return {
    success: response?.success || response?.data?.success,
    message: response?.message || 'Password reset link sent to your email',
  };
};

export const resetPassword = async ({ token, password }) => {
  const response = await apiRequest('/auth/reset-password', {
    method: 'POST',
    body: { token, password },
  });

  return {
    success: response?.success || response?.data?.success,
    message: response?.message || 'Password reset successfully',
  };
};

/**
 * Google OAuth Sign-In/Sign-Up
 * Auto-detects login vs signup based on user existence
 * @param {string} idToken - Google ID token from Google Sign-In SDK
 * @param {string} role - Required for new users: 'brand' or 'creator'
 * @param {string} creatorRole - Required if role is creator: creator role (e.g., 'influencer')
 * @returns {Promise} { token, user, message, isNewUser }
 */
export const googleOAuth = async ({ idToken, role, creatorRole }) => {
  const payload = {
    idToken,
  };

  // Only include role and creatorRole for new users (backend will auto-detect)
  if (role) {
    payload.role = role === 'brand' ? 'brand' : 'creator';
    if (payload.role === 'creator' && creatorRole) {
      payload.creatorRole = creatorRole;
    }
  }

  const response = await apiRequest('/auth/google', {
    method: 'POST',
    body: payload,
  });

  // Backend returns { success, data: { token, user, isNewUser }, message }
  if (response?.data?.token) {
    setAuthToken(response.data.token);
  }

  return {
    token: response?.data?.token,
    user: response?.data?.user,
    isNewUser: response?.data?.isNewUser || false,
    message: response?.message || (response?.data?.isNewUser ? 'Account created successfully' : 'Login successful'),
  };
};

/**
 * Apple OAuth Sign-In/Sign-Up
 * Auto-detects login vs signup based on user existence
 * @param {string} identityToken - Apple identity token (JWT) from Sign in with Apple SDK
 * @param {string} authorizationCode - Optional: Authorization code from Apple
 * @param {object} user - Optional: User info (only available on first sign-in)
 * @param {string} user.email - User email (only on first sign-in)
 * @param {object} user.name - User name object (only on first sign-in)
 * @param {string} user.name.firstName - First name
 * @param {string} user.name.lastName - Last name
 * @param {string} role - Required for new users: 'brand' or 'creator'
 * @param {string} creatorRole - Required if role is creator: creator role
 * @returns {Promise} { token, user, message, isNewUser }
 */
export const appleOAuth = async ({ identityToken, authorizationCode, user, role, creatorRole }) => {
  const payload = {
    identityToken,
  };

  if (authorizationCode) {
    payload.authorizationCode = authorizationCode;
  }

  // Include user info if provided (only available on first sign-in)
  if (user) {
    payload.user = {};
    if (user.email) {
      payload.user.email = user.email;
    }
    if (user.name) {
      payload.user.name = {};
      if (user.name.firstName) {
        payload.user.name.firstName = user.name.firstName;
      }
      if (user.name.lastName) {
        payload.user.name.lastName = user.name.lastName;
      }
    }
  }

  // Only include role and creatorRole for new users (backend will auto-detect)
  if (role) {
    payload.role = role === 'brand' ? 'brand' : 'creator';
    if (payload.role === 'creator' && creatorRole) {
      payload.creatorRole = creatorRole;
    }
  }

  const response = await apiRequest('/auth/apple', {
    method: 'POST',
    body: payload,
  });

  // Backend returns { success, data: { token, user, isNewUser }, message }
  if (response?.data?.token) {
    setAuthToken(response.data.token);
  }

  return {
    token: response?.data?.token,
    user: response?.data?.user,
    isNewUser: response?.data?.isNewUser || false,
    message: response?.message || (response?.data?.isNewUser ? 'Account created successfully' : 'Login successful'),
  };
};

