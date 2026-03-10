const axios = require('axios');
const crypto = require('crypto');
const { generatePKCE, ensureHttpsBackendUrl } = require('../../utils/socialHelpers');

// Store PKCE data temporarily (in production, use Redis or database)
const pkceStore = new Map();

const generateAuthUrl = (state, req) => {
  const backendUrl = ensureHttpsBackendUrl(req);
  const redirectUri = `${backendUrl}/api/social/callback/twitter`;
  const { codeVerifier, codeChallenge } = generatePKCE();
  
  // Store code_verifier with state for later use
  pkceStore.set(state, codeVerifier);
  // Clean up after 10 minutes
  setTimeout(() => pkceStore.delete(state), 10 * 60 * 1000);
  
  const params = new URLSearchParams({
    client_id: process.env.TWITTER_API_KEY,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'tweet.read users.read offline.access',
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });
  
  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
};

const exchangeToken = async (code, redirectUri, state = null) => {
  const codeVerifier = pkceStore.get(state || '');
  if (!codeVerifier) {
    throw new Error('PKCE code verifier not found. Please restart OAuth flow.');
  }
  pkceStore.delete(state || ''); // Clean up
  
  const credentials = Buffer.from(`${process.env.TWITTER_API_KEY}:${process.env.TWITTER_API_SECRET}`).toString('base64');
  const params = new URLSearchParams({
    code: code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });
  
  const response = await axios.post('https://api.twitter.com/2/oauth2/token', params.toString(), {
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  
  if (!response.data.access_token) {
    throw new Error('Invalid token response from Twitter');
  }
  
  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresAt: new Date(Date.now() + (response.data.expires_in * 1000))
  };
};

const fetchProfile = async (accessToken, instagramBusinessAccountId = null) => {
  const response = await axios.get('https://api.twitter.com/2/users/me?user.fields=username,public_metrics,verified', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!response.data?.data) {
    throw new Error('Invalid profile response from Twitter');
  }
  
  return {
    userId: response.data.data.id,
    username: response.data.data.username,
    followers: response.data.data.public_metrics?.followers_count || 0,
    engagement: 0,
    verified: response.data.data.verified || false
  };
};

const fetchMetrics = async (accessToken, platformUserId) => {
  try {
    // Get user profile with follower count
    const profileResponse = await axios.get('https://api.twitter.com/2/users/me?user.fields=public_metrics', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!profileResponse.data?.data) {
      throw new Error('Invalid profile response from Twitter');
    }
    
    const followers = profileResponse.data.data.public_metrics?.followers_count || 0;
    const username = profileResponse.data.data.username;
    
    // Get recent tweets for engagement calculation
    let engagement = 0;
    let audienceInsights = null;
    
    try {
      console.log('Twitter fetchMetrics - fetching recent tweets for:', username);
      
      // Try using user tweets endpoint first (better for basic access)
      let tweetsResponse;
      try {
        // Use user tweets endpoint (requires user ID)
        // Exclude retweets to get only original tweets
        tweetsResponse = await axios.get(`https://api.twitter.com/2/users/${platformUserId}/tweets`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          params: {
            max_results: 25,
            exclude: 'retweets', // Exclude retweets - only get original tweets
            'tweet.fields': 'public_metrics,referenced_tweets' // Include referenced_tweets to identify retweets
          }
        });
        console.log('Twitter fetchMetrics - user tweets endpoint succeeded');
      } catch (userTweetsError) {
        console.log('Twitter fetchMetrics - user tweets endpoint failed, trying search endpoint...', {
          status: userTweetsError.response?.status,
          message: userTweetsError.response?.data?.error?.message || userTweetsError.message
        });
        
        // Fallback to search endpoint
        // Exclude retweets in search query
        tweetsResponse = await axios.get(`https://api.twitter.com/2/tweets/search/recent`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          params: {
            query: `from:${username} -is:retweet`, // Exclude retweets in query
            max_results: 25,
            'tweet.fields': 'public_metrics,referenced_tweets'
          }
        });
        console.log('Twitter fetchMetrics - search endpoint succeeded');
      }
      
      let tweets = tweetsResponse.data?.data || [];
      
      // Filter out any retweets that might have slipped through
      // A retweet will have referenced_tweets with type 'retweeted'
      tweets = tweets.filter(tweet => {
        const isRetweet = tweet.referenced_tweets?.some(ref => ref.type === 'retweeted');
        return !isRetweet;
      });
      
      console.log('Twitter fetchMetrics - after filtering retweets:', {
        originalCount: tweetsResponse.data?.data?.length || 0,
        filteredCount: tweets.length,
        removedRetweets: (tweetsResponse.data?.data?.length || 0) - tweets.length
      });
      
      console.log('Twitter fetchMetrics - tweets response:', {
        tweetCount: tweets.length,
        hasData: !!tweetsResponse.data?.data,
        responseStructure: Object.keys(tweetsResponse.data || {})
      });
      
      if (tweets.length === 0) {
        console.warn('Twitter fetchMetrics - No tweets returned. Account may have no tweets, or endpoint requires elevated access.');
      } else {
        console.log(`Twitter fetchMetrics - Processing ${tweets.length} tweets...`);
        
        // Calculate total engagement (likes + retweets + replies)
        let totalEngagement = 0;
        
        tweets.forEach((tweet, index) => {
          const metrics = tweet.public_metrics || {};
          
          // Log full metrics for first tweet to debug
          if (index === 0) {
            console.log('Twitter tweet 1 - full metrics:', {
              public_metrics: metrics,
              fullTweet: JSON.stringify(tweet, null, 2)
            });
          }
          
          const likeCount = metrics.like_count || 0;
          const retweetCount = metrics.retweet_count || 0;
          const replyCount = metrics.reply_count || 0;
          const quoteCount = metrics.quote_count || 0; // Include quote tweets in engagement
          
          const tweetEngagement = likeCount + retweetCount + replyCount + quoteCount;
          totalEngagement += tweetEngagement;
          
          // Log first 3 tweets for debugging
          if (index < 3) {
            console.log(`Twitter tweet ${index + 1}:`, {
              likes: likeCount,
              retweets: retweetCount,
              replies: replyCount,
              quotes: quoteCount,
              engagement: tweetEngagement,
              isRetweet: tweet.referenced_tweets?.some(ref => ref.type === 'retweeted') || false
            });
          }
        });
        
        const avgEngagement = totalEngagement / tweets.length;
        // Engagement rate: (avg engagement / followers) * 100
        engagement = followers > 0 ? ((avgEngagement / followers) * 100) : 0;
        
        console.log(`Twitter metrics calculated:`, {
          tweets: tweets.length,
          totalEngagement: totalEngagement,
          avgEngagement: avgEngagement.toFixed(2),
          engagementRate: engagement.toFixed(2) + '%',
          followers: followers
        });
      }
    } catch (tweetError) {
      // Tweet metrics may not be available (rate limit, permissions, or access level)
      console.error('Twitter fetchMetrics - tweet metrics error:', {
        status: tweetError.response?.status,
        statusText: tweetError.response?.statusText,
        errorCode: tweetError.response?.data?.error?.title,
        errorMessage: tweetError.response?.data?.error?.detail || tweetError.response?.data?.error?.message,
        errorType: tweetError.response?.data?.error?.type,
        fullError: tweetError.response?.data
      });
      
      if (tweetError.response?.status === 403) {
        console.warn('Twitter fetchMetrics - 403 Forbidden. This endpoint may require elevated access or additional permissions.');
        console.warn('To get engagement metrics, you may need to:');
        console.warn('1. Apply for elevated access in Twitter Developer Portal');
        console.warn('2. Ensure your app has the correct permissions');
        console.warn('3. Check if your access level supports this endpoint');
      } else if (tweetError.response?.status === 429) {
        console.warn('Twitter fetchMetrics - Rate limit exceeded. Wait a few minutes and try again.');
      } else {
        console.warn('Twitter tweet metrics not available:', tweetError.response?.data?.error?.detail || tweetError.message);
      }
    }
    
    return {
      followers: followers,
      engagement: Math.round(engagement * 100) / 100,
      avgViews: 0, // Twitter doesn't provide view counts in basic API
      audienceInsights: audienceInsights // Twitter doesn't provide audience insights in basic API
    };
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Twitter access token is invalid or expired');
    }
    throw new Error(`Failed to fetch Twitter metrics: ${error.message}`);
  }
};

const refreshToken = async (refreshToken) => {
  const credentials = Buffer.from(`${process.env.TWITTER_API_KEY}:${process.env.TWITTER_API_SECRET}`).toString('base64');
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  
  const response = await axios.post('https://api.twitter.com/2/oauth2/token', params.toString(), {
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  
  if (!response.data.access_token) {
    throw new Error('Invalid refresh token response from Twitter');
  }
  
  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + (response.data.expires_in * 1000))
  };
};

module.exports = {
  generateAuthUrl,
  exchangeToken,
  fetchProfile,
  fetchMetrics,
  refreshToken
};

