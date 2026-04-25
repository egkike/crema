/**
 * ConfigRepository tests
 * 
 * Tests for app_config table repository
 * Following the same structural pattern as ConfigService tests
 */

import { describe, it, expect } from 'vitest';
import { configRepository, IConfigRepository } from '../../repositories/app-config.repository';
import type { AppConfig } from '../../types/entities';

describe('ConfigRepository', () => {
  describe('IConfigRepository interface', () => {
    it('should have findByKey method', () => {
      expect(typeof configRepository.findByKey).toBe('function');
    });

    it('should have findByCategory method', () => {
      expect(typeof configRepository.findByCategory).toBe('function');
    });

    it('should have findAll method', () => {
      expect(typeof configRepository.findAll).toBe('function');
    });

    it('should have upsert method', () => {
      expect(typeof configRepository.upsert).toBe('function');
    });

    it('should have delete method', () => {
      expect(typeof configRepository.delete).toBe('function');
    });
  });

  describe('IConfigRepository type', () => {
    it('should define findByKey signature', () => {
      const repo: IConfigRepository = {
        findByKey: async (_key: string) => null,
        findByCategory: async (_category: string) => [],
        findAll: async () => [],
        upsert: async (_config) => ({ configKey: '', configValue: '', configType: 'string' } as AppConfig),
        delete: async (_key: string) => false,
      };
      expect(typeof repo.findByKey).toBe('function');
    });
  });

  describe('AppConfig type', () => {
    it('should expect object with required fields', () => {
      const config: AppConfig = {
        id: '1',
        configKey: 'test.key',
        configValue: 'test-value',
        configType: 'string',
        category: 'cache',
        isPublic: false,
        isEncrypted: false,
        updatedAt: new Date(),
      };
      expect(config.configKey).toBe('test.key');
      expect(config.configValue).toBe('test-value');
      expect(config.configType).toBe('string');
    });

    it('should allow optional fields', () => {
      const config: AppConfig = {
        id: '1',
        configKey: 'test.key',
        configValue: 'test-value',
        configType: 'string',
        category: 'cache',
        isPublic: false,
        isEncrypted: false,
        updatedAt: new Date(),
        description: 'optional description',
      };
      expect(config.description).toBe('optional description');
    });
  });
});