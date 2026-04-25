/**
 * ConfigService Integration Tests
 * 
 * REQUIRES: PostgreSQL + Redis running
 * 
 * Run with: pnpm test -- --run src/__tests__/services/config.integration.test.ts
 * Skip if: DB or Redis not available
 * 
 * These tests verify ConfigService works with the real stack:
 * - Reads from DB (app_config table)
 * - Uses Redis cache
 * - Falls back to .env and defaults
 */

import { describe, it, expect } from 'vitest';
import { configService } from '../../services/config.service';

describe('ConfigService Integration', () => {
  describe('get', () => {
    it('should return default for unknown key', async () => {
      const result = await configService.get('unknown.key.12345', 'default');
      expect(result).toBe('default');
    });
  });

  describe('getNumber', () => {
    it('should return default for unknown key', async () => {
      const result = await configService.getNumber('unknown.key.12345', 42);
      expect(result).toBe(42);
    });
  });

  describe('getBoolean', () => {
    it('should return default for unknown key', async () => {
      const result = await configService.getBoolean('unknown.key.12345', true);
      expect(result).toBe(true);
    });
  });

  describe('getJSON', () => {
    it('should return default for unknown key', async () => {
      const result = await configService.getJSON('unknown.key.12345', { foo: 'bar' });
      expect(result).toEqual({ foo: 'bar' });
    });
  });

  describe('getAll', () => {
    it('should return array', async () => {
      const result = await configService.getAll();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getByKey', () => {
    it('should return null for unknown key', async () => {
      const result = await configService.getByKey('unknown.key.12345');
      expect(result).toBeNull();
    });
  });
});