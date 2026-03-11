/**
 * Error Handling Utilities
 * 
 * Centralized error handling functions for consistent error management
 */

import { Alert } from 'react-native';
import logger from './logger';

/**
 * Get user-friendly error message from error object
 */
export const getErrorMessage = (error) => {
  if (!error) {
    return 'An unexpected error occurred';
  }

  // If error is already a string
  if (typeof error === 'string') {
    return error;
  }

  // If error has a message property
  if (error.message) {
    return error.message;
  }

  // If error has response data (API error)
  if (error.response?.data?.message) {
    return error.response.data.message;
  }

  if (error.response?.data?.error) {
    return error.response.data.error;
  }

  // Network error
  if (error.isNetworkError || error.message?.includes('Network request failed')) {
    return 'Network request failed. Please check your internet connection and try again.';
  }

  // Timeout error
  if (error.name === 'AbortError' || error.message?.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }

  // Default message
  return 'An unexpected error occurred. Please try again.';
};

/**
 * Handle error with alert dialog
 */
export const handleErrorWithAlert = (error, customMessage = null) => {
  const message = customMessage || getErrorMessage(error);
  
  logger.error('Error occurred', error);
  
  Alert.alert(
    'Error',
    message,
    [{ text: 'OK' }]
  );
};

/**
 * Handle error silently (just log it)
 */
export const handleErrorSilently = (error, context = '') => {
  logger.error(context || 'Error occurred', error);
};

/**
 * Handle API error with retry option
 */
export const handleApiError = (error, onRetry = null) => {
  const message = getErrorMessage(error);
  
  logger.error('API error', error);
  
  const buttons = [{ text: 'OK', style: 'cancel' }];
  
  if (onRetry) {
    buttons.push({
      text: 'Retry',
      onPress: onRetry,
    });
  }
  
  Alert.alert(
    'Error',
    message,
    buttons
  );
};

/**
 * Check if error is a network error
 */
export const isNetworkError = (error) => {
  return error?.isNetworkError || 
         error?.message?.includes('Network request failed') ||
         !error?.response;
};

/**
 * Check if error is a timeout error
 */
export const isTimeoutError = (error) => {
  return error?.name === 'AbortError' || 
         error?.name === 'TimeoutError' ||
         error?.message?.includes('timeout');
};

/**
 * Check if error is an authentication error (401)
 */
export const isAuthError = (error) => {
  return error?.response?.status === 401 || 
         error?.status === 401;
};

/**
 * Check if error is a server error (5xx)
 */
export const isServerError = (error) => {
  const status = error?.response?.status || error?.status;
  return status >= 500 && status < 600;
};

/**
 * Check if error is a client error (4xx)
 */
export const isClientError = (error) => {
  const status = error?.response?.status || error?.status;
  return status >= 400 && status < 500;
};

/**
 * Format error for display
 */
export const formatError = (error) => {
  return {
    message: getErrorMessage(error),
    isNetworkError: isNetworkError(error),
    isTimeoutError: isTimeoutError(error),
    isAuthError: isAuthError(error),
    isServerError: isServerError(error),
    isClientError: isClientError(error),
    status: error?.response?.status || error?.status,
    code: error?.code,
  };
};

/**
 * Create error handler hook for components
 */
export const createErrorHandler = (onError = null) => {
  return (error, context = '') => {
    const formattedError = formatError(error);
    
    if (onError) {
      onError(formattedError);
    } else {
      handleErrorWithAlert(error);
    }
    
    return formattedError;
  };
};

