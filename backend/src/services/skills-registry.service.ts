/**
 * Skills Registry Service
 * Phase 2: Orchestrator SDD
 * Centralized registry of AI skills for the Orchestrator
 * 
 * NOTE: Handlers are stored ONLY in-memory (Map), not in DB
 * DB stores only metadata for discovery
 */

import Redis from 'ioredis';

import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';

/**
 * Skill interface - metadata only (handler is in-memory)
 */
export interface Skill {
  id: string;
  name: string;
  capability: string;
  description: string;
  parameters: SkillParameter[];
  options: SkillOptions;
  // Handler stored only in registeredSkills Map (in-memory)
  handler?: (input: unknown, options?: unknown) => Promise<unknown>;
}

export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  default?: unknown;
}

export interface SkillOptions {
  timeout?: number;
  retries?: number;
  cacheable?: boolean;
  streaming?: boolean;
}

// Capability validation pattern
const CAPABILITY_PATTERN = /^[a-z][a-z0-9_.]*$/;
const MAX_CAPABILITY_LENGTH = 50;

function isValidCapability(capability: string): boolean {
  return (
    typeof capability === 'string' &&
    capability.length > 0 &&
    capability.length <= MAX_CAPABILITY_LENGTH &&
    CAPABILITY_PATTERN.test(capability)
  );
}

// Validate skill fields before registration
function validateSkillFields(skill: Skill): void {
  if (!skill.id || typeof skill.id !== 'string') {
    throw new Error('Skill.id is required and must be a string');
  }
  if (!skill.name || typeof skill.name !== 'string') {
    throw new Error('Skill.name is required and must be a string');
  }
  if (!skill.description || typeof skill.description !== 'string') {
    throw new Error('Skill.description is required and must be a string');
  }
  if (!Array.isArray(skill.parameters)) {
    throw new Error('Skill.parameters must be an array');
  }
  if (typeof skill.options !== 'object' || skill.options === null) {
    throw new Error('Skill.options must be an object');
  }
}

// In-memory registry for handlers (NOT serializable to DB)
const registeredSkills = new Map<string, Skill>();

/**
 * Clear all registered skills (for testing or shutdown)
 */
export function clearRegisteredSkills(): void {
  registeredSkills.clear();
}

// Lazy Redis - same pattern as config.service.ts
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      keyPrefix: 'crema:orchestrator:',
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 3) {
          logger.warn('SkillsRegistry: Redis reconnection failed, giving up');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    });
  }
  return redisClient;
}

const CACHE_TTL = 300; // 5 minutes

// Custom error for skills not found
export class SkillNotFoundError extends Error {
  constructor(capability: string) {
    super(`Skill not found: ${capability}`);
    this.name = 'SkillNotFoundError';
  }
}

export const skillsRegistry = {
  /**
   * Register a skill (called at boot)
   * Stores handler in-memory + metadata in DB
   */
  async register(skill: Skill): Promise<void> {
    // Validate capability format
    if (!isValidCapability(skill.capability)) {
      logger.error({ capability: skill.capability }, 'SkillsRegistry: invalid capability format');
      throw new Error(`Invalid capability format: ${skill.capability}`);
    }

    // Validate skill fields
    validateSkillFields(skill);

    // Store in in-memory registry (for handler lookup)
    registeredSkills.set(skill.capability, skill);

    // Persist metadata to DB (NOT handler)
    // NOTE: id is NOT passed - let DB generate UUID via DEFAULT gen_random_uuid()
    // Following project standard: use DB-generated UUIDs (see product.repository.ts:669)
    await pool.query(
      `INSERT INTO skills (name, capability, description, parameters, options)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (capability) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         parameters = EXCLUDED.parameters,
         options = EXCLUDED.options,
         updated_at = NOW()`,
      [
        skill.name,
        skill.capability,
        skill.description,
        JSON.stringify(skill.parameters),
        JSON.stringify(skill.options),
      ]
    );

    // Invalidate cache (lazy Redis) - non-fatal if fails
    try {
      await getRedisClient().del('skills:all');
    } catch (error) {
      logger.warn({ error: String(error) }, 'SkillsRegistry: redis cache invalidation failed');
    }

    logger.info({ capability: skill.capability }, 'SkillsRegistry: skill registered');
  },

  /**
   * Find skill by capability
   * CRITICAL: Always get handler from registeredSkills (in-memory)
   * NOTE: Returns only skills with handler in memory. DB lookups return partial metadata.
   */
  async findByCapability(capability: string): Promise<Skill | null> {
    // Validate capability first
    if (!isValidCapability(capability)) {
      logger.warn({ capability }, 'SkillsRegistry: invalid capability format');
      return null;
    }

    // First: Check in-memory (handler always there)
    if (registeredSkills.has(capability)) {
      return registeredSkills.get(capability)!;
    }

    // NOTE: We do NOT fall back to DB because DB doesn't have handler
    // If skill is not in memory, it cannot be executed
    logger.debug({ capability }, 'SkillsRegistry: skill not in memory');
    return null;
  },

  /**
   * Find skill by capability (with DB fallback for metadata)
   * Returns skill metadata but handler may be undefined
   */
  async findByCapabilityWithMeta(capability: string): Promise<Skill | null> {
    // Validate capability first
    if (!isValidCapability(capability)) {
      logger.warn({ capability }, 'SkillsRegistry: invalid capability format');
      return null;
    }

    // First: Check in-memory
    if (registeredSkills.has(capability)) {
      return registeredSkills.get(capability)!;
    }

    // Second: Check Redis cache (with try-catch for JSON.parse safety)
    try {
      const redis = getRedisClient();
      const cached = await redis.get(`skill:${capability}`);
      if (cached) {
        return JSON.parse(cached) as Skill;
      }
    } catch (error) {
      logger.debug({ error: String(error) }, 'SkillsRegistry: redis cache miss');
    }

    // Third: Load from DB (metadata only, NO handler)
    const { rows } = await pool.query(
      'SELECT * FROM skills WHERE capability = $1 AND enabled = true',
      [capability]
    );

    if (rows.length === 0) {
      return null;
    }

    const skill = rows[0];
    logger.warn({ capability }, 'SkillsRegistry: skill from DB - no handler in memory');

    return skill as Skill;
  },

  /**
   * Find handler by capability
   * CRITICAL: Handler comes ONLY from in-memory registry
   */
  async findHandler(capability: string): Promise<Skill['handler'] | null> {
    // Validate capability first
    if (!isValidCapability(capability)) {
      logger.warn({ capability }, 'SkillsRegistry: invalid capability format');
      return null;
    }

    const skill = registeredSkills.get(capability);
    return skill?.handler ?? null;
  },

  /**
   * List all skills (metadata only from DB)
   */
  async listAll(): Promise<Skill[]> {
    // Check Redis cache (with try-catch for JSON.parse safety)
    try {
      const redis = getRedisClient();
      const cached = await redis.get('skills:all');
      if (cached) {
        return JSON.parse(cached) as Skill[];
      }
    } catch (error) {
      logger.debug({ error: String(error) }, 'SkillsRegistry: redis cache miss for listAll');
    }

    // Load from DB
    const { rows } = await pool.query(
      'SELECT * FROM skills WHERE enabled = true ORDER BY name'
    );

    // Cache result (lazy Redis) - non-fatal if fails
    try {
      const redis = getRedisClient();
      await redis.setex('skills:all', CACHE_TTL, JSON.stringify(rows));
    } catch (error) {
      logger.warn({ error: String(error) }, 'SkillsRegistry: redis cache set failed');
    }

    return rows as Skill[];
  },

  /**
   * List all capabilities (just strings)
   */
  async listCapabilities(): Promise<string[]> {
    const skills = await this.listAll();
    return skills.map((s) => s.capability);
  },

  /**
   * Unregister a skill
   */
  async unregister(capability: string): Promise<void> {
    // Validate capability first
    if (!isValidCapability(capability)) {
      logger.warn({ capability }, 'SkillsRegistry: invalid capability format');
      throw new Error(`Invalid capability format: ${capability}`);
    }

    // Remove from in-memory
    registeredSkills.delete(capability);

    // Disable in DB
    await pool.query(
      'UPDATE skills SET enabled = false WHERE capability = $1',
      [capability]
    );

    // Invalidate cache - non-fatal if fails
    try {
      const redis = getRedisClient();
      await redis.del('skills:all');
      await redis.del(`skill:${capability}`);
    } catch (error) {
      logger.warn({ error: String(error) }, 'SkillsRegistry: redis cache invalidation failed');
    }

    logger.info({ capability }, 'SkillsRegistry: skill unregistered');
  },

  /**
   * Get count of registered skills
   */
  async count(): Promise<number> {
    const { rows } = await pool.query(
      'SELECT COUNT(*) as count FROM skills WHERE enabled = true'
    );
    return Number(rows[0]?.count ?? 0);
  },

  /**
   * Check if capability is registered (handler in memory)
   */
  async isRegistered(capability: string): Promise<boolean> {
    // Validate capability first
    if (!isValidCapability(capability)) {
      return false;
    }
    return registeredSkills.has(capability);
  },

  /**
   * Get count of handlers in memory
   */
  async handlerCount(): Promise<number> {
    return registeredSkills.size;
  },
};