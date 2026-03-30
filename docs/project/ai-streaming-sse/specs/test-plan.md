# Test Plan + Test Cases
## AI Streaming con SSE - Crema

**Versión**: 1.0  
**Fecha**: Marzo 2026  
**Change**: ai-streaming-sse

---

## 1. Unit Tests

### 1.1 LLM Service - Streaming

#### TC-01: chatStream con OpenAI

```typescript
describe('LLMService.chatStream', () => {
  it('should stream tokens from OpenAI', async () => {
    // GIVEN: LLM service configured with OpenAI
    const messages = [{ role: 'user', content: 'Hola' }];

    // WHEN: Calling chatStream
    const chunks: string[] = [];
    await llmService.chatStream(messages, (chunk) => {
      chunks.push(chunk);
    });

    // THEN: Chunks are received
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join()).toContain('Hola');
  });
});
```

---

#### TC-02: chatStream con Ollama

```typescript
it('should stream tokens from Ollama', async () => {
  // GIVEN: LLM service configured with Ollama
  // WHEN/THEN: Similar to TC-01
});
```

---

### 1.2 QA Agent Service - Streaming

#### TC-03: chatStream deduce credits correctamente

```typescript
describe('qaAgentService.chatStream', () => {
  it('should deduct 1 credit at start', async () => {
    // GIVEN: User with 10 credits
    await creditsRepository.create({ userId, balance: 10 });

    // WHEN: Starting chat stream
    await qaAgentService.chatStream(productId, userId, '¿Qué es esto?');

    // THEN: Credit is deducted
    const balance = await creditsService.getBalance(userId);
    expect(balance.balance).toBe(9);
  });
});
```

---

#### TC-04: chatStream aborta si no hay credits

```typescript
it('should throw if no credits', async () => {
  // GIVEN: User with 0 credits

  // WHEN/THEN: Should throw AppError
  await expect(
    qaAgentService.chatStream(productId, userId, 'Message')
  ).rejects.toThrow('Créditos insuficientes');
});
```

---

### 1.3 Abort Controller

#### TC-05: Cancelar stream

```typescript
it('should cancel stream when abort called', async () => {
  // GIVEN: Active stream with abort controller
  const abortController = new AbortController();

  // WHEN: Abort is called
  abortController.abort();

  // THEN: Stream stops generating
  // Verify no more chunks after abort
});
```

---

## 2. Integration Tests

### 2.1 API Endpoints

#### TC-06: POST /api/ai/agents/qa/chat/stream

```typescript
describe('POST /api/ai/agents/qa/chat/stream', () => {
  it('should return SSE stream', async () => {
    const response = await request(app)
      .post('/api/ai/agents/qa/chat/stream')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'text/event-stream')
      .send({ product_id: 'prod-123', message: '¿Qué es esto?' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
  });
});
```

---

#### TC-07: SSE events structure

```typescript
it('should emit correct SSE events', async () => {
  // GIVEN: Connected SSE stream
  const response = await request(app)
    .post('/api/ai/agents/qa/chat/stream')
    .set('Authorization', `Bearer ${token}`)
    .send({ product_id: 'prod-123', message: 'Hola' });

  // WHEN: Reading stream
  const events = await readSSEEvents(response);

  // THEN: Events are correct
  expect(events[0].event).toBe('start');
  expect(events[1].event).toBe('chunk');
  expect(events[events.length - 1].event).toBe('done');
});
```

---

### 2.2 Error Handling

#### TC-08: Error event on insufficient credits

```typescript
it('should emit error event on insufficient credits', async () => {
  // GIVEN: User with 0 credits

  // WHEN: Requesting stream
  const response = await request(app)
    .post('/api/ai/agents/qa/chat/stream')
    .set('Authorization', `Bearer ${token}`)
    .send({ product_id: 'prod-123', message: 'Hola' });

  // THEN: Error event is emitted
  const events = await readSSEEvents(response);
  const errorEvent = events.find(e => e.event === 'error');
  expect(errorEvent).toBeDefined();
  expect(errorEvent.data.code).toBe('INSUFFICIENT_CREDITS');
});
```

---

#### TC-09: Fallback to sync endpoint

```typescript
it('should fallback to sync if stream fails', async () => {
  // GIVEN: Stream endpoint returns error

  // WHEN: Frontend detects error
  // THEN: Uses /chat (non-stream) endpoint
  const syncResponse = await request(app)
    .post('/api/ai/agents/qa/chat')
    .send({ product_id: 'prod-123', message: 'Hola' });

  expect(syncResponse.status).toBe(200);
  expect(syncResponse.body.data).toHaveProperty('response');
});
```

---

### 2.3 Authentication

#### TC-10: JWT required for stream

```typescript
it('should reject without JWT', async () => {
  const response = await request(app)
    .post('/api/ai/agents/qa/chat/stream')
    .send({ product_id: 'prod-123', message: 'Hola' });

  expect(response.status).toBe(401);
});
```

---

## 3. E2E Tests (Playwright)

### TC-11: Full chat flow with streaming

```typescript
test('user sees streaming response', async ({ page }) => {
  // 1. Login as buyer
  await page.login('buyer@test.com', 'password');

  // 2. Go to product with QA Agent enabled
  await page.goto('/product/test-course');

  // 3. Open chat
  await page.click('text=Hacer pregunta');

  // 4. Send message
  await page.fill('input[name="message"]', '¿Qué aprenderé?');
  await page.click('button:has-text("Enviar")');

  // 5. Verify streaming
  // First: "Conectando..." appears
  await expect(page.locator('.connecting')).toBeVisible();

  // Then: Text appears progressively
  const messageBox = page.locator('.ai-response');
  await expect(messageBox).toContainText('En este curso');

  // Verify cursor is blinking (still writing)
  await expect(page.locator('.cursor')).toBeVisible();
});
```

---

### TC-12: Cancel stream

```typescript
test('user can cancel stream', async ({ page }) => {
  // 1. Start chat
  await page.fill('input[name="message"]', '¿Tema largo?');
  await page.click('button:has-text("Enviar")');

  // 2. Click cancel while streaming
  await page.click('button:has-text("Cancelar")');

  // 3. Verify stream stopped
  const text = await page.locator('.ai-response').textContent();
  expect(text.length).toBeLessThan(100); // Not full response
});
```

---

## 4. Manual Tests

### 4.1 Performance

| Test | Métrica Target |
|------|----------------|
| First token latency | < 1 segundo |
| Tokens por segundo | > 20 |
| Total response time | Similar a síncrono |

### 4.2 Edge Cases

| Test | Descripción |
|------|-------------|
| Slow network | Simular 3G, verificar que funciona |
| Browser refresh | Refrescar página mientras stream activo |
| Tab inactive | Minimizar tab, verificar que sigue |

### 4.3 Cross-browser

| Browser | Soporte |
|---------|---------|
| Chrome | ✅ |
| Firefox | ✅ |
| Safari | ✅ |
| Mobile Chrome | ✅ |
| Mobile Safari | ✅ |

---

## 5. Coverage Goals

| Métrica | Target |
|---------|--------|
| Unit Test Coverage | > 80% |
| Integration Tests | Todos los endpoints |
| E2E Scenarios | Flujo principal, cancel, error |

---

**Documentos relacionados**:
- PRD-AI-Streaming-SSE.md
- User-Stories-AI-Streaming-SSE.md
