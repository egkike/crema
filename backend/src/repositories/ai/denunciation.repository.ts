/**
 * AI Denunciations Repository
 * Phase 4: Denunciations
 * Handles reports, reasons, actions, and policies
 */

import pool from '../../db/postgres';
import { config } from '../../config/index';

const schema = config.db?.schema || 'public';

// Types for Denunciations
export interface Report {
  id: string;
  reporter_id: string;
  content_type: string;
  content_id: string;
  reason_code: string;
  description: string | null;
  status: 'pending' | 'investigating' | 'resolved' | 'rejected';
  resolved_by: string | null;
  resolved_at: Date | null;
  resolution_notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ReportReason {
  id: string;
  content_type: string;
  code: string;
  label_es: string;
  label_en: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  is_active: boolean;
  created_at: Date;
}

export interface ReportAction {
  id: string;
  report_id: string;
  action_type: string;
  performed_by: string;
  notes: string | null;
  created_at: Date;
}

export interface ContentPolicy {
  id: string;
  title_es: string;
  title_en: string;
  content_es: string;
  content_en: string;
  content_type: string;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateReportDTO {
  reporterId: string;
  contentType: string;
  contentId: string;
  reasonCode: string;
  description?: string;
}

export interface UpdateReportDTO {
  status?: 'pending' | 'investigating' | 'resolved' | 'rejected';
  resolvedBy?: string;
  resolutionNotes?: string;
}

export interface CreateActionDTO {
  reportId: string;
  actionType: string;
  performedBy: string;
  notes?: string;
}

export const denominationRepository = {
  // =========================================================================
  // Reports
  // =========================================================================

  /**
   * Create a new report
   */
  async createReport(data: CreateReportDTO): Promise<Report> {
    const query = `
      INSERT INTO "${schema}".reports (reporter_id, content_type, content_id, reason_code, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, reporter_id, content_type, content_id, reason_code, description, status, resolved_by, resolved_at, resolution_notes, created_at, updated_at
    `;
    const { rows } = await pool.query<Report>(query, [
      data.reporterId,
      data.contentType,
      data.contentId,
      data.reasonCode,
      data.description || null,
    ]);
    return rows[0];
  },

  /**
   * Get report by ID
   */
  async getReportById(reportId: string): Promise<Report | null> {
    const query = `
      SELECT id, reporter_id, content_type, content_id, reason_code, description, status, resolved_by, resolved_at, resolution_notes, created_at, updated_at
      FROM "${schema}".reports
      WHERE id = $1
    `;
    const { rows } = await pool.query<Report>(query, [reportId]);
    return rows[0] || null;
  },

  /**
   * Get reports with filters
   */
  async getReports(
    filters: {
      status?: string;
      contentType?: string;
      reporterId?: string;
    },
    limit: number = 20,
    offset: number = 0
  ): Promise<{ reports: Report[]; total: number }> {
    let whereClause = '1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(filters.status);
    }
    if (filters.contentType) {
      whereClause += ` AND content_type = $${paramIndex++}`;
      params.push(filters.contentType);
    }
    if (filters.reporterId) {
      whereClause += ` AND reporter_id = $${paramIndex++}`;
      params.push(filters.reporterId);
    }

    const countQuery = `SELECT COUNT(*) as total FROM "${schema}".reports WHERE ${whereClause}`;
    const { rows: countRows } = await pool.query<{ total: number }>(countQuery, params);

    const query = `
      SELECT id, reporter_id, content_type, content_id, reason_code, description, status, resolved_by, resolved_at, resolution_notes, created_at, updated_at
      FROM "${schema}".reports
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    const { rows } = await pool.query<Report>(query, [...params, limit, offset]);

    return {
      reports: rows,
      total: countRows[0]?.total || 0,
    };
  },

  /**
   * Update a report
   */
  async updateReport(reportId: string, data: UpdateReportDTO): Promise<Report | null> {
    const updates: string[] = [];
    const params: unknown[] = [reportId];
    let paramIndex = 2;

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
    }
    if (data.resolvedBy !== undefined) {
      updates.push(`resolved_by = $${paramIndex++}`);
      params.push(data.resolvedBy);
    }
    if (data.resolutionNotes !== undefined) {
      updates.push(`resolution_notes = $${paramIndex++}`);
      params.push(data.resolutionNotes);
    }

    if (updates.length === 0) {
      return this.getReportById(reportId);
    }

    // Add resolved_at if status is resolved or rejected
    if (data.status === 'resolved' || data.status === 'rejected') {
      updates.push('resolved_at = CURRENT_TIMESTAMP');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const query = `
      UPDATE "${schema}".reports
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING id, reporter_id, content_type, content_id, reason_code, description, status, resolved_by, resolved_at, resolution_notes, created_at, updated_at
    `;

    const { rows } = await pool.query<Report>(query, params);
    return rows[0] || null;
  },

  /**
   * Check if user already reported this content
   */
  async hasUserReported(reporterId: string, contentType: string, contentId: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM "${schema}".reports
      WHERE reporter_id = $1 AND content_type = $2 AND content_id = $3
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [reporterId, contentType, contentId]);
    return rows.length > 0;
  },

  // =========================================================================
  // Report Reasons
  // =========================================================================

  /**
   * Get available report reasons for a content type
   */
  async getReasons(contentType: string): Promise<ReportReason[]> {
    const query = `
      SELECT id, content_type, code, label_es, label_en, severity, is_active, created_at
      FROM "${schema}".report_reasons
      WHERE content_type = $1 AND is_active = true
      ORDER BY severity DESC, code ASC
    `;
    const { rows } = await pool.query<ReportReason>(query, [contentType]);
    return rows;
  },

  /**
   * Get reason by code and content type
   */
  async getReasonByCode(contentType: string, code: string): Promise<ReportReason | null> {
    const query = `
      SELECT id, content_type, code, label_es, label_en, severity, is_active, created_at
      FROM "${schema}".report_reasons
      WHERE content_type = $1 AND code = $2
    `;
    const { rows } = await pool.query<ReportReason>(query, [contentType, code]);
    return rows[0] || null;
  },

  // =========================================================================
  // Report Actions
  // =========================================================================

  /**
   * Create a report action
   */
  async createAction(data: CreateActionDTO): Promise<ReportAction> {
    const query = `
      INSERT INTO "${schema}".report_actions (report_id, action_type, performed_by, notes)
      VALUES ($1, $2, $3, $4)
      RETURNING id, report_id, action_type, performed_by, notes, created_at
    `;
    const { rows } = await pool.query<ReportAction>(query, [
      data.reportId,
      data.actionType,
      data.performedBy,
      data.notes || null,
    ]);
    return rows[0];
  },

  /**
   * Get actions for a report
   */
  async getActionsByReport(reportId: string): Promise<ReportAction[]> {
    const query = `
      SELECT id, report_id, action_type, performed_by, notes, created_at
      FROM "${schema}".report_actions
      WHERE report_id = $1
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query<ReportAction>(query, [reportId]);
    return rows;
  },

  // =========================================================================
  // Content Policies
  // =========================================================================

  /**
   * Get all active content policies
   */
  async getPolicies(contentType?: string): Promise<ContentPolicy[]> {
    let query = `
      SELECT id, title_es, title_en, content_es, content_en, content_type, is_active, sort_order, created_at, updated_at
      FROM "${schema}".content_policies
      WHERE is_active = true
    `;
    const params: unknown[] = [];

    if (contentType) {
      query += ` AND content_type = $1`;
      params.push(contentType);
    }

    query += ` ORDER BY sort_order ASC, created_at ASC`;

    const { rows } = await pool.query<ContentPolicy>(query, params);
    return rows;
  },

  /**
   * Get policy by ID
   */
  async getPolicyById(policyId: string): Promise<ContentPolicy | null> {
    const query = `
      SELECT id, title_es, title_en, content_es, content_en, content_type, is_active, sort_order, created_at, updated_at
      FROM "${schema}".content_policies
      WHERE id = $1
    `;
    const { rows } = await pool.query<ContentPolicy>(query, [policyId]);
    return rows[0] || null;
  },
};