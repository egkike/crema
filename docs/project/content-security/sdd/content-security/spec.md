# SDD Spec: Content Security Enhancement

**Proyecto**: Crema - Content Security & Upload Validation
**Tipo**: Security Enhancement
**SDD Phase**: Spec
**Estado**: BORRADOR
**Fecha**: Mayo 2026
**Depends on**: proposal.md

> **Estandar de Verificación**: Ver `docs/project/common/verification-standard.md`

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

#### 5.1.1 upload.middleware.ts - Bloqueo de Ejecutables

```typescript
// Extensiones BLOQUEADAS explícitamente (más alla del allowlist)
const BLOCKED_EXTENSIONS = [
  'exe', 'bat', 'sh', 'msi', 'scr', 'pif', 'cmd', 'vbs',
  'com', 'pif', 'application/x-msdownload'
];

function fileFilter(req: any, file: { originalname: string; mimetype: string }, cb: (error: Error | null, acceptFile: boolean) => void) {
  const ext = getSafeExtension(file.originalname);

  // Check bloqueados PRIMERO
  const extLower = ext?.toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(extLower)) {
    const error = new Error(`Executable files not allowed. Blocked: ${BLOCKED_EXTENSIONS.join(', ')}`);
    cb(error, false);
    return;
  }

  // Luego validaciones existentes (allowlist, MIME type)
  // ...
}
```

#### 5.1.2 URL Validation Service

```typescript
// src/services/validation/url-validator.service.ts
const ALLOWED_DOMAINS = [
  'youtube.com', 'youtu.be',
  'vimeo.com', 'player.vimeo.com',
  'drive.google.com',
  'dropbox.com',
  'onedrive.live.com',
  'docs.google.com',
  'canva.com',
  'notion.so',
  'soundcloud.com',
  'spotify.com',
];

export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (!ALLOWED_DOMAINS.some(d => parsed.hostname.endsWith(d))) {
      return false;
    }
    // Rechazar URLs con auth params
    if (parsed.username || parsed.password) return false;
    // Rechazar tokens en query (common auth patterns)
    if (parsed.searchParams.has('token') || parsed.searchParams.has('key')) return false;
    return true;
  } catch {
    return false;
  }
}
```

#### 5.1.3 Tamaño Mínimo

```typescript
// En product.controller.ts o en el upload middleware
const MIN_FILE_SIZE = 1024; // 1KB

// En fileFilter o después del upload:
if (file.size < MIN_FILE_SIZE) {
  throw new AppError(`File too small. Minimum size: ${MIN_FILE_SIZE} bytes`, 400);
}
```

### 5.2 Rate Limiting para Uploads

```typescript
// src/middlewares/upload-rate-limit.middleware.ts
import { redisConnection } from '../config/redis';

export const uploadRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.id;
  if (!userId) return next();

  const key = `ratelimit:upload:${userId}`;
  const current = await redisConnection.incr(key);

  if (current === 1) {
    await redisConnection.expire(key, 60); // 1 minute window
  }

  const ttl = await redisConnection.ttl(key);
  res.setHeader('X-RateLimit-Limit', '10');
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, 10 - current)));
  res.setHeader('X-RateLimit-Reset', String(ttl));

  if (current > 10) {
    throw new AppError('Upload rate limit exceeded. Max 10 uploads per minute.', 429);
  }

  next();
};
```

### 5.3 Schema Updates

```typescript
// En createProductSchema - agregar declaración
const createProductSchema = z.object({
  // ... existing fields
  declarationAccepted: z.boolean()
    .refine(val => val === true, {
      message: 'Debes aceptar la declaración de derechos para continuar',
    }),
  isExternalLinkOnly: z.boolean().optional(),
  externalUrl: z.string().url().optional(),
  // Para ebooks
  isbn: z.string().regex(/^(?:ISBN(?:-1[03])?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$|97[89][0-9]{10}$|(?=(?:[0-9]+[- ]){4})[- 0-9X]{17}$)(?:97[89][ -]?)?[0-9]{1,5}[ -]?[0-9]+[ -]?[0-9X]+$/).optional(),
});
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