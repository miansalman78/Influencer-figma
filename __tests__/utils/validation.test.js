/**
 * Validation Utilities Tests
 */

import {
  validateEmail,
  validatePassword,
  validateAmount,
  validateWithdrawAmount,
  validatePhoneNumber,
  validateRequired,
  validateURL,
} from '../../utils/validation';

describe('Validation Utilities', () => {
  describe('validateEmail', () => {
    it('should return null for valid email', () => {
      expect(validateEmail('test@example.com')).toBeNull();
      expect(validateEmail('user.name@example.co.uk')).toBeNull();
    });

    it('should return error for invalid email', () => {
      expect(validateEmail('invalid')).not.toBeNull();
      expect(validateEmail('invalid@')).not.toBeNull();
      expect(validateEmail('@example.com')).not.toBeNull();
    });

    it('should return error for empty email', () => {
      expect(validateEmail('')).not.toBeNull();
      expect(validateEmail(null)).not.toBeNull();
      expect(validateEmail(undefined)).not.toBeNull();
    });

    it('should trim email before validation', () => {
      expect(validateEmail('  test@example.com  ')).toBeNull();
    });
  });

  describe('validatePassword', () => {
    it('should return null for valid password', () => {
      expect(validatePassword('Password123')).toBeNull();
      expect(validatePassword('ValidPass123!')).toBeNull();
    });

    it('should return error for short password', () => {
      expect(validatePassword('Short1')).not.toBeNull();
    });

    it('should return error for password without uppercase', () => {
      expect(validatePassword('password123')).not.toBeNull();
    });

    it('should return error for password without lowercase', () => {
      expect(validatePassword('PASSWORD123')).not.toBeNull();
    });

    it('should return error for password without numbers', () => {
      expect(validatePassword('Password')).not.toBeNull();
    });
  });

  describe('validateAmount', () => {
    it('should return valid for valid amount', () => {
      const result = validateAmount('100');
      expect(result.valid).toBe(true);
      expect(result.amount).toBe(100);
    });

    it('should return error for negative amount', () => {
      const result = validateAmount('-10');
      expect(result.valid).toBe(false);
    });

    it('should return error for non-numeric value', () => {
      const result = validateAmount('abc');
      expect(result.valid).toBe(false);
    });

    it('should validate minimum amount', () => {
      const result = validateAmount('5', { min: 10 });
      expect(result.valid).toBe(false);
    });

    it('should validate maximum amount', () => {
      const result = validateAmount('1000', { max: 500 });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateWithdrawAmount', () => {
    it('should validate USD withdrawal', () => {
      const result = validateWithdrawAmount('50', 100, 'USD');
      expect(result.valid).toBe(true);
    });

    it('should return error for amount below minimum USD', () => {
      const result = validateWithdrawAmount('5', 100, 'USD');
      expect(result.valid).toBe(false);
    });

    it('should return error for amount above balance', () => {
      const result = validateWithdrawAmount('150', 100, 'USD');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient balance');
    });
  });

  describe('validateRequired', () => {
    it('should return null for non-empty value', () => {
      expect(validateRequired('value')).toBeNull();
      expect(validateRequired(0)).toBeNull();
      expect(validateRequired(false)).toBeNull();
    });

    it('should return error for empty value', () => {
      expect(validateRequired('')).not.toBeNull();
      expect(validateRequired(null)).not.toBeNull();
      expect(validateRequired(undefined)).not.toBeNull();
    });
  });
});

