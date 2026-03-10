/**
 * Form Validation Utilities
 * 
 * Comprehensive form validation using Yup-like patterns
 * Can be used standalone or integrated with form libraries
 */

import {
  validateEmail,
  validatePassword,
  validateAmount,
  validatePhoneNumber,
  validateRequired,
  validateURL,
} from './validation';

/**
 * Validation Rule
 */
export class ValidationRule {
  constructor(validator, message) {
    this.validator = validator;
    this.message = message;
  }

  validate(value) {
    const result = this.validator(value);
    if (result === null || result === true) {
      return { valid: true };
    }
    return {
      valid: false,
      message: typeof result === 'string' ? result : this.message,
    };
  }
}

/**
 * Create validation schema
 */
export const createValidationSchema = (rules) => {
  return {
    validate: (data) => {
      const errors = {};
      let isValid = true;

      Object.keys(rules).forEach((field) => {
        const fieldRules = Array.isArray(rules[field]) ? rules[field] : [rules[field]];
        const value = data[field];

        for (const rule of fieldRules) {
          if (rule instanceof ValidationRule) {
            const result = rule.validate(value);
            if (!result.valid) {
              errors[field] = result.message;
              isValid = false;
              break;
            }
          } else if (typeof rule === 'function') {
            const result = rule(value, data);
            if (result !== null && result !== true) {
              errors[field] = typeof result === 'string' ? result : `${field} is invalid`;
              isValid = false;
              break;
            }
          }
        }
      });

      return { isValid, errors };
    },
  };
};

/**
 * Common validation rules
 */
export const rules = {
  required: (message = 'This field is required') =>
    new ValidationRule(
      (value) => validateRequired(value),
      message
    ),

  email: (message = 'Please enter a valid email address') =>
    new ValidationRule(
      (value) => validateEmail(value),
      message
    ),

  password: (options = {}, message) =>
    new ValidationRule(
      (value) => validatePassword(value, options),
      message || 'Password does not meet requirements'
    ),

  min: (min, message) =>
    new ValidationRule(
      (value) => {
        const num = Number(value);
        if (isNaN(num) || num < min) {
          return message || `Value must be at least ${min}`;
        }
        return true;
      },
      message || `Value must be at least ${min}`
    ),

  max: (max, message) =>
    new ValidationRule(
      (value) => {
        const num = Number(value);
        if (isNaN(num) || num > max) {
          return message || `Value must be at most ${max}`;
        }
        return true;
      },
      message || `Value must be at most ${max}`
    ),

  minLength: (min, message) =>
    new ValidationRule(
      (value) => {
        if (!value || value.length < min) {
          return message || `Must be at least ${min} characters`;
        }
        return true;
      },
      message || `Must be at least ${min} characters`
    ),

  maxLength: (max, message) =>
    new ValidationRule(
      (value) => {
        if (value && value.length > max) {
          return message || `Must be at most ${max} characters`;
        }
        return true;
      },
      message || `Must be at most ${max} characters`
    ),

  phone: (message = 'Please enter a valid phone number') =>
    new ValidationRule(
      (value) => validatePhoneNumber(value),
      message
    ),

  url: (message = 'Please enter a valid URL') =>
    new ValidationRule(
      (value) => validateURL(value),
      message
    ),

  amount: (options = {}, message) =>
    new ValidationRule(
      (value) => {
        const result = validateAmount(value, options);
        return result.valid ? true : result.error;
      },
      message || 'Invalid amount'
    ),

  match: (fieldName, message) =>
    new ValidationRule(
      (value, allValues) => {
        if (value !== allValues[fieldName]) {
          return message || `Fields do not match`;
        }
        return true;
      },
      message || `Fields do not match`
    ),

  custom: (validator, message) =>
    new ValidationRule(
      validator,
      message || 'Invalid value'
    ),
};

/**
 * Validate form data
 */
export const validateForm = (data, schema) => {
  return schema.validate(data);
};

/**
 * Validate single field
 */
export const validateField = (value, fieldRules, allData = {}) => {
  const rulesArray = Array.isArray(fieldRules) ? fieldRules : [fieldRules];

  for (const rule of rulesArray) {
    if (rule instanceof ValidationRule) {
      const result = rule.validate(value);
      if (!result.valid) {
        return result;
      }
    } else if (typeof rule === 'function') {
      const result = rule(value, allData);
      if (result !== null && result !== true) {
        return {
          valid: false,
          message: typeof result === 'string' ? result : 'Invalid value',
        };
      }
    }
  }

  return { valid: true };
};

/**
 * Example usage:
 * 
 * const loginSchema = createValidationSchema({
 *   email: [rules.required(), rules.email()],
 *   password: [rules.required(), rules.minLength(8)],
 * });
 * 
 * const { isValid, errors } = validateForm({ email, password }, loginSchema);
 */

