# SDD Proposal: Content Security Enhancement

**Proyecto**: Crema - Content Security & Upload Validation
**Tipo**: Security Enhancement
**Estado**: BORRADOR
**Fecha**: Mayo 2026
**Owner**: Kike García

---

## 1. Resumen Ejecutivo

El sistema actual de uploads en Crema tiene validaciones básicas (extensiones, MIME types, sanitización de filenames) pero carece de controles críticos de seguridad:

- **No hay bloqueo explícito de ejecutables** (.exe, .bat, .sh, .msi, etc.)
- **No hay validación de URLs externas** (dominios permitidos)
- **No hay declaración de derechos** de copyright en productos
- **No hay rate limiting específico** para uploads

Esta propuesta cubre la Fase 1 del roadmap (Semanas 1-4): Blindaje Técnico.

---

## 2. Estado Actual

### 2.1 Infraestructura Existente

| Componente | Implementación | Archivo |
|-----------|-------------|---------|
| **Upload middleware** | multer + allowlist | `src/middlewares/storage/upload.middleware.ts` |
| **Rate Limiting general** | Patrón existente de express-rate-limit | `src/middlewares/rateLimit/rateLimit.ts` → múltiples limiters (loginLimiter, aiLimiter, etc.) |
| **Allowed Extensions** | Array estático | `ALLOWED_EXTENSIONS` en upload.middleware |
| **Allowed MIME Types** | Array estático | `ALLOWED_MIME_TYPES` en upload.middleware |

### 2.2 Validaciones Existentes

```typescript
// upload.middleware.ts - LO QUE HAY
const ALLOWED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico',
  'mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'ogg', 'm4a',
  'zip', 'rar', '7z', 'tar', 'gz',
  'html', 'css', 'js', 'json', 'xml', 'md',
  'epub', 'mobi', 'azw3',
];
```

**PROBLEMA**: `.exe`, `.bat`, `.sh`, `.msi` NO están en ALLOWED_EXTENSIONS, por lo que son bloqueados implícitamente. SIN EMBARGO, el mensaje de error es genérico ("Extension not allowed") en lugar de uno específico que explique que son ejecutables y que `.exe` para software requiere malware scanning (CS-18).

### 2.3 Problemas Identificados

| Problema | Severidad | Descripción |
|----------|-----------|-------------|
| Mensaje de error confuso para ejecutables | 🔴 CRITICAL | El error dice "Extension not allowed" en lugar de "Executable files not allowed" con contexto de malware scanning |
| Sin validación de URLs externas | 🔴 CRITICAL | Dominios permitidos no están implementados |
| Sin checkboxes de copyright | 🟡 MEDIA | Cada tipo de producto requiere declaración de derechos |
| Rate limiting específico de uploads | 🟡 MEDIA | NO existe uploadLimiter específico - usar patrón existente de express-rate-limit |
| Validación de tamaño mínimo | 🟢 BAJA | Archivos < 1KB no son validados |

---

## 3. Objetivos

| # | Objetivo | Métrica de Éxito |
|---|----------|------------------|
| O1 | Mensaje de error claro para ejecutables | Archivo .exe rechazado con mensaje específico: "Executable files not allowed. Use .zip/.rar/.7z for software, or wait for malware scanning (CS-18)." |
| O2 | Allowlist de dominios externos | Solo youtube.com, vimeo.com, drive.google.com, etc. aceptados |
| O3 | Checkboxes de declaración de derechos | Todos los tipos de producto tienen checkbox obligatorio |
| O4 | Rate limiting específico para uploads | Máximo 10 uploads/minuto por usuario |
| O5 | Validación de tamaño mínimo | Archivos < 1KB rechazados |

---

## 4. Alcance (Fase 1 - Blindaje Técnico)

### 4.1 Dentro del Alcance (Tasks CS-01 a CS-15)

| Task | Descripción | Prioridad | Owner |
|------|-------------|----------|-------|
| CS-01 | Bloqueo explícito de ejecutables (.exe, .bat, .sh, .msi, .scr, .pif, .cmd, .vbs) | 🔴 ALTA | Backend |
| CS-02 | Checkbox declaración copyright general | 🔴 ALTA | Frontend |
| CS-03 | Checkbox autorización para links externos | 🔴 ALTA | Frontend |
| CS-04 | Checkbox derechos para ebooks | 🔴 ALTA | Frontend |
| CS-05 | Checkbox declaración originalidad para cursos | 🔴 ALTA | Frontend |
| CS-06 | Checkbox derechos de audio para podcasts | 🔴 ALTA | Frontend |
| CS-07 | Checkbox declaración licencia para software | 🔴 ALTA | Frontend |
| CS-08 | Checkbox declaración derechos para membresías | 🔴 ALTA | Frontend |
| CS-09 | Validación de tamaño mínimo (archivos < 1KB) | 🟡 MEDIA | Backend |
| CS-10 | Allowlist de dominios para URLs externas | 🔴 ALTA | Backend |
| CS-11 | Rate limiting específico para uploads (10/min) | 🟡 MEDIA | Backend |
| CS-12 | Warning en checkout para productos con links de terceros | 🟡 MEDIA | Frontend |
| CS-13 | Campo ISBN opcional para ebooks | 🟡 MEDIA | Fullstack |
| CS-14 | Preview obligatorio (al menos 1 lección/episodio gratuito) | 🟡 MEDIA | Backend |
| CS-15 | Metadata de episodios para podcasts | 🟡 MEDIA | Backend |

### 4.2 Fuera del Alcance (Fases 2-3)

- CS-16 a CS-27 (Moderación AI, Gestión de Copyright)
- Estas fases requieren integración con servicios externos (ClamAV, OpenAI Moderation, etc.)

### 4.3 Dependencias

| Task | Depende de |
|------|------------|
| CS-10 (Allowlist dominios) | Ninguna - puede implementarse independiente |
| CS-02 a CS-08 (Checkboxes) | Schema de producto requiere nuevo campo `declarationAccepted` |
| CS-14 (Preview obligatorio) | Sistema de módulos/lecciones debe existir |

---

## 5. Enfoque de Implementación

### Option A: Mínimo Viable
Implementar solo CS-01 (bloqueo ejecutables) + CS-10 (allowlist dominios). El resto en fases posteriores.

**Pros**: Rápido, enfoca recursos en críticos
**Cons**: Queda desorganizado, múltiples waves de cambios

### Option B: Frontend y Backend Separados
Backend: CS-01, CS-09, CS-10, CS-11, CS-14, CS-15
Frontend: CS-02 a CS-08, CS-12, CS-13

**Pros**: Equipos paralelos pueden trabajar
**Cons**: Requiere coordinación de schema

### Option C: Completo (Recomendado)
Implementar todas las tasks de Fase 1 en un solo PR.

**Pros**: Producto coherente, una sola vez de revisión
**Cons**: PR más grande

**Recomendación**: Option B - separar backend de frontend pero en PRs coordenados.

---

## 6. Documentos Relacionados

- PRD: `docs/project/content-security/PRD.md` (v2.2)
- Estándar de verificación: `docs/project/common/verification-standard.md`

---

## 7. Aprobación

| Rol | Nombre | Fecha |
|-----|--------|-------|
| Author | Kike García | Mayo 2026 |
| Reviewer | | |
| Approver | | |