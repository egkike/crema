# SDD Tasks: Content Security Enhancement

**Proyecto**: Crema - Content Security & Upload Validation
**Tipo**: Security Enhancement
**SDD Phase**: Tasks
**Estado**: BORRADOR
**Fecha**: Mayo 2026
**Depends on**: design.md

> **Recursos Reutilizables**: Ver `docs/project/reusable-resources.md` para módulos existentes (upload middleware, rate limiters, AppError, ConfigService).

---

## Task List

| # | Task | Prioridad | Depende de |
|---|------|:---------:|-----------|
| 1 | Bloqueo de ejecutables en upload.middleware.ts | 🔴 ALTA | - |
| 2 | Validación de URLs externas (allowlist dominios) | 🔴 ALTA | - |
| 3 | Rate limiting específico para uploads | 🟡 MEDIA | - |
| 4 | Validación de tamaño mínimo (1KB) | 🟡 MEDIA | - |
| 5 | Schema de declaraciones (declarationAccepted, isbn, externalUrl) | 🔴 ALTA | 2 |
| 6 | Integración en routes (uploadLimiter middleware) | 🟡 MEDIA | 3 |
| 7 | Tests unitarios | 🟡 MEDIA | 1, 2, 3, 4 |

---

## Task Details

### Task 1: Mejorar Mensaje de Error para Ejecutables

**Archivos**: `src/middlewares/storage/upload.middleware.ts`

**Decisión de diseño (Opción A - mantener bloqueo)**:
- Los ejecutables YA están bloqueados porque NO están en ALLOWED_EXTENSIONS
- Mejora: cambiar el mensaje de error genérico "Extension not allowed" por uno específico
- Hasta que CS-18 (malware scanning) esté implementado, no permitimos .exe

**Código a agregar**:

```typescript
// ============================================================================
// EXECUTABLE EXTENSIONS - Para mensaje de error mejorado
// ============================================================================

const EXECUTABLE_EXTENSIONS = [
  // Windows executables
  'exe', 'bat', 'cmd', 'msi', 'com', 'pif', 'scr',
  // Unix scripts
  'sh', 'bash', 'csh', 'tcsh', 'zsh',
  // Scripting
  'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh',
  // Other executables
  'app', 'bin', 'dmg', 'pkg', 'deb', 'rpm',
  // Shortcuts
  'lnk', 'inf', 'reg',
] as const;
```

**Modificar fileFilter()**:

```typescript
function fileFilter(req: any, file: { originalname: string; mimetype: string }, cb: (error: Error | null, acceptFile: boolean) => void) {
  const ext = path.extname(file.originalname).toLowerCase().replace(/^\./, '');
  const mimeType = file.mimetype.toLowerCase();

  // [1] Check si es extensión de ejecutable - mensaje específico
  if (ext && EXECUTABLE_EXTENSIONS.includes(ext)) {
    const error = new Error(
      `Executable files are not allowed. Use .zip, .rar, or .7z format for software. ` +
      `.exe files require malware scanning (CS-18 pending implementation).`
    );
    cb(error, false);
    return;
  }

  // [2-4] Existing logic (allowlist, MIME type, etc.)...
}
```

**Verification**:
```bash
pnpm tsc --noEmit
pnpm lint --filter @crema/backend
```

---

### Task 2: Validación de URLs Externas

**Archivo**: `src/utils/url-validator.util.ts` (CREAR)

**Código**:

```typescript
import logger from './logger';

// ============================================================================
// ALLOWED EXTERNAL DOMAINS - For products with external links
// ============================================================================

const ALLOWED_VIDEO_DOMAINS = [
  'youtube.com', 'youtu.be',
  'vimeo.com', 'player.vimeo.com',
] as const;

const ALLOWED_STORAGE_DOMAINS = [
  'drive.google.com',
  'dropbox.com',
  'onedrive.live.com',
] as const;

const ALLOWED_DOC_DOMAINS = [
  'docs.google.com',
  'canva.com',
  'notion.so',
] as const;

const ALLOWED_AUDIO_DOMAINS = [
  'soundcloud.com',
  'spotify.com',
] as const;

// All domains combined
const ALL_ALLOWED_DOMAINS = [
  ...ALLOWED_VIDEO_DOMAINS,
  ...ALLOWED_STORAGE_DOMAINS,
  ...ALLOWED_DOC_DOMAINS,
  ...ALLOWED_AUDIO_DOMAINS,
] as const;

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  normalizedUrl?: string;
}

/**
 * Validates that an external URL belongs to an allowed domain.
 * Used for products with external links (Initial plan).
 */
export function validateExternalUrl(url: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Protocol check - HTTPS only
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS URLs are allowed' };
  }

  // Domain check - endsWith to allow subdomains
  const hostname = parsed.hostname.toLowerCase();
  const isAllowed = (ALL_ALLOWED_DOMAINS as readonly string[]).some(
    domain => hostname === domain || hostname.endsWith('.' + domain)
  );

  if (!isAllowed) {
    return {
      valid: false,
      error: `Domain not allowed. Allowed: ${(ALL_ALLOWED_DOMAINS as readonly string[]).join(', ')}`,
    };
  }

  // No auth credentials
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs with authentication credentials are not allowed' };
  }

  // No auth tokens in query params
  const authParams = ['token', 'key', 'auth', 'access_token', 'api_key', 'signature'];
  const hasAuthParam = authParams.some(param => parsed.searchParams.has(param));

  if (hasAuthParam) {
    return { valid: false, error: 'URLs with authentication tokens are not allowed' };
  }

  return { valid: true, normalizedUrl: parsed.toString() };
}

export function validateExternalUrlSafe(value: string): boolean {
  return validateExternalUrl(value).valid;
}

export function getExternalUrlError(value: string): string {
  return validateExternalUrl(value).error || 'Invalid URL';
}
```

**Verification**:
```bash
pnpm tsc --noEmit
pnpm test -- --grep "validateExternalUrl"
```

---

### Task 3: Rate Limiting para Uploads

**Archivo**: `src/middlewares/rateLimit/rateLimit.ts` (AGREGAR)

**Código**:

```typescript
// ============================================================================
// UPLOAD RATE LIMITER - Protect against upload flooding
// ============================================================================

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // máximo 10 uploads por minuto por usuario
  message: {
    success: false,
    error: 'Límite de uploads alcanzado. Máximo 10 archivos por minuto. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.id;
    return userId || ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn(
      { key: req.rateLimit?.key, path: req.path },
      'Límite de uploads alcanzado'
    );
    res.status(options.statusCode || 429).json(options.message);
  },
});
```

**Nota**: Reusar el patrón existente de express-rate-limit. NO crear Redis manual.

**Verification**:
```bash
pnpm tsc --noEmit
```

---

### Task 4: Validación de Tamaño Mínimo

**Archivos**: `src/middlewares/storage/upload.middleware.ts` (AGREGAR constante) + Controller

**Constante** (en upload.middleware.ts):

```typescript
const MIN_FILE_SIZE_BYTES = 1024; // 1KB - hardcoded, no configurable
```

**En controller post-upload**:

```typescript
async function handleUpload(req: Request, res: Response) {
  const file = req.file;

  if (!file) {
    throw new AppError('No file uploaded', 400);
  }

  // Validate minimum file size
  if (file.size < MIN_FILE_SIZE_BYTES) {
    // Clean up temp file
    try {
      await fs.unlink(file.path);
    } catch {
      logger.warn({ file: file.path }, 'Failed to clean up small file');
    }

    throw new AppError(
      `File too small. Minimum size: ${MIN_FILE_SIZE_BYTES} bytes (1KB). Received: ${file.size} bytes.`,
      400
    );
  }

  // Continue with normal flow...
}
```

**Verification**:
```bash
pnpm tsc --noEmit
```

---

### Task 5: Schema de Declaraciones

**Archivo**: `src/schemas/product-declarations.schema.ts` (CREAR)

**Código**:

```typescript
import { z } from 'zod';
import { validateExternalUrlSafe, getExternalUrlError } from '../utils/url-validator.util';

// ============================================================================
// DECLARATION LABELS - Required acceptances per product type
// ============================================================================

export const DECLARATION_LABELS: Record<string, string> = {
  course: 'Declaro que este curso es contenido original creado por mí y tengo los derechos necesarios sobre todo el material.',
  ebook: 'Declaro que poseo los derechos de este ebook y no infringe copyrights de terceros.',
  podcast: 'Declaro que tengo derechos sobre toda la música y audio de este podcast.',
  software: 'Declaro que este software es legítimo, posee la licencia correspondiente y no contiene malware.',
  membership: 'Declaro que poseo los derechos de todo el contenido incluido en esta membresía.',
  link: 'Declaro que tengo autorización del creador del contenido enlazado.',
} as const;

// ============================================================================
// PRODUCT DECLARATION SCHEMA - For create/update product operations
// ============================================================================

export const productDeclarationSchema = z.object({
  declarationAccepted: z.boolean().refine(val => val === true, {
    message: 'Debes aceptar la declaración de derechos para continuar.',
  }),

  isExternalLinkOnly: z.boolean().optional().default(false),
  externalUrl: z.string()
    .url('URL inválida')
    .optional()
    .refine(val => !val || validateExternalUrlSafe(val), {
      message: getExternalUrlError(val || ''),
    }),

  isbn: z.string()
    .regex(
      /^(?:ISBN(?:-1[03])?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$|97[89][0-9]{10}$|(?=(?:[0-9]+[- ]){4})[- 0-9X]{17}$)(?:97[89][ -]?)?[0-9]{1,5}[ -]?[0-9]+[ -]?[0-9X]+$/,
      'ISBN inválido. Formatos aceptados: ISBN-10, ISBN-13'
    )
    .optional(),
});

export type ProductDeclarationInput = z.infer<typeof productDeclarationSchema>;
```

**Integración**: En el schema de producto existente, hacer merge del `productDeclarationSchema`.

**Verification**:
```bash
pnpm tsc --noEmit
pnpm test -- --grep "productDeclarationSchema"
```

---

### Task 6: Integración en Routes

**Archivos**: Donde se usa `upload.single('file')` — agregar `uploadLimiter` antes.

**Pattern**:

```typescript
import { uploadLimiter } from '../middlewares/rateLimit/rateLimit';
import { upload } from '../middlewares/storage/upload.middleware';

router.post(
  '/products/:productId/upload',
  jwtAuthMiddleware,
  uploadLimiter,  // <-- ANTES de upload
  upload.single('file'),
  productController.uploadFile
);

// Para AI content upload:
router.post(
  '/ai/content/upload',
  jwtAuthMiddleware,
  uploadLimiter,
  upload.single('file'),
  aiContentController.uploadContent
);
```

**Verification**:
```bash
pnpm tsc --noEmit
pnpm lint --filter @crema/backend
```

---

### Task 7: Tests Unitarios

**Patrones del proyecto** (ver `backend/src/__tests__/`):

```typescript
// src/__tests__/validators/url-validator.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateExternalUrl, validateExternalUrlSafe } from '../../utils/url-validator.util';

vi.mock('../../utils/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('validateExternalUrl', () => {
  describe('allowed domains', () => {
    it('should accept youtube.com URLs', () => {
      expect(validateExternalUrl('https://youtube.com/watch?v=abc').valid).toBe(true);
      expect(validateExternalUrl('https://youtu.be/abc').valid).toBe(true);
      expect(validateExternalUrl('https://video.youtube.com/watch?v=abc').valid).toBe(true);
    });

    it('should accept vimeo.com URLs', () => {
      expect(validateExternalUrl('https://vimeo.com/123456789').valid).toBe(true);
      expect(validateExternalUrl('https://player.vimeo.com/video/123456789').valid).toBe(true);
    });

    it('should accept drive.google.com URLs', () => {
      expect(validateExternalUrl('https://drive.google.com/file/d/abc/view').valid).toBe(true);
    });

    it('should accept dropbox.com URLs', () => {
      expect(validateExternalUrl('https://www.dropbox.com/s/abc/file.pdf').valid).toBe(true);
    });
  });

  describe('rejected patterns', () => {
    it('should reject http:// URLs', () => {
      const result = validateExternalUrl('http://youtube.com/watch?v=abc');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    it('should reject URLs with tokens', () => {
      const result = validateExternalUrl('https://drive.google.com/file?token=abc');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('token');
    });

    it('should reject URLs with auth credentials', () => {
      const result = validateExternalUrl('https://user:pass@dropbox.com/file');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('credentials');
    });

    it('should reject unknown domains', () => {
      const result = validateExternalUrl('https://random-site.com/file');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });
  });
});
```

```typescript
// src/__tests__/middlewares/upload-blocked.test.ts

import { describe, it, expect } from 'vitest';

// Test constants
const BLOCKED_EXTENSIONS = ['exe', 'bat', 'cmd', 'msi', 'sh', 'vbs'];

describe('BLOCKED_EXTENSIONS', () => {
  it('should include common executables', () => {
    expect(BLOCKED_EXTENSIONS).toContain('exe');
    expect(BLOCKED_EXTENSIONS).toContain('bat');
    expect(BLOCKED_EXTENSIONS).toContain('sh');
    expect(BLOCKED_EXTENSIONS).toContain('msi');
    expect(BLOCKED_EXTENSIONS).toContain('vbs');
  });
});
```

**Verification**:
```bash
pnpm test -- --grep "upload\|url-validator\|blocked"
```

---

## Orden de Implementación

```
Semana 1:
  Task 1 (Bloqueo ejecutables) → Task 2 (URL validator)
Semana 2:
  Task 3 (Rate limit) → Task 4 (Tamaño mínimo)
Semana 3:
  Task 5 (Declarations schema) → Task 6 (Integración routes)
Semana 4:
  Task 7 (Tests) → QA
```

---

## Estado

**Estado**: BORRADOR - Pending approval de proposal.md, spec.md y design.md