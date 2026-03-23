/**
 * Re-export PoolClient type from pg module.
 * Use this file to import PoolClient type in repositories.
 * 
 * Usage in repositories:
 * import type { PoolClient } from '../types/pool';
 */
import type { PoolClient as PGPoolClient } from 'pg';

export type PoolClient = PGPoolClient;
