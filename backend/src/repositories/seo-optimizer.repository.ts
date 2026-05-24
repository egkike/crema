/**
 * SeoOptimizerRepository for seo_configs table
 * Manages SEO configuration per product (meta tags, Open Graph, schema markup, keywords)
 */

import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

// --- INTERFACES ---

export interface SEOConfig {
  id: string;
  product_id: string;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  schema_markup: Record<string, unknown> | null;
  keywords: string[] | null;
  canonical_url: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Input type for creating/updating SEO configuration.
 * Excludes read-only fields: id, product_id, created_at, updated_at.
 */
export interface SEOConfigInput {
  meta_title?: string | null;
  meta_description?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
  schema_markup?: Record<string, unknown> | null;
  keywords?: string[] | null;
  canonical_url?: string | null;
}

// --- CONSTANTS ---

const SCHEMA = config.db?.schema ?? 'public';

// --- REPOSITORY ---

function mapRow(row: Record<string, unknown>): SEOConfig {
  return {
    id: row.id as string,
    product_id: row.product_id as string,
    meta_title: (row.meta_title as string) ?? null,
    meta_description: (row.meta_description as string) ?? null,
    og_title: (row.og_title as string) ?? null,
    og_description: (row.og_description as string) ?? null,
    og_image_url: (row.og_image_url as string) ?? null,
    schema_markup: (row.schema_markup as Record<string, unknown>) ?? null,
    keywords: (row.keywords as string[]) ?? null,
    canonical_url: (row.canonical_url as string) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

export const seoOptimizerRepository = {
  /**
   * Find SEO configuration by product ID
   */
  async findByProductId(productId: string): Promise<SEOConfig | null> {
    const query = `
      SELECT id, product_id, meta_title, meta_description,
             og_title, og_description, og_image_url,
             schema_markup, keywords, canonical_url,
             created_at, updated_at
      FROM "${SCHEMA}".product_seo_configs
      WHERE product_id = $1
    `;
    try {
      const { rows } = await pool.query(query, [productId]);
      return rows.length > 0 ? mapRow(rows[0]) : null;
    } catch (error) {
      logger.error({ error, productId }, 'SeoOptimizerRepository: findByProductId failed');
      throw error;
    }
  },

  /**
   * Create or update SEO configuration (upsert)
   */
  async upsert(productId: string, input: SEOConfigInput): Promise<SEOConfig> {
    const query = `
      INSERT INTO "${SCHEMA}".product_seo_configs (
        product_id, meta_title, meta_description,
        og_title, og_description, og_image_url,
        schema_markup, keywords, canonical_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (product_id) DO UPDATE SET
        meta_title = EXCLUDED.meta_title,
        meta_description = EXCLUDED.meta_description,
        og_title = EXCLUDED.og_title,
        og_description = EXCLUDED.og_description,
        og_image_url = EXCLUDED.og_image_url,
        schema_markup = EXCLUDED.schema_markup,
        keywords = EXCLUDED.keywords,
        canonical_url = EXCLUDED.canonical_url,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, product_id, meta_title, meta_description,
                og_title, og_description, og_image_url,
                schema_markup, keywords, canonical_url,
                created_at, updated_at
    `;
    try {
      const { rows } = await pool.query(query, [
        productId,
        input.meta_title ?? null,
        input.meta_description ?? null,
        input.og_title ?? null,
        input.og_description ?? null,
        input.og_image_url ?? null,
        input.schema_markup ? JSON.stringify(input.schema_markup) : null,
        input.keywords ?? null,
        input.canonical_url ?? null,
      ]);
      return mapRow(rows[0]);
    } catch (error) {
      logger.error({ error, productId }, 'SeoOptimizerRepository: upsert failed');
      throw error;
    }
  },

  /**
   * Delete SEO configuration by product ID
   */
  async delete(productId: string): Promise<void> {
    const query = `DELETE FROM "${SCHEMA}".product_seo_configs WHERE product_id = $1`;
    try {
      await pool.query(query, [productId]);
    } catch (error) {
      logger.error({ error, productId }, 'SeoOptimizerRepository: delete failed');
      throw error;
    }
  },
};
