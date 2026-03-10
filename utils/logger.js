/**
 * Environment-based Logger Utility
 * 
 * Provides structured logging that:
 * - Removes console.logs from production builds
 * - Sanitizes sensitive data
 * - Supports different log levels
 * - Can be extended to send logs to remote services
 * 
 * Usage:
 * import logger from '../utils/logger';
 * logger.info('User logged in', { userId: '123' });
 * logger.error('API error', error);
 */

const isDevelopment = __DEV__;

// Sensitive data patterns to sanitize
const SENSITIVE_PATTERNS = [
  /password/gi,
  /token/gi,
  /secret/gi,
  /api[_-]?key/gi,
  /authorization/gi,
  /bearer/gi,
  /credit[_-]?card/gi,
  /card[_-]?number/gi,
  /cvv/gi,
  /ssn/gi,
];

/**
 * Sanitize sensitive data from log messages
 */
const sanitize = (data) => {
  if (!data) return data;
  
  if (typeof data === 'string') {
    // Replace sensitive patterns with [REDACTED]
    let sanitized = data;
    SENSITIVE_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });
    return sanitized;
  }
  
  if (typeof data === 'object') {
    try {
      const sanitized = { ...data };
      Object.keys(sanitized).forEach(key => {
        const lowerKey = key.toLowerCase();
        // Check if key matches sensitive patterns
        const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(lowerKey));
        
        if (isSensitive) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof sanitized[key] === 'object') {
          sanitized[key] = sanitize(sanitized[key]);
        }
      });
      return sanitized;
    } catch (error) {
      return '[Error sanitizing data]';
    }
  }
  
  return data;
};

/**
 * Format log message with timestamp and context
 */
const formatMessage = (level, message, data) => {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  
  if (data !== undefined) {
    return { prefix, message, data: sanitize(data) };
  }
  return { prefix, message: sanitize(message) };
};

/**
 * Logger class with different log levels
 */
class Logger {
  /**
   * Log info messages (development only)
   */
  info(message, data) {
    if (isDevelopment) {
      const formatted = formatMessage('info', message, data);
      if (data !== undefined) {
        console.log(formatted.prefix, formatted.message, formatted.data);
      } else {
        console.log(formatted.prefix, formatted.message);
      }
    }
  }

  /**
   * Log warning messages (always logged)
   */
  warn(message, data) {
    const formatted = formatMessage('warn', message, data);
    if (data !== undefined) {
      console.warn(formatted.prefix, formatted.message, formatted.data);
    } else {
      console.warn(formatted.prefix, formatted.message);
    }
  }

  /**
   * Log error messages (always logged)
   */
  error(message, error) {
    const formatted = formatMessage('error', message, error);
    if (error) {
      console.error(formatted.prefix, formatted.message, formatted.data);
      
      // TODO: Send to error tracking service (Sentry, Bugsnag, etc.)
      // Example: Sentry.captureException(error, { extra: { message } });
    } else {
      console.error(formatted.prefix, formatted.message);
    }
  }

  /**
   * Log debug messages (development only)
   */
  debug(message, data) {
    if (isDevelopment) {
      const formatted = formatMessage('debug', message, data);
      if (data !== undefined) {
        console.log(formatted.prefix, formatted.message, formatted.data);
      } else {
        console.log(formatted.prefix, formatted.message);
      }
    }
  }

  /**
   * Log API requests (development only)
   */
  api(method, url, data) {
    if (isDevelopment) {
      const formatted = formatMessage('api', `${method} ${url}`, data);
      console.log(formatted.prefix, formatted.message, formatted.data || '');
    }
  }
}

// Export singleton instance
const logger = new Logger();
export default logger;

