const axios = require('axios');
const { ensureHttpsBackendUrl } = require('../../utils/socialHelpers');

const generateAuthUrl = (state, req) => {
  const backendUrl = ensureHttpsBackendUrl(req);
  const redirectUri = `${backendUrl}/api/social/callback/facebook`;
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: state
  });

  /**
   * Facebook Login for Business
   * - Business type apps require Business Login with config_id
   * - Using User Access Token configuration (Business Login) with approved permissions
   */
  const configId = process.env.FACEBOOK_BUSINESS_CONFIG_ID || '1534402508237462';
  params.append('config_id', configId);
  
  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
  
  console.log('Facebook OAuth URL generated:', {
    configId,
    url: authUrl.replace(/state=[^&]+/, 'state=***')
  });
  
  return authUrl;
};

const exchangeToken = async (code, redirectUri) => {
  const shortLivedResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
    params: {
      client_id: process.env.FACEBOOK_APP_ID,
      client_secret: process.env.FACEBOOK_APP_SECRET,
      redirect_uri: redirectUri,
      code: code
    }
  });
  
  if (!shortLivedResponse.data.access_token) {
    throw new Error('Invalid token response from Facebook');
  }
  
  const shortLivedToken = shortLivedResponse.data.access_token;
  
  const longLivedResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: process.env.FACEBOOK_APP_ID,
      client_secret: process.env.FACEBOOK_APP_SECRET,
      fb_exchange_token: shortLivedToken
    }
  });
  
  if (!longLivedResponse.data.access_token) {
    const shortLivedExpiresIn = shortLivedResponse.data.expires_in || 7200; // Default to 2 hours (7200 seconds)
    return {
      accessToken: shortLivedToken,
      refreshToken: null,
      expiresAt: new Date(Date.now() + (shortLivedExpiresIn * 1000)),
      pageId: null
    };
  }
  
  const longLivedToken = longLivedResponse.data.access_token;
  const longLivedExpiresIn = longLivedResponse.data.expires_in || (60 * 24 * 60 * 60); // Default to 60 days
  return {
    accessToken: longLivedToken,
    refreshToken: null,
    expiresAt: new Date(Date.now() + (longLivedExpiresIn * 1000)),
    pageId: null
  };
};

const fetchProfile = async (accessToken, instagramBusinessAccountId = null, pageId = null) => {
  // For user access tokens, we can use /me or pageId if provided
  let response;
  
  if (pageId) {
    // Use the selected page directly (Business Login flow)
    try {
      response = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
        params: {
          fields: 'id,name,followers_count',
          access_token: accessToken
        }
      });
      
      return {
        userId: response.data.id,
        username: response.data.name,
        followers: response.data.followers_count || 0,
        engagement: 0,
        verified: false
      };
    } catch (error) {
      console.log('Failed to fetch page profile, falling back to /me:', error.message);
    }
  }
  
  // Fallback to /me for regular user tokens
  response = await axios.get(`https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${accessToken}`);
  
  if (!response.data.id || !response.data.name) {
    throw new Error('Invalid profile response from Facebook');
  }
  
  return {
    userId: response.data.id,
    username: response.data.name,
    followers: 0,
    engagement: 0,
    verified: false
  };
};

const fetchMetrics = async (accessToken, platformUserId, pageId = null, instagramBusinessAccountId = null) => {
  try {
    console.log('Fetching Facebook metrics...');
    
    let page = null;
    let pageIdToUse = pageId;
    let pageAccessToken = accessToken; // For user access tokens, we'll get page access token from /me/accounts
    
    // If we have a specific pageId (from Business Login selection), use it directly
    if (pageIdToUse) {
      console.log(`Using provided page ID from Business Login: ${pageIdToUse}`);
      try {
        const pageResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageIdToUse}`, {
          params: {
            fields: 'id,name,followers_count',
            access_token: accessToken
          }
        });
        page = pageResponse.data;
        console.log(`Using Facebook Page: ${page.name} (ID: ${pageIdToUse}), Followers: ${page.followers_count || 0}`);
      } catch (error) {
        console.error('Error fetching page with provided ID:', error.response?.data || error.message);
        throw new Error(`Failed to fetch Facebook page: ${error.response?.data?.error?.message || error.message}`);
      }
    } else {
      // Get user's Facebook Pages via /me/accounts (for user access tokens)
      try {
        const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
          params: {
            access_token: accessToken,
            fields: 'id,name,followers_count,access_token'
          }
        });
        
        console.log('Facebook pages response:', JSON.stringify(pagesResponse.data, null, 2));
        if (pagesResponse.data.data && pagesResponse.data.data.length > 0) {
          return {
            followers: 0,
            engagement: 0,
            avgViews: 0,
            audienceInsights: null,
            pageImpressions: 0,
            pageViews: 0,
            postImpressions: 0
          };
        } else {
          return {
            followers: 0,
            engagement: 0,
            avgViews: 0,
            audienceInsights: null,
            pageImpressions: 0,
            pageViews: 0,
            postImpressions: 0
          };
        }
      } catch (error) {
        console.error('Error fetching Facebook pages:', error.response?.data || error.message);
        console.log('No Facebook Pages found for this user.');
        return {
          followers: 0,
          engagement: 0,
          avgViews: 0,
          audienceInsights: null,
          pageImpressions: 0,
          pageViews: 0,
          postImpressions: 0
        };
      }
    }
    
    // If we don't have a page at this point, return empty metrics
    if (!page || !pageIdToUse) {
      console.log('No Facebook Page available for metrics.');
      return {
        followers: 0,
        engagement: 0,
        avgViews: 0,
        audienceInsights: null,
        pageImpressions: 0,
        pageViews: 0,
        postImpressions: 0
      };
    }
    
    const followers = page.followers_count || 0;
    let engagement = 0;
    let audienceInsights = null;
    let pageImpressions = 0;
    let pageViews = 0;
    let postImpressions = 0;
    
    if (!pageAccessToken) {
      console.log('Warning: No page access token found. Some metrics may not be available.');
    }
    
    // Get page posts for engagement calculation (requires Page access token)
    let postsResponse = null;
    try {
      console.log(`Fetching posts for Facebook Page: ${pageIdToUse}`);
      postsResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageIdToUse}/posts`, {
          params: {
            fields: 'id,likes.summary(true),comments.summary(true),shares',
            limit: 25,
            access_token: pageAccessToken || accessToken // Use page token if available, fallback to user token
          }
        });
        
        const posts = postsResponse.data.data || [];
        console.log(`Found ${posts.length} posts for engagement calculation`);
        
        if (posts.length > 0) {
          // Calculate total engagement (likes + comments + shares)
          let totalEngagement = 0;
          
          posts.forEach((post, index) => {
            const likes = post.likes?.summary?.total_count || 0;
            const comments = post.comments?.summary?.total_count || 0;
            const shares = post.shares?.count || 0;
            const postEngagement = likes + comments + shares;
            totalEngagement += postEngagement;
            console.log(`Post ${index + 1}: likes=${likes}, comments=${comments}, shares=${shares}, total=${postEngagement}`);
          });
          
          const avgEngagement = totalEngagement / posts.length;
          // Engagement rate: (avg engagement / followers) * 100
          engagement = followers > 0 ? ((avgEngagement / followers) * 100) : 0;
          console.log(`Total engagement: ${totalEngagement}, Avg per post: ${avgEngagement}, Engagement rate: ${engagement}%`);
        } else {
          console.log('No posts found on this Facebook Page. Engagement will be 0.');
        }
      } catch (postError) {
        console.error('Facebook post metrics error:', {
          message: postError.response?.data?.error?.message || postError.message,
          code: postError.response?.data?.error?.code,
          type: postError.response?.data?.error?.type,
          fullError: postError.response?.data
        });
        console.log('Facebook post metrics not available:', postError.response?.data?.error?.message || postError.message);
      }
      
      // Get page-level insights (requires pages_read_engagement permission and Page access token)
      try {
        console.log(`Fetching page insights for Facebook Page: ${pageId}`);
        
        // Fetch page views (Facebook deprecated "impressions" in Nov 2025, replaced with "views")
        // Try page_views_total for total views
        try {
          const viewsTotalResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageIdToUse}/insights`, {
            params: {
              metric: 'page_views_total',
              period: 'day',
              since: Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000), // Last 30 days
              until: Math.floor(Date.now() / 1000),
              access_token: pageAccessToken || accessToken
            }
          });
          
          if (viewsTotalResponse.data.data && viewsTotalResponse.data.data.length > 0) {
            const values = viewsTotalResponse.data.data[0].values || [];
            pageImpressions = values.reduce((sum, val) => sum + (val.value || 0), 0);
            console.log(`Total page views (last 30 days): ${pageImpressions}`);
          }
        } catch (viewsError) {
          console.log('Page views_total error:', viewsError.response?.data?.error?.message || viewsError.message);
        }
        
        // Fetch page profile views
        try {
          const viewsResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageIdToUse}/insights`, {
            params: {
              metric: 'page_views',
              period: 'day',
              since: Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000),
              until: Math.floor(Date.now() / 1000),
              access_token: pageAccessToken || accessToken
            }
          });
          
          if (viewsResponse.data.data && viewsResponse.data.data.length > 0) {
            const values = viewsResponse.data.data[0].values || [];
            pageViews = values.reduce((sum, val) => sum + (val.value || 0), 0);
            console.log(`Total page profile views (last 30 days): ${pageViews}`);
          }
        } catch (viewsError) {
          console.log('Page views error:', viewsError.response?.data?.error?.message || viewsError.message);
        }
      } catch (insightsError) {
        console.log('Page insights error:', insightsError.response?.data?.error?.message || insightsError.message);
      }
      
      // Get post impressions for recent posts
      // Note: Post insights may require the post to be published and have some engagement
      try {
        console.log(`Calculating post impressions for recent posts`);
        const posts = postsResponse?.data?.data || [];
        
        if (posts.length > 0) {
          // Fetch impressions for each post (limited to first 5 for performance)
          const postIds = posts.slice(0, 5).map(post => post.id);
          let totalPostImpressions = 0;
          let successfulFetches = 0;
          
          for (const postId of postIds) {
            try {
              // Try post_views (Facebook deprecated "impressions" in Nov 2025)
              // Try post_views first, then fallback to post_impressions
              let postInsightsResponse = null;
              try {
                postInsightsResponse = await axios.get(`https://graph.facebook.com/v18.0/${postId}/insights`, {
                  params: {
                    metric: 'post_views',
                    access_token: pageAccessToken || accessToken
                  }
                });
              } catch (viewsError) {
                // Fallback to old metric name
                try {
                  postInsightsResponse = await axios.get(`https://graph.facebook.com/v18.0/${postId}/insights`, {
                    params: {
                      metric: 'post_impressions',
                      access_token: pageAccessToken || accessToken
                    }
                  });
                } catch (impressionsError) {
                  throw viewsError; // Use the first error
                }
              }
              
              if (postInsightsResponse.data.data && postInsightsResponse.data.data.length > 0) {
                // Get the latest value
                const latestValue = postInsightsResponse.data.data[0].values?.[postInsightsResponse.data.data[0].values.length - 1]?.value || 0;
                totalPostImpressions += latestValue;
                successfulFetches++;
                console.log(`Post ${postId}: ${latestValue} impressions`);
              }
            } catch (postInsightError) {
              // Post insights might not be available for all posts (e.g., very old posts, unpublished posts)
              const errorMsg = postInsightError.response?.data?.error?.message || postInsightError.message;
              console.log(`Post insights not available for post ${postId}: ${errorMsg}`);
            }
          }
          
          postImpressions = totalPostImpressions;
          console.log(`Total post impressions (from ${successfulFetches}/${postIds.length} posts): ${postImpressions}`);
          
          if (successfulFetches === 0) {
            console.log('Note: Post insights may not be available if posts are too old or require specific permissions.');
          }
        }
      } catch (postInsightsError) {
        console.log('Post impressions error:', postInsightsError.response?.data?.error?.message || postInsightsError.message);
      }
      
    // Demographic insights are deprecated (September 2024)
    audienceInsights = null;
    
    return {
      followers: followers,
      engagement: Math.round(engagement * 100) / 100,
      avgViews: 0, // Facebook doesn't provide average views in basic API
      audienceInsights: audienceInsights,
      pageImpressions: pageImpressions,
      pageViews: pageViews,
      postImpressions: postImpressions
    };
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Facebook access token is invalid or expired');
    }
    throw new Error(`Failed to fetch Facebook metrics: ${error.message}`);
  }
};

// Parse Facebook insights data
const parseFacebookInsights = (insightsData) => {
  const insights = {
    topLocations: [],
    genderDistribution: { male: 0, female: 0, nonBinary: 0, other: 0 },
    ageGroups: []
  };
  
  let totalGenderCount = 0;
  const ageGroupCounts = {};
  const countryCounts = {};
  
  insightsData.forEach(insight => {
    // Handle both old and new metric names
    const isGenderAge = insight.name === 'page_fans_gender_age' || insight.name === 'page_fans_by_age_gender';
    const isCountry = insight.name === 'page_fans_country' || insight.name === 'page_fans_by_country';
    
    if (isGenderAge) {
      const values = insight.values[0]?.value || {};
      Object.keys(values).forEach(key => {
        const [gender, age] = key.split('.');
        const value = values[key] || 0;
        
        if (gender === 'M' || gender === 'male') {
          insights.genderDistribution.male += value;
          totalGenderCount += value;
        } else if (gender === 'F' || gender === 'female') {
          insights.genderDistribution.female += value;
          totalGenderCount += value;
        } else {
          insights.genderDistribution.other += value;
          totalGenderCount += value;
        }
        
        // Aggregate age groups
        if (age) {
          if (!ageGroupCounts[age]) {
            ageGroupCounts[age] = 0;
          }
          ageGroupCounts[age] += value;
        }
      });
    } else if (isCountry) {
      const values = insight.values[0]?.value || {};
      Object.keys(values).forEach(country => {
        const count = values[country] || 0;
        if (!countryCounts[country]) {
          countryCounts[country] = 0;
        }
        countryCounts[country] += count;
      });
    }
  });
  
  // Convert age group counts to percentages
  const totalAgeCount = Object.values(ageGroupCounts).reduce((sum, count) => sum + count, 0);
  Object.keys(ageGroupCounts).forEach(age => {
    const count = ageGroupCounts[age];
    const percentage = totalAgeCount > 0 ? Math.round((count / totalAgeCount) * 100) : 0;
    insights.ageGroups.push({ range: age, percentage });
  });
  
  // Normalize gender distribution to percentages
  if (totalGenderCount > 0) {
    insights.genderDistribution.male = Math.round((insights.genderDistribution.male / totalGenderCount) * 100);
    insights.genderDistribution.female = Math.round((insights.genderDistribution.female / totalGenderCount) * 100);
    insights.genderDistribution.other = Math.round((insights.genderDistribution.other / totalGenderCount) * 100);
  }
  
  // Convert country counts to percentages and sort
  const totalCountryCount = Object.values(countryCounts).reduce((sum, count) => sum + count, 0);
  Object.keys(countryCounts).forEach(country => {
    const count = countryCounts[country];
    const percentage = totalCountryCount > 0 ? Math.round((count / totalCountryCount) * 100) : 0;
    insights.topLocations.push({ country, percentage });
  });
  
  // Sort and limit top locations
  insights.topLocations.sort((a, b) => b.percentage - a.percentage);
  insights.topLocations = insights.topLocations.slice(0, 10);
  
  return insights;
};

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
    throw new Error('Failed to extend Facebook token');
  }
  
  // Default to 60 days if expires_in is missing
  const expiresIn = response.data.expires_in || (60 * 24 * 60 * 60); // Default to 60 days
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
