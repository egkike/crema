# Product Requirements Document (PRD)
## AI Streaming con Server-Sent Events (SSE) - Crema

**Versión**: 1.0  
**Fecha**: Marzo 2026  
**Estado**: Draft para revisión  
**Owner**: Kike García

---

## 1. Visión General

### 1.1 Objetivo del Documento

Este PRD define los requisitos para implementar **streaming de respuestas en tiempo real** para los agentes AI de Crema (QA Agent, Tutor AI, Insights AI) usando Server-Sent Events (SSE).

### 1.2 Problema Actual

La implementación actual de los agentes AI es **100% síncrona**:

| Problema | Impacto | Métrica |
|----------|---------|---------|
| **Tiempo de espera largo** | Usuario ve spinner sin feedback | 3-10 segundos |
| **Sin "typing" indicator** | No sabe si la IA está procesando | UX deficiente |
| **Respuesta masiva** | Todo aparece de golpe | Sin fluidéz |
| **Timeout risks** | Conexiones largas pueden caer | Inconsistencia |

### 1.3 Solución Propuesta

Implementar **Server-Sent Events (SSE)** para streaming de tokens en tiempo real:

```
┌──────────────┐     SSE Stream      ┌──────────────┐
│   Frontend   │ ◄────────────────── │    Backend   │
│              │    token1: "Hola"   │              │
│  [typing...]  │    token2: " soy"   │   LLM API    │
│  Hola soy    │    token3: " tu"    │  (streaming) │
│  soy tu...   │    token4: " Tuto"  │              │
└──────────────┘                     └──────────────┘
```

---

## 2. Análisis de Alternativas

### 2.1 Opciones Evaluadas

| Tecnología | Complejidad | Latencia | Bidireccional | Recomendado |
|------------|-------------|----------|---------------|-------------|
| **Server-Sent Events (SSE)** | Baja | Muy baja | No | ✅ SELECCIONADO |
| WebSockets | Alta | Baja | Sí | ❌ Overkill |
| Polling | Muy baja | Alta | No | ❌ Ineficiente |
| WebRTC | Muy alta | Baja | Sí | ❌ Overkill |

### 2.2 Justificación de SSE

| Aspecto | Detalle |
|---------|---------|
| **Simplicidad** | No requiere librería cliente adicional |
| **Nativo en HTTP** | Funciona con fetch/EventSource |
| **Unidireccional** | Perfecto para server→client (chat) |
| **Reconexión automática** | Built-in si se corta |
| **Compatible con proxies** | Funciona bien con nginx |
| **Costo** | No requiere infraestructura adicional |

---

## 3. Requisitos Funcionales

### 3.1 Streaming de QA Agent

#### RF-01: Chat streaming con QA Agent
- **Descripción**: El usuario puede recibir respuestas del QA Agent en streaming
- **Prioridad**: Alta

**Detalles**:
- Endpoint: `POST /api/ai/agents/qa/chat/stream`
- Formato: `text/event-stream`
- Eventos: `chunk`, `done`, `error`
- El primer chunk debe tardar < 1s (para percepción de velocidad)

---

### 3.2 Streaming de Tutor AI

#### RF-02: Chat streaming con Tutor AI
- **Descripción**: El usuario puede recibir respuestas del Tutor en streaming
- **Prioridad**: Alta

**Detalles**:
- Endpoint: `POST /api/ai/products/:id/tutor/chat/stream`
- Mismos eventos que RF-01
- Considerar contexto de lecciones más largo

---

### 3.3 Streaming de Insights AI

#### RF-03: Query streaming con Insights AI
- **Descripción**: El usuario puede ver resultados de insights en streaming
- **Prioridad**: Media

**Detalles**:
- Endpoint: `POST /api/ai/insights/query/stream`
- Eventos: `sql_generated`, `chunk`, `done`, `error`

---

### 3.4 Control de Client

#### RF-04: Cancelar stream
- **Descripción**: El usuario puede cancelar una respuesta en progreso
- **Prioridad**: Media

**Detalles**:
- Client envía `EventSource.close()` o AbortController
- Server debe detectar y detener generación de LLM

---

### 3.5 Fallback

#### RF-05: Fallback a modo síncrono
- **Descripción**: Si SSE falla, el sistema debe caer al modo síncrono gracefully
- **Prioridad**: Alta

**Detalles**:
- Mantener endpoints síncronos existentes
- Frontend detecta y usa streaming solo si está disponible

---

## 4. Requisitos No Funcionales

### 4.1 Rendimiento

| Métrica | Target | Notas |
|---------|--------|-------|
| **Primer token latency** | < 1 segundo | Percepción de velocidad |
| **Tokens por segundo** | > 20 tps | Depende del LLM |
| **Tiempo total** | Similar o mejor que síncrono | - |
| **Timeout de conexión** | 60 segundos | Límite razonable |

### 4.2 Seguridad

| Requisito | Descripción |
|-----------|-------------|
| **RNF-01** | Autenticación JWT debe funcionar con streams |
| **RNF-02** | Rate limiting debe aplicar a streams |
| **RNF-03** | Validación de credits antes de iniciar stream |
| **RNF-04** | Abortar generación si credits se agotan |

### 4.3 Confiabilidad

| Requisito | Descripción |
|-----------|-------------|
| **RNF-05** | Reintento automático de conexión si se corta |
| **RNF-06** | Logging de streams iniciados y completados |
| **RNF-07** | Manejo graceful si LLM falla a mitad de stream |

---

## 5. Diseño de API

### 5.1 Nuevo Endpoint: QA Agent Stream

```
POST /api/ai/agents/qa/chat/stream
Headers:
  Authorization: Bearer <token>
  Accept: text/event-stream

Body:
{
  "product_id": "uuid",
  "message": "string"
}

Response (SSE):
event: start
data: {"conversationId": "uuid", "creditsUsed": 1}

event: chunk
data: {"content": "Hola", "done": false}

event: chunk  
data: {"content": " soy tu", "done": false}

event: done
data: {"content": " completo", "done": true, "totalTokens": 150}
```

### 5.2 Nuevo Endpoint: Tutor Stream

```
POST /api/ai/products/:productId/tutor/chat/stream
Headers:
  Authorization: Bearer <token>
  Accept: text/event-stream

Body:
{
  "message": "string"
}
```

### 5.3 Respuestas de Error

```
event: error
data: {"code": "INSUFFICIENT_CREDITS", "message": "Créditos insuficientes"}

event: error
data: {"code": "LLM_ERROR", "message": "Error al generar respuesta"}
```

---

## 6. Arquitectura

### 6.1 Flujo de Datos

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend  │     │   Backend   │     │  LLM API    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                    │                    │
       │ POST /chat/stream  │                    │
       │───────────────────>│                    │
       │                    │                    │
       │              Verificar credits         │
       │              Abonar costo              │
       │                    │                    │
       │                    │ POST /chat (stream)│
       │                    │───────────────────>│
       │                    │                    │
       │    SSE Stream      │<──────────────────│
       │<──────────────────│  chunk1: "Hola"   │
       │  event: chunk      │                    │
       │                    │  chunk2: " soy"   │
       │<──────────────────│                    │
       │  event: chunk      │                    │
       │                    │                    │
       │              (continúa hasta done)       │
       │                    │                    │
       │  event: done       │                    │
       │<──────────────────│                    │
```

### 6.2 Componentes a Modificar

| Archivo | Cambio |
|---------|--------|
| `llm.service.ts` | Agregar método `chatStream()` con streaming |
| `qaAgent.service.ts` | Agregar método `chatStream()` |
| `tutor.service.ts` | Agregar método `chatStream()` |
| `ai.routes.ts` | Agregar endpoints `/stream` |
| `credits.service.ts` | Abonar credits al iniciar, no al final |

### 6.3 Manejo de Credits

**Problema**: Credits se usan al inicio del stream, pero no sabemos cuántos tokens se usarán.

**Solución**:
1. **Pre-authorization**: Usar costo estimado (ej: 10 credits) al iniciar
2. **Settlement**: Ajustar al final (devolver excedente o cobrar diferencia)
3. **Simplificado** (recomendado): Cobrar 1 credit por mensaje (como actual), sin ajustar

---

## 7. Cambios en Frontend

### 7.1 Uso de SSE en Frontend

```typescript
// Ejemplo de consumo de stream
const response = await fetch('/api/ai/agents/qa/chat/stream', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'text/event-stream'
  },
  body: JSON.stringify({ product_id, message })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value);
  // Parsear eventos SSE y renderizar
}
```

### 7.2 UI/UX Esperada

| Estado | UI |
|--------|-----|
| **Iniciando** | "Conectando..." (spinner) |
| **Recibiendo** | Texto apareciendo token por token |
| **Completado** | Respuesta completa, cursor parpadeando |
| **Error** | Mensaje de error, opción de reintentar |

---

## 8. Modelo de Datos

### 8.1 Tablas Existentes

**No se requieren cambios en tablas**. El streaming no modifica el modelo de datos.

### 8.2 Cache en Memoria (Opcional)

Si se implementa caché de conversaciones para no regenerar contexto:

```typescript
// Memory cache for active streams
interface ActiveStream {
  conversationId: string;
  abortController: AbortController;
  creditsUsed: number;
  startedAt: Date;
}
```

---

## 9. Testing

### 9.1 Tests Unitarios

| Test | Descripción |
|------|-------------|
| LLM stream | Verificar que streaming funciona con cada provider |
| Credit deduction | Verificar que credits se usan correctamente |
| Cancel | Verificar que abortController funciona |

### 9.2 Tests de Integración

| Test | Descripción |
|------|-------------|
| Full stream | Usuario → API → LLM → SSE → Frontend |
| Reconnection | Simular corte de conexión |
| Error mid-stream | LLM falla a mitad de respuesta |

### 9.3 Manual Testing

| Test | Descripción |
|------|-------------|
| UX real | Probar con chat real en el browser |
| Mobile | Verificar que funciona en móvil |
| Slow network | Simular conexión lenta |

---

## 10. Estimación de Trabajo

| Fase | Tarea | Estimación |
|------|-------|------------|
| 1 | Modificar LLM Service para streaming | 2 horas |
| 2 | Modificar QA Agent para streaming | 2 horas |
| 3 | Modificar Tutor para streaming | 1 hora |
| 4 | Agregar routes SSE | 1 hora |
| 5 | Frontend: componente de streaming | 3 horas |
| 6 | Testing y fixes | 2 horas |
| **Total** | | **11 horas** |

---

## 11. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| LLM no soporta streaming | Baja | Alto | Verificar providers antes |
| SSE no funciona en algún browser | Baja | Medio | Polyfill o fallback |
| Credits se agotan a mitad | Media | Medio | Pre-authorization |
| Timeout de nginx/proxy | Media | Alto | Configurar timeout 60s+ |
| Memory leaks por streams abiertos | Media | Medio | Cleanup de abort controllers |

---

## 12. Plan de Implementación

### Semana 1: Backend
- [ ] Modificar `llm.service.ts` - Agregar `chatStream()`
- [ ] Modificar `qaAgent.service.ts` - Agregar `chatStream()`
- [ ] Modificar `tutor.service.ts` - Agregar `chatStream()`
- [ ] Crear nuevos endpoints SSE en `ai.routes.ts`
- [ ] Tests unitarios

### Semana 2: Frontend + Testing
- [ ] Crear componente de streaming (React/Astro)
- [ ] Integrar con chat UI existente
- [ ] Testing E2E
- [ ] Manual testing

---

## 13. Métricas de Éxito

El feature será exitoso si:

1. ✅ Primer token aparece en < 1 segundo
2. ✅ Streaming es perceptible por el usuario (ve respuesta progresiva)
3. ✅ No hay increase en tiempo total de respuesta
4. ✅ Fallback síncrono funciona si streaming falla
5. ✅ Rate limiting aplica correctamente
6. ✅ Credits se deducen correctamente

---

## 14. Documentos Relacionados

- PRD-Crema-Interaccion-Analytics.md (features AI existentes)
- AI Credits System (credits.service.ts)
- LLM Service (llm.service.ts)

---

**Documento preparado**: Marzo 2026  
**Versión**: 1.0  
**Próximo paso**: User Stories + Acceptance Criteria
