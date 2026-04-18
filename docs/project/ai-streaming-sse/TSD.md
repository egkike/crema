# Technical Specification Document (TSD)
## AI Streaming con Server-Sent Events (SSE) - Crema

**Versión**: 1.0  
**Fecha**: Marzo 2026  
**Change**: ai-streaming-sse

---

## 1. Arquitectura Técnica

### 1.1 Visión General

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ARQUITECTURA SSE                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐     ┌──────────────┐     ┌────────────────────────┐  │
│  │   Frontend   │     │   Express    │     │      LLM Provider      │  │
│  │              │     │   Backend     │     │  (OpenAI/Ollama/etc)   │  │
│  │  EventSource │────►│              │────►│                        │  │
│  │  o fetch +   │     │  /stream     │     │  Response (stream: true)│  │
│  │  Readable    │     │  endpoint    │     │                        │  │
│  │  Stream      │◄────│              │◄────│                        │  │
│  └──────────────┘     └──────────────┘     └────────────────────────┘  │
│         │                     │                      │                │
│         │                     │                      │                │
│         │            ┌────────┴────────┐              │                │
│         │            │   Abort        │              │                │
│         │            │ Controller      │              │                │
│         │            │ (cancellation) │              │                │
│         │            └─────────────────┘              │                │
│         │                                                  │                │
│  ┌──────┴──────┐                                         │                │
│  │   React/    │                                         │                │
│  │   Astro     │◄────────────────────────────────────────┘                │
│  │  Component  │                                                          │
│  └────────────┘                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Stack Tecnológico

| Componente | Tecnología | Notas |
|------------|------------|-------|
| **Backend** | Express + Node.js | Usa `Response` object directamente |
| **Streaming** | Native `ReadableStream` | API nativa de Node.js |
| **LLM Providers** | OpenAI, Ollama, Anthropic, Gemini | Todos soportan streaming |
| **Frontend** | React/Astro | Fetch API + ReadableStream |
| **Auth** | JWT (existing) | Sin cambios necesarios |

---

## 2. Implementación del LLM Service

### 2.1 Nuevo Método: chatStream()

```typescript
// backend/src/services/ai/llm.service.ts

export interface ChatStreamOptions {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal; // Para cancelación
}

export class LLMService {
  // ... existing methods ...

  /**
   * Chat with streaming response
   */
  async chatStream(
    options: ChatStreamOptions
  ): Promise<{ content: string; usage?: LLMUsage }> {
    const { messages, onChunk, signal, ...requestOptions } = options;

    switch (this.provider) {
      case 'openai':
        return this.openAIStream({ ...requestOptions, messages, onChunk, signal });
      case 'ollama':
        return this.ollamaStream({ ...requestOptions, messages, onChunk, signal });
      case 'anthropic':
        return this.anthropicStream({ ...requestOptions, messages, onChunk, signal });
      case 'gemini':
        return this.geminiStream({ ...requestOptions, messages, onChunk, signal });
      default:
        throw new Error(`Streaming not supported for provider: ${this.provider}`);
    }
  }
}
```

### 2.2 OpenAI Streaming

```typescript
// backend/src/services/ai/llm.service.ts (continuación)

private async openAIStream(options: {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<{ content: string; usage?: LLMUsage }> {
  const apiKey = config.ai.openaiApiKey;
  const model = options.model || OPENAI_MODEL;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 500,
      stream: true, // ← IMPORTANTE: streaming habilitado
    }),
    signal: options.signal, // Para cancelación
  });

  if (!response.ok) {
    throw new Error(`OpenAI stream error: ${response.status}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  // Procesar stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          
          if (delta) {
            fullContent += delta;
            options.onChunk?.(delta);
          }
          
          // Track usage
          if (parsed.usage) {
            usage = {
              promptTokens: parsed.usage.prompt_tokens,
              completionTokens: parsed.usage.completion_tokens,
              totalTokens: parsed.usage.total_tokens,
            };
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { content: fullContent, usage };
}
```

### 2.3 Ollama Streaming

```typescript
private async ollamaStream(options: {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<{ content: string }> {
  const model = options.model || OLLAMA_MODEL;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      stream: true, // ← IMPORTANTE
    }),
    signal: options.signal,
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          const content = data.message?.content;
          
          if (content) {
            fullContent += content;
            options.onChunk?.(content);
          }
        } catch {
          // Skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { content: fullContent };
}
```

---

## 3. Implementación del QA Agent Service

### 3.1 Nuevo Método: chatStream()

```typescript
// backend/src/services/ai/agents.service.ts

export const qaAgentService = {
  /**
   * Chat with QA Agent using streaming
   */
  async chatStream(
    productId: string,
    userId: string,
    message: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<{ conversationId: string; content: string }> {
    // 1. Get config
    const config = await this.getConfig(productId);
    if (!config || !config.is_enabled) {
      throw new AppError('QA agent no está habilitado', 400);
    }

    // 2. Check and deduct credits (BEFORE starting)
    const cost = aiCreditService.getOperationCost('search');
    const credits = await aiCreditService.getBalance(userId);
    if (!credits || credits.balance < cost) {
      throw new AppError('Créditos insuficientes', 402);
    }

    // 3. Deduct credits immediately
    await aiCreditService.useCredits(userId, cost, `QA Agent stream`);

    // 4. Get or create conversation
    let conversationId: string;
    const conversations = await this.getUserConversations(userId, 'qa', 1);
    const activeConv = conversations.find(c => c.status === 'active' && c.product_id === productId);
    
    if (activeConv) {
      conversationId = activeConv.id;
    } else {
      const conv = await this.createConversation('qa', productId, userId, { productId });
      conversationId = conv.id;
    }

    // 5. Save user message
    await this.addMessage(conversationId, 'user', message);

    // 6. Retrieve context
    let context = '';
    if (config.use_memory) {
      const embeddings = await pool.query(
        `SELECT content FROM "${schema}".ai_embeddings 
         WHERE product_id = $1 AND source_type IN ('lesson', 'faq')
         ORDER BY created_at DESC LIMIT 5`,
        [productId]
      );
      context += 'Información del producto:\n' + embeddings.rows.map(r => r.content).join('\n\n');
    }

    if (config.use_faqs) {
      const faqs = await pool.query(
        `SELECT question, answer FROM "${schema}".product_faqs 
         WHERE product_id = $1 AND is_active = true
         ORDER BY sort_order LIMIT 10`,
        [productId]
      );
      context += '\n\nFAQs:\n' + faqs.rows.map(f => `P: ${f.question}\nR: ${f.answer}`).join('\n\n');
    }

    // 7. Build messages
    const systemPrompt = config.system_prompt || DEFAULT_QA_SYSTEM_PROMPT;
    const messages = llmService.buildPrompt(systemPrompt, context, message);

    // 8. Call LLM with streaming
    let fullResponse = '';
    try {
      await llmService.chatStream({
        messages,
        temperature: config.temperature,
        maxTokens: config.max_tokens,
        onChunk: (chunk) => {
          fullResponse += chunk;
          onChunk(chunk);
        },
        signal,
      });
    } catch (error: unknown) {
      if (error.name === 'AbortError') {
        // User cancelled - save partial response
        logger.info({ conversationId, partialLength: fullResponse.length }, 'Stream cancelled by user');
      } else {
        throw error;
      }
    }

    // 9. Save assistant message (or partial)
    await this.addMessage(conversationId, 'assistant', fullResponse, message.length / 4);

    return { conversationId, content: fullResponse };
  },
};
```

---

## 4. API Routes con SSE

### 4.1 Endpoint SSE en Express

```typescript
// backend/src/routes/ai.routes.ts

import { Response } from 'express';

/**
 * POST /api/ai/agents/qa/chat/stream
 * SSE streaming for QA Agent
 */
router.post(
  '/agents/qa/chat/stream',
  jwtAuthMiddleware,
  aiChatLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { product_id, message } = req.body;

    if (!product_id || !message) {
      res.status(400).json({ error: 'product_id and message are required' });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Create AbortController for cancellation
    const abortController = new AbortController();
    
    // Clean up on client disconnect
    req.on('close', () => {
      abortController.abort();
    });

    try {
      // Send start event
      sendSSE(res, 'start', { creditsUsed: 1 });

      // Stream response
      await qaAgentService.chatStream(
        productId,
        userId,
        message,
        // onChunk callback
        (chunk) => {
          sendSSE(res, 'chunk', { content: chunk, done: false });
        },
        abortController.signal
      );

      // Send done event
      sendSSE(res, 'done', { done: true });

    } catch (error: unknown) {
      logger.error({ error: error.message }, 'SSE stream error');

      // Handle specific errors
      if (error.message.includes('Créditos insuficientes')) {
        sendSSE(res, 'error', { code: 'INSUFFICIENT_CREDITS', message: error.message });
      } else if (error.name === 'AbortError') {
        sendSSE(res, 'done', { done: true, cancelled: true });
      } else {
        sendSSE(res, 'error', { code: 'LLM_ERROR', message: 'Error al generar respuesta' });
      }
    } finally {
      res.end();
    }
  }
);

/**
 * Helper function to send SSE events
 */
function sendSSE(res: Response, event: string, data: Record<string, unknown>) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
```

---

## 5. Frontend Implementation

### 5.1 Hook de Streaming

```typescript
// frontend/src/hooks/useAIStream.ts

import { useState, useCallback, useRef } from 'react';

interface UseAIStreamOptions {
  endpoint: string;
  onChunk?: (chunk: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: string) => void;
}

export function useAIStream(options: UseAIStreamOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (productId: string, message: string) => {
    // Reset state
    setResponse('');
    setError(null);
    setIsStreaming(true);

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ product_id: productId, message }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          const data = line.slice(6);
          
          try {
            const parsed = JSON.parse(data);
            
            // Handle events
            switch (parsed.done) {
              case false:
                // Chunk event
                fullResponse += parsed.content || '';
                setResponse(fullResponse);
                options.onChunk?.(parsed.content || '');
                break;
              
              case true:
                // Done event
                if (parsed.cancelled) {
                  // Stream was cancelled
                }
                options.onComplete?.(fullResponse);
                break;
            }
            
            // Error event
            if (parsed.code) {
              throw new Error(parsed.message);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Cancelled by user - not an error
        options.onComplete?.(response);
      } else {
        setError(err.message);
        options.onError?.(err.message);
      }
    } finally {
      setIsStreaming(false);
    }
  }, [options]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return {
    sendMessage,
    cancel,
    response,
    isStreaming,
    error,
  };
}
```

### 5.2 Componente de Chat

```tsx
// frontend/src/components/AIChat.tsx

import { useAIStream } from '../hooks/useAIStream';

export function AIChat({ productId }: { productId: string }) {
  const [message, setMessage] = useState('');
  
  const { sendMessage, cancel, response, isStreaming, error } = useAIStream({
    endpoint: '/api/ai/agents/qa/chat/stream',
    onChunk: (chunk) => {
      // Scroll to bottom as response comes in
      scrollToBottom();
    },
  });

  const handleSend = async () => {
    if (!message.trim() || isStreaming) return;
    await sendMessage(productId, message);
    setMessage('');
  };

  return (
    <div className="chat-container">
      {/* Messages */}
      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        
        {/* Streaming response */}
        {isStreaming && (
          <div className="message assistant streaming">
            {response}
            <span className="cursor">|</span>
          </div>
        )}
        
        {/* Error */}
        {error && (
          <div className="error">{error}</div>
        )}
      </div>

      {/* Input */}
      <div className="input-area">
        {isStreaming ? (
          <button onClick={cancel} className="cancel-btn">
            Cancelar
          </button>
        ) : (
          <>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Escribe tu pregunta..."
            />
            <button onClick={handleSend}>Enviar</button>
          </>
        )}
      </div>
    </div>
  );
}
```

---

## 6. Configuración de Infraestructura

### 6.1 Nginx Configuration

```nginx
# nginx.conf or site config

# SSE endpoint - disable buffering
location /api/ai/agents/qa/chat/stream {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    
    # Disable buffering for SSE
    proxy_buffering off;
    proxy_cache off;
    
    # Increase timeouts
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
    
    # Required for SSE
    proxy_set_header X-Accel-Buffering no;
}

location /api/ai/products/:productId/tutor/chat/stream {
    # Same config as above
}
```

### 6.2 Environment Variables

No se requieren nuevas variables de entorno. La configuración existente de LLM es suficiente.

### 6.3 Rate Limiting

El rate limiting existente aplica a los endpoints de streaming. Configuración en `ai-rate-limit.middleware.ts`:

```typescript
export const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.',
  standardHeaders: true,
  legacyHeaders: false,
});
```

---

## 7. Manejo de Errores

### 7.1 Tipos de Errores

| Código | Descripción | Acción del Frontend |
|--------|-------------|---------------------|
| `INSUFFICIENT_CREDITS` | No hay créditos | Mostrar modal de compra |
| `LLM_ERROR` | Error del LLM | Mostrar retry button |
| `STREAM_CANCELLED` | Usuario canceló | Limpiar estado |
| `TIMEOUT` | Timeout de conexión | Auto-retry con backoff |
| `AUTH_ERROR` | Token expirado | Redirect a login |

### 7.2 Retry Logic

```typescript
// Frontend retry logic
async function withRetry(fn: () => Promise<void>, maxRetries = 3) {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fn();
      return;
    } catch (error: unknown) {
      lastError = error;
      
      // Wait with exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
  
  throw lastError;
}
```

---

## 8. Logging y Monitoreo

### 8.1 Logs del Backend

```typescript
// Agregar logs específicos para SSE

logger.info({
  event: 'sse_stream_start',
  userId,
  productId,
  endpoint: '/agents/qa/chat/stream',
}, 'SSE stream started');

logger.info({
  event: 'sse_stream_complete',
  userId,
  productId,
  duration: Date.now() - startTime,
  responseLength: fullResponse.length,
}, 'SSE stream completed');

logger.warn({
  event: 'sse_cancelled',
  userId,
  productId,
  partialLength: fullResponse.length,
}, 'SSE stream cancelled by user');
```

### 8.2 Métricas a Monitorear

| Métrica | Target | Alerta si |
|---------|--------|-----------|
| First token latency | < 1s | > 2s |
| Stream duration | - | > 60s |
| Error rate | < 5% | > 10% |
| Concurrent streams | < 100 | > 200 |

---

## 9. Testing Strategy

### 9.1 Unit Tests

```typescript
// test/llm.service.test.ts

describe('LLMService.chatStream', () => {
  it('should stream tokens from OpenAI', async () => {
    const chunks: string[] = [];
    
    await llmService.chatStream({
      messages: [{ role: 'user', content: 'Hola' }],
      onChunk: (chunk) => chunks.push(chunk),
    });
    
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should support cancellation', async () => {
    const controller = new AbortController();
    
    // Cancel immediately
    setTimeout(() => controller.abort(), 10);
    
    await expect(
      llmService.chatStream({
        messages: [{ role: 'user', content: 'Large response...' }],
        signal: controller.signal,
      })
    ).rejects.toThrow('abort');
  });
});
```

---

## 10. Anexo: Streaming para Todos los Providers

### 10.1 Anthropic (Claude) Streaming

Anthropic usa un formato diferente - requiere el header `x-stream: true` y la respuesta es `text/event-stream`:

```typescript
// backend/src/services/ai/llm.service.ts

private async anthropicStream(options: {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<{ content: string }> {
  const apiKey = config.ai.anthropicApiKey;
  const model = options.model || ANTHROPIC_MODEL;

  // Convertir mensajes al formato de Anthropic
  const anthropicMessages = options.messages
    .filter(msg => msg.role !== 'system')
    .map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    }));

  const systemPrompt = options.messages.find(m => m.role === 'system')?.content || '';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'x-stream': 'true', // ← IMPORTANTE: habilita streaming
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature ?? 0.7,
      system: systemPrompt,
      messages: anthropicMessages,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic stream error: ${response.status} - ${error}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  // Procesar SSE stream de Anthropic
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let usage = { promptTokens: 0, completionTokens: 0 };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6);
        
        try {
          const parsed = JSON.parse(data);
          
          // Anthropic envía "message_delta" con el contenido
          if (parsed.type === 'content_block_delta') {
            const text = parsed.delta?.text;
            if (text) {
              fullContent += text;
              options.onChunk?.(text);
            }
          }
          
          // Track usage cuando termina
          if (parsed.type === 'message_delta') {
            if (parsed.usage) {
              usage = {
                promptTokens: parsed.usage.input_tokens,
                completionTokens: parsed.usage.output_tokens,
              };
            }
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { content: fullContent };
}
```

**Diferencias clave con OpenAI:**
| Aspecto | OpenAI | Anthropic |
|---------|--------|-----------|
| Header | `stream: true` en body | `x-stream: true` en headers |
| Formato response | JSON lines | SSE con `type: content_block_delta` |
| Contenido en | `delta.content` | `delta.text` |
| Fin del stream | `data: [DONE]` | `type: message_delta` |

---

### 10.2 Google Gemini Streaming

Gemini usa `server-sent events` directamente:

```typescript
// backend/src/services/ai/llm.service.ts

private async geminiStream(options: {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<{ content: string }> {
  const apiKey = config.ai.geminiApiKey;
  const model = options.model || GEMINI_MODEL;

  // Convertir mensajes al formato de Gemini
  const contents = options.messages
    .filter(msg => msg.role !== 'system')
    .map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

  const systemInstruction = options.messages.find(m => m.role === 'system')?.content || '';

  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:streamGenerateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 1024,
        responseModalities: 'text', // Para streaming
      },
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini stream error: ${response.status} - ${error}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6);
        
        try {
          const parsed = JSON.parse(data);
          
          // Gemini envía candidatos con partes
          const candidate = parsed?.candidates?.[0];
          const part = candidate?.content?.parts?.[0];
          const text = part?.text;
          
          if (text) {
            fullContent += text;
            options.onChunk?.(text);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { content: fullContent };
}
```

**Diferencias clave:**
| Aspecto | OpenAI | Gemini |
|---------|--------|--------|
| API | `/v1/chat/completions` | `/v1beta/{model}:streamGenerateContent` |
| Formato | JSON lines | JSON con candidatos |
| Contenido en | `choices[0].delta.content` | `candidates[0].content.parts[0].text` |

---

### 10.3 Fallback entre Providers

Si un provider no soporta streaming, implementar fallback automático:

```typescript
// En LLMService.chatStream()

async chatStream(options: ChatStreamOptions): Promise<{ content: string; usage?: LLMUsage }> {
  try {
    switch (this.provider) {
      case 'openai':
        return await this.openAIStream(options);
      case 'ollama':
        return await this.ollamaStream(options);
      case 'anthropic':
        return await this.anthropicStream(options);
      case 'gemini':
        return await this.geminiStream(options);
      default:
        throw new Error(`Unknown provider: ${this.provider}`);
    }
  } catch (error: unknown) {
    // Si es error de streaming, intentar sin streaming como fallback
    if (error.message.includes('stream') && !options.signal?.aborted) {
      logger.warn({ provider: this.provider, error: error.message }, 'Stream failed, trying without streaming');
      
      // Llamar al método no-streaming
      const response = await this.chat({
        messages: options.messages,
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      });
      
      // Simular streaming con la respuesta completa
      options.onChunk?.(response.content);
      
      return { content: response.content, usage: response.usage };
    }
    
    throw error;
  }
}
```

---

### 10.4 Memory Leak Prevention

Asegurar cleanup de readers en todos los casos de error:

```typescript
// Patrón seguro para todos los providers

async function safeStream(options: StreamOptions): Promise<string> {
  const reader = options.response.body?.getReader();
  
  if (!reader) {
    throw new Error('No response body');
  }

  try {
    // ... proceso del stream ...
  } catch (error: unknown) {
    // IMPORTANTE: Siempre hacer cleanup
    try {
      reader.cancel(); // Cancelar el reader
    } catch {
      // Ignorar errores de cleanup
    }
    
    throw error;
  } finally {
    // Asegurar que se libera el lock
    try {
      reader.releaseLock();
    } catch {
      // Puede fallar si ya se canceló
    }
  }
}
```

---

### 10.5 Manejo de Connection Close

Qué hacer cuando el browser se cierra o pierde conexión:

```typescript
// En el endpoint SSE

req.on('close', () => {
  // El AbortController ya está conectado al signal
  // Pero podemos agregar logging
  logger.info({
    event: 'sse_client_disconnected',
    userId: req.user?.id,
    conversationId,
  }, 'Client disconnected during stream');
  
  // No es necesario abort() manualmente - el signal ya está configurado
});
```

---

### 10.6 Cost Tracking Real

Para cobrar exactamente los tokens usados (no estimado):

```typescript
// Modificar QA Agent para trackear uso real

async chatStream(...) {
  // ... verificación de credits ...
  
  let totalTokens = 0;
  
  await llmService.chatStream({
    messages,
    onChunk: (chunk) => {
      onChunk(chunk);
      // No podemos contar tokens exactos aquí
      // Usamos estimación: ~4 caracteres por token
      totalTokens += Math.ceil(chunk.length / 4);
    },
    signal,
  });

  // Ajustar credits al final (opcional)
  const estimatedCredits = Math.ceil(totalTokens / 1000); // 1 credit por 1000 tokens
  const difference = estimatedCredits - 1; // 1 credit fue cobrado al inicio
  
  if (difference > 0) {
    // Cobrar diferencia (raro)
    await aiCreditService.useCredits(userId, difference, `QA Agent - ajuste`);
  } else if (difference < 0) {
    // Reintegrar excedente
    await aiCreditService.addCredits(userId, Math.abs(difference), `QA Agent - reintegro`);
  }

  return { conversationId, content: fullResponse };
}
```

---

## 12. Checklist de Implementación

- [x] 1. Agregar método `chatStream()` a `LLMService`
- [x] 2. Implementar streaming para OpenAI
- [x] 3. Implementar streaming para Ollama
- [x] 4. Implementar streaming para Anthropic (usa `x-stream: true`)
- [x] 5. Implementar streaming para Gemini (usa streamGenerateContent)
- [x] 6. Agregar fallback sin streaming en cada provider
- [x] 7. Asegurar cleanup de readers en casos de error
- [x] 8. Agregar método `chatStream()` a `qaAgentService`
- [x] 9. Agregar método `chatStream()` a `tutorService`
- [x] 10. Implementar endpoint SSE para Insights (`/insights/query/stream`)
- [x] 11. Crear endpoint SSE en `ai.routes.ts`
- [ ] 12. Configurar nginx para SSE
- [ ] 13. Crear hook `useAIStream` en frontend
- [ ] 14. Crear componente de chat con streaming
- [ ] 15. Implementar retry logic en frontend
- [x] 16. Tests unitarios
- [ ] 17. Tests de integración
- [ ] 18. E2E tests

---

> **Estado de Implementación**: Backend completado (Abril 2026)
> - Multi-provider LLM (OpenAI, Ollama, Anthropic, Gemini, Simulator) ✅
> - Streaming para todos los providers ✅
> - Endpoints SSE para QA, Tutor, Insights ✅
> - Frontend pendiente

---

**Documento basado en**: PRD-AI-Streaming-SSE.md v1.0  
**User Stories**: specs/user-stories.md  
**Test Plan**: specs/test-plan.md
