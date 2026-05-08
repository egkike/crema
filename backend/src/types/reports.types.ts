/**
 * Reports Agent Type Definitions
 * Automated triage for denunciations/reports.
 */

// ============================================
// Report Reason Codes
// ============================================

export type ReportReasonCode =
  | 'COPYRIGHT'
  | 'MISLEADING'
  | 'INAPPROPRIATE'
  | 'TECHNICAL_ISSUE'
  | 'NOT_AS_DESCRIBED'
  | 'MALWARE'
  | 'FRAUD'
  | 'HARASSMENT'
  | 'SPAM'
  | 'REFUND_ABUSE'
  | 'FAKE_REVIEW'
  | 'OFFENSIVE_REVIEW'
  | 'COMPETITOR_REVIEW';

// ============================================
// Triage Result
// ============================================

export type TriageSeverity = 1 | 2 | 3;

export type TriageAction =
  | 'warning'
  | 'suspend'
  | 'ban'
  | 'delete_content'
  | 'hide_content'
  | 'no_action';

export interface TriageResult {
  suggestedReason: ReportReasonCode | null;
  suggestedReasonLabel: string;
  severity: TriageSeverity;
  isSpam: boolean;
  confidence: number;
  suggestedAction: TriageAction;
  analysis: string;
}

// ============================================
// Reason Code Labels (human-readable)
// ============================================

export const REPORT_REASON_LABELS: Record<ReportReasonCode, string> = {
  COPYRIGHT: 'Contenido con derechos de autor',
  MISLEADING: 'Información engañosa',
  INAPPROPRIATE: 'Contenido inapropiado',
  TECHNICAL_ISSUE: 'Problema técnico',
  NOT_AS_DESCRIBED: 'No corresponde con la descripción',
  MALWARE: 'Software malicioso',
  FRAUD: 'Fraude',
  HARASSMENT: 'Acoso',
  SPAM: 'Spam',
  REFUND_ABUSE: 'Abuso de reembolso',
  FAKE_REVIEW: 'Reseña falsa',
  OFFENSIVE_REVIEW: 'Reseña ofensiva',
  COMPETITOR_REVIEW: 'Reseña de competidor',
};
