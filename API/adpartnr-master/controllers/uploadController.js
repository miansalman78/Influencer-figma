const { successResponse, errorResponse } = require('../utils/response');
const { cloudinary } = require('../config/cloudinary');

// Upload single image
const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No image file provided', 400);
    }

    const file = req.file;
    
    // Return upload result
    return successResponse(res, {
      url: file.path, // Cloudinary secure URL
      publicId: file.public_id, // Cloudinary public ID for deletion
      format: file.format,
      width: file.width,
      height: file.height,
      bytes: file.bytes,
      resourceType: file.resource_type,
      createdAt: file.created_at
    }, 'Image uploaded successfully');
  } catch (error) {
    console.error('Image upload error:', error);
    return errorResponse(res, error.message || 'Failed to upload image', 500);
  }
};

// Upload multiple images
const uploadMultipleImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return errorResponse(res, 'No image files provided', 400);
    }

    const files = req.files.map(file => ({
      url: file.path,
      publicId: file.public_id,
      format: file.format,
      width: file.width,
      height: file.height,
      bytes: file.bytes,
      resourceType: file.resource_type,
      createdAt: file.created_at
    }));

    return successResponse(res, {
      files,
      urls: files.map(f => f.url),
      count: files.length
    }, `${files.length} image(s) uploaded successfully`);
  } catch (error) {
    console.error('Multiple images upload error:', error);
    return errorResponse(res, error.message || 'Failed to upload images', 500);
  }
};

// Upload single document
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No document file provided', 400);
    }

    const file = req.file;
    
    // Return upload result
    return successResponse(res, {
      url: file.path, // Cloudinary secure URL
      publicId: file.public_id, // Cloudinary public ID for deletion
      format: file.format,
      bytes: file.bytes,
      resourceType: file.resource_type,
      createdAt: file.created_at,
      originalName: file.originalname || null
    }, 'Document uploaded successfully');
  } catch (error) {
    console.error('Document upload error:', error);
    return errorResponse(res, error.message || 'Failed to upload document', 500);
  }
};

// Upload multiple documents
const uploadMultipleDocuments = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return errorResponse(res, 'No document files provided', 400);
    }

    const files = req.files.map(file => ({
      url: file.path,
      publicId: file.public_id,
      format: file.format,
      bytes: file.bytes,
      resourceType: file.resource_type,
      createdAt: file.created_at,
      originalName: file.originalname || null
    }));

    return successResponse(res, {
      files,
      urls: files.map(f => f.url),
      count: files.length
    }, `${files.length} document(s) uploaded successfully`);
  } catch (error) {
    console.error('Multiple documents upload error:', error);
    return errorResponse(res, error.message || 'Failed to upload documents', 500);
  }
};

// Delete uploaded file
const deleteFile = async (req, res) => {
  try {
    const { publicId } = req.params;
    const { resourceType = 'image' } = req.query; // 'image' or 'raw' for documents

    if (!publicId) {
      return errorResponse(res, 'Public ID is required', 400);
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });

    if (result.result === 'not found') {
      return errorResponse(res, 'File not found', 404);
    }

    if (result.result === 'ok') {
      return successResponse(res, {
        publicId,
        deleted: true
      }, 'File deleted successfully');
    }

    return errorResponse(res, 'Failed to delete file', 500);
  } catch (error) {
    console.error('Delete file error:', error);
    return errorResponse(res, error.message || 'Failed to delete file', 500);
  }
};

module.exports = {
  uploadImage,
  uploadMultipleImages,
  uploadDocument,
  uploadMultipleDocuments,
  deleteFile
};

