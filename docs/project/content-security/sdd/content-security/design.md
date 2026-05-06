# SDD Design: Content Security Enhancement

**Proyecto**: Crema - Content Security & Upload Validation
**Tipo**: Security Enhancement
**SDD Phase**: Design
**Estado**: BORRADOR
**Fecha**: Mayo 2026
**Depends on**: spec.md

> **Estandar de Verificación**: Ver `docs/project/common/verification-standard.md`
>
> **Recursos Reutilizables**: Ver `docs/project/reusable-resources.md` para módulos existentes (upload middleware, rate limiters, AppError, ConfigService).

---

## 1. Resumen del Diseño

Implementar controles de seguridad para uploads de contenido:

- Bloqueo explícito de archivos ejecutables en upload middleware
- Allowlist de dominios para URLs externas con validación robusta
- Rate limiting específico para uploads (reusando patrón existente)
- Validación de tamaño mínimo de archivos

**Arquitectura general**: Validaciones sincrónicas en middleware (fast-fail), jobs asíncronos (malware scan, AI moderation) via BullMQ.

---

## 2. Análisis del Código Existente

### 2.1 Infraestructura de Rate Limiting Disponible

El proyecto YA tiene un sistema de rate limiting robusto en `src/middlewares/rateLimit/rateLimit.ts`:

```typescript
// Patrón existente - usar este en lugar de Redis manual
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // máximo 30 peticiones por minuto por usuario
  message: { success: false, error: 'Límite de peticiones de AI alcanzado...' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.id;
    return userId || ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de AI alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});
```

**NO crear rate limiter nuevo con Redis manual** — usar el patrón existente de `express-rate-limit`.

### 2.2 Upload Middleware Existente

Ubicación: `src/middlewares/storage/upload.middleware.ts`

```typescript
// Estructura actual - agregar validación de bloqueados aquí
const ALLOWED_EXTENSIONS = [...]; // 28 extensiones
const ALLOWED_MIME_TYPES = [...]; // 30 MIME types

function sanitizeFilename(filename: string): string { ... }
function getSafeExtension(filename: string): string | null { ... }
function isAllowedMimeType(mimeType: string): boolean { ... }

export const upload = multer({
  storage,
  fileFilter: (req: any, file: any, cb: any) => fileFilter(req, file, cb),
  limits: {
    fileSize: config?.storage?.maxGlobalSizeBytes || 100 * 1024 * 1024,
    files: 10,
  },
});
```

### 2.3 Schema de Productos

Ubicación: `src/schemas/products.schema.ts` — crear nuevo archivo `src/schemas/product-declarations.schema.ts`

---

## 3. Arquitectura

### 3.1 Flujo de Validación de Uploads

```
[Upload Request]
       │
       ▼
┌──────────────────────────────┐
│ upload.middleware.ts         │
│ (multer + fileFilter)        │
└──────────────────────────────┘
       │
       ├─ [1] Check: blocked extensions (.exe, .bat, .sh, .msi...)
       │
       ├─ [2] Check: allowlist extensions (.pdf, .mp4, .zip...)
       │
       ├─ [3] Check: MIME type validation
       │
       ├─ [4] Check: filename sanitization (path traversal prevention)
       │
       ├─ [5] Check: file size (max configurable via config.storage)
       │
       ▼
[Si pasa todos los checks] → archivo guardado en temp/
       │
       ▼
[BullMQ Job: malware-scan] (async, no block)
```

### 3.2 Componentes a Crear/Modificar

| Componente | Tipo | Archivo |
|-----------|------|---------|
| `upload.middleware.ts` | MODIFICAR | `src/middlewares/storage/upload.middleware.ts` |
| `BLOCKED_EXTENSIONS` | AGREGAR | Inline en upload.middleware.ts |
| `url-validator.util.ts` | CREAR | `src/utils/url-validator.util.ts` |
| `uploadRateLimit` | CREAR | `src/middlewares/rateLimit/rateLimit.ts` (agregar nuevo limiter) |
| `product-declarations.schema.ts` | CREAR | `src/schemas/product-declarations.schema.ts` |

---

## 4. Diseño Detallado

### 4.1 Mejorar Mensaje de Error para Ejecutables

**Archivo**: `src/middlewares/storage/upload.middleware.ts`

**Situación actual**: Los ejecutables (.exe, .bat, .sh, .msi) NO están en ALLOWED_EXTENSIONS → son bloqueados. El mensaje de error es genérico: "Extension not allowed".

**Decisión de diseño (Opción A)**: Mantener el bloqueo de ejecutables hasta que CS-18 (malware scanning) esté implementado. Mejorar el mensaje para que sea claro y explique la situación.

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

**Modificación en fileFilter**:

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

  // [2] Check allowlist (existing logic)
  const safeExt = getSafeExtension(file.originalname);
  if (!safeExt || !ALLOWED_EXTENSIONS.includes(safeExt)) {
    const error = new Error(`Extension not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
    cb(error, false);
    return;
  }

  // [3] Check MIME type (existing logic)
  if (!isAllowedMimeType(mimeType)) {
    const error = new Error(`MIME type not allowed: ${mimeType}`);
    cb(error, false);
    return;
  }

  cb(null, true);
}
```

**Nota importante**: Este es un MEJOR MENSAJE, no un cambio de funcionalidad. Los ejecutables YA están bloqueados por no estar en ALLOWED_EXTENSIONS. El cambio es solo el mensaje de error.
}
```

### 4.2 Validación de URLs Externas

**Archivo**: `src/utils/url-validator.util.ts`

**Pattern**: Utility function para validación, reusable en schemas y controllers.

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
  // [1] Parse URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // [2] Protocol check - HTTPS only
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS URLs are allowed' };
  }

  // [3] Domain check - endsWith to allow subdomains
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

  // [4] No auth credentials
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs with authentication credentials are not allowed' };
  }

  // [5] No auth tokens in query params
  const authParams = ['token', 'key', 'auth', 'access_token', 'api_key', 'signature'];
  const hasAuthParam = authParams.some(param => parsed.searchParams.has(param));

  if (hasAuthParam) {
    return { valid: false, error: 'URLs with authentication tokens are not allowed' };
  }

  return { valid: true, normalizedUrl: parsed.toString() };
}

/**
 * Creates a Zod custom refinement for external URLs.
 * Use in schemas: externalUrl: z.string().optional().refine(validateExternalUrlSafe)
 */
export function validateExternalUrlSafe(value: string): boolean {
  return validateExternalUrl(value).valid;
}

export function getExternalUrlError(value: string): string {
  return validateExternalUrl(value).error || 'Invalid URL';
}
```

### 4.3 Rate Limiting para Uploads

**Archivo**: `src/middlewares/rateLimit/rateLimit.ts` — AGREGAR nuevo limiter

**Pattern**: Reusar el patrón existente de express-rate-limit, NO crear Redis manual.

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

### 4.4 Schema de Declaraciones

**Archivo**: `src/schemas/product-declarations.schema.ts`

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
  // Required declaration acceptance
  declarationAccepted: z.boolean().refine(val => val === true, {
    message: 'Debes aceptar la declaración de derechos para continuar.',
  }),

  // For products with external links only
  isExternalLinkOnly: z.boolean().optional().default(false),
  externalUrl: z.string()
    .url('URL inválida')
    .optional()
    .refine(val => !val || validateExternalUrlSafe(val), {
      message: getExternalUrlError(val || ''),
    }),

  // ISBN for ebooks (optional but validated if provided)
  isbn: z.string()
    .regex(
      /^(?:ISBN(?:-1[03])?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$|97[89][0-9]{10}$|(?=(?:[0-9]+[- ]){4})[- 0-9X]{17}$)(?:97[89][ -]?)?[0-9]{1,5}[ -]?[0-9]+[ -]?[0-9X]+$/,
      'ISBN inválido. Formatos aceptados: ISBN-10, ISBN-13, ISBN-10 con prefijo (ej: ISBN 1-23456-789-0)'
    )
    .optional(),
});

export type ProductDeclarationInput = z.infer<typeof productDeclarationSchema>;
```

### 4.5 Validación de Tamaño Mínimo

**Ubicación**: `src/middlewares/storage/upload.middleware.ts` o en controller

```typescript
// Constants - usar config para max, hardcodear min
const MIN_FILE_SIZE_BYTES = 1024; // 1KB (hardcoded, no configurable)

// En el controller post-upload:
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

### 4.6 Configuración vía config/index.ts

**Patrón del proyecto**: Los valores configurables van en `config/index.ts`, no hardcodear.

```typescript
// En config/index.ts - storage config existente

export const config = {
  // ...
  storage: {
    maxGlobalSizeMb: env.MAX_GLOBAL_UPLOAD_SIZE_MB,
    maxGlobalSizeBytes: env.MAX_GLOBAL_UPLOAD_SIZE_MB * 1024 * 1024,
    // AGREGAR: mínimo size en KB (para validación post-upload)
    minSizeBytes: 1024, // 1KB hardcoded - no configurable por seguridad
  },
} as const;
```

**Variables de entorno relacionadas**:

| Variable | Default | Uso |
|----------|---------|-----|
| `MAX_GLOBAL_UPLOAD_SIZE_MB` | 100 | Tamaño máximo de archivo |
| `MIN_FILE_SIZE_BYTES` | 1024 | Hardcoded - mínimo (no configurable) |

---

## 5. Seguridad

### 5.1 Defense in Depth

| Capa | Validación | Archivos |
|------|------------|----------|
| **Middleware** | Block extensions, MIME types, filename sanitization | `upload.middleware.ts` |
| **Controller** | File size validation, post-upload checks | Controller |
| **Schema** | Zod validation (declarationAccepted, url format) | `product-declarations.schema.ts` |
| **Service** | Business logic validation | Services |

### 5.2 Fail Secure

- Si cualquier validación falla → reject con error claro (400)
- No exponer stack traces o paths internos en producción
- Loguear intentos de uploads bloqueados (para monitoreo)

### 5.3 Rate Limiting Headers

El patrón existente de express-rate-limit ya incluye headers estándar:

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 45
```

---

## 6. Performance

### 6.1 Validación Sincrónica (< 100ms)

Las validaciones de fileFilter son sincrónicas y rápidas:
- String comparisons (BLOCKED_EXTENSIONS.includes)
- MIME type check
- Extension check

### 6.2 Async Operations

| Operación | Тип | Notas |
|----------|-----|-------|
| Malware scan | BullMQ async job | Post-upload, no block |
| AI moderation | BullMQ async job | Post-upload, no block |

---

## 7. Testing

### 7.1 Unit Tests

```typescript
// src/__tests__/validators/url-validator.test.ts

describe('validateExternalUrl', () => {
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

  it('should reject unknown domains', () => {
    const result = validateExternalUrl('https://random-site.com/file');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not allowed');
  });
});
```

```typescript
// src/__tests__/middlewares/upload-blocked.test.ts

describe('BLOCKED_EXTENSIONS', () => {
  const BLOCKED = ['exe', 'bat', 'cmd', 'msi', 'sh', 'vbs'];

  it('should include common executables', () => {
    BLOCKED.forEach(ext => {
      expect(validateExternalUrl(`test.${ext}`)).toBeBlocked();
    });
  });
});
```

---

## 8. Código - Archivos a Modificar/Crear

| Archivo | Acción | Ubicación |
|---------|--------|-----------|
| `upload.middleware.ts` | MODIFICAR | Agregar BLOCKED_EXTENSIONS y validación |
| `rateLimit.ts` | MODIFICAR | Agregar uploadLimiter |
| `url-validator.util.ts` | CREAR | `src/utils/url-validator.util.ts` |
| `product-declarations.schema.ts` | CREAR | `src/schemas/product-declarations.schema.ts` |

---

## 9. Estado

**Estado**: BORRADOR - Pending approval de proposal.md y spec.md