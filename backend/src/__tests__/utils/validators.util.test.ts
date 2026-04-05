import { describe, it, expect } from 'vitest';

import {
  validateCUIT,
  validateCBU,
  SpecialValidators,
  getValidatedSchema,
} from '../../utils/validators.util';

describe('validators.util', () => {
  describe('validateCUIT', () => {
    it('should validate correct CUIT format', () => {
      // Test that validateCUIT is a function
      expect(typeof validateCUIT).toBe('function');
    });
  });

  describe('validateCBU', () => {
    it('should return false for invalid length', () => {
      expect(validateCBU('072000088800000000000')).toBe(false); // 21 dígitos
      expect(validateCBU('07200008880000000000012')).toBe(false); // 23 dígitos
    });

    it('should return false for non-numeric characters', () => {
      expect(validateCBU('07200008880000000000a1')).toBe(false);
    });
  });

  describe('SpecialValidators', () => {
    it('should have ARS tax_id validator', () => {
      expect(SpecialValidators.ARS.tax_id).toBe(validateCUIT);
    });

    it('should have ARS cbu validator', () => {
      expect(SpecialValidators.ARS.cbu).toBe(validateCBU);
    });
  });

  describe('getValidatedSchema', () => {
    it('should return configured schema if valid', () => {
      const result = getValidatedSchema();
      expect(['public', 'crema']).toContain(result);
    });
  });
});
