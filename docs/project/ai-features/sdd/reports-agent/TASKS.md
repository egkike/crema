# SDD Tasks: Reports Agent (Triage Automático)

**Change**: reports-agent
**Type**: AI Feature
**SDD Phase**: Tasks
**Status**: Draft
**Date**: Mayo 2026
**Owner**: Kike García
**Depends on**: design.md

---

## Task List

| # | Task | Priority | Depends on |
|---|------|:---------:|------------|
| 1 | Agregar tipos `TriageResult` y `ReportReasonCode` en `types/reports.types.ts` | 🔴 ALTA | - |
| 2 | Extender `reportService` con método `triageReport()` | 🔴 ALTA | 1 |
| 3 | Agregar endpoint en `admin.routes.ts` + UUID validation | 🔴 ALTA | 2 |
| 4 | Unit tests del método `triageReport()` | 🟡 MEDIA | 2 |

---

## Task Details

### Task 1: TypeScript Types

**Archivo:** `backend/src/types/reports.types.ts`

**Agregar:**
```typescript
export type ReportReasonCode =
  | 'COPYRIGHT' | 'MISLEADING' | 'INAPPROPRIATE' | 'TECHNICAL_ISSUE'
  | 'NOT_AS_DESCRIBED' | 'MALWARE' | 'FRAUD' | 'HARASSMENT' | 'SPAM'
  | 'REFUND_ABUSE' | 'FAKE_REVIEW' | 'OFFENSIVE_REVIEW' | 'COMPETITOR_REVIEW';

export interface TriageResult {
  suggestedReason: ReportReasonCode | null;  // null si fallback
  suggestedReasonLabel: string;
  severity: 1 | 2 | 3;
  isSpam: boolean;
  confidence: number;
  suggestedAction: 'warning' | 'suspend' | 'ban' | 'delete_content' | 'hide_content' | 'no_action';
  analysis: string;
}

export const REPORT_REASON_LABELS: Record<string, string> = {
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
```

**Validación:**
```bash
pnpm tsc --noEmit
# Sin errores
```

---

### Task 2: Extender reportService con triageReport()

**Archivo:** `backend/src/services/ai/denunciation.service.ts`

**Agregar método:**
```typescript
// Helper constants
const LLM_TIMEOUT_MS = 5000;
const LLM_RETRY_COUNT = 1;

// Standalone executeTriage function (reportService is object literal, NOT a class)
async function executeTriage(reportId: string, adminId: string): Promise<TriageResult> {
  // Audit: log which admin triggered the triage
  // TODO: await auditLogRepository.log(adminId, 'triage_requested', { reportId });
  // 1. Obtener report de la DB
  const report = await denunciationRepository.getReportById(reportId);
  if (!report) {
    throw new AppError('REPORT_NOT_FOUND', 404);
  }

  // 2. Obtener policies de memory (skip if description is empty)
  const policies = (report.description || '').trim().length > 0
    ? await memoryService.searchSimilar(
        null,
        report.description || '',
        3,
        ['policy']
      )
    : [];

  // 3. Construir prompt
  const { systemPrompt, context } = buildTriagePrompt(report.description || '', policies);

  // 4. Llamar LLM
  const model = config.ai.openaiModel;
  const messages = llmService.buildPrompt(systemPrompt, context, report.description || '');
  const response = await llmService.chat({ messages, model, temperature: 0.3 });

  // 5. Parsear y mapear
  const parsed = parseLLMResponse(response.content);
  if (!parsed) {
    return {
      suggestedReason: null,
      suggestedReasonLabel: 'Por clasificar',
      severity: 2,
      isSpam: false,
      confidence: 0,
      suggestedAction: 'no_action',
      analysis: 'Clasificación no disponible',
    };
  }

  const reasonCode = mapToValidReasonCode(parsed.suggestedReason);
  const severity = validateSeverity(parsed.severity);
  const suggestedAction = validateSuggestedAction(parsed.suggestedAction);

  return {
    suggestedReason: reasonCode,
    suggestedReasonLabel: reasonCode ? REPORT_REASON_LABELS[reasonCode] || reasonCode : 'Por clasificar',
    severity,
    isSpam: parsed.isSpam,
    confidence: parsed.confidence,
    suggestedAction,
    analysis: parsed.analysis,
  };
}

// Helper: detect timeout errors for retry logic
function isTimeoutError(error: Error): boolean {
  return error.name === 'TimeoutError' || error.message.includes('timeout');
}

// Public method with retry wrapper
async function triageReport(reportId: string, adminId: string): Promise<TriageResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= LLM_RETRY_COUNT; attempt++) {
    try {
      return await executeTriage(reportId, adminId);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!isTimeoutError(lastError)) {
        throw lastError; // preserve original status code (e.g. 404 REPORT_NOT_FOUND)
      }
      if (attempt === LLM_RETRY_COUNT) {
        throw new AppError('TRIAGE_FAILED', 500);
      }
      // Retry on timeout
    }
  }
}
```

**Helper methods a agregar:**
```typescript
function buildTriagePrompt(description: string, policies: EmbeddingSearchResult[]): { systemPrompt: string; context: string } {
  // Políticas van SOLO en context, no en system prompt
  const policyContext = policies.length > 0
    ? policies.map(p => `Política: ${p.metadata?.title || p.content?.substring(0, 80) ?? ''}\n${p.content}`).join('\n\n')
    : '(Sin políticas específicas encontradas)';

  // system prompt SIN {policy_context} — solo instrucciones
  const systemPrompt = REPORTS_TRIAGE_SYSTEM_PROMPT;
  return { systemPrompt, context: policyContext };
}

function parseLLMResponse(raw: string): ParsedLLMResponse | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.suggestedReason || !parsed.severity) return null;
    return parsed;
  } catch {
    return null;
  }
}

function mapToValidReasonCode(suggested: string): ReportReasonCode | null {
  if (!suggested) return null;

  const normalized = suggested.toUpperCase().trim();

  // Exact match
  if (VALID_REASON_CODES.includes(normalized as ReportReasonCode)) {
    return normalized as ReportReasonCode;
  }

  // Fuzzy match para casos comunes
  const fuzzyMap: Record<string, ReportReasonCode> = {
    'COPYRIGHT': 'COPYRIGHT',
    'INTELLECTUAL_PROPERTY': 'COPYRIGHT',
    'DMCA': 'COPYRIGHT',
    'FRAUD': 'FRAUD',
    'SCAM': 'FRAUD',
    'HARASSMENT': 'HARASSMENT',
    'BULLYING': 'HARASSMENT',
    'SPAM': 'SPAM',
    'ADVERTISING': 'SPAM',
    'MISLEADING': 'MISLEADING',
    'DECEPTIVE': 'MISLEADING',
    'INAPPROPRIATE': 'INAPPROPRIATE',
    'OFFENSIVE': 'INAPPROPRIATE',
    'TECHNICAL_ISSUE': 'TECHNICAL_ISSUE',
    'NOT_AS_DESCRIBED': 'NOT_AS_DESCRIBED',
    'MALWARE': 'MALWARE',
    'VIRUS': 'MALWARE',
    'REFUND_ABUSE': 'REFUND_ABUSE',
    'FAKE_REVIEW': 'FAKE_REVIEW',
    'OFFENSIVE_REVIEW': 'OFFENSIVE_REVIEW',
    'COMPETITOR_REVIEW': 'COMPETITOR_REVIEW',
    'COMPETITOR': 'COMPETITOR_REVIEW',
  };

  return fuzzyMap[normalized] || null;
}

function validateSeverity(severity: number): 1 | 2 | 3 {
  if (severity === 1 || severity === 2 || severity === 3) return severity;
  return 2; // fallback to medium
}

function validateSuggestedAction(action: unknown): 'warning' | 'suspend' | 'ban' | 'delete_content' | 'hide_content' | 'no_action' {
  const allowed = ['warning', 'suspend', 'ban', 'delete_content', 'hide_content', 'no_action'] as const;
  if (typeof action === 'string' && allowed.includes(action as typeof allowed[number])) {
    return action as typeof allowed[number];
  }
  return 'no_action';
}
```

**Constantes:**
```typescript
const VALID_REASON_CODES = [...] as const;
const REPORTS_TRIAGE_SYSTEM_PROMPT = `...`;
const LLM_TIMEOUT_MS = 5000;
const LLM_RETRY_COUNT = 1;
```

**Imports necesarios:**
```typescript
import { config } from '../../config';
import { llmService } from './llm.service';
import { memoryService } from './memory.service';
import type { EmbeddingSearchResult } from '../../types/ai.types';
import type { ReportReasonCode, TriageResult } from '../../types/reports.types';
import { REPORT_REASON_LABELS } from '../../types/reports.types';
```

**Validación:**
```bash
pnpm tsc --noEmit
pnpm test -- --grep "triageReport"
# Tests pasan
```

---

### Task 3: Endpoint en admin.routes.ts

**Archivo:** `backend/src/routes/admin.routes.ts`

**Agregar route:**
```typescript
// POST /api/admin/reports/:reportId/triage
// Nota: restrictTo('ADMIN') ya global en admin.routes via router.use()
// UUID validation helper (inline — isValidUUID not exported from validators.util.ts)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post(
  '/reports/:reportId/triage',
  jwtAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { reportId } = req.params;

    if (!UUID_REGEX.test(reportId)) {
      throw new AppError('INVALID_REPORT_ID', 400);
    }

    const adminId = req.user.id;
    const result = await reportService.triageReport(reportId, adminId);
    res.json(result);
  })
);
```

**Validación:**
```bash
pnpm tsc --noEmit
```

---

### Task 4: Unit Tests

**Archivo:** `backend/src/__tests__/services/ai/denunciation.service.test.ts`

**Tests a cubrir:**
```typescript
describe('reportService.triageReport', () => {
  it('should throw REPORT_NOT_FOUND if report does not exist', async () => {
    // mock: denunciationRepository.getReportById → null
    // verify: throw AppError('REPORT_NOT_FOUND', 404)
  });

  it('should return triage result with severity 3 for fraud', async () => {
    // mock: report.description = 'Estafa me cobró y no entregar...'
    // mock: memoryService.searchSimilar → []
    // mock: llmService.buildPrompt → [...]
    // mock: llmService.chat → { content: '{"suggestedReason":"FRAUD","severity":3,"isSpam":false,"confidence":0.95,"suggestedAction":"ban","analysis":"fraude detectado"}' }
    // verify: result.severity === 3
    // verify: result.suggestedReason === 'FRAUD'
  });

  it('should mark isSpam true for short generic descriptions', async () => {
    // mock: llmService.chat → { content: '{"suggestedReason":"SPAM","severity":1,"isSpam":true,"confidence":0.9,"suggestedAction":"no_action","analysis":"spam"}' }
    // verify: result.isSpam === true
  });

  it('should map fuzzy reason codes to valid ones', async () => {
    // mock: llmService.chat → { content: '{"suggestedReason":"SCAM","severity":3,...}' }
    // verify: result.suggestedReason === 'FRAUD' // mapped
  });

  it('should return fallback severity=2 on invalid LLM JSON (NOT throw)', async () => {
    // mock: llmService.chat → { content: 'invalid json' }
    // verify: result.severity === 2
    // verify: result.analysis === 'Clasificación no disponible'
  });

  it('should use memoryService.searchSimilar (not retrieve)', async () => {
    // mock: memoryService.searchSimilar → [policy]
    // verify: memoryService.searchSimilar called with ['policy'] sourceTypes
  });

  it('should pass description as userQuestion to buildPrompt', async () => {
    // verify: llmService.buildPrompt called with description as 3rd arg
  });
});
```

**Mock pattern:**
```typescript
vi.mock('../../../db/postgres', () => ({
  default: { query: vi.fn() },
}));

vi.mock('../../../services/ai/llm.service', () => ({
  llmService: { buildPrompt: vi.fn(), chat: vi.fn() },
}));

vi.mock('../../../services/ai/memory.service', () => ({
  memoryService: { searchSimilar: vi.fn() },
}));
```

**Validación:**
```bash
pnpm test -- --grep "triageReport"
# Todos pasan
```

---

## Implementation Order

```
1 → 2 → 3 → 4
```

## Verification Checklist

| Command | Expected |
|---------|----------|
| `pnpm tsc --noEmit` | Sin errores |
| `pnpm lint --filter backend` | Sin errores/warnings |
| `pnpm test -- --grep "triageReport"` | 100% passing |

---

## Definition of Done

- [ ] Task 1-4 completadas
- [ ] `pnpm tsc --noEmit` sin errores
- [ ] `pnpm lint --filter backend` sin errores/warnings
- [ ] Tests passing
- [ ] Endpoint responde correctamente (probar con curl/httpie)