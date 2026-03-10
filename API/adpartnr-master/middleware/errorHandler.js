const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error (skip logging expected business logic errors)
  // Don't log validation errors, insufficient balance, etc. as they're expected
  const skipLoggingMessages = [
    'Insufficient available balance',
    'Validation failed',
    'not found',
    'already exists',
    'Invalid token',
    'Token expired'
  ];
  
  const shouldSkipLogging = skipLoggingMessages.some(msg => 
    err.message && err.message.toLowerCase().includes(msg.toLowerCase())
  );
  
  if (!shouldSkipLogging) {
    console.error(err);
  } else {
    // Log at info level for expected errors (optional - can be removed)
    // console.log(`Expected error: ${err.message}`);
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401 };
  }

  // Paystack errors
  if (err.name === 'PaystackError') {
    const message = err.message || 'Payment processing error';
    error = { message, statusCode: 400 };
  }

  // Cloudinary / upload service errors (502/503 from Cloudinary API or multer-storage-cloudinary)
  if (err.name === 'CloudinaryError' || (err.message && (
    err.message.includes('unexpected status code') ||
    (err.message.includes('502') && err.message.toLowerCase().includes('status')) ||
    (err.message.includes('503') && err.message.toLowerCase().includes('status'))
  ))) {
    const message = 'Image upload service is temporarily unavailable. Please try again or check Cloudinary (CLOUDINARY_*) configuration.';
    error = { message, statusCode: 503 };
  }

  // Multer errors (file upload)
  if (err.name === 'MulterError') {
    let message = 'File upload error';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size too large';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field';
    }
    error = { message, statusCode: 400 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
