const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Create storage configuration
const createStorage = (folder, allowedFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp'], resourceType = 'auto') => {
  const params = {
    folder: `adpartnr/${folder}`,
    allowed_formats: allowedFormats,
    resource_type: resourceType
  };

  // Only apply image transformations if we are explicitly handling images
  if (resourceType === 'image') {
    params.transformation = [
      { width: 1200, height: 1200, crop: 'limit' },
      { quality: 'auto' }
    ];
  }

  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: params
  });
};

// Profile image storage
const profileStorage = createStorage('profiles', ['jpg', 'jpeg', 'png']);

// Campaign media storage
const campaignStorage = createStorage('campaigns', ['jpg', 'jpeg', 'png', 'mp4', 'mov', 'avi'], 'auto');

// Offer portfolio storage
const portfolioStorage = createStorage('portfolio', ['jpg', 'jpeg', 'png', 'mp4', 'mov', 'avi'], 'auto');

// Review media storage
const reviewStorage = createStorage('reviews', ['jpg', 'jpeg', 'png', 'mp4', 'mov', 'avi'], 'auto');

// Offer media storage (new)
const offerStorage = createStorage('offers', ['jpg', 'jpeg', 'png', 'mp4', 'mov', 'avi']);

// Image upload storage (general purpose)
const imageStorage = createStorage('uploads/images', ['jpg', 'jpeg', 'png', 'gif', 'webp'], 'image');

// Document and Media upload storage
const documentStorage = createStorage('uploads/documents', ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx', 'mp4', 'mov', 'avi'], 'auto');

// Create multer upload instances
const uploadProfile = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for profile pictures'), false);
    }
  }
});

const uploadCampaignMedia = multer({
  storage: campaignStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  }
});

const uploadPortfolio = multer({
  storage: portfolioStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  }
});

const uploadReviewMedia = multer({
  storage: reviewStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  }
});

const uploadOfferMedia = multer({
  storage: offerStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  }
});

// Image upload instance
const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP)'), false);
    }
  }
});

// Document/Media upload instance
const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for deliverables
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only documents and videos are allowed'), false);
    }
  }
});

// Utility functions
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    throw new Error('Failed to delete image');
  }
};

const getImageUrl = (publicId, options = {}) => {
  return cloudinary.url(publicId, {
    secure: true,
    ...options
  });
};

const generateThumbnail = (publicId, width = 300, height = 300) => {
  return cloudinary.url(publicId, {
    width,
    height,
    crop: 'fill',
    gravity: 'face',
    quality: 'auto'
  });
};

module.exports = {
  cloudinary,
  uploadProfile,
  uploadCampaignMedia,
  uploadPortfolio,
  uploadReviewMedia,
  uploadImage,
  uploadDocument,
  deleteImage,
  getImageUrl,
  generateThumbnail,
  uploadOfferMedia
};
