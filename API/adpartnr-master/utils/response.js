// Success response helper
const successResponse = (res, data = null, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

// Error response helper
const errorResponse = (res, message = 'Error', statusCode = 400, errors = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors && { errors })
  });
};

// Pagination response helper
const paginatedResponse = (res, data, pagination, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination
  });
};

// Created response helper
const createdResponse = (res, data, message = 'Created successfully') => {
  return successResponse(res, data, message, 201);
};

// No content response helper
const noContentResponse = (res, message = 'No content') => {
  return successResponse(res, null, message, 204);
};

// Unauthorized response helper
const unauthorizedResponse = (res, message = 'Unauthorized') => {
  return errorResponse(res, message, 401);
};

// Forbidden response helper
const forbiddenResponse = (res, message = 'Forbidden') => {
  return errorResponse(res, message, 403);
};

// Not found response helper
const notFoundResponse = (res, message = 'Not found') => {
  return errorResponse(res, message, 404);
};

// Conflict response helper
const conflictResponse = (res, message = 'Conflict') => {
  return errorResponse(res, message, 409);
};

// Server error response helper
const serverErrorResponse = (res, message = 'Internal server error') => {
  return errorResponse(res, message, 500);
};

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse,
  createdResponse,
  noContentResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  conflictResponse,
  serverErrorResponse
};
