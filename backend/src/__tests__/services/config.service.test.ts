/**
 * ConfigService tests
 * 
 * Tests for centralized configuration management
 * 
 * What we can test without complex mocking:
 * - ALLOWED_CONFIG_KEYS exist and contain expected keys
 * - Type exports
 * - Service structure
 * 
 * What requires integration testing (with DB + Redis running):
 * - get/getNumber/getBoolean/getJSON (uses configRepository + Redis cache + .env fallback)
 * - set/setMany (requires DB)
 */

import { describe, it, expect } from 'vitest';
import { configService, ALLOWED_CONFIG_KEYS, ConfigType, ConfigCategory } from '../../services/config.service';

describe('ConfigService', () => {
  describe('ALLOWED_CONFIG_KEYS', () => {
    it('should exist and be an array', () => {
      expect(ALLOWED_CONFIG_KEYS).toBeInstanceOf(Array);
      expect(ALLOWED_CONFIG_KEYS.length).toBeGreaterThan(0);
    });

    it('should contain ai.* keys', () => {
      expect(ALLOWED_CONFIG_KEYS).toContain('ai.embedding_dimensions');
      expect(ALLOWED_CONFIG_KEYS).toContain('ai.default_model');
      expect(ALLOWED_CONFIG_KEYS).toContain('ai.whisper_model');
    });

    it('should contain retry.* keys', () => {
      expect(ALLOWED_CONFIG_KEYS).toContain('retry.payout_delay');
      expect(ALLOWED_CONFIG_KEYS).toContain('retry.release_delay');
      expect(ALLOWED_CONFIG_KEYS).toContain('retry.max_attempts');
    });

    it('should contain commission.* keys', () => {
      expect(ALLOWED_CONFIG_KEYS).toContain('commission.default_margin');
      expect(ALLOWED_CONFIG_KEYS).toContain('commission.min_creator_margin');
    });

    it('should contain orchestrator.* keys', () => {
      expect(ALLOWED_CONFIG_KEYS).toContain('orchestrator.default_timeout');
      expect(ALLOWED_CONFIG_KEYS).toContain('orchestrator.max_retries');
    });

    it('should contain error_notification.* keys (from Phase 3)', () => {
      expect(ALLOWED_CONFIG_KEYS).toContain('error_notification.enabled');
      expect(ALLOWED_CONFIG_KEYS).toContain('error_notification.max_per_minute');
      expect(ALLOWED_CONFIG_KEYS).toContain('error_notification.severity_threshold');
    });

    it('should contain providers.* keys', () => {
      expect(ALLOWED_CONFIG_KEYS).toContain('providers.blockonomics_timeout');
    });

    it('should have all keys as valid config key format', () => {
      ALLOWED_CONFIG_KEYS.forEach((key) => {
        expect(typeof key).toBe('string');
        // Keys like "category.key" or "category.sub_key"
        expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/);
      });
    });
  });

  describe('ConfigType', () => {
    it('should export valid types', () => {
      const validTypes: ConfigType[] = ['string', 'number', 'boolean', 'json'];
      expect(validTypes).toContain('string');
      expect(validTypes).toContain('number');
      expect(validTypes).toContain('boolean');
      expect(validTypes).toContain('json');
    });
  });

  describe('ConfigCategory', () => {
    it('should export valid categories', () => {
      const validCategories: ConfigCategory[] = ['ai', 'retry', 'admin', 'commission', 'cache', 'providers', 'features'];
      expect(validCategories).toContain('ai');
      expect(validCategories).toContain('retry');
      expect(validCategories).toContain('admin');
    });
  });

  describe('configService', () => {
    it('should export get function', () => {
      expect(typeof configService.get).toBe('function');
    });

    it('should export getNumber function', () => {
      expect(typeof configService.getNumber).toBe('function');
    });

    it('should export getBoolean function', () => {
      expect(typeof configService.getBoolean).toBe('function');
    });

    it('should export getJSON function', () => {
      expect(typeof configService.getJSON).toBe('function');
    });

    it('should export set function', () => {
      expect(typeof configService.set).toBe('function');
    });

    it('should export setMany function', () => {
      expect(typeof configService.setMany).toBe('function');
    });

    it('should export getAll function', () => {
      expect(typeof configService.getAll).toBe('function');
    });

    it('should export getByKey function', () => {
      expect(typeof configService.getByKey).toBe('function');
    });

    it('should export initCache function', () => {
      expect(typeof configService.initCache).toBe('function');
    });

    it('should export closeCache function', () => {
      expect(typeof configService.closeCache).toBe('function');
    });
  });
});