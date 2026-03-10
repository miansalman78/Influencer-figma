const axios = require('axios');
const { ensureHttpsBackendUrl } = require('../../utils/socialHelpers');

const generateAuthUrl = (state, req) => {
  const backendUrl = ensureHttpsBackendUrl(req);
  const redirectUri = `${backendUrl}/api/social/callback/youtube`;
  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/youtube.readonly',
    state: state
  });
  
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

const exchangeToken = async (code, redirectUri) => {
  const response = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: process.env.YOUTUBE_CLIENT_ID,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    code: code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  });
  
  if (!response.data.access_token) {
    throw new Error('Invalid token response from YouTube');
  }
  
  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresAt: new Date(Date.now() + (response.data.expires_in * 1000))
  };
};

const fetchProfile = async (accessToken, instagramBusinessAccountId = null) => {
  const response = await axios.get('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!response.data.items || response.data.items.length === 0) {
    throw new Error('No YouTube channel found');
  }
  
  const channel = response.data.items[0];
  return {
    userId: channel.id,
    username: channel.snippet.title,
    followers: parseInt(channel.statistics.subscriberCount) || 0,
    engagement: 0,
    verified: channel.snippet.verified || false
  };
};

const fetchMetrics = async (accessToken, platformUserId) => {
  try {
    // Get channel statistics (subscriber count)
    const channelResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      throw new Error('No YouTube channel found');
    }
    
    const channel = channelResponse.data.items[0];
    const followers = parseInt(channel.statistics.subscriberCount) || 0;
    const channelId = channel.id;
    
    // Get recent videos for engagement calculation
    let engagement = 0;
    let audienceInsights = null;
    
    try {
      // Get channel's uploads playlist
      const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
      
      if (uploadsPlaylistId) {
        // Get videos from uploads playlist
        const playlistResponse = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          params: {
            part: 'contentDetails',
            playlistId: uploadsPlaylistId,
            maxResults: 25
          }
        });
        
        const videoItems = playlistResponse.data.items || [];
        
        if (videoItems.length > 0) {
          // Get video IDs
          const videoIds = videoItems.map(item => item.contentDetails.videoId).join(',');
          
          // Get video statistics
          const videosResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            },
            params: {
              part: 'statistics',
              id: videoIds
            }
          });
          
          const videos = videosResponse.data.items || [];
          
          // Calculate engagement
          let totalEngagement = 0;
          let totalViews = 0;
          
          videos.forEach(video => {
            const stats = video.statistics;
            totalEngagement += (parseInt(stats.likeCount) || 0) + (parseInt(stats.commentCount) || 0);
            totalViews += parseInt(stats.viewCount) || 0;
          });
          
          const avgEngagement = videos.length > 0 ? totalEngagement / videos.length : 0;
          // Engagement rate: (avg engagement / followers) * 100
          engagement = followers > 0 ? ((avgEngagement / followers) * 100) : 0;
        }
      }
    } catch (videoError) {
      // Video metrics may not be available
      console.log('YouTube video metrics not available:', videoError.message);
    }
    
    return {
      followers: followers,
      engagement: Math.round(engagement * 100) / 100,
      avgViews: 0, // YouTube doesn't provide average views in basic API
      audienceInsights: audienceInsights // YouTube doesn't provide audience insights in basic API
    };
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('YouTube access token is invalid or expired');
    }
    throw new Error(`Failed to fetch YouTube metrics: ${error.message}`);
  }
};

const refreshToken = async (refreshToken) => {
  const response = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: process.env.YOUTUBE_CLIENT_ID,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  
  if (!response.data.access_token) {
    throw new Error('Invalid refresh token response from YouTube');
  }
  
  return {
    accessToken: response.data.access_token,
    refreshToken: refreshToken, // YouTube returns same refresh token
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

