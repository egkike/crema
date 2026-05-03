# Product Requirements Document (PRD)
## Crema - Content Security & Upload Validation

**Versión**: 2.2
**Fecha**: Mayo 2026
**Estado**: Parcial - Validaciones técnicas básicas implementadas, ejecutables y AI pending
**Owner**: Kike García

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Catálogo de Controles de Validación](#2-catálogo-de-controles-de-validación)
3. [Workflows de Moderación](#3-workflows-de-moderación)
4. [API Endpoints](#4-api-endpoints)
5. [Roadmap de Implementación](#5-roadmap-de-implementación)
6. [Stack Disponible](#0-stack-disponible)

---

## 0. Stack Disponible

> ⚠️ **Regla obligatoria**: Antes de proponer soluciones, verificar qué está ya implementado. Explorar lo existente antes de agregar dependencias nuevas.

### 0.1 Infraestructura Disponible

| Componente | Implementación | Archivo | Uso |
|-----------|-------------|---------|-----|
| **Redis** | `ioredis` con configuración centralizada | `backend/src/config/redis.ts` → `redisConnection` | Caching, rate limiting |
| **BullMQ** | Cola + Worker para jobs asíncronos | `backend/src/queues/scheduler.ts` + `main.worker.ts` | Async scanning, processing |
| **NotificationService** | Slack + Datadog notifications | `src/services/notification.service.ts` | Alertas de seguridad |

### 0.2 Validaciones Existentes (reutilizables)

| Validador | Archivo | Descripción |
|---------|---------|-------------|
| **Upload middleware** | `src/middlewares/storage/upload.middleware.ts` | Allowlist extensiones, MIME types, sanitización de filenames, límite de tamaño |
| **GlobalErrorHandler** | `src/middlewares/global-error.middleware.ts` | Manejo centralizado de errores |
| **RequestId middleware** | `src/middlewares/tracking/requestId.middleware.ts` | Trazabilidad de requests |
| **Rate Limiting** | `src/middlewares/rateLimit.ts` | Límite general de requests por IP/usuario |

### 0.3 Ejemplo de Reutilización

```typescript
// Para async malware scanning (BullMQ):
import { mainQueue } from '../queues/scheduler';
await mainQueue.add('scan-malware', { fileId, fileHash }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });

// Para caching de resultados de validación (Redis):
// Ver skills-registry.service.ts para patrón de Redis caching con TTL y JSON parse safety

// Para notificar incidentes de seguridad:
import { notificationService } from '../services/notification.service';
notificationService.notify(new Error('Security incident'), { context }, 'error');
```

### 0.4 Consideraciones

- **Malware scanning** → BullMQ worker existente puede extenderse; no crear cola nueva
- **Caching de validación** → Usar Redis con TTL (evitar re-validar archivos ya escaneados)
- **Rate limiting en uploads** → Usar patrón de NotificationService (Redis INCR + TTL)

## 1. Resumen Ejecutivo

### 1.1 Visión
Establecer un marco robusto de validaciones y controles para todo el contenido subido a la plataforma Crema, asegurando la calidad, legalidad y seguridad del ecosistema. El objetivo es evitar la subida de contenido malicioso, ilegal, prohibido o que infrinja derechos de autor, manteniendo una experiencia de usuario coherente.

> **Del Análisis 6**: Para una experiencia de calidad, el contenido debe ser seguro, legítimo y de quality verificada. Las validaciones no son solo controles de seguridad, sino garantías de una experiencia positiva para el comprador.

### 1.2 Objetivos Estratégicos
- **Cero Tolerancia al Malware**: Impedir la subida de archivos ejecutables o maliciosos.
- **Protección de Copyright**: Implementar mecanismos para disuadir la piratería y facilitar el reporte de infracciones.
- **Calidad de Contenido**: Asegurar que el contenido subido sea coherente con el tipo de producto declarado.
- **Seguridad Legal**: Blindar a la plataforma mediante términos legales claros y procesos de moderación.

---

## 2. Catálogo de Controles de Validación

### 2.1 Validaciones Técnicas (Capa de Infraestructura)

| Control | Descripción | Implementación | Prioridad |
|---------|-------------|----------------|:---------:|
| **Allowlist de Extensiones** | Solo permitir extensiones aprobadas (pdf, mp4, etc.) | `storage/upload.middleware.ts` → `ALLOWED_EXTENSIONS` | ✅ Hecho |
| **Validación de MIME Types** | Verificar que el MIME type coincida con la extensión | `storage/upload.middleware.ts` → `isAllowedMimeType()` | ✅ Hecho |
| **Sanitización de Filenames** | Remover caracteres peligrosos y prevenir path traversal | `storage/upload.middleware.ts` → `sanitizeFilename()` | ✅ Hecho |
| **Límite de Tamaño Global** | Máximo 100MB por archivo (configurable) | `storage/upload.middleware.ts` → `limits.fileSize` | ✅ Hecho |
| **Rate Limiting (general)** | Límite de requests por IP/usuario | `middlewares/rateLimit.ts` | ✅ Hecho |
| **Bloqueo de Ejecutables** | Prohibir estrictamente `.exe`, `.bat`, `.sh`, `.msi` | ❌ NO - `ALLOWED_EXTENSIONS` no incluye ejecutables, pero no hay block explícito | ALTA |
| **Malware Scanning** | Escaneo de archivos subidos contra firmas de virus | ❌ Pendiente - requiere integración ClamAV | ALTA |
| **Validación de Tamaño Mínimo** | Evitar archivos vacíos o corruptos (ej: PDF < 1KB) | ❌ Pendiente | BAJA |
| **Quality Checks** | Verificar resolución mínima de video/imagen y duración | ❌ Pendiente | BAJA |
| **Validación de URLs Externas** | Solo permitir dominios seguros y conocidos (YouTube, Vimeo, etc.) | ❌ Pendiente - allowlist no implementado | ALTA |
| **Rate Limiting por Upload** | Limitar cantidad de uploads por usuario en ventana de tiempo | 🟡 PARCIAL - rate limit general existe, específico de uploads no | MEDIA |

---

### 2.2 Validación de Coherencia y Calidad (Capa AI)

> **Dependencia**: La validación de coherencia AI depende del `ContentAssistantService` (voir AI-FEATURES-PRD sección 4.2). Mientras tanto, usar heurística simple basada en palabras clave del título.

| Control | Descripción | Lógica de Validación | Prioridad |
|---------|-------------|----------------------|:---------:|
| **Coherencia de Contenido** | Verificar que el contenido coincide con el tipo de producto | Usar `ContentAssistantService` (Fase 1 AI) o heurística simple: palabras clave del título en el contenido | ALTA |
| **Moderación de Contenido** | Detectar contenido prohibido (sexo, violencia, odio, abusos) | Integración con API de Moderación (OpenAI Moderation o similar) | ALTA |
| **Análisis de Texto Prohibido** | Buscar palabras clave prohibidas en títulos y descripciones | Regex + Análisis semántico con LLM | MEDIA |

---

### 2.3 Control de Copyright y Propiedad Intelectual

| Control | Descripción | Implementación | Prioridad |
|---------|-------------|----------------|:---------:|
| **Declaración Obligatoria** | Checkbox de "Poseo los derechos de este contenido" | Campo obligatorio en `createProductSchema` | ALTA |
| **Fingerprinting/Hashing** | Generar hash único del archivo para detectar re-uploads de contenido reportado | Guardar hash en base de datos al subir | MEDIA |
| **Sistemas de Reporte** | Canal para que terceros denuncien infracciones | `reports` table + `ReportAgentService` | ✅ Hecho |
| **DMCA Takedown Process** | Proceso formal para retiro de contenido por copyright | Flujo de soporte + eliminación manual/auto | MEDIA |

### 2.4 URLs Externas Permitidas

Para productos que utilizan enlaces externos (especialmente para planes Initial), solo se permiten los siguientes dominios verificados:

| Categoría | Dominios Permitidos | Notas |
|-----------|---------------------|-------|
| **Video Hosting** | `youtube.com`, `youtu.be`, `vimeo.com`, `player.vimeo.com` | Solo URLs de embed/player |
| **Almacenamiento** | `drive.google.com`, `dropbox.com`, `onedrive.live.com` | Links de descarga directa |
| **Documentos** | `docs.google.com`, `canva.com`, `notion.so` | Solo contenido público/compartido |
| **Audio** | `soundcloud.com`, `spotify.com` | Solo embed/published links |

**Validación técnica**:
- Verificar que la URL pertenece a uno de los dominios permitidos
- Solo se aceptan URLs con protocolo `https://`
- No se permiten URLs con parámetros de autenticación o tokens

---

### 2.5 Validación de Links Externos (Planes Initial)

**Contexto**: Los creadores con Plan Initial solo pueden subir links externos (no archivos). Es un modelo válido de la plataforma, pero requiere controles específicos.

| Control | Descripción | Implementación | Prioridad |
|---------|-------------|----------------|:---------:|
| **Declaración de Autorización** | Checkbox específico para links: "Declaro que tengo autorización del creador del contenido enlazado" | Campo obligatorio en `createProductSchema` cuando `contentType = 'link'` | ALTA |
| **Verificación de Propiedad (YouTube)** | Para videos de YouTube, verificar que el canal del video pertenece al creador (mismo email/owner) | Integración con YouTube Data API | MEDIA |
| **Denuncia de Terceros** | Si el propietario del contenido enlazado reporta → producto marcado para revisión | Sistema de reportes existente | MEDIA |
| **Contenido Mínimo Propio** | Si el producto es 100% links externos → warning en el checkout: "Este producto contiene contenido de terceros" | Validación en checkout | BAJA |

---

## 3. Validación Específica para Ebooks

Los Ebooks tienen alto riesgo de infracción de copyright. Controles adicionales:

| Control | Descripción | Implementación | Prioridad |
|---------|-------------|----------------|:---------:|
| **Declaración de Derechos** | Checkbox obligatorio: "Declaro que poseo los derechos de este ebook" | Campo en `createProductSchema` | ALTA |
| **ISBN (opcional)** | Campo opcional para que el creador declare el ISBN del ebook | Validar formato y verificar coincidencia con título | MEDIA |
| **Fingerprint/Hash** | Generar hash único del PDF para detectar re-uploads de contenido reportado | Guardar hash en DB | MEDIA |
| **Detección de Plagio** | Comparar contenido con base de datos de libros conocidos | Integración con API externa (ej: Copyscape, Grammarly) | ALTA |
| **Preview Obligatorio** | Requerir que el ebook tenga al menos 5-10 páginas como preview visible | Validación en metadata del producto | BAJA |
| **Reporte de Terceros** | Sistema para que autores/editoriales reporten ebooks infractores | Sistema de reportes existente | MEDIA |

---

## 4. Matriz de Validación por Tipo de Producto

| Tipo de Producto | Extensiones Permitidas | Validación de Coherencia AI | Requisito Mínimo |
|------------------|-----------------------|----------------------------|-------------------|
| **Curso** | mp4, webm, pdf, docx, link | Video/Audio coherente con tema | Al menos 1 lección |
| **Ebook** | pdf, epub, mobi | Texto coherente con tema | Archivo PDF/Epub válido |
| **Podcast** | mp3, wav, m4a | Audio coherente con tema | Duración > 1 min |
| **Software** | zip, rar, 7z, exe (solo Pro) | Manual/Readme coherente | Archivo comprimido |
| **Membresía** | Mixto | Coherencia general | Estructura de módulos |

---

## 5. Validación Específica para Cursos

Los cursos tienen riesgo de plagio de contenido educativo (copiar estructura/lecciones de otros cursos). Controles específicos:

| Control | Descripción | Implementación | Prioridad |
|---------|-------------|----------------|:---------:|
| **Declaración de Originalidad** | Checkbox: "Este curso es contenido original creado por mí" | Campo obligatorio en `createProductSchema` | ALTA |
| **Coherencia AI** | Usar AI para verificar que el contenido del video/audio coincide con el título y descripción | `ContentAssistantService` analiza contenido | ALTA |
| **Preview Obligatorio** | Al menos 1 lección gratuita visible (preview) | Validación: minimo 1 lección con `isPreview: true` | ALTA |
| **Estructura Visible** | Mostrar índice de módulos/lecciones en la página del producto | metadata del producto visible en frontend | MEDIA |
| **Denuncia de Plagio** | Sistema para que creadores reporten cursos copiados | Sistema de reportes existente | MEDIA |

---

## 6. Validación Específica para Podcasts

Los podcasts tienen riesgo de música/sonido con copyright y contenido de terceros. Controles específicos:

| Control | Descripción | Implementación | Prioridad |
|---------|-------------|----------------|:---------:|
| **Declaración de Derechos de Audio** | Checkbox: "Declaro que tengo derechos sobre toda la música y audio de este podcast" | Campo obligatorio | ALTA |
| **Detección de Música Conocida** | Comparar audio con base de datos de música protegida | Integración con API (ej: Audible Magic) | MEDIA |
| **Preview Obligatorio** | Al menos 1 episodio gratuito visible | Minimo 1 episodio con `isPreview: true` | ALTA |
| **Metadatos del Episodio** | Requerir título, descripción y duración de cada episodio | Validación en schema de episodio | BAJA |
| **Reporte de Derechos de Autor** | Sistema para reportar contenido con música sin licencia | Sistema de reportes existente | MEDIA |

---

## 7. Validación Específica para Software

El software tiene riesgo de malware y licencias. Controles específicos:

| Control | Descripción | Implementación | Prioridad |
|---------|-------------|----------------|:---------:|
| **Declaración de Licencia** | Checkbox: "Declaro que este software es legítimo y posee la licencia correspondiente" | Campo obligatorio | ALTA |
| **Escaneo de Malware** | Escaneo obligatorio del archivo antes de aceptar | Integración con ClamAV o servicio similar | ALTA |
| **Solo Plan Pro** | Los planes Initial no pueden subir archivos ejecutables | Validación en `checkPlanLimits.middleware.ts` | ✅ Hecho |
| **Verificación de SHA256** | Generar hash del archivo para tracking y seguridad | Guardar hash en DB | MEDIA |
| **README/Documentación** | Requerir archivo de instrucciones (txt/pdf) dentro del zip | Validación en contenido del zip | BAJA |
| **Reporte de Software Dañino** | Sistema para usuarios reporten software malicioso | Sistema de reportes existente | MEDIA |

---

## 8. Validación Específica para Membresías

Las membresías son contenido mixto (múltiples productos). Controles específicos:

| Control | Descripción | Implementación | Prioridad |
|---------|-------------|----------------|:---------:|
| **Declaración de Derechos** | Checkbox: "Declaro que poseo los derechos de todo el contenido incluido en esta membresía" | Campo obligatorio | ALTA |
| **Coherencia General** | Verificar que el contenido general coincide con el tema de la membresía | AI analiza sample del contenido | MEDIA |
| **Contenido Visible** | Lista pública de qué incluye la membresía (módulos/episodios) | Metadata visible en frontend | MEDIA |
| **Verificación de Propiedad** | Verificar que el creador posee los productos incluidos en la membresía | Verificar que los productos relacionados son del mismo creator | ALTA |

---

## 9. Modificaciones a Documentación Legal

Para respaldar estos controles, se deben realizar las siguientes actualizaciones:

### 9.1 Terms of Service (T&C)
- **Sección de Responsabilidades**: Reforzar que el Creador es el único responsable legal del contenido y de poseer los derechos.
- **Cláusula de Moderación**: Especificar que Crema puede eliminar contenido sin previo aviso si se detecta violación de copyright o contenido prohibido.
- **Proceso de Denuncias**: Detallar el proceso de reporte de infracciones.

### 9.2 Privacy Policy
- **Datos de Moderación**: Indicar que el contenido puede ser procesado por servicios de terceros (AI) para fines de moderación y seguridad.
- **Retención de Evidencias**: Guardar logs de archivos eliminados por infracciones para posibles requerimientos legales.

### 9.3 Refund Policy
- **Invalidación por Infracción**: El reembolso es denegado si el producto es eliminado por violar los T&C (ej: copyright).

---

## 10. Validación de Contenido Interactivo

> **Nueva sección para Plataforma de Experiencia**: Con las nuevas herramientas de Book Highlights, Audio Notes y AI Summary, necesitamos validar el contenido que los usuarios generan.
>
> **Nota**: Las features mencionadas (Book Highlights, Audio Notes, AI Summary) están definidas en AI-FEATURES-PRD.md secciones 4.17-4.20. Esta sección provee las validaciones de seguridad necesarias para esas features.

### 10.1 Notas y Highlights del Comprador

| Control | Descripción | Prioridad |
|---------|-------------|:---------:|
| **Longitud de notas** | Limitar caracteres por nota (max 5000) | MEDIA |
| **Contenido prohibido en notas** | Verificar que notas no contengan contenido ilegal | ALTA |
| **Links externos** | Validar URLs en notas (mismo dominio allowlist) | MEDIA |
| **Rate limiting** | Max notas/highlights por minuto por usuario | ALTA |
| **SPAM detection** | Detectar patrones de spam en notas | MEDIA |

### 10.2 AI Summary

| Control | Descripción | Prioridad |
|---------|-------------|:---------:|
| **Calidad del resumen** | Verificar que el resumen tiene mínimo 50 caracteres | BAJA |
| **Timeouts** | Limitar tiempo de generación (max 60s) | ALTA |
| **Costo de credits** | Verificar balance suficiente antes de generar | ALTA |
| **Cache** | Cachear resúmenes por content_hash (24h) | MEDIA |

### 10.3 Audio Notes

| Control | Descripción | Prioridad |
|---------|-------------|:---------:|
| **Sincronización** | Timestamp debe ser válido (0 a duración audio) | ALTA |
| **Longitud de nota** | Max 2000 caracteres por nota | MEDIA |
| **Contenido prohibido** | Moderar notas antes de guardar | ALTA |

---

## 11. Roadmap de Implementación

> **Fecha inicio**: Mayo 2026  
> **Duración**: 12 semanas (3 meses)  
> **Nota**: Todas las tareas de implementación siguen el Estándar de Verificación definido en `docs/project/common/verification-standard.md`

### Fase 1: Blindaje Técnico (Semanas 1-4) [Mayo 2026]

| ID | Task | Estado | Owner | Sprint | Notas |
|----|------|--------|------|--------|-------|
| CS-01 | Implementar bloqueo de ejecutables en `upload.middleware.ts` | ❌ TODO | Backend | Sprint 1 | `ALLOWED_EXTENSIONS` no incluye ejecutables; se requiere block explícito |
| CS-02 | Agregar checkbox de declaración de copyright general | ❌ TODO | Frontend | Sprint 1 | |
| CS-03 | Agregar checkbox específico de "autorización" para links externos | ❌ TODO | Frontend | Sprint 1 | |
| CS-04 | Agregar checkbox de derechos para ebooks | ❌ TODO | Frontend | Sprint 1 | |
| CS-05 | Agregar checkbox de declaración de originalidad para cursos | ❌ TODO | Frontend | Sprint 1 | |
| CS-06 | Agregar checkbox de derechos de audio para podcasts | ❌ TODO | Frontend | Sprint 1 | |
| CS-07 | Agregar declaración de licencia para software | ❌ TODO | Frontend | Sprint 1 | |
| CS-08 | Agregar declaración de derechos para membresías | ❌ TODO | Frontend | Sprint 1 | |
| CS-09 | Implementar validación de tamaño mínimo de archivos | ❌ TODO | Backend | Sprint 2 | |
| CS-10 | Implementar allowlist de dominios permitidos para URLs externas | ❌ TODO | Backend | Sprint 2 | |
| CS-11 | Implementar rate limiting específico para uploads | ✅ HECHO | Backend | Sprint 2 | Rate limit general existe |
| CS-12 | Implementar warning en checkout para productos con links de terceros | ❌ TODO | Frontend | Sprint 2 | |
| CS-13 | Agregar campo ISBN opcional para ebooks | ❌ TODO | Fullstack | Sprint 3 |
| CS-14 | Requerir preview obligatorio (al menos 1 lección/episodio gratuito) | TODO | Backend | Sprint 3 |
| CS-15 | Requerir metadata de episodios para podcasts | TODO | Backend | Sprint 3 |

### Fase 2: Moderación AI (Semanas 5-8) [Junio - Julio 2026]

| ID | Task | Estado | Owner | Sprint |
|----|------|--------|------|--------|
| CS-16 | Integrar API de moderación para contenido prohibido | TODO | Backend | Sprint 4 |
| CS-17 | Implementar validación de coherencia AI para cursos/ebooks/podcasts/membresías | TODO | Backend | Sprint 5 |
| CS-18 | Integrar scanner de malware básico (ClamAV o similar) | TODO | DevOps | Sprint 5 |
| CS-19 | Implementar detección de música protegida para podcasts | TODO | Backend | Sprint 6 |
| CS-20 | Verificar coherencia de estructura de miembros con productos incluidos | TODO | Backend | Sprint 6 |

### Fase 3: Gestión de Copyright (Semanas 9-12) [Agosto - Septiembre 2026]

| ID | Task | Estado | Owner | Sprint |
|----|------|--------|------|--------|
| CS-21 | Implementar sistema de hashing de archivos (fingerprint) | TODO | Backend | Sprint 7 |
| CS-22 | Formalizar el proceso de DMCA takedown | TODO | Legal | Sprint 7 |
| CS-23 | Implementar validación de calidad (resolución/duración) | TODO | Backend | Sprint 8 |
| CS-24 | Integrar servicio de detección de plagio para ebooks | TODO | Backend | Sprint 9 |
| CS-25 | Verificación de propiedad de canales YouTube (para links externos) | TODO | Backend | Sprint 9 |
| CS-26 | Sistema de verificación de SHA256 para software | TODO | Backend | Sprint 10 |
| CS-27 | Integración con sistema de licencias de software | TODO | Backend | Sprint 10 |

> **Leyenda de estados**: `✅ HECHO` | `🟡 PARCIAL` | `❌ TODO` | `🔄 IN PROGRESS` | `⛔ BLOCKED`

---

## 10. Requisitos No Funcionales

### 10.1 Performance y Tiempos de Respuesta

| Operación | Tiempo Objetivo | Tipo |
|-----------|-----------------|------|
| **Validación de extensiones/MIME** | < 100ms | Sincrónico |
| **Validación de coherencia AI** | < 10 segundos | Asincrónico |
| **Upload de archivo** | < 30 segundos (sin AI) | Sincrónico |
| **Malware scanning** | < 60 segundos | Asincrónico |
| **Moderación de contenido AI** | < 15 segundos | Asincrónico |

### 10.2 Timeouts y Handling

| Escenario | Timeout | Manejo |
|-----------|---------|--------|
| Validación de archivo | 5s | Error 400: "Archivo inválido" |
| Upload completo | 30s | Error 413: "Archivo muy grande" |
| Malware scan | 60s | Reintento automático, luego marcar para revisión manual |
| Moderación AI | 15s | Timeout → permitir contenido, marcar para revisión |

### 10.3 Seguridad

#### 10.3.1 Rate Limiting

| Endpoint | Límite | Ventana |
|----------|:------:|---------|
| `/upload/*` | 10 | minuto por usuario |
| `/validate/*` | 20 | minuto por usuario |
| `/moderation/*` | 30 | minuto por usuario |

#### 10.3.2 Validación de Archivos

| Control | Implementación |
|---------|---------------|
| **MIME type verification** | Verificar que el Content-Type coincide con la extensión |
| **Extension allowlist** | Solo extensiones aprobadas por tipo de producto |
| **Filename sanitization** | Remover path traversal, caracteres especiales |
| **Size limits** | Max 100MB por archivo, configurable |
| **Magic bytes** | Verificar header del archivo real |

#### 10.3.3 Malware Protection

| Control | Descripción |
|---------|-------------|
| **ClamAV integration** | Escaneo async de archivos subidos |
| **File type restrictions** | Bloquear ejecutables (.exe, .bat, .sh, .msi) excepto en casos permitidos |
| ** quarantine** | Archivos sospechosos en quarantine para revisión manual |
| **Hash tracking** | SHA256 para detectar re-uploads de archivos maliciosos conocidos |

### 10.4 Escalabilidad

| Aspecto | Requisito |
|--------|-----------|
| **Uploads concurrentes** | Soporte hasta 100 uploads simultáneos |
| **Queue processing** | BullMQ para malware scanning y moderación |
| **Caching** | Redis para resultados de validación (evitar re-validar) |
| **Horizontal scaling** | Stateless, puede escalar con más instancias |

### 10.5 Monitoreo

| Métrica | Descripción | Alerta |
|---------|-------------|--------|
| **Upload success rate** | % de uploads exitosos | < 95% |
| **Validation failures** | Fallos de validación por tipo | > 10% |
| **Malware detected** | Archivos maliciosos encontrados | > 0 |
| **Moderation queue** | Pendientes de revisión | > 100 |

---

## 11. Testing

### 11.1 Unit Tests

| Test Case | Descripción | Mock |
|---------|-------------|-----|
| TC-01 | Allowlist extensiones - extensiones válidas | - |
| TC-02 | Allowlist extensiones - extensión bloqueada | - |
| TC-03 | Validación MIME type coincide con extensión | - |
| TC-04 | Sanitización filename - path traversal | - |
| TC-05 | Límite de tamaño - archivo muy grande | - |
| TC-06 | URL Validator - dominios permitidos | - |
| TC-07 | URL Validator - dominios bloqueados | - |
| TC-08 | URL Validator - URLs con tokens rechazadas | - |
| TC-09 | Content Moderation - contenido permitido | mock LLM |
| TC-10 | Content Moderation - contenido prohibido | mock LLM |

### 11.2 Integration Tests

| Test Case | Descripción |
|---------|-------------|
| IT-01 | Upload exitoso con archivo válido |
| IT-02 | Upload rechazado - extensión bloqueada |
| IT-03 | Upload con URL externa válida |
| IT-04 | Moderation flag → producto pendiente |

### 11.3 Security Tests

| Test Case | Descripción |
|---------|-------------|
| ST-01 | Bloquear todos los tipos executable (.exe, .bat, .sh, .msi, .scr, .pif) |
| ST-02 | Sanitización XSS en filenames |
| ST-03 | Path traversal prevention |
| ST-04 | Rate limiting en upload |

### 11.4 Test Fixtures

```typescript
// src/__tests__/fixtures/content-security.ts
export const validFiles = [
  { name: 'ebook.pdf', mimeType: 'application/pdf', size: 5 * 1024 * 1024 },
  { name: 'video.mp4', mimeType: 'video/mp4', size: 50 * 1024 * 1024 },
  { name: 'audio.mp3', mimeType: 'audio/mpeg', size: 10 * 1024 * 1024 },
];

export const blockedFiles = [
  { name: 'virus.exe', mimeType: 'application/x-msdownload' },
  { name: 'script.bat', mimeType: 'text/plain' },
  { name: 'shell.sh', mimeType: 'application/x-sh' },
];

export const allowedDomains = ['youtube.com', 'vimeo.com', 'drive.google.com'];
export const blockedDomains = ['random-site.com', 'evil-download.net'];
```

### 11.5 Coverage Target

| Tipo | Target |
|------|--------|
| Unit Tests | >= 80% |
| Integration | Core flows |
| Security | All validations |

---

**Documento preparado para revisión técnica y legal.**
