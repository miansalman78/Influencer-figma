const axios = require('axios');
const { ensureHttpsBackendUrl } = require('../../utils/socialHelpers');

// Generate Instagram OAuth authorization URL
const generateAuthUrl = (state, req) => {
  const backendUrl = ensureHttpsBackendUrl(req);
  const redirectUri = `${backendUrl}/api/social/callback/instagram`;
  
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: state
  });

  /**
   * Instagram OAuth via Facebook Login for Business
   * - Business type apps require Business Login with config_id
   * - Using the same User Access Token Business Login configuration
   *   that works for Facebook (config_id from Meta dashboard)
   */
  const configId = process.env.INSTAGRAM_BUSINESS_CONFIG_ID || '1534402508237462';
  params.append('config_id', configId);
  
  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
  
  console.log('Instagram OAuth URL generated:', {
    configId,
    url: authUrl.replace(/state=[^&]+/, 'state=***')
  });
  
  return authUrl;
};

// Exchange authorization code for access token
const exchangeToken = async (code, redirectUri) => {
  try {
    // Ensure redirectUri matches exactly what was used in authorization
    // Remove trailing slashes and ensure consistent format
    const normalizedRedirectUri = redirectUri.replace(/\/$/, '');
    
    console.log('Token exchange - redirect URI:', normalizedRedirectUri);
    console.log('Token exchange - code received:', code ? 'Yes' : 'No');
    
    // Step 1: Exchange code for Facebook short-lived token
    const facebookTokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: normalizedRedirectUri,
        code: code
      }
    }).catch(error => {
      // Extract detailed error information
      const errorData = error.response?.data?.error || {};
      const errorMessage = errorData.message || error.message || 'Unknown error';
      const errorCode = errorData.code;
      const errorType = errorData.type;
      const errorSubcode = errorData.error_subcode;
      
      console.error('Facebook token exchange error:', {
        message: errorMessage,
        code: errorCode,
        type: errorType,
        subcode: errorSubcode,
        redirectUri: normalizedRedirectUri,
        fullError: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      
      // Provide more helpful error messages
      if (errorCode === 100) {
        throw new Error(`Facebook token exchange failed: Invalid redirect URI. Make sure "${normalizedRedirectUri}" is added to "Valid OAuth Redirect URIs" in Facebook App Settings.`);
      } else if (errorMessage.includes('authorization code has been used')) {
        throw new Error('This authorization code has already been used. Please restart the OAuth flow.');
      } else {
        throw new Error(`Facebook token exchange failed: ${errorMessage}${errorCode ? ` (Code: ${errorCode})` : ''}`);
      }
    });
    
    if (!facebookTokenResponse.data.access_token) {
      throw new Error('Invalid token response from Facebook');
    }
    
    const facebookToken = facebookTokenResponse.data.access_token;
    
    // Step 2: Exchange for long-lived token (60 days)
    const longLivedResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: facebookToken
      }
    }).catch(error => {
      const errorMessage = error.response?.data?.error?.message || error.message;
      throw new Error(`Facebook long-lived token exchange failed: ${errorMessage}`);
    });
    
    if (!longLivedResponse.data.access_token) {
      throw new Error('Failed to exchange for long-lived Facebook token');
    }
    
    const longLivedToken = longLivedResponse.data.access_token;
    
    // Step 3: Get user's Facebook Pages (for user access tokens)
    const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: {
        access_token: longLivedToken,
        fields: 'id,name,instagram_business_account'
      }
    }).catch(error => {
      const errorMessage = error.response?.data?.error?.message || error.message;
      throw new Error(`Failed to get Facebook Pages: ${errorMessage}`);
    });
    
    if (!pagesResponse.data.data || pagesResponse.data.data.length === 0) {
      throw new Error('No Facebook Pages found. Please link your Instagram Business account to a Facebook Page.');
    }
    
    const pages = pagesResponse.data.data;
    
    if (pages.length === 0) {
      throw new Error('No Facebook Pages found. Please link your Instagram Business account to a Facebook Page.');
    }
    
    // Find page with Instagram Business account
    const pageWithInstagram = pages.find(page => page.instagram_business_account);
    if (!pageWithInstagram || !pageWithInstagram.instagram_business_account) {
      throw new Error('No Instagram Business account found. Please convert your Instagram account to Business/Creator and link it to a Facebook Page.');
    }
    
    const instagramBusinessAccountId = pageWithInstagram.instagram_business_account.id || 
                                       pageWithInstagram.instagram_business_account;
    
    let pageAccessToken = null;
    try {
      const pageTokenResp = await axios.get(`https://graph.facebook.com/v18.0/${pageWithInstagram.id}`, {
        params: {
          fields: 'access_token',
          access_token: longLivedToken
        }
      });
      pageAccessToken = pageTokenResp.data?.access_token || null;
    } catch (e) {
      pageAccessToken = null;
    }
    
    // Instagram long-lived tokens typically expire in 60 days, default to 60 days if expires_in is missing
    const longLivedExpiresIn = longLivedResponse.data.expires_in || (60 * 24 * 60 * 60); // Default to 60 days (5184000 seconds)
    return {
      accessToken: pageAccessToken || longLivedToken,
      refreshToken: null,
      expiresAt: new Date(Date.now() + (longLivedExpiresIn * 1000)),
      instagramBusinessAccountId: instagramBusinessAccountId,
      facebookPageId: pageWithInstagram.id
    };
  } catch (error) {
    // Re-throw with more context
    if (error.message.includes('Facebook') || error.message.includes('Instagram')) {
      throw error;
    }
    throw new Error(`Instagram OAuth error: ${error.message}`);
  }
};

// Fetch Instagram profile
const fetchProfile = async (accessToken, instagramBusinessAccountId = null) => {
  if (!instagramBusinessAccountId) {
    throw new Error('Instagram Business Account ID is required');
  }
  const response = await axios.get(`https://graph.facebook.com/v18.0/${instagramBusinessAccountId}`, {
    params: {
      fields: 'id,username,profile_picture_url,followers_count,media_count',
      access_token: accessToken
    }
  });
  
  if (!response.data.id || !response.data.username) {
    throw new Error('Invalid profile response from Instagram Graph API');
  }
  
  return {
    userId: response.data.id,
    username: response.data.username,
    followers: response.data.followers_count || 0,
    engagement: 0,
    verified: false,
    mediaCount: response.data.media_count || 0,
    profilePictureUrl: response.data.profile_picture_url
  };
};

// Fetch Instagram metrics
const fetchMetrics = async (accessToken, instagramBusinessAccountId) => {
  if (!instagramBusinessAccountId) {
    throw new Error('Instagram Business Account ID is required for fetching metrics');
  }
  
  console.log('Fetching Instagram metrics for account:', instagramBusinessAccountId);
  
  // Get account info
  const accountResponse = await axios.get(`https://graph.facebook.com/v18.0/${instagramBusinessAccountId}`, {
    params: {
      fields: 'followers_count,media_count',
      access_token: accessToken
    }
  }).catch(error => {
    console.error('Error fetching Instagram account info:', error.response?.data || error.message);
    throw new Error(`Failed to fetch Instagram account info: ${error.response?.data?.error?.message || error.message}`);
  });
  
  const followers = accountResponse.data.followers_count || 0;
  console.log('Instagram followers:', followers);
  
  // Get recent media for engagement calculation and avgViews
  let totalEngagement = 0;
  let mediaCount = 0;
  let totalViews = 0;
  let videoCount = 0;
  
  try {
    const mediaResponse = await axios.get(`https://graph.facebook.com/v18.0/${instagramBusinessAccountId}/media`, {
      params: {
        fields: 'like_count,comments_count,media_type,video_title',
        limit: 25,
        access_token: accessToken
      }
    });
    
    if (mediaResponse.data.data && mediaResponse.data.data.length > 0) {
      mediaResponse.data.data.forEach(media => {
        totalEngagement += (media.like_count || 0) + (media.comments_count || 0);
        mediaCount++;
        
        // For videos, try to get view count (requires insights permission)
        if (media.media_type === 'VIDEO') {
          videoCount++;
        }
      });
      console.log(`Processed ${mediaCount} media posts, total engagement: ${totalEngagement}`);
      console.log(`Found ${videoCount} video posts`);
    } else {
      console.log('No media found for engagement calculation');
    }
  } catch (error) {
    console.error('Error fetching Instagram media:', error.response?.data || error.message);
    // Don't throw - engagement will be 0 if media fetch fails
  }
  
  // Try to get video insights for view counts (if available)
  // Note: Instagram Graph API requires metric_type=total_value for certain metrics
  if (videoCount > 0) {
    try {
      // Try to get account-level video views insights
      const accountInsightsResponse = await axios.get(`https://graph.facebook.com/v18.0/${instagramBusinessAccountId}/insights`, {
        params: {
          metric: 'views',
          metric_type: 'total_value', // Required parameter
          period: 'day',
          since: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60), // Last 30 days
          until: Math.floor(Date.now() / 1000),
          access_token: accessToken
        }
      });
      
      if (accountInsightsResponse.data.data && accountInsightsResponse.data.data.length > 0) {
        // Sum up views from all days
        let totalAccountViews = 0;
        accountInsightsResponse.data.data.forEach(insight => {
          if (insight.values) {
            insight.values.forEach(value => {
              totalAccountViews += value.value || 0;
            });
          }
        });
        
        if (totalAccountViews > 0) {
          // Calculate average views per video (approximate)
          totalViews = Math.round(totalAccountViews / videoCount);
          console.log(`Calculated avgViews from account insights: ${totalViews} (total: ${totalAccountViews}, videos: ${videoCount})`);
        }
      }
    } catch (error) {
      console.log('Video views insights not available:', error.response?.data?.error?.message || error.message);
      console.log('Instagram Graph API may not support views metric for this account type or permissions');
    }
  }
  
  // Calculate engagement rate
  const avgEngagement = mediaCount > 0 ? totalEngagement / mediaCount : 0;
  const engagementRate = followers > 0 ? ((avgEngagement / followers) * 100) : 0;
  console.log('Calculated engagement rate:', engagementRate);
  
  // Calculate average views
  const avgViews = videoCount > 0 && totalViews > 0 ? Math.round(totalViews / videoCount) : 0;
  
  // Get audience insights (optional - requires permissions)
  // Use correct metric names: follower_demographics, reached_audience_demographics, or engaged_audience_demographics
  // Note: Requires metric_type=total_value and breakdown parameters
  let audienceInsights = null;
  try {
    // Try follower_demographics first (most commonly available)
    // Requires breakdown parameter: age, gender, country, or city
    const insightsResponse = await axios.get(`https://graph.facebook.com/v18.0/${instagramBusinessAccountId}/insights`, {
      params: {
        metric: 'follower_demographics',
        metric_type: 'total_value', // Required parameter
        breakdown: 'age,gender', // Get both age and gender breakdowns
        period: 'lifetime',
        access_token: accessToken
      }
    });
    
    // Get country breakdown separately
    let countryData = null;
    try {
      const countryResponse = await axios.get(`https://graph.facebook.com/v18.0/${instagramBusinessAccountId}/insights`, {
        params: {
          metric: 'follower_demographics',
          metric_type: 'total_value',
          breakdown: 'country',
          period: 'lifetime',
          access_token: accessToken
        }
      });
      
      if (countryResponse.data.data && countryResponse.data.data.length > 0) {
        countryData = countryResponse.data.data;
        console.log('Fetched country data successfully');
      }
    } catch (countryError) {
      console.log('Country data not available:', countryError.response?.data?.error?.message || countryError.message);
    }
    
    // Combine demographics and country data
    const combinedInsights = [
      ...(insightsResponse.data.data || []),
      ...(countryData || [])
    ];
    
    if (combinedInsights.length > 0) {
      console.log('Instagram insights response:', JSON.stringify(combinedInsights, null, 2));
      audienceInsights = parseInsights(combinedInsights);
      console.log('Parsed audience insights:', JSON.stringify(audienceInsights, null, 2));
      console.log('Fetched audience insights successfully using follower_demographics');
    } else {
      console.log('Instagram insights response has no data');
      console.log('Full response:', JSON.stringify(insightsResponse.data, null, 2));
    }
  } catch (error) {
    // Try alternative metrics if follower_demographics fails
    const errorData = error.response?.data?.error || {};
    const errorMessage = errorData.message || error.message;
    const errorCode = errorData.code;
    
    console.log('follower_demographics not available, trying reached_audience_demographics...');
    
    try {
      // Try reached_audience_demographics (requires timeframe parameter)
      const altInsightsResponse = await axios.get(`https://graph.facebook.com/v18.0/${instagramBusinessAccountId}/insights`, {
        params: {
          metric: 'reached_audience_demographics',
          metric_type: 'total_value', // Required parameter
          breakdown: 'age,gender', // Get both age and gender breakdowns
          timeframe: 'lifetime', // Required for reached_audience_demographics
          access_token: accessToken
        }
      });
      
      if (altInsightsResponse.data.data && altInsightsResponse.data.data.length > 0) {
        console.log('Instagram insights response (reached_audience_demographics):', JSON.stringify(altInsightsResponse.data.data, null, 2));
        audienceInsights = parseInsights(altInsightsResponse.data.data);
        console.log('Parsed audience insights:', JSON.stringify(audienceInsights, null, 2));
        console.log('Fetched audience insights successfully using reached_audience_demographics');
      } else {
        console.log('Reached audience demographics response has no data');
        console.log('Full response:', JSON.stringify(altInsightsResponse.data, null, 2));
      }
    } catch (altError) {
      console.error('Instagram insights error:', {
        message: errorMessage,
        code: errorCode,
        altError: altError.response?.data?.error?.message || altError.message,
        fullError: error.response?.data
      });
      
      if (errorCode === 100 || errorMessage.includes('permission') || errorMessage.includes('metric')) {
        console.log('This is normal - audience insights may require advanced access, App Review, or specific account type');
        console.log('You can request advanced access after making successful API calls');
      }
    }
  }
  
  return {
    followers: followers,
    engagement: Math.round(engagementRate * 100) / 100,
    avgViews: avgViews,
    audienceInsights: audienceInsights
  };
};

// Parse Instagram insights data
// Handles follower_demographics, reached_audience_demographics, and engaged_audience_demographics
const parseInsights = (insightsData) => {
  const insights = {
    topLocations: [],
    genderDistribution: { male: 0, female: 0, nonBinary: 0, other: 0 },
    ageGroups: []
  };
  
  // Track totals for percentage calculation
  let totalGenderCount = 0;
  const ageGroupCounts = {}; // Track counts per age group
  
  insightsData.forEach(insight => {
    // Instagram Graph API returns data in total_value.breakdowns[0].results format
    // Structure: { total_value: { breakdowns: [{ results: [{ dimension_values: [age, gender], value: count }] }] } }
    if (insight.name && insight.name.includes('demographics') && insight.total_value) {
      const breakdowns = insight.total_value.breakdowns || [];
      
      breakdowns.forEach(breakdown => {
        const results = breakdown.results || [];
        const dimensionKeys = breakdown.dimension_keys || [];
        
        results.forEach(result => {
          const dimensionValues = result.dimension_values || [];
          const value = result.value || 0;
          
          // Check if this is country breakdown
          if (dimensionKeys.includes('country') || (dimensionValues.length === 1 && typeof dimensionValues[0] === 'string' && dimensionValues[0].length === 2)) {
            // Country data: dimension_values: ["US"] or ["NG"]
            const country = dimensionValues[0];
            if (country) {
              insights.topLocations.push({
                country: country,
                percentage: value // This will be normalized later
              });
            }
          }
          // Check if this is age+gender breakdown
          else if (dimensionKeys.includes('age') && dimensionKeys.includes('gender')) {
            // dimension_values format: [age, gender] when breakdown=age,gender
            // Example: ["18-24", "F"] or ["25-34", "M"]
            if (dimensionValues.length >= 2) {
              const age = dimensionValues[0]; // e.g., "18-24", "25-34", "65+"
              const gender = dimensionValues[1]; // e.g., "F" (female), "M" (male), "U" (unknown/unspecified)
              
              // Handle gender distribution
              if (gender === 'M' || gender === 'male') {
                insights.genderDistribution.male += value;
                totalGenderCount += value;
              } else if (gender === 'F' || gender === 'female') {
                insights.genderDistribution.female += value;
                totalGenderCount += value;
              } else if (gender === 'U' || gender === 'unknown' || gender === 'unspecified') {
                // "U" typically means unknown/unspecified, count as "other"
                insights.genderDistribution.other += value;
                totalGenderCount += value;
              }
              
              // Handle age groups (aggregate all genders for each age range)
              if (age) {
                if (!ageGroupCounts[age]) {
                  ageGroupCounts[age] = 0;
                }
                ageGroupCounts[age] += value;
              }
            }
          }
        });
      });
    }
  });
  
  // Normalize country percentages
  const totalCountryCount = insights.topLocations.reduce((sum, loc) => sum + loc.percentage, 0);
  if (totalCountryCount > 0) {
    insights.topLocations.forEach(location => {
      location.percentage = Math.round((location.percentage / totalCountryCount) * 100);
    });
    // Sort by percentage (highest first) and limit to top 10
    insights.topLocations.sort((a, b) => b.percentage - a.percentage);
    insights.topLocations = insights.topLocations.slice(0, 10);
  }
  
  // Convert age group counts to percentages
  const totalAgeCount = Object.values(ageGroupCounts).reduce((sum, count) => sum + count, 0);
  Object.keys(ageGroupCounts).forEach(ageRange => {
    const count = ageGroupCounts[ageRange];
    const percentage = totalAgeCount > 0 ? Math.round((count / totalAgeCount) * 100) : 0;
    insights.ageGroups.push({ range: ageRange, percentage });
  });
  
  // Normalize gender distribution to percentages
  if (totalGenderCount > 0) {
    insights.genderDistribution.male = Math.round((insights.genderDistribution.male / totalGenderCount) * 100);
    insights.genderDistribution.female = Math.round((insights.genderDistribution.female / totalGenderCount) * 100);
    insights.genderDistribution.other = Math.round((insights.genderDistribution.other / totalGenderCount) * 100);
  }
  
  // Sort age groups by range (handle special cases like "65+")
  insights.ageGroups.sort((a, b) => {
    const aStart = a.range === '65+' ? 65 : parseInt(a.range.split('-')[0] || a.range);
    const bStart = b.range === '65+' ? 65 : parseInt(b.range.split('-')[0] || b.range);
    return aStart - bStart;
  });
  
  return insights;
};

// Refresh Instagram token (extends Facebook token)
const refreshToken = async (currentToken) => {
  const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: process.env.FACEBOOK_APP_ID,
      client_secret: process.env.FACEBOOK_APP_SECRET,
      fb_exchange_token: currentToken
    }
  });
  
  if (!response.data.access_token) {
    throw new Error('Failed to extend Instagram token');
  }
  
  // Instagram tokens typically expire in 60 days, default to 60 days if expires_in is missing
  const expiresIn = response.data.expires_in || (60 * 24 * 60 * 60); // Default to 60 days (5184000 seconds)
  return {
    accessToken: response.data.access_token,
    refreshToken: null,
    expiresAt: new Date(Date.now() + (expiresIn * 1000))
  };
};

module.exports = {
  generateAuthUrl,
  exchangeToken,
  fetchProfile,
  fetchMetrics,
  refreshToken
};
