# User Stories + Acceptance Criteria
## Crema - Sistema de Interacción y Analytics (AI Features)

**Versión**: 1.0  
**Fecha**: Marzo 2026  
**Change**: ai-features  
**Estado**: Draft  
**Owner**: Kike García

---

## 1. Sistema de Créditos AI

### US-01: Consultar saldo de créditos

**Como** usuario Pro,  
**quiero** consultar mi saldo de créditos AI,  
**para** saber cuántos credits tengo disponibles.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-01.1 | El usuario puede ver su balance actual de créditos |
| AC-01.2 | Se muestra total purchased y total used |
| AC-01.3 | Se muestra fecha de expiración si aplica |
| AC-01.4 | Si no tiene créditos, muestra 0 |

---

### US-02: Comprar paquete de créditos

**Como** usuario Pro,  
**quiero** comprar un paquete de créditos AI,  
**para** usar funciones de IA.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-02.1 | El usuario ve los 3 paquetes disponibles (Básico, Standard, Pro) |
| AC-02.2 | Al seleccionar paquete, se crea preferencia de pago en MercadoPago |
| AC-02.3 | Al confirmar pago webhook, se acreditan los créditos |
| AC-02.4 | Los créditos vencen a los 12 meses |

---

### US-03: Usar créditos para IA

**Como** usuario Pro,  
**quiero** que se descuente un crédito cada vez que uso IA,  
**para** controlar mi consumo.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-03.1 | Cada consulta al Tutor AI descuenta 1 crédito |
| AC-03.2 | Si no hay créditos suficientes, se rechaza la operación |
| AC-03.3 | Se registra la transacción en el historial |
| AC-03.4 | El usuario puede ver su historial de uso |

---

## 2. Sistema de Q&A

### US-04: Hacer pregunta sobre producto

**Como** comprador registrado,  
**quiero** hacer una pregunta sobre un producto,  
**para** resolver dudas antes de comprar.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-04.1 | El usuario puede hacer una pregunta en la página del producto |
| AC-04.2 | La pregunta se guarda con estado "pending" |
| AC-04.3 | El creador recibe notificación de nueva pregunta |
| AC-04.4 | Las preguntas son visibles para todos los usuarios |

---

### US-05: Responder pregunta

**Como** creador de contenido,  
**quiero** responder las preguntas de los compradores,  
**para** ajudar con información sobre mi producto.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-05.1 | El creador puede responder su propia pregunta |
| AC-05.2 | La respuesta se muestra junto con la pregunta |
| AC-05.3 | Se notifica al usuario que hizo la pregunta |
| AC-05.4 | Solo el creador puede responder |

---

### US-06: Votar pregunta/respuesta

**Como** usuario,  
**quiero** votar preguntas y respuestas útiles,  
**para** destacar el contenido helpful.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-06.1 | El usuario puede upvote/downvote preguntas |
| AC-06.2 | El usuario puede upvote/downvote respuestas |
| AC-06.3 | Un usuario solo puede votar una vez por contenido |
| AC-06.4 | Los votos se actualizan en tiempo real |

---

### US-07: FAQ automático con IA

**Como** creador,  
**quiero** que el sistema genere FAQs automáticamente,  
**para** reducir preguntas repetitivas.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-07.1 | El sistema sugiere FAQs basadas en Q&A del producto |
| AC-07.2 | El creador puede aprobar/rechazar sugerencias |
| AC-07.3 | Las FAQs aprobadas aparecen en la página del producto |
| AC-07.4 | Las FAQs se indexan para búsqueda semántica |

---

## 3. Sistema de Reviews

### US-08: Escribir review

**Como** comprador verificado,  
**quiero** escribir una calificación y reseña de un producto,  
**para** ayudar a otros compradores.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-08.1 | Solo compradores con orden completada pueden hacer review |
| AC-08.2 | El usuario puede rating 1-5 estrellas |
| AC-08.3 | El usuario puede escribir texto (opcional) |
| AC-08.4 | Se muestra "verified purchase" en el review |

---

### US-09: Configurar reviews

**Como** creador,  
**quiero** configurar la visibilidad de reviews en mi producto,  
**para** controlar qué se muestra.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-09.1 | El creador puede habilitar/deshabilitar reviews |
| AC-09.2 | El creador puede establecer mínimo de caracteres |
| AC-09.3 | El creador puede require verified purchase |
| AC-09.4 | El creador puede moderate reviews antes de publicarlas |

---

### US-10: Moderar review

**Como** creador,  
**quiero** moderar los reviews de mis productos,  
**para** mantener la calidad.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-10.1 | El creador puede aprobar un review |
| AC-10.2 | El creador puede rechazar un review |
| AC-10.3 | El creador puede editar el texto del review |
| AC-10.4 | El creador puede eliminar reviews inappropriate |

---

### US-11: Votar review

**Como** usuario,  
**quiero** votar reviews helpful,  
**para** ordenar los más útiles primero.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-11.1 | El usuario puede upvote/downvote reviews |
| AC-11.2 | Los reviews se ordenan por votes + rating |
| AC-11.3 | Un usuario solo puede votar una vez por review |

---

## 4. Sistema de Denuncias

### US-12: Crear denuncia

**Como** usuario,  
**quiero** reportar contenido inappropriate,  
**para** mantener la comunidad segura.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-12.1 | El usuario puede denunciar productos, reviews, preguntas |
| AC-12.2 | El usuario debe seleccionar una razón predefinida |
| AC-12.3 | El usuario debe proporcionar descripción |
| AC-12.4 | El sistema registra: usuario, contenido, fecha, razón |

---

### US-13: Revisar denuncia (Admin)

**Como** administrador,  
**quiero** ver y resolver las denuncias,  
**para** mantener la calidad de la plataforma.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-13.1 | El admin ve lista de denuncias pendientes |
| AC-13.2 | El admin puede ver detalles del contenido denunciado |
| AC-13.3 | El admin puede: aprobar, rechazar, o tomar acción |
| AC-13.4 | Las acciones incluyen: warning, ban, remove content, retain funds |

---

### US-14: Retener fondos por fraude

**Como** administrador,  
**quiero** retener los fondos de un creador bajo investigación,  
**para** proteger a los compradores afectados.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-14.1 | Al aprobar denuncia, el admin puede retener ganancias |
| AC-14.2 | Los fondos se marcan como "on hold" |
| AC-14.3 | El admin puede liberar fondos después de resolución |
| AC-14.4 | El período máximo de retención es 90 días |

---

## 5. Agentes AI

### US-15: Configurar Q&A Agent

**Como** creador,  
**quiero** configurar mi agente de Q&A con IA,  
**para** automatizar respuestas.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-15.1 | El creador puede habilitar/deshabilitar el agente |
| AC-15.2 | El creador puede configurar el tono (formal, casual, etc.) |
| AC-15.3 | El creador puede agregar información adicional de contexto |
| AC-15.4 | El agente usa el contenido del producto como base de conocimiento |

---

### US-16: Chatear con Q&A Agent

**Como** comprador,  
**quiero** chatear con el agente IA sobre un producto,  
**para** obtener respuestas automáticas.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-16.1 | El usuario puede iniciar conversación con el agente |
| AC-16.2 | El agente responde basándose en el contenido del curso |
| AC-16.3 | El agente tiene memoria de la conversación |
| AC-16.4 | Se descuenta 1 crédito por cada mensaje |

---

### US-17: Configurar Tutor AI

**Como** creador,  
**quiero** configurar el Tutor AI de mi producto,  
**para** personalizar la experiencia de aprendizaje.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-17.1 | El creador puede habilitar/deshabilitar Tutor AI |
| AC-17.2 | El creador puede establecer reglas de teaching |
| AC-17.3 | El creador puede definir objetivos del curso |
| AC-17.4 | El Tutor usa embeddings de las lecciones |

---

### US-18: Generar Insights

**Como** creador Pro,  
**quiero** obtener insights sobre mis datos de ventas,  
**para** tomar mejores decisiones.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-18.1 | El usuario puede hacer preguntas en lenguaje natural |
| AC-18.2 | El sistema genera SQL y ejecuta la query |
| AC-18.3 | El sistema devuelve resultados y visualizaciones |
| AC-18.4 | El usuario puede guardar dashboards |

---

## 6. Analytics Dashboard

### US-19: Ver métricas del dashboard

**Como** creador,  
**quiero** ver estadísticas de mis productos,  
**para** entender mi performance.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-19.1 | El creador ve: ventas, revenue, conversiones |
| AC-19.2 | El creador ve: tráfico y fuentes |
| AC-19.3 | El creador ve: engagement (QA, reviews) |
| AC-19.4 | Los datos se actualizan daily |

---

## Resumen de User Stories

| Módulo | Stories | Prioridad |
|--------|---------|-----------|
| Créditos AI | US-01, US-02, US-03 | Alta |
| Q&A | US-04, US-05, US-06, US-07 | Alta |
| Reviews | US-08, US-09, US-10, US-11 | Alta |
| Denuncias | US-12, US-13, US-14 | Alta |
| Agentes AI | US-15, US-16, US-17, US-18 | Media |
| Analytics | US-19 | Media |

---

**Documento basado en**: PRD-Crema-Interaccion-Analytics.md v1.2  
**Próximo paso**: Test Plan + Test Cases
