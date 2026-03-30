# User Stories + Acceptance Criteria
## AI Streaming con SSE - Crema

**Versión**: 1.0  
**Fecha**: Marzo 2026  
**Change**: ai-streaming-sse

---

## 1. Streaming de QA Agent

### US-01: Chat con QA Agent en streaming

**Como** comprador de un producto,  
**quiero** recibir respuestas del QA Agent en tiempo real (token por token),  
**para** tener una experiencia más fluida e interactiva.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-01.1 | El usuario envía un mensaje y ve respuesta progresiva |
| AC-01.2 | El primer token aparece en menos de 1 segundo |
| AC-01.3 | La respuesta se muestra mientras se genera (no toda al final) |
| AC-01.4 | Se deduce 1 crédito al iniciar el chat |
| AC-01.5 | La conversación se guarda en la base de datos |

---

### US-02: Ver indicador de "escribiendo"

**Como** usuario,  
**quiero** ver un indicador de que la IA está escribiendo,  
**para** saber que el sistema está procesando mi solicitud.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-02.1 | Mientras llega el primer token, muestra "Conectando..." o spinner |
| AC-02.2 | Al recibir el primer chunk, cambia a mostrar el texto |
| AC-02.3 | El cursor parpadea al final mientras escribe |

---

## 2. Streaming de Tutor AI

### US-03: Chat con Tutor AI en streaming

**Como** estudiante de un curso,  
**quiero** recibir respuestas del Tutor en tiempo real,  
**para** una experiencia de aprendizaje más dinámica.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-03.1 | El usuario envía mensaje al Tutor y ve respuesta progresiva |
| AC-03.2 | Funciona igual que QA Agent en términos de streaming |
| AC-03.3 | El contexto de lecciones se carga igual que antes |

---

## 3. Streaming de Insights AI

### US-04: Query de Insights en streaming

**Como** creador Pro,  
**quiero** ver los resultados de Insights mientras se generan,  
**para** no esperar a que todo esté listo.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-04.1 | Al hacer una query, ve el SQL generado primero |
| AC-04.2 | Los resultados aparecen en chunks si son muchos |
| AC-04.3 | Se muestra progreso ("3 de 10 resultados") |

---

## 4. Control de Usuario

### US-05: Cancelar stream

**Como** usuario,  
**quiero** poder cancelar una respuesta en progreso,  
**para** si me arrepentí o cambió mi pregunta.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-05.1 | El usuario puede cerrar la conexión en cualquier momento |
| AC-05.2 | Al cancelar, no se cobra el crédito completo (o se reintegra) |
| AC-05.3 | La UI vuelve al estado inicial |

---

### US-06: Reintentar conexión

**Como** usuario,  
**quiero** que si la conexión se corta, pueda reconectar fácilmente,  
**para** no perder mi lugar en la conversación.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-06.1 | Si la conexión se corta, el frontend reintenta automáticamente |
| AC-06.2 | El usuario puede ver un indicador de "Reconectando..." |
| AC-06.3 | Después de 3 intentos fallidos, muestra error |

---

## 5. Fallback

### US-07: Fallback a modo síncrono

**Como** sistema,  
**quiero** que si el streaming falla, el sistema caiga gracefully al modo síncrono,  
**para** que el usuario no quede varado.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-07.1 | Si SSE no está disponible, el frontend usa el endpoint síncrono |
| AC-07.2 | El usuario no nota la diferencia (salvo que no hay streaming) |
| AC-07.3 | Se reporta el error en logs para debugging |

---

## 6. Errores

### US-08: Manejo de errores en streaming

**Como** usuario,  
**quiero** ver un mensaje claro si hay un error,  
**para** saber qué pasó y qué hacer.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-08.1 | Si no hay créditos, muestra "Créditos insuficientes" |
| AC-08.2 | Si el LLM falla, muestra "Error al generar respuesta. Intenta de nuevo" |
| AC-08.3 | El usuario puede reintentar con un click |

---

## 7. Seguridad y Rate Limiting

### US-09: Rate limiting en streams

**Como** sistema,  
**quiero** aplicar rate limiting a los streams,  
**para** prevenir abuso.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-09.1 | El mismo rate limit aplica a streams que a requests normales |
| AC-09.2 | Si se excede, recibe error 429 |

---

### US-10: Autenticación en streams

**Como** sistema,  
**quiero** que los streams requieran autenticación JWT,  
**para** proteger el acceso.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-10.1 | El endpoint de stream requiere JWT válido |
| AC-10.2 | Si el token expira mientras el stream está activo, se corta |
| AC-10.3 | El usuario debe re-autenticarse para nuevo stream |

---

## Resumen de User Stories

| ID | User Story | Prioridad |
|----|------------|-----------|
| US-01 | Chat QA Agent streaming | Alta |
| US-02 | Indicador "escribiendo" | Alta |
| US-03 | Chat Tutor streaming | Alta |
| US-04 | Query Insights streaming | Media |
| US-05 | Cancelar stream | Media |
| US-06 | Reintentar conexión | Media |
| US-07 | Fallback síncrono | Alta |
| US-08 | Manejo de errores | Alta |
| US-09 | Rate limiting | Alta |
| US-10 | Autenticación | Alta |

---

**Documento basado en**: PRD-AI-Streaming-SSE.md v1.0
