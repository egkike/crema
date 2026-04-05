import { describe, it, expect } from 'vitest';

import { toString, parseClamped, parseDate } from '../../utils/params.util';

describe('params.util', () => {
  describe('toString', () => {
    it('should return string value as-is', () => {
      expect(toString('hello')).toBe('hello');
    });

    it('should return first element of array', () => {
      expect(toString(['hello', 'world'])).toBe('hello');
    });

    it('should return empty string for undefined', () => {
      expect(toString(undefined)).toBe('');
    });

    it('should handle empty string', () => {
      expect(toString('')).toBe('');
    });
  });

  describe('parseClamped', () => {
    it('should parse and clamp value within bounds', () => {
      expect(parseClamped('50', 0, 0, 100)).toBe(50);
    });

    it('should return default for NaN', () => {
      expect(parseClamped('not-a-number', 10, 0, 100)).toBe(10);
    });

    it('should clamp to min if below', () => {
      expect(parseClamped('-5', 0, 0, 100)).toBe(0);
    });

    it('should clamp to max if above', () => {
      expect(parseClamped('150', 0, 0, 100)).toBe(100);
    });

    it('should handle array input', () => {
      expect(parseClamped(['25', '50'], 0, 0, 100)).toBe(25);
    });

    it('should return default for undefined', () => {
      expect(parseClamped(undefined, 10, 0, 100)).toBe(10);
    });
  });

  describe('parseDate', () => {
    it('should parse valid date string', () => {
      const result = parseDate('2024-01-15');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString().startsWith('2024-01-15')).toBe(true);
    });

    it('should return undefined for invalid date', () => {
      expect(parseDate('not-a-date')).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      expect(parseDate(undefined)).toBeUndefined();
    });

    it('should handle array input', () => {
      const result = parseDate(['2024-01-15', '2024-02-20']);
      expect(result).toBeInstanceOf(Date);
    });
  });
});
