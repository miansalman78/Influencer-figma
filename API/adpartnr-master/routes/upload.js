const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { uploadImage, uploadDocument } = require('../config/cloudinary');
const uploadController = require('../controllers/uploadController');

// All upload routes require authentication
router.use(authenticate);

// Image upload routes
router.post('/image', uploadImage.single('image'), uploadController.uploadImage);
router.post('/images', uploadImage.array('images', 10), uploadController.uploadMultipleImages);

// Document upload routes
router.post('/document', uploadDocument.single('document'), uploadController.uploadDocument);
router.post('/documents', uploadDocument.array('documents', 10), uploadController.uploadMultipleDocuments);

// Delete file route
router.delete('/file/:publicId', uploadController.deleteFile);

module.exports = router;

