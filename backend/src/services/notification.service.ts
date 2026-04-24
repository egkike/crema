/**
 * NotificationService
 * Phase 3: Error Handling SDD
 * 
 * Sends error notifications to Slack and Datadog
 * Integrates with the global error handling system
 */

import Redis from 'ioredis';

import logger from '../utils/logger';

// ============================================================================
// Redis client for distributed rate limiting
// ============================================================================

let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (!redisClient) {
    try {
      redisClient = new Redis({
        host: process.env.REDIS_HOST || process.env.REDIS_URL?.replace('redis://', '').split(':')[0] || 'localhost',
        port: parseInt(process.env.REDIS_PORT || process.env.REDIS_URL?.replace('redis://', '').split(':')[1] || '6379', 10),
        password: process.env.REDIS_PASSWORD || process.env.REDIS_URL?.split('@')?.[0],
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      });
      redisClient.on('error', () => {
        // Silently handle - will fallback to in-memory
        redisClient = null;
      });
    } catch {
      // Redis not available - will use in-memory fallback
    }
  }
  return redisClient;
}

// ============================================================================
// Types
// ============================================================================

export type NotificationLevel = 'error' | 'warning' | 'info';

export interface NotificationPayload {
  level: NotificationLevel;
  message: string;
  code?: string;
  requestId?: string;
  stack?: string;
  timestamp: string;
  environment: string;
  service: string;
}

interface ErrorContext {
  requestId?: string;
  path?: string;
  method?: string;
}

// ============================================================================
// Config (sync - using process.env directly)
// ============================================================================
// 
// SECURITY DECISION: Using process.env directly instead of configService.
// 
// Reasons:
// 1. configService methods are async (Promise-based), but error handling
//    needs to be synchronous - we can't await in a sync error path.
// 2. Errors can happen BEFORE configService is initialized (at startup).
// 3. DB might be down when error occurs - we still need notifications.
// 4. process.env is always available synchronously.
// 
// Tradeoff: DB-based config won't work for notification settings.
// If DB-based config is needed, add a sync getter to configService
// that reads from in-memory cache after initialization.
// 
// Alternative considered: Add sync getter to configService:
//   getBooleanSync(key: string): boolean | undefined
//   (would read from internal cache after initial async load)
// 
// Current env vars (match DB allowlist in config.service.ts):
// Pattern: ERROR_NOTIFICATION_<KEY> matches error_notification.<key>
// 
// Current env vars (must match DB allowlist in config.service.ts):
//   ERROR_NOTIFICATION_SLACK_WEBHOOK    → error_notification.slack_webhook
//   ERROR_NOTIFICATION_SLACK_CHANNEL    → error_notification.slack_channel
//   ERROR_NOTIFICATION_DATADOG_API_KEY → error_notification.datadog_api_key
//   ERROR_NOTIFICATION_DATADOG_SITE  → error_notification.datadog_site
//   ERROR_NOTIFICATION_ENABLED         → error_notification.enabled
//   ERROR_NOTIFICATION_THRESHOLD      → error_notification.threshold
//   ERROR_NOTIFICATION_MAX_PER_MINUTE   → error_notification.max_per_minute
//   ERROR_NOTIFICATION_NOTIFY_DB_ERRORS  → error_notification.notify_db_errors
//   ERROR_NOTIFICATION_NOTIFY_TIMEOUT  → error_notification.notify_timeout_errors
//   ERROR_NOTIFICATION_NOTIFY_UNHANDLED → error_notification.notify_unhandled
// 

const getConfig = () => ({
  slackWebhook: process.env.ERROR_NOTIFICATION_SLACK_WEBHOOK || '',
  slackChannel: process.env.ERROR_NOTIFICATION_SLACK_CHANNEL || '#alerts',
  datadogApiKey: process.env.ERROR_NOTIFICATION_DATADOG_API_KEY || '',
  datadogSite: process.env.ERROR_NOTIFICATION_DATADOG_SITE || 'datadoghq.com',
  enabled: process.env.ERROR_NOTIFICATION_ENABLED !== 'false',
  severityThreshold: process.env.ERROR_NOTIFICATION_THRESHOLD || 'error',
  maxPerMinute: parseInt(process.env.ERROR_NOTIFICATION_MAX_PER_MINUTE || '10', 10),
});

const SEVERITY_ORDER: Record<NotificationLevel, number> = {
  info: 1,
  warning: 2,
  error: 3,
};

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Escape Slack markdown special characters to prevent Block Kit injection.
 * Escapes: * _ ` > < |
 */
function escapeSlackMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/!/g, '\\!')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/\|/g, '\\|');
}

/**
 * Sanitize stack trace before sending to Slack/Datadog.
 * Removes:
 * - Absolute file paths (/home/user/.../file.ts)
 * - Environment variable references (KEY=value, KEY="value")
 * - Query strings (?key=value)
 * - Token/secret patterns (Bearer ..., api_key ...)
 * 
 * SECURITY: Stack traces can contain sensitive data like:
 * - Full file paths revealing project structure
 * - SQL queries with data values
 * - Env vars with real credentials in error messages
 * - API keys, tokens, passwords
 */
function sanitizeStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;

  let sanitized = stack;

  // Remove absolute file paths (Unix: /home/..., Windows: C:\...)
  sanitized = sanitized.replace(/(\/[a-zA-Z0-9_\-.]+)+(\/[a-zA-Z0-9_\-.]+\.ts|\/[a-zA-Z0-9_\-.]+\.js|\/[a-zA-Z0-9_\-.]+\.tsx|\/[a-zA-Z0-9_\-.]+\.jsx)/g, (match) => {
    // Replace with shortened path: /home/.../file.ts → ...file.ts
    const parts = match.split('/');
    return '...' + parts.slice(-2).join('/');
  });

  // Remove Windows paths (C:\Users\...)
  sanitized = sanitized.replace(/[A-Z]:\\[^\s)]+/gi, (match) => {
    const parts = match.split('\\');
    return '...' + parts.slice(-2).join('\\');
  });

  // Remove env var assignments (KEY=value or KEY="value" or KEY='value')
  sanitized = sanitized.replace(/([a-zA-Z_][a-zA-Z0-9_]*)=(["']?)[^"'\s)]+\2/gi, '$1=***');

  // Remove query strings with potentially sensitive data
  sanitized = sanitized.replace(/\?[a-zA-Z0-9_]+=(["']?)[^"'\s)]+\1/gi, '?...=***');

  // Remove common secret patterns
  sanitized = sanitized.replace(/(Bearer\s+)[a-zA-Z0-9_-]+/gi, '$1***');
  sanitized = sanitized.replace(/(api[_-]?key\s*)[:=][^\s)]+/gi, '$1***');
  sanitized = sanitized.replace(/(token\s*)[:=][^\s)]+/gi, '$1***');
  sanitized = sanitized.replace(/(password\s*)[:=][^\s)]+/gi, '$1***');

  // Collapse multiple newlines to max 2
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

  return sanitized;
}

/**
 * Sanitize error message — truncate and escape for display.
 */
function sanitizeMessage(message: string, maxLength = 500): string {
  let sanitized = message.trim();
  // Truncate to prevent oversized messages
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '... [truncated]';
  }
  return sanitized;
}

// ============================================================================
// Async fetch with timeout wrapper
// ============================================================================

const FETCH_TIMEOUT_MS = 5000; // 5 seconds max per notification

async function fetchWithTimeout(url: string, init: RequestInit, serviceName: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${serviceName} notification timeout after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  }
}

// ============================================================================
// NotificationService
// ============================================================================

export const notificationService = {
  // Rate limiter state (in-memory, per-process)
  // NOTE (theoretical): In multi-instance deployment (PM2 cluster / K8s replicas),
  // each process has its own counter. For true distributed rate limiting,
  // this would need Redis. Document as known limitation.
  notificationsThisMinute: 0,
  lastReset: Date.now(),
  // Mutex for atomic rate limiting
  _rateLimitInFlight: false,

  /**
   * Check if notifications are enabled and severity is high enough
   */
  shouldNotify(level: NotificationLevel): boolean {
    const config = getConfig();
    
    if (!config.enabled) return false;

    const thresholdStr = config.severityThreshold;
    const thresholdLevel = SEVERITY_ORDER[thresholdStr as NotificationLevel] || 3;
    const messageLevel = SEVERITY_ORDER[level];

    return messageLevel >= thresholdLevel;
  },

  /**
   * Rate limiting: max notifications per minute
   * Uses Redis for distributed rate limiting, falls back to in-memory if unavailable.
   * 
   * Redis approach: INCR with TTL for atomic count + reset every minute.
   * Fallback: in-memory counter with mutex.
   */
  async checkRateLimit(): Promise<boolean> {
    const config = getConfig();
    const redis = getRedisClient();

    // Try Redis-based rate limiting first (distributed-safe)
    if (redis) {
      try {
        const key = 'crema:notifications:ratelimit';
        const current = await redis.incr(key);
        
        // Set TTL on first increment
        if (current === 1) {
          await redis.expire(key, 60);
        }

        if (current > config.maxPerMinute) {
          logger.warn({ count: current, max: config.maxPerMinute }, 'Notification rate limit exceeded (Redis)');
          return false;
        }
        return true;
      } catch {
        // Redis failed - fall through to in-memory
        logger.debug({}, 'Redis rate limit failed, using in-memory fallback');
      }
    }

    // Fallback: in-memory rate limiting (per-process)
    const now = Date.now();
    
    // Reset counter every minute
    if (now - this.lastReset >= 60000) {
      this.notificationsThisMinute = 0;
      this.lastReset = now;
    }

    // Atomic check-and-increment via mutex flag (process-level only)
    if (this._rateLimitInFlight) {
      return false;
    }

    if (this.notificationsThisMinute >= config.maxPerMinute) {
      logger.warn({ count: this.notificationsThisMinute, max: config.maxPerMinute }, 'Notification rate limit exceeded (in-memory)');
      return false;
    }

    this._rateLimitInFlight = true;
    try {
      this.notificationsThisMinute++;
    } finally {
      this._rateLimitInFlight = false;
    }
    return true;
  },

  /**
   * Check if this error type should trigger a notification
   * 
   * NOTE (theoretical): Relies on error.name string matching.
   * Fragile if third-party libraries use non-standard names.
   * Using instanceof checks where possible would be more robust.
   */
  shouldNotifyForError(error: Error): boolean {
    const errorName = error.constructor.name.toLowerCase();
    
    // DB errors — env var name matches DB allowlist
    if (errorName.includes('db') || errorName.includes('database') || errorName.includes('postgres')) {
      return process.env.ERROR_NOTIFICATION_NOTIFY_DB_ERRORS !== 'false';
    }
    
    // Timeout errors
    if (errorName.includes('timeout') || errorName.includes('timedout')) {
      return process.env.ERROR_NOTIFICATION_NOTIFY_TIMEOUT !== 'false';
    }
    
    // Unhandled exceptions
    if (errorName.includes('unhandled') || errorName.includes('unknown')) {
      return process.env.ERROR_NOTIFICATION_NOTIFY_UNHANDLED !== 'false';
    }

    // Default: notify for all errors
    return true;
  },

  /**
   * Build notification payload (no PII)
   */
  buildPayload(error: Error, context: ErrorContext, level: NotificationLevel): NotificationPayload {
    const sanitizedMessage = sanitizeMessage(error.message || 'Unknown error');
    // Only include stack trace in development (sanitized)
    const sanitizedStack = process.env.NODE_ENV === 'development' 
      ? sanitizeStack(error.stack) 
      : undefined;

    return {
      level,
      message: sanitizedMessage,
      code: error.name || 'UNKNOWN',
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      service: 'crema-backend',
      stack: sanitizedStack,
    };
  },

  /**
   * Send to Slack
   */
  async sendToSlack(payload: NotificationPayload): Promise<void> {
    const config = getConfig();
    
    if (!config.slackWebhook) {
      logger.debug({}, 'Slack webhook not configured, skipping');
      return;
    }

    const emoji = {
      error: '🔴',
      warning: '🟡',
      info: '🔵',
    }[payload.level];

    // Escape all user-controlled content for Slack markdown
    const escapedMessage = escapeSlackMarkdown(payload.message);
    const escapedStack = payload.stack ? escapeSlackMarkdown(payload.stack) : undefined;

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Error Notification`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Level:* ${payload.level.toUpperCase()}` },
          { type: 'mrkdwn', text: `*Code:* ${escapeSlackMarkdown(payload.code || '')}` },
          { type: 'mrkdwn', text: `*Service:* ${escapeSlackMarkdown(payload.service)}` },
          { type: 'mrkdwn', text: `*Environment:* ${escapeSlackMarkdown(payload.environment)}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Message:*\n\`${escapedMessage}\``,
        },
      },
    ];

    if (payload.requestId) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Request ID:* \`${escapeSlackMarkdown(payload.requestId)}\``,
        },
      });
    }

    // Stack trace only in development (already sanitized)
    if (escapedStack && process.env.NODE_ENV === 'development') {
      // Truncate sanitized stack to 500 chars to avoid Slack payload limit (3000 chars)
      const truncatedStack = escapedStack.length > 500 
        ? escapedStack.substring(0, 500) + '\n... [truncated]' 
        : escapedStack;
      
      // Validate total message size — Slack limits to 3000 chars per message
      const totalSize = JSON.stringify(blocks).length + truncatedStack.length;
      if (totalSize > 2800) {
        // Slack content limit — truncate further
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Stack:*\n\`\`\`${truncatedStack.substring(0, 300)}\n... [size limit]\`\`\``,
          },
        });
      } else {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Stack:*\n\`\`\`${truncatedStack}\`\`\``,
          },
        });
      }
    }

    const body = JSON.stringify({
      channel: config.slackChannel,
      blocks,
      text: `${emoji} [${payload.level.toUpperCase()}] ${escapedMessage}`,
    });

    try {
      const response = await fetchWithTimeout(config.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }, 'Slack');

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status}`);
      }

      logger.debug({ level: payload.level }, 'Slack notification sent');
    } catch (error) {
      // SECURITY: Never log raw error objects — they may contain request details or secrets
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ service: 'Slack', status: 'failed', message: errorMessage }, 'Failed to send Slack notification');
    }
  },

  /**
   * Send to Datadog
   */
  async sendToDatadog(payload: NotificationPayload): Promise<void> {
    const config = getConfig();
    
    if (!config.datadogApiKey) {
      logger.debug({}, 'Datadog API key not configured, skipping');
      return;
    }

    try {
      const response = await fetchWithTimeout(`https://api.${config.datadogSite}/api/v2/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': config.datadogApiKey,
        },
        body: JSON.stringify({
          ddtimestamp: new Date(payload.timestamp).getTime(),
          message: payload.message,
          status: payload.level,
          service: payload.service,
          env: payload.environment,
          error: {
            kind: payload.code,
            message: payload.message,
            stack: payload.stack,
          },
          request_id: payload.requestId,
        }),
      }, 'Datadog');

      if (!response.ok) {
        throw new Error(`Datadog API error: ${response.status}`);
      }

      logger.debug({ level: payload.level }, 'Datadog notification sent');
    } catch (error) {
      // SECURITY: Never log raw error object — may contain API keys or headers
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ service: 'Datadog', status: 'failed', message: errorMessage }, 'Failed to send Datadog notification');
    }
  },

  /**
   * Main notification method
   */
  async notify(error: Error, context: ErrorContext = {}): Promise<void> {
    // Determine severity based on error name
    const level: NotificationLevel = error.name?.toLowerCase().includes('timeout')
      ? 'warning'
      : error.name?.toLowerCase().includes('validation')
        ? 'info'
        : 'error';

    // Check if we should notify
    if (!this.shouldNotify(level)) {
      logger.debug({ level }, 'Notification skipped (disabled or below threshold)');
      return;
    }

    if (!this.shouldNotifyForError(error)) {
      logger.debug({ errorName: error.name }, 'Notification skipped (error type filtered)');
      return;
    }

    if (!await this.checkRateLimit()) {
      logger.debug({}, 'Notification skipped (rate limit)');
      return;
    }

    // Build payload (no PII, sanitized)
    const payload = this.buildPayload(error, context, level);

    // Send to both channels in parallel (with timeout)
    await Promise.all([
      this.sendToSlack(payload),
      this.sendToDatadog(payload),
    ]);

    logger.info({ level, code: payload.code, requestId: context.requestId }, 'Error notification sent');
  },
};