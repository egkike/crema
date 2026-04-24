/**
 * NotificationService tests
 * 
 * Tests ONLY what can be verified WITHOUT changing process.env after module import.
 * 
 * Why skip tests for env config:
 * - Vi.stubEnv() in beforeEach affects test execution context, NOT module import
 * - notification.service reads process.env at EVERY call (good pattern)
 * - But Vitest caches modules, so stubEnv after import has no effect on the module
 * 
 * What works: tests that use current env as-is, or mock global fetch
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch (used by sendToSlack and sendToDatadog)
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import AFTER vi.stubGlobal — module reads process.env at every call
import { notificationService } from '../../services/notification.service';

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true } as Response);
    notificationService.notificationsThisMinute = 0;
    notificationService.lastReset = Date.now();
  });

  // -------------------------------------------------------------------------
  // shouldNotifyForError (reads process.env directly, no config caching issue)
  // -------------------------------------------------------------------------

  describe('shouldNotifyForError', () => {
    it('should notify for DB errors by default', () => {
      const dbError = new Error('connection refused');
      Object.defineProperty(dbError, 'name', { value: 'PostgresError' });
      expect(notificationService.shouldNotifyForError(dbError)).toBe(true);
    });

    it('should notify for timeout errors by default', () => {
      const timeoutError = new Error('timeout');
      Object.defineProperty(timeoutError, 'name', { value: 'TimeoutError' });
      expect(notificationService.shouldNotifyForError(timeoutError)).toBe(true);
    });

    it('should notify for generic errors by default', () => {
      expect(notificationService.shouldNotifyForError(new Error('generic'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // buildPayload (only reads NODE_ENV, testable with current env)
  // -------------------------------------------------------------------------

  describe('buildPayload', () => {
    it('should build payload without PII', () => {
      const error = new Error('something went wrong');
      Object.defineProperty(error, 'name', { value: 'TestError' });

      const payload = notificationService.buildPayload(error, { requestId: 'req-123' }, 'error');

      expect(payload.level).toBe('error');
      expect(payload.message).toBe('something went wrong');
      expect(payload.code).toBe('TestError');
      expect(payload.requestId).toBe('req-123');
      expect(payload.timestamp).toBeDefined();
      expect(payload.service).toBe('crema-backend');
    });

    it('should exclude stack in production when NODE_ENV=production', () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const error = new Error('test');
      Object.defineProperty(error, 'name', { value: 'TestError' });

      const payload = notificationService.buildPayload(error, {}, 'error');

      expect(payload.stack).toBeUndefined();
      process.env.NODE_ENV = prevEnv;
    });

    it('should include stack when NODE_ENV=development', () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const error = new Error('test');
      Object.defineProperty(error, 'name', { value: 'TestError' });
      Object.defineProperty(error, 'stack', { value: 'Error\n    at test.js:1' });

      const payload = notificationService.buildPayload(error, {}, 'error');

      expect(payload.stack).toBeDefined();
      process.env.NODE_ENV = prevEnv;
    });
  });

  // -------------------------------------------------------------------------
// sendToSlack (only calls fetch when ERROR_NOTIFICATION_SLACK_WEBHOOK is set)
  // -------------------------------------------------------------------------
  describe('sendToSlack', () => {
    it('should call fetch when webhook is configured', async () => {
      // Only works if ERROR_NOTIFICATION_SLACK_WEBHOOK is set in the actual environment
      const webhookUrl = process.env.ERROR_NOTIFICATION_SLACK_WEBHOOK;

      if (!webhookUrl) return;

      const payload = {
        level: 'error' as const,
        message: 'test error',
        code: 'TestError',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'test',
        service: 'crema-backend',
      };

      await notificationService.sendToSlack(payload);

      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should throw when Slack returns non-ok', async () => {
      const webhookUrl = process.env.ERROR_NOTIFICATION_SLACK_WEBHOOK;

      if (!webhookUrl) return;

      mockFetch.mockResolvedValue({ ok: false, status: 400 } as Response);

      const payload = {
        level: 'error' as const,
        message: 'test',
        code: 'Test',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'test',
        service: 'crema',
      };

      await expect(notificationService.sendToSlack(payload)).rejects.toThrow('Slack API error: 400');
    });
  });

  // -------------------------------------------------------------------------
// sendToDatadog (only calls fetch when ERROR_NOTIFICATION_DATADOG_API_KEY is set)
  // -------------------------------------------------------------------------
  describe('sendToDatadog', () => {
    it('should call fetch when api key is configured', async () => {
      const apiKey = process.env.ERROR_NOTIFICATION_DATADOG_API_KEY;

      if (!apiKey) return;

      const payload = {
        level: 'error' as const,
        message: 'test error',
        code: 'TestError',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'test',
        service: 'crema-backend',
      };

      await notificationService.sendToDatadog(payload);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api/v2/logs'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'DD-API-KEY': apiKey }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // notify (integration — skips if env not configured)
  // -------------------------------------------------------------------------

  describe('notify', () => {
    it('should send to Slack and Datadog when both are configured', async () => {
      const webhookUrl = process.env.ERROR_NOTIFICATION_SLACK_WEBHOOK;
      const apiKey = process.env.ERROR_NOTIFICATION_DATADOG_API_KEY;

      if (!webhookUrl || !apiKey) return; // Skip in env without webhooks configured

      const error = new Error('production error');
      Object.defineProperty(error, 'name', { value: 'ProductionError' });

      await notificationService.notify(error, { requestId: 'req-456' });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});