/**
 * Upload Service
 *
 * Handles file uploads (images and documents) to Cloudinary via backend API.
 * Uses fetch() for uploads so React Native sends FormData with correct boundary.
 *
 * Endpoints:
 * - POST /api/upload/image - Upload single image
 * - POST /api/upload/images - Upload multiple images
 * - POST /api/upload/document - Upload single document
 * - POST /api/upload/documents - Upload multiple documents
 * - DELETE /api/upload/file/:publicId - Delete uploaded file
 */

import apiClient, { getToken } from './apiClient';
import { API_CONFIG } from '../config/env.config';
import logger from '../utils/logger';

const BASE_URL = API_CONFIG.BASE_URL;

/** POST FormData to path using fetch (no Content-Type = boundary set automatically by RN) */
const uploadWithFetch = async (path, formData) => {
  const token = await getToken();
  const headers = {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });
  } catch (fetchErr) {
    const err = new Error(fetchErr.message || 'Network request failed');
    err.isNetworkError = true;
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.message || json?.error || `Upload failed (${res.status})`);
    err.status = res.status;
    err.data = json;
    err.isNetworkError = false;
    throw err;
  }
  return json;
};

/**
 * Upload a single image file
 * 
 * @param {Object} file - File object with uri, type, and name
 * @param {string} file.uri - Local file URI (file:// or content://)
 * @param {string} file.type - MIME type (e.g., 'image/jpeg')
 * @param {string} file.name - File name (optional)
 * @returns {Promise<Object>} Response with uploaded image URL
 * 
 * @example
 * const result = await uploadImage({
 *   uri: 'file:///path/to/image.jpg',
 *   type: 'image/jpeg',
 *   name: 'image.jpg'
 * });
 * // Returns: { success: true, data: { url: 'https://...' } }
 */
export const uploadImage = async (file) => {
  try {
    if (!file || !file.uri) {
      throw new Error('File URI is required');
    }

    // Create FormData for multipart/form-data
    const formData = new FormData();
    formData.append('image', {
      uri: file.uri,
      type: file.type || 'image/jpeg',
      name: file.name || 'image.jpg',
    });

    logger.info('[Upload] Uploading single image:', file.name || file.uri);

    const json = await uploadWithFetch('/upload/image', formData);

    if (json && json.success && json.data) {
      logger.info('[Upload] Image uploaded successfully:', json.data?.url);
      return json;
    }

    throw new Error(json?.message || 'Failed to upload image');
  } catch (error) {
    logger.error('[Upload] Error uploading image:', error);
    throw error;
  }
};

/**
 * Upload multiple image files (max 10)
 * 
 * @param {Array<Object>} files - Array of file objects
 * @returns {Promise<Object>} Response with array of uploaded image URLs
 * 
 * @example
 * const result = await uploadImages([
 *   { uri: 'file:///path/to/image1.jpg', type: 'image/jpeg', name: 'image1.jpg' },
 *   { uri: 'file:///path/to/image2.jpg', type: 'image/jpeg', name: 'image2.jpg' }
 * ]);
 */
export const uploadImages = async (files) => {
  try {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('Files array is required and must not be empty');
    }

    if (files.length > 10) {
      throw new Error('Maximum 10 images allowed per upload');
    }

    const formData = new FormData();
    files.forEach((file, index) => {
      if (!file.uri) {
        throw new Error(`File at index ${index} is missing URI`);
      }
      formData.append('images', {
        uri: file.uri,
        type: file.type || 'image/jpeg',
        name: file.name || `image${index + 1}.jpg`,
      });
    });

    logger.info('[Upload] Uploading multiple images:', files.length);

    const json = await uploadWithFetch('/upload/images', formData);

    if (json && json.success && json.data) {
      const data = json.data || {};
      const urls = data.urls || (Array.isArray(data.files) ? data.files.map(f => f.url) : []);
      logger.info('[Upload] Images uploaded successfully:', urls.length);
      return { ...json, data: { ...data, files: data.files || [], urls } };
    }

    throw new Error(json?.message || 'Failed to upload images');
  } catch (error) {
    logger.error('[Upload] Error uploading images:', error);
    throw error;
  }
};

/**
 * Upload a single document file
 * 
 * @param {Object} file - File object with uri, type, and name
 * @param {string} file.uri - Local file URI
 * @param {string} file.type - MIME type (e.g., 'application/pdf')
 * @param {string} file.name - File name (optional)
 * @returns {Promise<Object>} Response with uploaded document URL
 * 
 * @example
 * const result = await uploadDocument({
 *   uri: 'file:///path/to/document.pdf',
 *   type: 'application/pdf',
 *   name: 'document.pdf'
 * });
 */
export const uploadDocument = async (file) => {
  try {
    if (!file || !file.uri) {
      throw new Error('File URI is required');
    }

    const formData = new FormData();
    formData.append('document', {
      uri: file.uri,
      type: file.type || 'application/pdf',
      name: file.name || 'document.pdf',
    });

    logger.info('[Upload] Uploading document:', file.name || file.uri);

    const json = await uploadWithFetch('/upload/document', formData);

    if (json && json.success && json.data) {
      logger.info('[Upload] Document uploaded successfully:', json.data?.url);
      return json;
    }

    throw new Error(json?.message || 'Failed to upload document');
  } catch (error) {
    logger.error('[Upload] Error uploading document:', error);
    throw error;
  }
};

/**
 * Upload a single video file
 * 
 * @param {Object} file - File object with uri, type, and name
 * @returns {Promise<Object>} Response with uploaded video URL
 */
export const uploadVideo = async (file) => {
  try {
    if (!file || !file.uri) {
      throw new Error('File URI is required');
    }

    const formData = new FormData();
    formData.append('document', {
      uri: file.uri,
      type: file.type || 'video/mp4',
      name: file.name || `video_${Date.now()}.mp4`,
    });

    logger.info('[Upload] Uploading video:', file.name || file.uri);

    const json = await uploadWithFetch('/upload/document', formData);

    if (json && json.success && json.data) {
      logger.info('[Upload] Video uploaded successfully:', json.data?.url);
      return json;
    }

    throw new Error(json?.message || 'Failed to upload video');
  } catch (error) {
    logger.error('[Upload] Error uploading video:', error);
    throw error;
  }
};

/**
 * Upload multiple document files (max 10)
 * 
 * @param {Array<Object>} files - Array of file objects
 * @returns {Promise<Object>} Response with array of uploaded document URLs
 * 
 * @example
 * const result = await uploadDocuments([
 *   { uri: 'file:///path/to/doc1.pdf', type: 'application/pdf', name: 'doc1.pdf' },
 *   { uri: 'file:///path/to/doc2.pdf', type: 'application/pdf', name: 'doc2.pdf' }
 * ]);
 */
export const uploadDocuments = async (files) => {
  try {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('Files array is required and must not be empty');
    }

    if (files.length > 10) {
      throw new Error('Maximum 10 documents allowed per upload');
    }

    const formData = new FormData();
    files.forEach((file, index) => {
      if (!file.uri) {
        throw new Error(`File at index ${index} is missing URI`);
      }
      formData.append('documents', {
        uri: file.uri,
        type: file.type || 'application/pdf',
        name: file.name || `document${index + 1}.pdf`,
      });
    });

    logger.info('[Upload] Uploading multiple documents:', files.length);

    const json = await uploadWithFetch('/upload/documents', formData);

    if (json && json.success && json.data) {
      const data = json.data || {};
      const urls = data.urls || (Array.isArray(data.files) ? data.files.map(f => f.url) : []);
      logger.info('[Upload] Documents uploaded successfully:', urls.length);
      return { ...json, data: { ...data, files: data.files || [], urls } };
    }

    throw new Error(json?.message || 'Failed to upload documents');
  } catch (error) {
    logger.error('[Upload] Error uploading documents:', error);
    throw error;
  }
};

/**
 * Delete an uploaded file from Cloudinary
 * 
 * @param {string} publicId - Cloudinary public ID of the file to delete
 * @param {string} resourceType - Type of resource: 'image' (default) or 'raw' (for documents)
 * @returns {Promise<Object>} Response indicating success
 * 
 * @example
 * // Delete an image
 * await deleteFile('adpartnr/uploads/images/xyz123', 'image');
 * 
 * // Delete a document
 * await deleteFile('adpartnr/uploads/documents/xyz123', 'raw');
 */
export const deleteFile = async (publicId, resourceType = 'image') => {
  try {
    if (!publicId) {
      throw new Error('Public ID is required');
    }

    if (resourceType !== 'image' && resourceType !== 'raw') {
      throw new Error('Resource type must be "image" or "raw"');
    }

    logger.info('[Upload] Deleting file:', publicId, 'type:', resourceType);

    const response = await apiClient.delete(`/upload/file/${publicId}`, {
      params: {
        resourceType,
      },
    });

    if (response.data && response.data.success) {
      logger.info('[Upload] File deleted successfully:', publicId);
      return response.data;
    }

    throw new Error(response.data?.message || 'Failed to delete file');
  } catch (error) {
    logger.error('[Upload] Error deleting file:', error);
    throw error;
  }
};

/**
 * Extract Cloudinary public ID from a URL
 * Helper function to get public ID from uploaded file URL
 * 
 * @param {string} url - Cloudinary URL
 * @returns {string|null} Public ID or null if not found
 * 
 * @example
 * const publicId = extractPublicId('https://res.cloudinary.com/dgwynprpj/image/upload/v1767839525/adpartnr/uploads/images/aylcfkdd1hd7163ji99z.jpg');
 * // Returns: 'adpartnr/uploads/images/aylcfkdd1hd7163ji99z'
 */
export const extractPublicId = (url) => {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/{version}/{public_id}.{format}
    const match = url.match(/\/upload\/[^/]+\/(.+?)(?:\.[^.]+)?$/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  } catch (error) {
    logger.error('[Upload] Error extracting public ID:', error);
    return null;
  }
};

export default {
  uploadImage,
  uploadImages,
  uploadDocument,
  uploadDocuments,
  uploadVideo,
  deleteFile,
  extractPublicId,
};


