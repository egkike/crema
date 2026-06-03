# SDD Spec: Content Security Enhancement

**Proyecto**: Crema - Content Security & Upload Validation
**Tipo**: Security Enhancement
**SDD Phase**: Spec
**Estado**: BORRADOR
**Fecha**: Mayo 2026
**Depends on**: proposal.md

> **Estandar de Verificación**: Ver `docs/project/common/verification-standard.md`
>
> **Recursos Reutilizables**: Ver `docs/project/reusable-resources.md` para módulos existentes.

---

## 1. Resumen

Implementar controles de seguridad para uploads de contenido en Crema:

- Bloqueo explícito de archivos ejecutables
- Allowlist de dominios para URLs externas
- Validación de tamaño mínimo de archivos
- Rate limiting específico para uploads

**Nota sobre arquitectura**: El upload middleware usa multer con storage en disco. Las validaciones son sincrónicas en el middleware, las validaciones pesadas (malware scan, AI moderation) van a BullMQ.

---

## 2. Requirements

### 2.1 Requisitos Funcionales

| ID | Requirement | Prioridad |
|----|-------------|:---------:|
| CS-001 | Bloqueo explícito de ejecutables (.exe, .bat, .sh, .msi, .scr, .pif, .cmd, .vbs) | 🔴 ALTA |
| CS-002 | Allowlist de dominios para URLs externas (youtube.com, vimeo.com, drive.google.com, dropbox.com, etc.) | 🔴 ALTA |
| CS-003 | Validación de tamaño mínimo de archivos (mínimo 1KB) | 🟡 MEDIA |
| CS-004 | Checkboxes de declaración de derechos (por tipo de producto) | 🔴 ALTA |
| CS-005 | Rate limiting específico para uploads (10/min por usuario) | 🟡 MEDIA |
| CS-006 | Warning en checkout para productos con links de terceros | 🟡 MEDIA |
| CS-007 | Preview obligatorio (al menos 1 lección/episodio gratuito) | 🟡 MEDIA |
| CS-008 | ISBN opcional para ebooks | 🟡 MEDIA |

### 2.2 Requisitos No Funcionales

| Requisito | Target |
|-----------|--------|
| Tiempo de validación | < 100ms sincrónico |
| Rate limit uploads | 10 requests/minuto por usuario |
| Tamaño máximo archivo | 100MB (configurable) |
| Tamaño mínimo archivo | 1KB |

---

## 3. User Stories

| ID | Como | Quiero | Para |
|----|------|--------|------|
| CS-US-01 | Creador | subir archivos .exe para software | ❌ Rechazado con mensaje claro |
| CS-US-02 | Creador | agregar link de YouTube en producto | ✅ Aceptado |
| CS-US-03 | Creador | agregar link de sitio no verificado | ❌ Rechazado con mensaje claro |
| CS-US-04 | Creador | subir archivo muy pequeño (< 1KB) | ❌ Rechazado con mensaje de error |
| CS-US-05 | Creador | crear ebook sin declaración de derechos | ❌ Schema rechaza la creación |
| CS-US-06 | Comprador | ver warning cuando producto tiene links de terceros | ✅ Información transparente |

---

## 4. Acceptance Criteria

### 4.1 Bloqueo de Ejecutables

| Criterio | Validación |
|----------|------------|
| AC-EXE-01 | Archivo `.exe` rechazado con error 400: "Executable files not allowed" |
| AC-EXE-02 | Archivo `.bat` rechazado con error 400 |
| AC-EXE-03 | Archivo `.sh` rechazado con error 400 |
| AC-EXE-04 | Archivo `.msi` rechazado con error 400 |
| AC-EXE-05 | Archivo `.scr`, `.pif`, `.cmd`, `.vbs` rechazados |
| AC-EXE-06 | Archivos válidos (.pdf, .mp4, .zip) aceptados normalmente |
| AC-EXE-07 | Error incluye lista de extensiones permitidas |

### 4.2 Allowlist de Dominios

| Criterio | Validación |
|----------|------------|
| AC-DOM-01 | `youtube.com`, `youtu.be` aceptados |
| AC-DOM-02 | `vimeo.com`, `player.vimeo.com` aceptados |
| AC-DOM-03 | `drive.google.com` aceptado |
| AC-DOM-04 | `dropbox.com` aceptado |
| AC-DOM-05 | `docs.google.com` aceptado |
| AC-DOM-06 | Dominio no listado rechazado con error |
| AC-DOM-07 | URLs con tokens o parámetros de auth rechazados |
| AC-DOM-08 | Solo `https://` aceptado, `http://` rechazado |

### 4.3 Validación de Tamaño

| Criterio | Validación |
|----------|------------|
| AC-SIZE-01 | Archivo < 1KB rechazado con error 400 |
| AC-SIZE-02 | Archivo >= 1KB aceptado |
| AC-SIZE-03 | Archivo > 100MB rechazado con error 413 |

### 4.4 Checkboxes de Declaración

| Criterio | Validación |
|----------|------------|
| AC-DECL-01 | Schema de producto requiere campo `declarationAccepted: boolean` |
| AC-DECL-02 | Creación sin `declarationAccepted: true` rechazada con 400 |
| AC-DECL-03 | Campo label indica el tipo de declaración según tipo de producto |

### 4.5 Rate Limiting

| Criterio | Validación |
|----------|------------|
| AC-RATE-01 | 11vo upload en 1 minuto rechazado con 429 |
| AC-RATE-02 | Headers X-RateLimit-* presentes en respuesta |
| AC-RATE-03 | Contador se resetea después de ventana de 1 minuto |

---

## 5. Technical Specification

### 5.1 Backend Changes

#### 5.1.1 upload.middleware.ts - Mejorar Mensaje de Error para Ejecutables

**Situación actual**: Los ejecutables (.exe, .bat, .sh, .msi) NO están en ALLOWED_EXTENSIONS, por lo que son bloqueados implícitamente. El error dice "Extension not allowed" — sin contexto.

**Cambio requerido**: Mejorar el mensaje de error para que sea específico y explica por qué.

```typescript
// Agregar constante para extensiones de ejecutables (para mensaje de error)
const EXECUTABLE_EXTENSIONS = ['exe', 'bat', 'sh', 'msi', 'scr', 'pif', 'cmd', 'vbs', 'com', 'app', 'bin', 'dmg'];

function fileFilter(req: any, file: { originalname: string; mimetype: string }, cb: (error: Error | null, acceptFile: boolean) => void) {
  const ext = getSafeExtension(file.originalname)?.toLowerCase();
  const mimeType = file.mimetype.toLowerCase();

  // Check: extensión es de ejecutable?
  if (ext && EXECUTABLE_EXTENSIONS.includes(ext)) {
    const error = new Error(
      `Executable files are not allowed. Use .zip, .rar, or .7z format for software. ` +
      `.exe files require malware scanning (CS-18 pending implementation).`
    );
    cb(error, false);
    return;
  }

  // Check allowlist existente (extensión válida)
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    const error = new Error(`Extension not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
    cb(error, false);
    return;
  }

  // Check MIME type (existente)...
}
```

#### 5.1.2 URL Validation Utility

**Archivo**: `src/utils/url-validator.util.ts` (CREAR)

```typescript
// src/utils/url-validator.util.ts

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

export function validateExternalUrl(url: string): UrlValidationResult {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS URLs are allowed' };
    }
    const hostname = parsed.hostname.toLowerCase();
    const isAllowed = (ALL_ALLOWED_DOMAINS as readonly string[]).some(
      domain => hostname === domain || hostname.endsWith('.' + domain)
    );
    if (!isAllowed) {
      return { valid: false, error: `Domain not allowed. Allowed: ${(ALL_ALLOWED_DOMAINS as readonly string[]).join(', ')}` };
    }
    if (parsed.username || parsed.password) {
      return { valid: false, error: 'URLs with authentication credentials are not allowed' };
    }
    const authParams = ['token', 'key', 'auth', 'access_token', 'api_key', 'signature'];
    if (authParams.some(param => parsed.searchParams.has(param))) {
      return { valid: false, error: 'URLs with authentication tokens are not allowed' };
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
```

#### 5.1.3 Tamaño Mínimo de Archivo

**Ubicación**: Controller (post-upload), NO en middleware.

```typescript
// En el controller después de upload.single('file'):
const MIN_FILE_SIZE_BYTES = 1024; // 1KB - hardcoded por seguridad

async handleUpload(req: Request, res: Response) {
  const file = req.file;
  if (!file) {
    throw new AppError('No file uploaded', 400);
  }

  if (file.size < MIN_FILE_SIZE_BYTES) {
    // Limpiar archivo temporal
    try { await fs.unlink(file.path); } catch { /* ignore */ }
    throw new AppError(
      `File too small. Minimum: ${MIN_FILE_SIZE_BYTES} bytes (1KB). Received: ${file.size} bytes.`,
      400
    );
  }
  // Continuar...
}
```

### 5.2 Rate Limiting para Uploads

**Archivo**: `src/middlewares/rateLimit/rateLimit.ts` (AGREGAR)

**Pattern**: Usar express-rate-limit (NO Redis manual).

```typescript
// ============================================================================
// UPLOAD RATE LIMITER - Protect against upload flooding
// ============================================================================

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // máximo 10 uploads por minuto por usuario
  message: {
    success: false,
    error: 'Límite de uploads alcanzado. Máximo 10 archivos por minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.id;
    return userId || ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de uploads alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});
```

### 5.3 Schema Updates

**Archivo**: `src/schemas/product-declarations.schema.ts` (CREAR)

```typescript
import { z } from 'zod';
import { validateExternalUrl } from '../utils/url-validator.util';

export const DECLARATION_LABELS: Record<string, string> = {
  course: 'Declaro que este curso es contenido original creado por mí y tengo los derechos necesarios.',
  ebook: 'Declaro que poseo los derechos de este ebook y no infringe copyrights de terceros.',
  podcast: 'Declaro que tengo derechos sobre toda la música y audio de este podcast.',
  software: 'Declaro que este software es legítimo, posee la licencia correspondiente y no contiene malware.',
  membership: 'Declaro que poseo los derechos de todo el contenido incluido en esta membresía.',
  link: 'Declaro que tengo autorización del creador del contenido enlazado.',
} as const;

export const productDeclarationSchema = z.object({
  declarationAccepted: z.boolean().refine(val => val === true, {
    message: 'Debes aceptar la declaración de derechos para continuar.',
  }),
  isExternalLinkOnly: z.boolean().optional().default(false),
  externalUrl: z.string().url('URL inválida').optional().refine(
    val => !val || validateExternalUrl(val).valid,
    { message: val => validateExternalUrl(val || '').error || 'URL no válida' }
  ),
  isbn: z.string().regex(/^(?:ISBN(?:-1[03])?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$|97[89][0-9]{10}$|(?=(?:[0-9]+[- ]){4})[- 0-9X]{17}$)(?:97[89][ -]?)?[0-9]{1,5}[ -]?[0-9]+[ -]?[0-9X]+$/, 'ISBN inválido').optional(),
});

export type ProductDeclarationInput = z.infer<typeof productDeclarationSchema>;
```

### 5.4 Allowed Domains Constant

```typescript
// src/utils/allowed-domains.ts
export const ALLOWED_VIDEO_DOMAINS = [
  'youtube.com', 'youtu.be',
  'vimeo.com', 'player.vimeo.com',
] as const;

export const ALLOWED_STORAGE_DOMAINS = [
  'drive.google.com',
  'dropbox.com',
  'onedrive.live.com',
] as const;

export const ALLOWED_DOC_DOMAINS = [
  'docs.google.com',
  'canva.com',
  'notion.so',
] as const;

export const ALLOWED_AUDIO_DOMAINS = [
  'soundcloud.com',
  'spotify.com',
] as const;

export const ALL_ALLOWED_DOMAINS = [
  ...ALLOWED_VIDEO_DOMAINS,
  ...ALLOWED_STORAGE_DOMAINS,
  ...ALLOWED_DOC_DOMAINS,
  ...ALLOWED_AUDIO_DOMAINS,
];
```

---

## 6. Edge Cases

| Caso | Manejo |
|------|--------|
| Archivo sin extensión | Permitido si MIME type es válido |
| Extensión en mayúsculas (.EXE) | Bloqueado (case-insensitive) |
| URL con subdomain (video.youtube.com) | Aceptado (endsWith check) |
| URL con path extra | Aceptado si hostname allowed |
| http:// youtube.com | Rechazado (solo https) |
| Archivo 0 bytes | Rechazado por size mínimo |
| Upload rápido successive | Rate limit aplica por userId |

---

## 7. Security Considerations

1. **Defense in Depth**: Múltiples capas de validación (middleware + schema + service)
2. **Fail Secure**: Si validation falla, reject con error claro
3. **Input Sanitization**: Filenames ya sanitizados, URLs validadas contra allowlist
4. **No secrets en URLs**: Tokens y auth params bloqueados

---

## 8. Estado

**Estado**: BORRADOR - Pending approval de proposal.md