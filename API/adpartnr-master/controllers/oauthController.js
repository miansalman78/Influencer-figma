const axios = require('axios');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const { successResponse, errorResponse, createdResponse } = require('../utils/response');
const { sanitizeUserData } = require('../controllers/authController');

// Google OAuth - Login/Signup
const googleAuth = async (req, res) => {
  try {
    const { idToken, role, creatorRole } = req.body;

    if (!idToken) {
      return errorResponse(res, 'Google ID token is required', 400);
    }

    // Verify Google ID token
    let googleUser;
    try {
      const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
      googleUser = response.data;
    } catch (error) {
      console.error('Google token verification error:', error);
      return errorResponse(res, 'Invalid Google ID token', 401);
    }

    // Validate token
    if (!googleUser.email || !googleUser.sub) {
      return errorResponse(res, 'Invalid Google token data', 401);
    }

    const email = googleUser.email.toLowerCase();
    const googleId = googleUser.sub;
    const name = googleUser.name || googleUser.given_name || 'User';
    const profileImage = googleUser.picture || null;

    // Check if user exists with this Google ID
    let user = await User.findOne({ googleId });

    if (user) {
      // Existing user - login
      await user.updateLastActive();
      const token = generateToken(user._id);

      return successResponse(res, {
        user: sanitizeUserData(user),
        token,
        isNewUser: false
      }, 'Login successful');
    }

    // Check if user exists with this email (but different provider)
    user = await User.findOne({ email });
    if (user) {
      // User exists with email but different auth method
      return errorResponse(res, 'An account with this email already exists. Please use your original login method.', 409);
    }

    // New user - signup
    if (!role) {
      return errorResponse(res, 'Role is required for new users (brand or creator)', 400);
    }

    if (role === 'creator' && !creatorRole) {
      return errorResponse(res, 'Creator role is required for creator accounts', 400);
    }

    user = new User({
      name,
      email,
      googleId,
      oauthProvider: 'google',
      role,
      creatorRole: role === 'creator' ? creatorRole : undefined,
      profileImage,
      password: null // OAuth users don't need password
    });

    await user.save();
    const token = generateToken(user._id);

    return createdResponse(res, {
      user: sanitizeUserData(user),
      token,
      isNewUser: true
    }, 'Account created successfully');
  } catch (error) {
    console.error('Google OAuth error:', error);
    return errorResponse(res, error.message || 'Google authentication failed', 500);
  }
};

// Apple OAuth - Login/Signup
const appleAuth = async (req, res) => {
  try {
    const { identityToken, authorizationCode, user, role, creatorRole } = req.body;

    if (!identityToken) {
      return errorResponse(res, 'Apple identity token is required', 400);
    }

    // Verify Apple identity token
    let appleUser;
    try {
      // Decode the JWT token (Apple uses JWT)
      const decoded = jwt.decode(identityToken, { complete: true });
      
      if (!decoded || !decoded.payload) {
        return errorResponse(res, 'Invalid Apple identity token', 401);
      }

      // Verify token signature with Apple's public keys
      // Note: In production, you should verify the token signature with Apple's public keys
      // For now, we'll decode and use the payload
      const payload = decoded.payload;

      // Apple provides email in token for first-time sign-in
      // For subsequent sign-ins, email might be in the 'user' object
      const email = payload.email || (user && user.email);
      const appleId = payload.sub; // Apple user ID

      if (!email || !appleId) {
        return errorResponse(res, 'Invalid Apple token data', 401);
      }

      appleUser = {
        email: email.toLowerCase(),
        appleId,
        name: user?.name || payload.name || 'User',
        // Apple doesn't provide profile image
      };
    } catch (error) {
      console.error('Apple token verification error:', error);
      return errorResponse(res, 'Invalid Apple identity token', 401);
    }

    const email = appleUser.email;
    const appleId = appleUser.appleId;
    const name = appleUser.name;

    // Check if user exists with this Apple ID
    let userDoc = await User.findOne({ appleId });

    if (userDoc) {
      // Existing user - login
      await userDoc.updateLastActive();
      const token = generateToken(userDoc._id);

      return successResponse(res, {
        user: sanitizeUserData(userDoc),
        token,
        isNewUser: false
      }, 'Login successful');
    }

    // Check if user exists with this email (but different provider)
    userDoc = await User.findOne({ email });
    if (userDoc) {
      // User exists with email but different auth method
      return errorResponse(res, 'An account with this email already exists. Please use your original login method.', 409);
    }

    // New user - signup
    if (!role) {
      return errorResponse(res, 'Role is required for new users (brand or creator)', 400);
    }

    if (role === 'creator' && !creatorRole) {
      return errorResponse(res, 'Creator role is required for creator accounts', 400);
    }

    userDoc = new User({
      name,
      email,
      appleId,
      oauthProvider: 'apple',
      role,
      creatorRole: role === 'creator' ? creatorRole : undefined,
      password: null // OAuth users don't need password
    });

    await userDoc.save();
    const token = generateToken(userDoc._id);

    return createdResponse(res, {
      user: sanitizeUserData(userDoc),
      token,
      isNewUser: true
    }, 'Account created successfully');
  } catch (error) {
    console.error('Apple OAuth error:', error);
    return errorResponse(res, error.message || 'Apple authentication failed', 500);
  }
};

// Google OAuth callback (for web-based flows)
// Web apps redirect to this endpoint after Google authentication
const googleCallback = async (req, res) => {
  try {
    const { code, error, state } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error('Google OAuth error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/login?error=oauth_failed&message=${encodeURIComponent(error)}`);
    }

    // Check for authorization code
    if (!code) {
      console.error('Google OAuth callback: No authorization code received');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/login?error=no_code`);
    }

    // Exchange authorization code for tokens
    let tokenResponse;
    try {
      const backendUrl = process.env.BACKEND_URL || (req.protocol + '://' + req.get('host'));
      const redirectUri = `${backendUrl}/api/auth/google/callback`;

      tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      });
    } catch (error) {
      console.error('Google token exchange error:', error.response?.data || error.message);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/login?error=token_exchange_failed`);
    }

    const { id_token } = tokenResponse.data;

    if (!id_token) {
      console.error('Google token exchange: No id_token in response');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/login?error=no_id_token`);
    }

    // Verify Google ID token (reuse existing logic)
    let googleUser;
    try {
      const verifyResponse = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`);
      googleUser = verifyResponse.data;
    } catch (error) {
      console.error('Google token verification error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/login?error=invalid_token`);
    }

    // Validate token data
    if (!googleUser.email || !googleUser.sub) {
      console.error('Google token verification: Invalid token data');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/login?error=invalid_token_data`);
    }

    const email = googleUser.email.toLowerCase();
    const googleId = googleUser.sub;
    const name = googleUser.name || googleUser.given_name || 'User';
    const profileImage = googleUser.picture || null;

    // Check if user exists with this Google ID
    let user = await User.findOne({ googleId });

    if (!user) {
      // Check if user exists with this email (but different provider)
      user = await User.findOne({ email });
      if (user) {
        // User exists with email but different auth method
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return res.redirect(`${frontendUrl}/login?error=email_exists&message=${encodeURIComponent('An account with this email already exists. Please use your original login method.')}`);
      }

      // New user - need role from state or redirect to role selection
      // For now, redirect to signup page with email pre-filled
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/signup?oauth=google&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
    }

    // Existing user - login
    await user.updateLastActive();
    const token = generateToken(user._id);

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    // Redirect with token in URL (frontend can extract and store securely)
    // For better security, frontend should immediately move token to secure storage
    return res.redirect(`${frontendUrl}/auth/success?token=${token}&oauth=google`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/login?error=server_error`);
  }
};

// Apple OAuth callback (for web-based flows - not used for mobile)
// Mobile apps send tokens directly to POST /api/auth/apple
const appleCallback = async (req, res) => {
  // This endpoint is required by Apple but not used for mobile app flows
  // Mobile apps get the identity token directly and send it to POST /api/auth/apple
  return res.status(200).json({
    success: true,
    message: 'Apple Sign-In callback endpoint. For mobile apps, use POST /api/auth/apple with identityToken instead.'
  });
};

module.exports = {
  googleAuth,
  appleAuth,
  googleCallback,
  appleCallback
};

