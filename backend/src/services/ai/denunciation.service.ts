/**
 * Report Service
 * Phase 4: Denunciations
 * Manages reports, reasons, actions, and policies
 */

import { denominationRepository, type Report, type ReportReason, type ReportAction, type ContentPolicy } from '../../repositories/ai/denunciation.repository';
import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';

export const reportService = {
  // =========================================================================
  // Reports
  // =========================================================================

  /**
   * Create a new report
   */
  async createReport(
    reporterId: string,
    contentType: string,
    contentId: string,
    reasonCode: string,
    description?: string
  ): Promise<Report> {
    // Validate content type
    const validContentTypes = ['product', 'review', 'question', 'answer', 'faq', 'user'];
    if (!validContentTypes.includes(contentType)) {
      throw new AppError('Tipo de contenido inválido', 400);
    }

    // Check if reason is valid
    const reason = await denominationRepository.getReasonByCode(contentType, reasonCode);
    if (!reason) {
      throw new AppError('Código de razón inválido', 400);
    }

    // Check if user already reported this content
    const alreadyReported = await denominationRepository.hasUserReported(reporterId, contentType, contentId);
    if (alreadyReported) {
      throw new AppError('Ya has reportado este contenido', 400);
    }

    // Build report data - only include optional fields if provided
    const reportData: { reporterId: string; contentType: string; contentId: string; reasonCode: string } & ({ description: string } | {}) = {
      reporterId,
      contentType,
      contentId,
      reasonCode,
    };
    
    if (description) {
      Object.assign(reportData, { description });
    }

    const result = await denominationRepository.createReport(reportData);

    logger.info({ reporterId, contentType, contentId, reasonCode }, 'Report created');
    return result;
  },

  /**
   * Get reports (admin)
   */
  async getReports(
    filters: { status?: string; contentType?: string; reporterId?: string },
    limit: number = 20,
    offset: number = 0
  ): Promise<{ reports: Report[]; total: number }> {
    return denominationRepository.getReports(filters, limit, offset);
  },

  /**
   * Get a single report by ID
   */
  async getReportById(reportId: string): Promise<Report | null> {
    return denominationRepository.getReportById(reportId);
  },

  /**
   * Update report status (admin)
   */
  async resolveReport(
    reportId: string,
    status: 'pending' | 'investigating' | 'resolved' | 'rejected',
    resolvedBy: string,
    resolutionNotes?: string
  ): Promise<Report> {
    const report = await denominationRepository.getReportById(reportId);
    if (!report) {
      throw new AppError('Report no encontrado', 404);
    }

    const result = await denominationRepository.updateReport(reportId, {
      status,
      resolvedBy,
      ...(resolutionNotes && { resolutionNotes }),
    });

    if (!result) {
      throw new AppError('Error al actualizar el report', 500);
    }

    logger.info({ reportId, status, resolvedBy }, 'Report resolved');
    return result;
  },

  /**
   * Apply action to a report (admin)
   */
  async applyAction(
    reportId: string,
    actionType: 'warning' | 'suspend' | 'ban' | 'delete_content' | 'hide_content' | 'no_action',
    performedBy: string,
    notes?: string
  ): Promise<ReportAction> {
    const report = await denominationRepository.getReportById(reportId);
    if (!report) {
      throw new AppError('Report no encontrado', 404);
    }

    // Create the action
    const actionData: { reportId: string; actionType: 'warning' | 'suspend' | 'ban' | 'delete_content' | 'hide_content' | 'no_action'; performedBy: string } & ({ notes: string } | {}) = {
      reportId,
      actionType,
      performedBy,
    };
    
    if (notes) {
      Object.assign(actionData, { notes });
    }

    const action = await denominationRepository.createAction(actionData);

    // If critical action (ban, delete_content), mark report as resolved
    if (actionType === 'ban' || actionType === 'delete_content') {
      await denominationRepository.updateReport(reportId, {
        status: 'resolved',
        resolvedBy: performedBy,
        resolutionNotes: `Action taken: ${actionType}`,
      });
    }

    logger.info({ reportId, actionType, performedBy }, 'Report action applied');
    return action;
  },

  // =========================================================================
  // Report Reasons
  // =========================================================================

  /**
   * Get available reasons for a content type
   */
  async getReasons(contentType: string): Promise<ReportReason[]> {
    const validContentTypes = ['product', 'review', 'question', 'answer', 'faq', 'user'];
    if (!validContentTypes.includes(contentType)) {
      throw new AppError('Tipo de contenido inválido', 400);
    }

    return denominationRepository.getReasons(contentType);
  },

  // =========================================================================
  // Report Actions
  // =========================================================================

  /**
   * Get actions for a report
   */
  async getActions(reportId: string): Promise<ReportAction[]> {
    return denominationRepository.getActionsByReport(reportId);
  },

  // =========================================================================
  // Content Policies
  // =========================================================================

  /**
   * Get content policies (public)
   */
  async getPolicies(contentType?: string): Promise<ContentPolicy[]> {
    return denominationRepository.getPolicies(contentType);
  },

  /**
   * Get a single policy by ID
   */
  async getPolicyById(policyId: string): Promise<ContentPolicy | null> {
    return denominationRepository.getPolicyById(policyId);
  },
};