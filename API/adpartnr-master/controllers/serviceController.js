const User = require('../models/User');
const { successResponse, errorResponse, notFoundResponse } = require('../utils/response');
const { sanitizeString } = require('../utils/helpers');

// Get services by creator role
const getServicesByRole = async (req, res) => {
  try {
    const { creatorRole } = req.params;
    
    if (!['influencer', 'service_creator'].includes(creatorRole)) {
      return errorResponse(res, 'Invalid creator role', 400);
    }
    
    const services = getServicesForRole(creatorRole);
    return successResponse(res, { services }, 'Services retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get all available services
const getAllServices = async (req, res) => {
  try {
    const allServices = {
      influencer: getServicesForRole('influencer'),
      service_creator: getServicesForRole('service_creator')
    };
    
    return successResponse(res, allServices, 'All services retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Update user services
const updateUserServices = async (req, res) => {
  try {
    const userId = req.user._id;
    const { services } = req.body;
    
    const user = await findUserById(userId);
    if (!user) {
      return notFoundResponse(res, 'User not found');
    }
    
    if (user.role !== 'creator') {
      return errorResponse(res, 'Only creators can update services', 403);
    }
    
    const validatedServices = validateServicesForRole(services, user.creatorRole);
    if (!validatedServices.valid) {
      return errorResponse(res, validatedServices.message, 400);
    }
    
    const updatedUser = await updateUserServicesById(userId, services);
    return successResponse(res, sanitizeUserData(updatedUser), 'Services updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get user's current services
const getUserServices = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const user = await findUserById(userId);
    if (!user) {
      return notFoundResponse(res, 'User not found');
    }
    
    const userServices = {
      services: user.services,
      creatorRole: user.creatorRole,
      availableServices: user.creatorRole ? getServicesForRole(user.creatorRole) : []
    };
    
    return successResponse(res, userServices, 'User services retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Helper functions
const getServicesForRole = (creatorRole) => {
  const services = {
    influencer: [
      {
        id: 'feed_post',
        name: 'Instagram Feed Post',
        description: 'Create and post content on Instagram feed',
        platform: 'instagram',
        category: 'social_media'
      },
      {
        id: 'reel',
        name: 'Instagram Reel',
        description: 'Create short-form video content for Instagram Reels',
        platform: 'instagram',
        category: 'video_content'
      },
      {
        id: 'story',
        name: 'Instagram Story',
        description: 'Create temporary content for Instagram Stories',
        platform: 'instagram',
        category: 'social_media'
      },
      {
        id: 'carousel_post',
        name: 'Instagram Carousel',
        description: 'Create multi-image posts for Instagram',
        platform: 'instagram',
        category: 'social_media'
      },
      {
        id: 'short_video',
        name: 'TikTok Short Video',
        description: 'Create short-form video content for TikTok',
        platform: 'tiktok',
        category: 'video_content'
      },
      {
        id: 'duet',
        name: 'TikTok Duet',
        description: 'Create duet content on TikTok',
        platform: 'tiktok',
        category: 'video_content'
      },
      {
        id: 'product_review',
        name: 'Product Review',
        description: 'Create product review content across platforms',
        platform: 'multi',
        category: 'review_content'
      },
      {
        id: 'full_video_review',
        name: 'YouTube Full Review',
        description: 'Create comprehensive product reviews for YouTube',
        platform: 'youtube',
        category: 'video_content'
      },
      {
        id: 'unboxing',
        name: 'Unboxing Video',
        description: 'Create unboxing content for products',
        platform: 'multi',
        category: 'video_content'
      },
      {
        id: 'mention',
        name: 'Brand Mention',
        description: 'Mention brand in existing content',
        platform: 'multi',
        category: 'social_media'
      },
      {
        id: 'community_post',
        name: 'YouTube Community Post',
        description: 'Create community posts on YouTube',
        platform: 'youtube',
        category: 'social_media'
      },
      {
        id: 'tweet',
        name: 'Twitter Tweet',
        description: 'Create promotional tweets',
        platform: 'twitter',
        category: 'social_media'
      },
      {
        id: 'thread',
        name: 'Twitter Thread',
        description: 'Create Twitter thread content',
        platform: 'twitter',
        category: 'social_media'
      },
      {
        id: 'retweet_campaign',
        name: 'Retweet Campaign',
        description: 'Participate in retweet campaigns',
        platform: 'twitter',
        category: 'social_media'
      },
      {
        id: 'page_post',
        name: 'Facebook Page Post',
        description: 'Create posts on Facebook pages',
        platform: 'facebook',
        category: 'social_media'
      },
      {
        id: 'group_post',
        name: 'Facebook Group Post',
        description: 'Create posts in Facebook groups',
        platform: 'facebook',
        category: 'social_media'
      }
    ],
    service_creator: [
      {
        id: 'ugc_video',
        name: 'UGC Video Creation',
        description: 'Create user-generated content videos',
        category: 'video_creation',
        type: 'content_creation'
      },
      {
        id: 'ad_script',
        name: 'Advertisement Script Writing',
        description: 'Write scripts for advertisements and promotional content',
        category: 'copywriting',
        type: 'content_creation'
      },
      {
        id: 'short_form_content',
        name: 'Short Form Content',
        description: 'Create short-form content for social media',
        category: 'content_creation',
        type: 'content_creation'
      },
      {
        id: 'logo_design',
        name: 'Logo Design',
        description: 'Create custom logo designs for brands',
        category: 'graphic_design',
        type: 'design'
      },
      {
        id: 'product_banner',
        name: 'Product Banner Design',
        description: 'Design promotional banners for products',
        category: 'graphic_design',
        type: 'design'
      },
      {
        id: 'flyer',
        name: 'Flyer Design',
        description: 'Create promotional flyers and posters',
        category: 'graphic_design',
        type: 'design'
      },
      {
        id: 'social_media_design',
        name: 'Social Media Design',
        description: 'Design graphics for social media posts',
        category: 'graphic_design',
        type: 'design'
      },
      {
        id: 'ad_editing',
        name: 'Advertisement Video Editing',
        description: 'Edit promotional and advertisement videos',
        category: 'video_editing',
        type: 'video_production'
      },
      {
        id: 'youtube_edit',
        name: 'YouTube Video Editing',
        description: 'Edit long-form content for YouTube',
        category: 'video_editing',
        type: 'video_production'
      },
      {
        id: 'reels_edit',
        name: 'Instagram Reels Editing',
        description: 'Edit short-form videos for Instagram Reels',
        category: 'video_editing',
        type: 'video_production'
      },
      {
        id: 'tiktok_edit',
        name: 'TikTok Video Editing',
        description: 'Edit short-form videos for TikTok',
        category: 'video_editing',
        type: 'video_production'
      },
      {
        id: 'product_shoot',
        name: 'Product Photography',
        description: 'Professional product photography services',
        category: 'photography',
        type: 'photography'
      },
      {
        id: 'lifestyle_video',
        name: 'Lifestyle Video Production',
        description: 'Create lifestyle and promotional videos',
        category: 'video_production',
        type: 'video_production'
      },
      {
        id: 'promotional_video',
        name: 'Promotional Video',
        description: 'Create promotional video content',
        category: 'video_production',
        type: 'video_production'
      },
      {
        id: 'product_photography',
        name: 'Product Photography',
        description: 'Professional product photography',
        category: 'photography',
        type: 'photography'
      },
      {
        id: 'model_shoot',
        name: 'Model Photography',
        description: 'Professional model and portrait photography',
        category: 'photography',
        type: 'photography'
      },
      {
        id: 'lifestyle_image',
        name: 'Lifestyle Photography',
        description: 'Lifestyle and brand photography',
        category: 'photography',
        type: 'photography'
      },
      {
        id: 'caption',
        name: 'Social Media Captions',
        description: 'Write engaging captions for social media posts',
        category: 'copywriting',
        type: 'content_creation'
      },
      {
        id: 'ad_copy',
        name: 'Advertisement Copy',
        description: 'Write compelling copy for advertisements',
        category: 'copywriting',
        type: 'content_creation'
      },
      {
        id: 'blog_writing',
        name: 'Blog Writing',
        description: 'Create blog posts and articles',
        category: 'copywriting',
        type: 'content_creation'
      },
      {
        id: 'brand_messaging',
        name: 'Brand Messaging',
        description: 'Develop brand voice and messaging strategies',
        category: 'copywriting',
        type: 'content_creation'
      },
      {
        id: 'narration',
        name: 'Voice Narration',
        description: 'Provide voice narration for videos and content',
        category: 'voice_work',
        type: 'audio_production'
      },
      {
        id: 'ad_voiceover',
        name: 'Advertisement Voiceover',
        description: 'Voice over work for advertisements',
        category: 'voice_work',
        type: 'audio_production'
      },
      {
        id: 'explainer_video',
        name: 'Explainer Video Voiceover',
        description: 'Voice narration for explainer videos',
        category: 'voice_work',
        type: 'audio_production'
      },
      {
        id: '2d_animation',
        name: '2D Animation',
        description: 'Create 2D animated content',
        category: 'animation',
        type: 'animation'
      },
      {
        id: '3d_animation',
        name: '3D Animation',
        description: 'Create 3D animated content',
        category: 'animation',
        type: 'animation'
      },
      {
        id: 'motion_video',
        name: 'Motion Graphics',
        description: 'Create motion graphics and animated content',
        category: 'animation',
        type: 'animation'
      },
      {
        id: 'landing_page',
        name: 'Landing Page Design',
        description: 'Design landing pages for campaigns',
        category: 'web_design',
        type: 'design'
      },
      {
        id: 'ui_ux_design',
        name: 'UI/UX Design',
        description: 'Create user interface and user experience designs',
        category: 'web_design',
        type: 'design'
      }
    ]
  };
  
  return services[creatorRole] || [];
};

const validateServicesForRole = (services, creatorRole) => {
  if (!Array.isArray(services)) {
    return { valid: false, message: 'Services must be an array' };
  }
  
  const availableServices = getServicesForRole(creatorRole);
  const availableServiceIds = availableServices.map(service => service.id);
  
  const invalidServices = services.filter(service => !availableServiceIds.includes(service));
  
  if (invalidServices.length > 0) {
    return { 
      valid: false, 
      message: `Invalid services for ${creatorRole}: ${invalidServices.join(', ')}` 
    };
  }
  
  return { valid: true };
};

const findUserById = async (userId) => {
  return await User.findById(userId);
};

const updateUserServicesById = async (userId, services) => {
  return await User.findByIdAndUpdate(
    userId, 
    { services }, 
    { new: true, runValidators: true }
  );
};

const sanitizeUserData = (user) => {
  const userObj = user.toObject();
  delete userObj.password;
  return userObj;
};

module.exports = {
  getServicesByRole,
  getAllServices,
  updateUserServices,
  getUserServices,
  getServicesForRole
};
