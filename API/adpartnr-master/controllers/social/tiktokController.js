const axios = require('axios');
const { ensureHttpsBackendUrl } = require('../../utils/socialHelpers');

const generateAuthUrl = (state, req) => {
  // Validate client key is set
  if (!process.env.TIKTOK_CLIENT_KEY) {
    throw new Error('TIKTOK_CLIENT_KEY is not set in environment variables. Please add it to your .env file.');
  }
  
  const backendUrl = ensureHttpsBackendUrl(req);
  const redirectUri = `${backendUrl}/api/social/callback/tiktok`;
  
  // Log for debugging (without exposing full client key)
  console.log('TikTok authorization URL generation:', {
    hasClientKey: !!process.env.TIKTOK_CLIENT_KEY,
    clientKeyPrefix: process.env.TIKTOK_CLIENT_KEY ? process.env.TIKTOK_CLIENT_KEY.substring(0, 8) + '...' : 'missing',
    redirectUri: redirectUri,
    backendUrl: backendUrl
  });
  
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'user.info.basic,user.info.stats,video.list',
    state: state
  });
  
  // Add prompt=consent to force authorization screen (if TikTok supports it)
  // This ensures users see the permission screen even if they've authorized before
  params.append('prompt', 'consent');
  
  const authUrl = `https://www.tiktok.com/v2/auth/authorize?${params.toString()}`;
  console.log('TikTok authorization URL (without sensitive data):', authUrl.replace(/client_key=[^&]+/, 'client_key=***'));
  
  return authUrl;
};

const exchangeToken = async (code, redirectUri) => {
  try {
    // Normalize redirect URI (remove trailing slash to match authorization URL)
    const normalizedRedirectUri = redirectUri.replace(/\/$/, '');
    
    console.log('TikTok token exchange - redirect URI:', normalizedRedirectUri);
    console.log('TikTok token exchange - code:', code ? 'present' : 'missing');
    
    // TikTok requires application/x-www-form-urlencoded, not JSON
    const params = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: normalizedRedirectUri
    });
    
    const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    // Log full response for debugging
    console.log('TikTok token exchange response:', JSON.stringify(response.data, null, 2));
    console.log('TikTok token exchange response structure:', {
      hasData: !!response.data,
      hasDataData: !!response.data?.data,
      hasAccessToken: !!response.data?.data?.access_token,
      hasDirectAccessToken: !!response.data?.access_token,
      hasScope: !!response.data?.scope,
      hasDataScope: !!response.data?.data?.scope,
      scopeValue: response.data?.scope || response.data?.data?.scope || 'NOT FOUND',
      keys: Object.keys(response.data || {}),
      dataKeys: response.data?.data ? Object.keys(response.data.data) : []
    });
    
    // Check for error in response (multiple possible error formats)
    if (response.data?.error) {
      const errorMsg = response.data.error?.error_description || response.data.error?.error_msg || response.data.error?.message || 'Unknown error';
      const errorCode = response.data.error?.error_code || response.data.error?.code;
      console.error('TikTok token exchange error:', {
        error: response.data.error,
        code: errorCode,
        message: errorMsg,
        redirectUri: redirectUri
      });
      throw new Error(`TikTok token exchange failed: ${errorMsg}${errorCode ? ` (Code: ${errorCode})` : ''}`);
    }
    
    // TikTok returns access_token directly in response.data, not nested in response.data.data
    // Check both possible structures to be safe
    const accessToken = response.data?.data?.access_token || response.data?.access_token;
    const refreshToken = response.data?.data?.refresh_token || response.data?.refresh_token;
    const expiresIn = response.data?.data?.expires_in || response.data?.expires_in;
    
    if (!accessToken) {
      console.error('TikTok token exchange - missing access_token:', {
        responseData: response.data,
        responseStatus: response.status,
        hasData: !!response.data,
        hasDataData: !!response.data?.data,
        hasDirectAccessToken: !!response.data?.access_token,
        hasNestedAccessToken: !!response.data?.data?.access_token,
        keys: Object.keys(response.data || {}),
        fullResponse: JSON.stringify(response.data, null, 2)
      });
      throw new Error('Invalid token response from TikTok: access_token not found in response. Check server logs for full response structure.');
    }
    
    // Check which scopes were actually granted
    // TikTok may return scope in different locations, check both
    const grantedScopes = response.data?.data?.scope || response.data?.scope || '';
    const requiredScopes = ['user.info.basic', 'user.info.stats', 'video.list'];
    
    // Parse granted scopes - handle both comma-separated and space-separated, and URL-encoded
    let grantedScopesList = [];
    if (grantedScopes) {
      // Decode URL encoding if present
      const decodedScopes = decodeURIComponent(grantedScopes);
      grantedScopesList = decodedScopes.split(/[,\s]+/).map(s => s.trim()).filter(s => s.length > 0);
    }
    
    const missingScopes = requiredScopes.filter(scope => !grantedScopesList.includes(scope));
    
    console.log('TikTok token exchange - scope validation:', {
      grantedScopes: grantedScopes,
      grantedScopesList: grantedScopesList,
      requiredScopes: requiredScopes,
      missingScopes: missingScopes,
      hasAllScopes: missingScopes.length === 0
    });
    
    // If scope field is missing or empty, we can't validate - log warning but continue
    // The API call will fail later if scopes aren't granted
    if (!grantedScopes || grantedScopes.trim() === '') {
      console.warn('TikTok token exchange - scope field not found in response. Cannot validate scopes. Will attempt API calls and fail if scopes are missing.');
    } else if (missingScopes.length > 0) {
      // Verify both required scopes were granted
      console.error('TikTok token exchange - missing required scopes:', {
        grantedScopes: grantedScopes,
        grantedScopesList: grantedScopesList,
        missingScopes: missingScopes,
        requiredScopes: requiredScopes,
        fullTokenResponse: JSON.stringify(response.data, null, 2)
      });
      throw new Error(`TikTok authorization incomplete: The following required scopes were not granted: ${missingScopes.join(', ')}. Please reconnect and make sure to grant ALL requested permissions on the authorization screen.`);
    }
    
    console.log('TikTok token exchange successful - all scopes granted:', {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      expiresIn: expiresIn,
      grantedScopes: grantedScopesList
    });
    
    return {
      accessToken: accessToken,
      refreshToken: refreshToken || null,
      expiresAt: expiresIn ? new Date(Date.now() + (expiresIn * 1000)) : new Date(Date.now() + (3600 * 1000)) // Default 1 hour if not provided
    };
  } catch (error) {
    // Handle axios errors
    if (error.response) {
      const errorData = error.response.data;
      const errorMsg = errorData?.error?.error_description || 
                      errorData?.error?.error_msg || 
                      errorData?.error?.message || 
                      errorData?.error_description ||
                      error.message || 
                      'Unknown error';
      const errorCode = errorData?.error?.error_code || errorData?.error?.code;
      
      console.error('TikTok token exchange error (axios):', {
        status: error.response.status,
        statusText: error.response.statusText,
        error: errorData,
        code: errorCode,
        message: errorMsg,
        redirectUri: redirectUri,
        fullResponse: errorData
      });
      
      // Provide helpful error messages
      if (errorCode === 'invalid_client') {
        throw new Error('TikTok token exchange failed: Invalid client credentials. Check TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in .env');
      } else if (errorCode === 'invalid_grant' || errorMsg.includes('invalid code')) {
        throw new Error('TikTok token exchange failed: Invalid or expired authorization code. Please restart the OAuth flow.');
      } else if (errorMsg.includes('redirect_uri')) {
        throw new Error(`TikTok token exchange failed: Invalid redirect URI. Make sure "${redirectUri}" matches the redirect URI in your TikTok app settings.`);
      } else {
        throw new Error(`TikTok token exchange failed: ${errorMsg}${errorCode ? ` (Code: ${errorCode})` : ''}`);
      }
    }
    
    // Re-throw if it's already our custom error
    if (error.message.includes('TikTok token exchange failed')) {
      throw error;
    }
    
    // Generic error
    console.error('TikTok token exchange unexpected error:', error);
    throw new Error(`TikTok token exchange failed: ${error.message}`);
  }
};

const fetchProfile = async (accessToken, instagramBusinessAccountId = null) => {
  try {
    console.log('TikTok fetchProfile - attempting to fetch user info with token:', {
      tokenPrefix: accessToken ? accessToken.substring(0, 20) + '...' : 'missing',
      tokenLength: accessToken?.length
    });
    
    // First, get basic profile info (user.info.basic)
    const basicResponse = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      params: {
        fields: 'open_id,union_id,avatar_url,display_name'
      }
    });
    
    // Then, get stats (user.info.stats) for followers
    let followers = 0;
    let following = 0;
    let likes = 0;
    
    try {
      const statsResponse = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          fields: 'follower_count,following_count,likes_count'
        }
      });
      
      if (statsResponse.data?.data?.user) {
        followers = statsResponse.data.data.user.follower_count || 0;
        following = statsResponse.data.data.user.following_count || 0;
        likes = statsResponse.data.data.user.likes_count || 0;
      }
    } catch (statsError) {
      // If user.info.stats is not available, log but don't fail
      console.warn('TikTok fetchProfile - user.info.stats not available:', statsError.response?.data?.error?.message || statsError.message);
      // Try to get follower_count from basic response as fallback
      if (basicResponse.data?.data?.user?.follower_count) {
        followers = basicResponse.data.data.user.follower_count;
      }
    }
    
    console.log('TikTok fetchProfile - success:', {
      hasData: !!basicResponse.data?.data,
      hasUser: !!basicResponse.data?.data?.user,
      userId: basicResponse.data?.data?.user?.open_id,
      followers: followers
    });
    
    if (!basicResponse.data?.data?.user) {
      console.error('TikTok fetchProfile - invalid response structure:', basicResponse.data);
      throw new Error('Invalid profile response from TikTok');
    }
    
    return {
      userId: basicResponse.data.data.user.open_id,
      username: basicResponse.data.data.user.display_name,
      followers: followers,
      engagement: 0,
      verified: false
    };
  } catch (error) {
    if (error.response?.status === 401) {
      const errorData = error.response.data?.error;
      console.error('TikTok fetchProfile 401 error - DETAILED:', {
        status: error.response.status,
        statusText: error.response.statusText,
        error: errorData,
        code: errorData?.code,
        message: errorData?.message,
        errorDescription: errorData?.error_description,
        errorMsg: errorData?.error_msg,
        fullResponse: error.response.data,
        responseHeaders: error.response.headers
      });
      
      if (errorData?.code === 'scope_not_authorized') {
        console.error('TikTok scope_not_authorized - required permission was not granted.');
        
        const errorMessage = `TikTok authorization failed: Required permissions were not granted.

To fix:
1. Go to TikTok Developer Portal → Your App → Scopes/Permissions
2. Ensure these scopes are enabled:
   - ✅ user.info.basic (for profile info)
   - ✅ user.info.stats (for follower count)
   - ✅ video.list (for video metrics)
3. Revoke app access in TikTok Settings → Privacy → Connected Apps
4. Reconnect and grant ALL permissions
5. Make sure both toggles are ON (green) on the authorization screen`;
        
        throw new Error(errorMessage);
      }
      throw new Error('TikTok access token is invalid or expired. Please reconnect your TikTok account.');
    }
    console.error('TikTok fetchProfile - unexpected error:', error.message, error.response?.data);
    throw error;
  }
};

const fetchMetrics = async (accessToken, platformUserId) => {
  try {
    // Get follower count from user.info.stats
    let followers = 0;
    try {
      const statsResponse = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          fields: 'follower_count'
        }
      });
      
      followers = statsResponse.data?.data?.user?.follower_count || 0;
    } catch (statsError) {
      console.warn('TikTok fetchMetrics - user.info.stats not available:', statsError.response?.data?.error?.message || statsError.message);
      // Continue without followers count
    }
    
    // Get recent videos for engagement calculation
    let engagement = 0;
    let avgViews = 0;
    
    try {
      console.log('TikTok fetchMetrics - fetching video list...');
      
      // Build request parameters
      // TikTok Login Kit video.list requires:
      // - GET request (NOT POST)
      // - ALL parameters as query parameters in URL (NOT in body)
      const requestParams = {
        fields: 'videos', // Required: must be in query param
        video_fields: 'id,like_count,comment_count,share_count,view_count', // Required: must be in query param
        max_count: 20 // Optional: in query param
      };
      
      // Build the full URL to see exactly what we're calling
      const baseUrl = 'https://open.tiktokapis.com/v2/video/list';
      const queryString = new URLSearchParams(requestParams).toString();
      const fullUrl = `${baseUrl}?${queryString}`;
      
      console.log('TikTok fetchMetrics - request details:', {
        baseUrl: baseUrl,
        fullUrl: fullUrl,
        method: 'GET',
        params: requestParams,
        hasAccessToken: !!accessToken,
        tokenPrefix: accessToken ? accessToken.substring(0, 20) + '...' : 'missing'
      });
      
      // Use GET method with all parameters as query parameters
      // Try without trailing slash first
      let videosResponse;
      try {
        videosResponse = await axios.get('https://open.tiktokapis.com/v2/video/list', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          params: requestParams
        });
        console.log('TikTok fetchMetrics - request succeeded (without trailing slash)');
      } catch (noSlashError) {
        if (noSlashError.response?.status === 404) {
          console.log('TikTok fetchMetrics - trying with trailing slash...');
          // Fallback to with trailing slash
          videosResponse = await axios.get('https://open.tiktokapis.com/v2/video/list/', {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            },
            params: requestParams
          });
          console.log('TikTok fetchMetrics - request succeeded (with trailing slash)');
        } else {
          throw noSlashError;
        }
      }
      
      console.log('TikTok fetchMetrics - video list request successful');
      
      console.log('TikTok fetchMetrics - video list response:', {
        hasData: !!videosResponse.data?.data,
        hasVideos: !!videosResponse.data?.data?.videos,
        videoCount: videosResponse.data?.data?.videos?.length || 0,
        responseStructure: Object.keys(videosResponse.data || {})
      });
      
      const videos = videosResponse.data?.data?.videos || [];
      
      if (videos.length === 0) {
        console.warn('TikTok fetchMetrics - No videos returned. Account may have no public videos, or video.list scope may not be working correctly.');
      } else {
        console.log(`TikTok fetchMetrics - Processing ${videos.length} videos...`);
        
        // Calculate total engagement (likes + comments + shares)
        let totalEngagement = 0;
        let totalViews = 0;
        let videosWithViews = 0;
        
        videos.forEach((video, index) => {
          const videoEngagement = (video.like_count || 0) + (video.comment_count || 0) + (video.share_count || 0);
          totalEngagement += videoEngagement;
          
          if (video.view_count) {
            totalViews += video.view_count;
            videosWithViews++;
          }
          
          // Log first 3 videos for debugging
          if (index < 3) {
            console.log(`TikTok video ${index + 1}:`, {
              likes: video.like_count || 0,
              comments: video.comment_count || 0,
              shares: video.share_count || 0,
              views: video.view_count || 'not available',
              engagement: videoEngagement
            });
          }
        });
        
        // Calculate engagement rate: (avg engagement per video / followers) * 100
        const avgEngagement = totalEngagement / videos.length;
        engagement = followers > 0 ? ((avgEngagement / followers) * 100) : 0;
        
        // Calculate average views (only from videos that have view_count)
        avgViews = videosWithViews > 0 ? (totalViews / videosWithViews) : 0;
        
        console.log(`TikTok metrics calculated:`, {
          videos: videos.length,
          videosWithViews: videosWithViews,
          totalEngagement: totalEngagement,
          avgEngagement: avgEngagement.toFixed(2),
          engagementRate: engagement.toFixed(2) + '%',
          totalViews: totalViews,
          avgViews: Math.round(avgViews),
          followers: followers
        });
      }
    } catch (videoError) {
      // Video list may not be available due to missing scope or Sandbox limitations
      console.error('TikTok fetchMetrics - video list error:', {
        status: videoError.response?.status,
        statusText: videoError.response?.statusText,
        errorCode: videoError.response?.data?.error?.code,
        errorMessage: videoError.response?.data?.error?.message,
        errorDescription: videoError.response?.data?.error?.error_description,
        fullError: videoError.response?.data
      });
      
      if (videoError.response?.status === 401 && videoError.response?.data?.error?.code === 'scope_not_authorized') {
        console.error('TikTok video.list scope not authorized. User needs to reconnect and grant video.list permission.');
      } else if (videoError.response?.status === 404) {
        // 404 "Unsupported path(Janus)" indicates endpoint is not available in Sandbox
        console.warn('⚠️ TikTok video.list endpoint returns 404 in Sandbox mode.');
        console.warn('This is expected - TikTok Sandbox blocks video metrics endpoints.');
        console.warn('To get video metrics (engagement, avgViews), you must:');
        console.warn('1. Submit your app for review in TikTok Developer Portal');
        console.warn('2. Get approved for video.list scope');
        console.warn('3. Switch your app to Production mode');
        console.warn('4. Then the /v2/video/list/ endpoint will work');
        console.warn('For now, engagement and avgViews will be 0 (Sandbox limitation).');
      } else {
        console.error('TikTok video metrics not available:', videoError.response?.data?.error?.message || videoError.message);
      }
    }
    
    // Note: TikTok Sandbox does NOT provide audience insights
    // Analytics/Business APIs (video.insights, user.insights) are only available after app review
    return {
      followers: followers,
      engagement: Math.round(engagement * 100) / 100,
      avgViews: Math.round(avgViews),
      audienceInsights: null // Not available in Sandbox - requires app review for Analytics APIs
    };
  } catch (error) {
    if (error.response?.status === 401) {
      const errorData = error.response.data?.error;
      if (errorData?.code === 'scope_not_authorized') {
        console.log('TikTok scope not authorized. Returning basic metrics only.');
        return {
          followers: 0,
          engagement: 0,
          avgViews: 0,
          audienceInsights: null
        };
      }
      throw new Error('TikTok access token is invalid or expired. Please reconnect your TikTok account.');
    }
    throw new Error(`Failed to fetch TikTok metrics: ${error.message}`);
  }
};

const refreshToken = async (refreshToken) => {
  // TikTok requires application/x-www-form-urlencoded, not JSON
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });
  
  const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  
  if (!response.data?.data?.access_token) {
    throw new Error('Invalid refresh token response from TikTok');
  }
  
  return {
    accessToken: response.data.data.access_token,
    refreshToken: response.data.data.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + (response.data.data.expires_in * 1000))
  };
};

module.exports = {
  generateAuthUrl,
  exchangeToken,
  fetchProfile,
  fetchMetrics,
  refreshToken
};

