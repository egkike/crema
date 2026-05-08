import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies — must be before any import of the service
vi.mock('../../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../repositories/ai/denunciation.repository', () => ({
  denominationRepository: {
    createReport: vi.fn(),
    getReports: vi.fn(),
    getReportById: vi.fn(),
    updateReport: vi.fn(),
    createAction: vi.fn(),
    getReasons: vi.fn(),
    getActionsByReport: vi.fn(),
    getPolicies: vi.fn(),
    getPolicyById: vi.fn(),
    getReasonByCode: vi.fn(),
    hasUserReported: vi.fn(),
  },
}));

vi.mock('../../../errors/AppError', () => ({
  AppError: class extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'AppError';
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('../../../config/index', () => ({
  config: {
    ai: {
      openaiModel: 'gpt-4o-mini',
    },
    db: {
      schema: 'public',
    },
  },
}));

vi.mock('../../../services/ai/llm.service', () => ({
  llmService: {
    buildPrompt: vi.fn(),
    chat: vi.fn(),
  },
}));

vi.mock('../../../services/ai/memory.service', () => ({
  memoryService: {
    searchSimilar: vi.fn(),
  },
}));

// Import mocked modules
import { denominationRepository } from '../../../repositories/ai/denunciation.repository';
import { llmService } from '../../../services/ai/llm.service';
import { memoryService } from '../../../services/ai/memory.service';
import { AppError } from '../../../errors/AppError';

// ============================================================================
// Existing tests: exports and method existence
// ============================================================================

describe('ReportService', () => {
  describe('exports', () => {
    it('should export reportService', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(reportService).toBeDefined();
    });
  });

  describe('method existence', () => {
    it('should have createReport method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.createReport).toBe('function');
    });

    it('should have getReports method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.getReports).toBe('function');
    });

    it('should have getReportById method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.getReportById).toBe('function');
    });

    it('should have resolveReport method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.resolveReport).toBe('function');
    });

    it('should have applyAction method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.applyAction).toBe('function');
    });

    it('should have getReasons method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.getReasons).toBe('function');
    });

    it('should have getActions method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.getActions).toBe('function');
    });

    it('should have getPolicies method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.getPolicies).toBe('function');
    });

    it('should have getPolicyById method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.getPolicyById).toBe('function');
    });
  });
});

// ============================================================================
// triageReport tests
// ============================================================================

describe('reportService.triageReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw REPORT_NOT_FOUND if report does not exist', async () => {
    const { reportService } = await import('../../../services/ai/denunciation.service');

    vi.mocked(denominationRepository.getReportById).mockResolvedValue(null);

    await expect(reportService.triageReport('non-existent-id', 'admin-1')).rejects.toMatchObject({
      message: 'REPORT_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('should return triage result with severity 3 for fraud', async () => {
    const { reportService } = await import('../../../services/ai/denunciation.service');

    const mockReport = {
      id: 'report-1',
      reporter_id: 'user-1',
      content_type: 'product',
      content_id: 'prod-1',
      reason_code: 'FRAUD',
      description: 'Estafa me cobró y no entregó el producto',
      status: 'pending' as const,
      resolved_by: null,
      resolved_at: null,
      resolution_notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(denominationRepository.getReportById).mockResolvedValue(mockReport);
    vi.mocked(memoryService.searchSimilar).mockResolvedValue([]);
    vi.mocked(llmService.buildPrompt).mockReturnValue([
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'user question' },
    ]);
    vi.mocked(llmService.chat).mockResolvedValue({
      content: '{"suggestedReason":"FRAUD","severity":3,"isSpam":false,"confidence":0.95,"suggestedAction":"ban","analysis":"fraude detectado"}',
      model: 'gpt-4o-mini',
    });

    const result = await reportService.triageReport('report-1', 'admin-1');

    expect(result.severity).toBe(3);
    expect(result.suggestedReason).toBe('FRAUD');
    expect(result.isSpam).toBe(false);
    expect(result.confidence).toBe(0.95);
    expect(result.suggestedAction).toBe('ban');
    expect(result.analysis).toBe('fraude detectado');
  });

  it('should mark isSpam true for short generic descriptions', async () => {
    const { reportService } = await import('../../../services/ai/denunciation.service');

    const mockReport = {
      id: 'report-2',
      reporter_id: 'user-2',
      content_type: 'review',
      content_id: 'rev-1',
      reason_code: 'SPAM',
      description: 'spam',
      status: 'pending' as const,
      resolved_by: null,
      resolved_at: null,
      resolution_notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(denominationRepository.getReportById).mockResolvedValue(mockReport);
    vi.mocked(memoryService.searchSimilar).mockResolvedValue([]);
    vi.mocked(llmService.buildPrompt).mockReturnValue([
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'spam' },
    ]);
    vi.mocked(llmService.chat).mockResolvedValue({
      content: '{"suggestedReason":"SPAM","severity":1,"isSpam":true,"confidence":0.9,"suggestedAction":"no_action","analysis":"spam"}',
      model: 'gpt-4o-mini',
    });

    const result = await reportService.triageReport('report-2', 'admin-1');

    expect(result.isSpam).toBe(true);
    expect(result.suggestedReason).toBe('SPAM');
    expect(result.severity).toBe(1);
  });

  it('should map fuzzy reason codes to valid ones', async () => {
    const { reportService } = await import('../../../services/ai/denunciation.service');

    const mockReport = {
      id: 'report-3',
      reporter_id: 'user-3',
      content_type: 'product',
      content_id: 'prod-2',
      reason_code: 'FRAUD',
      description: 'Me estafaron con este producto',
      status: 'pending' as const,
      resolved_by: null,
      resolved_at: null,
      resolution_notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(denominationRepository.getReportById).mockResolvedValue(mockReport);
    vi.mocked(memoryService.searchSimilar).mockResolvedValue([]);
    vi.mocked(llmService.buildPrompt).mockReturnValue([
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'user question' },
    ]);
    vi.mocked(llmService.chat).mockResolvedValue({
      content: '{"suggestedReason":"SCAM","severity":3,"isSpam":false,"confidence":0.9,"suggestedAction":"ban","analysis":"scam detected"}',
      model: 'gpt-4o-mini',
    });

    const result = await reportService.triageReport('report-3', 'admin-1');

    // SCAM should be mapped to FRAUD
    expect(result.suggestedReason).toBe('FRAUD');
    expect(result.severity).toBe(3);
  });

  it('should return fallback severity=2 on invalid LLM JSON (NOT throw)', async () => {
    const { reportService } = await import('../../../services/ai/denunciation.service');

    const mockReport = {
      id: 'report-4',
      reporter_id: 'user-4',
      content_type: 'product',
      content_id: 'prod-3',
      reason_code: 'MISLEADING',
      description: 'Producto engañoso',
      status: 'pending' as const,
      resolved_by: null,
      resolved_at: null,
      resolution_notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(denominationRepository.getReportById).mockResolvedValue(mockReport);
    vi.mocked(memoryService.searchSimilar).mockResolvedValue([]);
    vi.mocked(llmService.buildPrompt).mockReturnValue([
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'user question' },
    ]);
    vi.mocked(llmService.chat).mockResolvedValue({
      content: 'invalid json',
      model: 'gpt-4o-mini',
    });

    const result = await reportService.triageReport('report-4', 'admin-1');

    expect(result.severity).toBe(2);
    expect(result.analysis).toBe('Clasificación no disponible');
    expect(result.suggestedReason).toBe(null);
    expect(result.suggestedAction).toBe('no_action');
  });

  it('should use memoryService.searchSimilar (not retrieve) with policy sourceTypes', async () => {
    const { reportService } = await import('../../../services/ai/denunciation.service');

    const mockReport = {
      id: 'report-5',
      reporter_id: 'user-5',
      content_type: 'product',
      content_id: 'prod-4',
      reason_code: 'COPYRIGHT',
      description: 'Contenido con derechos de autor',
      status: 'pending' as const,
      resolved_by: null,
      resolved_at: null,
      resolution_notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const mockPolicies = [
      {
        id: 'policy-1',
        source_type: 'policy' as const,
        source_id: 'policy-1',
        content: 'Política de copyright',
        metadata: { title: 'Copyright Policy' },
        similarity: 0.85,
      },
    ];

    vi.mocked(denominationRepository.getReportById).mockResolvedValue(mockReport);
    vi.mocked(memoryService.searchSimilar).mockResolvedValue(mockPolicies);
    vi.mocked(llmService.buildPrompt).mockReturnValue([
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'user question' },
    ]);
    vi.mocked(llmService.chat).mockResolvedValue({
      content: '{"suggestedReason":"COPYRIGHT","severity":2,"isSpam":false,"confidence":0.8,"suggestedAction":"hide_content","analysis":"copyright violation"}',
      model: 'gpt-4o-mini',
    });

    await reportService.triageReport('report-5', 'admin-1');

    expect(memoryService.searchSimilar).toHaveBeenCalledWith(
      null,
      'Contenido con derechos de autor',
      3,
      ['policy'],
    );
  });

  it('should pass description as userQuestion to buildPrompt', async () => {
    const { reportService } = await import('../../../services/ai/denunciation.service');

    const mockReport = {
      id: 'report-6',
      reporter_id: 'user-6',
      content_type: 'product',
      content_id: 'prod-5',
      reason_code: 'FRAUD',
      description: 'Este producto es una estafa total',
      status: 'pending' as const,
      resolved_by: null,
      resolved_at: null,
      resolution_notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(denominationRepository.getReportById).mockResolvedValue(mockReport);
    vi.mocked(memoryService.searchSimilar).mockResolvedValue([]);
    vi.mocked(llmService.buildPrompt).mockReturnValue([
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'user question' },
    ]);
    vi.mocked(llmService.chat).mockResolvedValue({
      content: '{"suggestedReason":"FRAUD","severity":3,"isSpam":false,"confidence":0.9,"suggestedAction":"ban","analysis":"fraud"}',
      model: 'gpt-4o-mini',
    });

    await reportService.triageReport('report-6', 'admin-1');

    // buildPrompt is called with (systemPrompt, context, description)
    // The 3rd argument should be the report description
    expect(llmService.buildPrompt).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'Este producto es una estafa total',
    );
  });

  it('should timeout and retry on LLM timeout', async () => {
    const { reportService } = await import('../../../services/ai/denunciation.service');

    const mockReport = {
      id: 'report-7',
      reporter_id: 'user-7',
      content_type: 'product',
      content_id: 'prod-6',
      reason_code: 'FRAUD',
      description: 'Fraude detectado en la plataforma',
      status: 'pending' as const,
      resolved_by: null,
      resolved_at: null,
      resolution_notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(denominationRepository.getReportById).mockResolvedValue(mockReport);
    vi.mocked(memoryService.searchSimilar).mockResolvedValue([]);
    vi.mocked(llmService.buildPrompt).mockReturnValue([
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'user question' },
    ]);

    // First call: timeout, second call: success
    const timeoutError = new Error('Request timeout');
    timeoutError.name = 'TimeoutError';

    vi.mocked(llmService.chat)
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce({
        content: '{"suggestedReason":"FRAUD","severity":3,"isSpam":false,"confidence":0.95,"suggestedAction":"ban","analysis":"fraude tras retry"}',
        model: 'gpt-4o-mini',
      });

    const result = await reportService.triageReport('report-7', 'admin-1');

    // chat should have been called twice (initial + retry)
    expect(llmService.chat).toHaveBeenCalledTimes(2);
    expect(result.severity).toBe(3);
    expect(result.suggestedReason).toBe('FRAUD');
    expect(result.analysis).toBe('fraude tras retry');
  });

  it('should re-throw non-timeout errors (preserve 404)', async () => {
    const { reportService } = await import('../../../services/ai/denunciation.service');

    // Simulate getReportById throwing an AppError with 404
    const notFoundError = new AppError('REPORT_NOT_FOUND', 404);
    vi.mocked(denominationRepository.getReportById).mockRejectedValue(notFoundError);

    await expect(reportService.triageReport('report-8', 'admin-1')).rejects.toMatchObject({
      message: 'REPORT_NOT_FOUND',
      statusCode: 404,
    });

    // LLM should never be called since error happens before
    expect(llmService.chat).not.toHaveBeenCalled();
  });

  it('should throw TRIAGE_FAILED after both retries timeout', async () => {
    const { reportService } = await import('../../../services/ai/denunciation.service');

    const mockReport = {
      id: 'report-9',
      reporter_id: 'user-9',
      content_type: 'product',
      content_id: 'prod-7',
      reason_code: 'FRAUD',
      description: 'Fraude persistente',
      status: 'pending' as const,
      resolved_by: null,
      resolved_at: null,
      resolution_notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(denominationRepository.getReportById).mockResolvedValue(mockReport);
    vi.mocked(memoryService.searchSimilar).mockResolvedValue([]);
    vi.mocked(llmService.buildPrompt).mockReturnValue([
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'user question' },
    ]);

    const timeoutError = new Error('Request timeout');
    timeoutError.name = 'TimeoutError';

    vi.mocked(llmService.chat)
      .mockRejectedValueOnce(timeoutError)
      .mockRejectedValueOnce(timeoutError);

    await expect(reportService.triageReport('report-9', 'admin-1')).rejects.toMatchObject({
      message: 'TRIAGE_FAILED',
      statusCode: 500,
    });
  });

  it('should reject description > 2000 characters with 400', async () => {
    const { reportService } = await import('../../../services/ai/denunciation.service');

    const mockReport = {
      id: 'report-10',
      reporter_id: 'user-10',
      content_type: 'product',
      content_id: 'prod-8',
      reason_code: 'FRAUD',
      description: 'x'.repeat(2001),
      status: 'pending' as const,
      resolved_by: null,
      resolved_at: null,
      resolution_notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(denominationRepository.getReportById).mockResolvedValue(mockReport);

    await expect(reportService.triageReport('report-10', 'admin-1')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('should reject description with delimiter strings with 400', async () => {
    const { reportService } = await import('../../../services/ai/denunciation.service');

    const mockReport = {
      id: 'report-11',
      reporter_id: 'user-11',
      content_type: 'product',
      content_id: 'prod-9',
      reason_code: 'FRAUD',
      description: '[USER_INPUT_START] malicious injection attempt',
      status: 'pending' as const,
      resolved_by: null,
      resolved_at: null,
      resolution_notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(denominationRepository.getReportById).mockResolvedValue(mockReport);

    await expect(reportService.triageReport('report-11', 'admin-1')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('should skip memory search when description is empty', async () => {
    const { reportService } = await import('../../../services/ai/denunciation.service');

    const mockReport = {
      id: 'report-12',
      reporter_id: 'user-12',
      content_type: 'product',
      content_id: 'prod-10',
      reason_code: 'FRAUD',
      description: '',
      status: 'pending' as const,
      resolved_by: null,
      resolved_at: null,
      resolution_notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(denominationRepository.getReportById).mockResolvedValue(mockReport);
    vi.mocked(llmService.buildPrompt).mockReturnValue([
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: '' },
    ]);
    vi.mocked(llmService.chat).mockResolvedValue({
      content: '{"suggestedReason":"FRAUD","severity":3,"isSpam":false,"confidence":0.9,"suggestedAction":"ban","analysis":"empty description triage"}',
      model: 'gpt-4o-mini',
    });

    await reportService.triageReport('report-12', 'admin-1');

    expect(memoryService.searchSimilar).not.toHaveBeenCalled();
  });
});
