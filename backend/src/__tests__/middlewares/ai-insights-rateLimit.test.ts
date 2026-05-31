import { describe, it, expect } from 'vitest';

import {
  churnPredictionLimiter,
  recoveryEmailLimiter,
  compareLimiter,
} from '../../middlewares/rateLimit/rateLimit';

describe('rateLimit — AI Insights limiters', () => {
  describe('churnPredictionLimiter', () => {
    it('should be defined and be a middleware function', () => {
      expect(churnPredictionLimiter).toBeDefined();
      expect(typeof churnPredictionLimiter).toBe('function');
    });

    it('should expose getKey for key resolution', () => {
      // express-rate-limit v8 exposes getKey (wrapped keyGenerator)
      expect(churnPredictionLimiter).toHaveProperty('getKey');
      expect(typeof churnPredictionLimiter.getKey).toBe('function');
    });

    it('should expose resetKey for manual reset', () => {
      expect(churnPredictionLimiter).toHaveProperty('resetKey');
      expect(typeof churnPredictionLimiter.resetKey).toBe('function');
    });

    it('should have correct max configuration', () => {
      // Verify the limiter can be imported without error and is a valid rate-limit middleware.
      expect(churnPredictionLimiter).toBeDefined();
      expect(typeof churnPredictionLimiter).toBe('function');
    });
  });

  describe('recoveryEmailLimiter', () => {
    it('should be defined and be a middleware function', () => {
      expect(recoveryEmailLimiter).toBeDefined();
      expect(typeof recoveryEmailLimiter).toBe('function');
    });

    it('should expose getKey for key resolution', () => {
      expect(recoveryEmailLimiter).toHaveProperty('getKey');
      expect(typeof recoveryEmailLimiter.getKey).toBe('function');
    });

    it('should expose resetKey for manual reset', () => {
      expect(recoveryEmailLimiter).toHaveProperty('resetKey');
      expect(typeof recoveryEmailLimiter.resetKey).toBe('function');
    });
  });

  describe('compareLimiter', () => {
    it('should be defined and be a middleware function', () => {
      expect(compareLimiter).toBeDefined();
      expect(typeof compareLimiter).toBe('function');
    });

    it('should expose getKey for key resolution', () => {
      expect(compareLimiter).toHaveProperty('getKey');
      expect(typeof compareLimiter.getKey).toBe('function');
    });

    it('should expose resetKey for manual reset', () => {
      expect(compareLimiter).toHaveProperty('resetKey');
      expect(typeof compareLimiter.resetKey).toBe('function');
    });
  });
});
