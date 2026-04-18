# Product Requirements Document (PRD)
## Crema - Content Security & Upload Validation

**Versión**: 1.0  
**Fecha**: Abril 2026  
**Estado**: Draft para revisión  
**Owner**: Kike García

---

## 1. Resumen Ejecutivo

### 1.1 Visión
Establecer un marco robusto de validaciones y controles para todo el contenido subido a la plataforma Crema, asegurando la calidad, legalidad y seguridad del ecosistema. El objetivo es evitar la subida de contenido malicioso, ilegal, prohibido o que infrinja derechos de autor, manteniendo una experiencia de usuario coherente.

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
| **Allowlist de Extensiones** | Solo permitir extensiones aprobadas (pdf, mp4, etc.) | `upload.middleware.ts` | ✅ Hecho |
| **Validación de MIME Types** | Verificar que el MIME type coincida con la extensión | `upload.middleware.ts` | ✅ Hecho |
| **Sanitización de Filenames** | Remover caracteres peligrosos y prevenir path traversal | `upload.middleware.ts` | ✅ Hecho |
| **Límite de Tamaño Global** | Máximo 100MB por archivo (configurable) | `upload.middleware.ts` | ✅ Hecho |
| **Malware Scanning** | Escaneo de archivos subidos contra firmas de virus | Integración con ClamAV o servicio similar | ALTA |
| **Bloqueo de Ejecutables** | Prohibir estrictamente `.exe`, `.bat`, `.sh`, `.msi` | Filtro en `upload.middleware.ts` | ALTA |
| **Validación de Tamaño Mínimo** | Evitar archivos vacíos o corruptos (ej: PDF < 1KB) | Validación en `product.controller.ts` | BAJA |
| **Quality Checks** | Verificar resolución mínima de video/imagen y duración | Análisis de metadata en `content-reader.service.ts` | BAJA |
| **Validación de URLs Externas** | Solo permitir dominios seguros y conocidos (YouTube, Vimeo, etc.) | Allowlist de dominios en `products.schema.ts` | ALTA |
| **Rate Limiting por Upload** | Limitar cantidad de uploads por usuario en ventana de tiempo | Middleware de rate limiting especializado | MEDIA |

---

### 2.2 Validación de Coherencia y Calidad (Capa AI)

| Control | Descripción | Lógica de Validación | Prioridad |
|---------|-------------|----------------------|:---------:|
| **Coherencia de Contenido** | Verificar que el contenido coincide con el tipo de producto | Usar `ContentAssistantService` para resumir contenido y compararlo con el título/descripción del producto | ALTA |
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

## 10. Roadmap de Implementación

### Fase 1: Blindaje Técnico (Corto Plazo)
- [ ] Implementar bloqueo de ejecutables en `upload.middleware.ts`
- [ ] Agregar checkbox de declaración de copyright general en frontend/backend
- [ ] Agregar checkbox específico de "autorización" cuando el contenido es un link externo
- [ ] Agregar checkbox específico para ebooks: "Declaro que poseo los derechos de este ebook"
- [ ] Agregar checkbox de declaración de originalidad para cursos
- [ ] Agregar checkbox de derechos de audio para podcasts
- [ ] Agregar declaración de licencia para software
- [ ] Agregar declaración de derechos para membresías
- [ ] Implementar validación de tamaño mínimo de archivos
- [ ] Implementar allowlist de dominios permitidos para URLs externas
- [ ] Implementar rate limiting específico para uploads
- [ ] Implementar warning en checkout para productos 100% con links de terceros
- [ ] Agregar campo ISBN opcional para ebooks
- [ ] Requerir preview obligatorio (al menos 1 lección/episodio gratuito)
- [ ] Requerir metadata de episodios para podcasts
- [ ] Agregar campo ISBN opcional para ebooks

### Fase 2: Moderación AI (Medio Plazo)
- [ ] Integrar API de moderación para contenido prohibido
- [ ] Implementar validación de coherencia (Content Assistant) para cursos, ebooks, podcasts, membresías
- [ ] Integrar scanner de malware básico
- [ ] Implementar detección de música protegida para podcasts (Audible Magic o similar)
- [ ] Verificar coherencia de estructura de membresías con productos incluidos

### Fase 3: Gestión de Copyright (Largo Plazo)
- [ ] Implementar sistema de hashing de archivos (fingerprint)
- [ ] Formalizar el proceso de DMCA takedown
- [ ] Implementar validación de calidad (resolución/duración)
- [ ] Integrar servicio de detección de plagio para ebooks (Copyscape o similar)
- [ ] Verificación de propiedad de canales YouTube (para links externos)
- [ ] Sistema de verificación de SHA256 para software
- [ ] Integración con sistema de licencias de software

---

**Documento preparado para revisión técnica y legal.**
