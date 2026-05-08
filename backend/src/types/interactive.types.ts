/**
 * Interactive Agent type definitions.
 * Used for module field configuration, user module data, and analysis results.
 */

export interface FieldConfig {
  moduleKey: string;
  fieldName: string;
  fieldType: 'number' | 'string' | 'boolean' | 'select';
  fieldLabel: string;
  fieldPlaceholder?: string;
  fieldOptions?: Array<{ value: string; label: string }>;
  fieldRequired?: boolean;
  fieldValidation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  orderIndex?: number;
}

export interface ModuleFieldConfig {
  moduleKey: string;
  fields: FieldConfig[];
}

export interface UserModuleData {
  moduleKey: string;
  inputData: Record<string, unknown>;
  outputAnalysis?: Record<string, unknown>;
  completedAt?: string;
  updatedAt: string;
}

export interface AnalysisResult {
  analysis: string;
  recommendations: string[];
  nextSteps: string[];
  metrics: Record<string, unknown>;
  creditsUsed: number;
}

export interface AnalyticsResult {
  totalUsers: number;
  completedModules: number;
  averageCompletion: number;
  fieldStats: Array<{
    fieldName: string;
    moduleKey: string;
    average: number | null;
    responses: number;
  }>;
  // recentActivity: not implemented — removed until feature is added
}
