# Test Plan + Test Cases
## Crema - Sistema de Interacción y Analytics (AI Features)

**Versión**: 1.0  
**Fecha**: Marzo 2026  
**Change**: ai-features  
**Estado**: Draft

---

## 1. Estrategia de Testing

### 1.1 Tipos de Tests

| Tipo | Cobertura | Herramienta |
|------|-----------|-------------|
| Unit Tests | Servicios individuales | Vitest |
| Integration | Endpoints API, DB | Vitest + Supertest |
| E2E | Flows completos | Playwright |
| Manual | Edge cases complejos | - |

### 1.2 Ambiente de Testing

| Ambiente | DB | Notas |
|----------|-----|-------|
| Local | PostgreSQL con pgvector | Con datos mock |
| CI | PostgreSQL container | Tests automatizados |

---

## 2. Unit Tests

### 2.1 AI Credits Service

#### TC-01: getBalance - Usuario con créditos

```typescript
describe('AiCreditsService', () => {
  it('should return correct balance for user with credits', async () => {
    // GIVEN: User has 100 credits
    const userId = 'user-123';
    await creditsRepository.create({ userId, balance: 100, totalPurchased: 100, totalUsed: 0 });

    // WHEN: Getting balance
    const result = await service.getBalance(userId);

    // THEN: Returns correct values
    expect(result.balance).toBe(100);
    expect(result.totalPurchased).toBe(100);
    expect(result.totalUsed).toBe(0);
  });
});
```

**Criterio de aceptación**: AC-01.1, AC-01.2

---

#### TC-02: useCredit - Deducción exitosa

```typescript
it('should deduct credit on usage', async () => {
  // GIVEN: User has 10 credits
  await creditsRepository.create({ userId, balance: 10, totalPurchased: 10, totalUsed: 0 });

  // WHEN: Using 1 credit
  const result = await service.useCredit(userId, 1);

  // THEN: Balance is deducted
  expect(result).toBe(true);
  const updated = await creditsRepository.getByUserId(userId);
  expect(updated.balance).toBe(9);
  expect(updated.totalUsed).toBe(1);
});
```

**Criterio de aceptación**: AC-03.1, AC-03.3

---

#### TC-03: useCredit - Saldo insuficiente

```typescript
it('should throw error when insufficient credits', async () => {
  // GIVEN: User has 0 credits
  await creditsRepository.create({ userId, balance: 0 });

  // WHEN/THEN: Should throw AppError
  await expect(service.useCredit(userId, 1))
    .rejects.toThrow('Créditos insuficientes');
});
```

**Criterio de aceptación**: AC-03.2

---

#### TC-04: addCredits - Acreditar después de pago

```typescript
it('should add credits after payment', async () => {
  // GIVEN: Package with 500 credits
  const pkg = { code: 'CREDITS_BASIC', credits: 500 };

  // WHEN: Adding credits
  await service.addCredits(userId, pkg.code);

  // THEN: Credits are added
  const balance = await service.getBalance(userId);
  expect(balance.balance).toBe(500);
  expect(balance.totalPurchased).toBe(500);
});
```

**Criterio de aceptación**: AC-02.3

---

### 2.2 Memory Service (Embeddings)

#### TC-05: createEmbedding

```typescript
describe('MemoryService', () => {
  it('should create embedding for content', async () => {
    // GIVEN: Content text
    const content = 'This is a lesson about TypeScript';

    // WHEN: Creating embedding
    const result = await service.createEmbedding({
      content,
      sourceType: 'lesson',
      sourceId: 'lesson-123',
      userId: 'user-123'
    });

    // THEN: Returns embedding vector
    expect(result).toHaveProperty('id');
    expect(result.embedding).toHaveLength(1536); // OpenAI ada-002
  });
});
```

---

#### TC-06: semanticSearch

```typescript
it('should find similar content using semantic search', async () => {
  // GIVEN: Indexed content about "TypeScript interfaces"
  await service.createEmbedding({
    content: 'Interfaces in TypeScript define object shapes',
    sourceType: 'lesson',
    sourceId: 'lesson-1'
  });

  // WHEN: Searching for "how to define types"
  const results = await service.semanticSearch('how to define types', {
    sourceType: 'lesson',
    limit: 5
  });

  // THEN: Returns relevant results
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].sourceId).toBe('lesson-1');
});
```

---

### 2.3 Q&A Service

#### TC-07: createQuestion

```typescript
describe('QAService', () => {
  it('should create question successfully', async () => {
    // GIVEN: Authenticated user, product
    const userId = 'user-123';
    const productId = 'prod-456';

    // WHEN: Creating question
    const result = await service.createQuestion({
      userId,
      productId,
      question: 'How do I use this course?'
    });

    // THEN: Question is created with pending status
    expect(result.status).toBe('pending');
    expect(result.question).toBe('How do I use this course?');
  });
});
```

**Criterio de aceptación**: AC-04.1, AC-04.2

---

#### TC-08: answerQuestion - Solo creador

```typescript
it('should allow only creator to answer', async () => {
  // GIVEN: Question on product
  const question = await service.createQuestion({ ... });

  // WHEN: Non-creator tries to answer
  // THEN: Should throw error
  await expect(service.answerQuestion({
    questionId: question.id,
    userId: 'other-user', // Not creator
    answer: 'Some answer'
  })).rejects.toThrow();
});
```

**Criterio de aceptación**: AC-05.4

---

### 2.4 Review Service

#### TC-09: createReview - Solo comprador

```typescript
describe('ReviewService', () => {
  it('should only allow verified purchasers', async () => {
    // GIVEN: User WITHOUT completed order
    const userId = 'user-123';

    // WHEN/THEN: Should throw error
    await expect(service.createReview({
      userId,
      productId: 'prod-456',
      rating: 5,
      text: 'Great course!'
    })).rejects.toThrow('Solo puedes reseñar productos que has comprado');
  });
});
```

**Criterio de aceptación**: AC-08.1

---

#### TC-10: createReview - Con compra verificada

```typescript
it('should allow verified purchasers', async () => {
  // GIVEN: User WITH completed order
  await orderRepository.create({ userId, productId: 'prod-456', status: 'completed' });

  // WHEN: Creating review
  const result = await service.createReview({
    userId,
    productId: 'prod-456',
    rating: 5,
    text: 'Great!'
  });

  // THEN: Review is created
  expect(result.verifiedPurchase).toBe(true);
});
```

**Criterio de aceptación**: AC-08.4

---

### 2.5 Denunciation Service

#### TC-11: createReport

```typescript
describe('DenunciationService', () => {
  it('should create report with all required fields', async () => {
    // GIVEN: Valid report data
    const reportData = {
      reporterId: 'user-123',
      contentType: 'product',
      contentId: 'prod-456',
      reason: 'spam',
      description: 'This is spam'
    };

    // WHEN: Creating report
    const result = await service.createReport(reportData);

    // THEN: Report is created with pending status
    expect(result.status).toBe('pending');
    expect(result.reason).toBe('spam');
  });
});
```

**Criterio de aceptación**: AC-12.1, AC-12.2, AC-12.3, AC-12.4

---

#### TC-12: resolveReport - Retener fondos

```typescript
it('should retain funds when approving report with fraud', async () => {
  // GIVEN: Report approved with fraud
  const report = await service.createReport({ ... });

  // WHEN: Resolving with fund retention
  await service.resolveReport(report.id, {
    action: 'retain_funds',
    adminId: 'admin-1'
  });

  // THEN: Creator funds are on hold
  const creatorBalance = await balanceRepository.getByUserId(creatorId);
  expect(creatorBalance.onHold).toBeGreaterThan(0);
});
```

**Criterio de aceptación**: AC-14.1, AC-14.2

---

### 2.6 AI Agents

#### TC-13: QAAgent - Respuesta con contexto

```typescript
describe('QAAgentService', () => {
  it('should generate response with product context', async () => {
    // GIVEN: Product with indexed content
    await memoryService.createEmbedding({
      content: 'This course teaches TypeScript',
      sourceType: 'lesson',
      sourceId: 'lesson-1',
      productId: 'prod-123'
    });

    // WHEN: Chatting with agent
    const response = await agent.chat('prod-123', 'user-456', 'What does this course teach?');

    // THEN: Returns relevant response
    expect(response.message).toContain('TypeScript');
    expect(response.creditsUsed).toBe(1);
  });
});
```

**Criterio de aceptación**: AC-16.2, AC-16.4

---

#### TC-14: Insights - Query generation

```typescript
describe('InsightsService', () => {
  it('should generate SQL from natural language', async () => {
    // WHEN: User asks in natural language
    const result = await service.query({
      userId: 'creator-123',
      question: 'How many sales did I have this month?'
    });

    // THEN: Returns SQL and results
    expect(result).toHaveProperty('sql');
    expect(result).toHaveProperty('results');
    expect(result.sql).toContain('SELECT');
  });
});
```

**Criterio de aceptación**: AC-18.2

---

## 3. Integration Tests

### 3.1 API Endpoints

#### TC-15: POST /api/ai/credits/purchase

```typescript
describe('AI Credits API', () => {
  it('should create payment preference', async () => {
    const response = await request(app)
      .post('/api/ai/credits/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageCode: 'CREDITS_STANDARD' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('preferenceId');
  });
});
```

---

#### TC-16: GET /api/ai/credits

```typescript
it('should return user credit balance', async () => {
  const response = await request(app)
    .get('/api/ai/credits')
    .set('Authorization', `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('balance');
});
```

---

#### TC-17: POST /api/ai/products/:id/questions

```typescript
it('should create question', async () => {
  const response = await request(app)
    .post('/api/ai/products/prod-123/questions')
    .set('Authorization', `Bearer ${token}`)
    .send({ question: 'Is this course good for beginners?' });

  expect(response.status).toBe(201);
  expect(response.body.question).toBe('Is this course good for beginners?');
});
```

---

#### TC-18: POST /api/ai/products/:id/reviews

```typescript
it('should create review for verified purchase', async () => {
  // Setup: Create completed order first
  await orderRepository.create({ userId, productId: 'prod-123', status: 'completed' });

  const response = await request(app)
    .post('/api/ai/products/prod-123/reviews')
    .set('Authorization', `Bearer ${token}`)
    .send({ rating: 5, text: 'Excellent!' });

  expect(response.status).toBe(201);
  expect(response.body.rating).toBe(5);
});
```

---

#### TC-19: POST /api/reports

```typescript
it('should create report', async () => {
  const response = await request(app)
    .post('/api/reports')
    .set('Authorization', `Bearer ${token}`)
    .send({
      contentType: 'product',
      contentId: 'prod-123',
      reason: 'inappropriate_content',
      description: 'Contains offensive material'
    });

  expect(response.status).toBe(201);
  expect(response.body.status).toBe('pending');
});
```

---

#### TC-20: POST /api/agents/qa/chat

```typescript
it('should chat with QA agent', async () => {
  const response = await request(app)
    .post('/api/agents/qa/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({
      productId: 'prod-123',
      message: 'What will I learn?'
    });

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('message');
});
```

---

### 3.2 Webhook Integration

#### TC-21: MP Webhook - Credit Purchase

```typescript
it('should add credits after MP payment', async () => {
  // GIVEN: Payment approved webhook from MP
  const webhookPayload = {
    topic: 'payment',
    id: 'mp-payment-123',
    external_reference: 'order-credits-123',
    status: 'approved'
  };

  // WHEN: Webhook received
  await request(app)
    .post('/api/payments/webhook/mercadopago')
    .send(webhookPayload);

  // THEN: Credits are added to user
  const balance = await creditsService.getBalance(userId);
  expect(balance.balance).toBeGreaterThan(0);
});
```

**Criterio de aceptación**: AC-02.3

---

## 4. E2E Tests (Playwright)

### TC-22: Compra de créditos flow completo

```typescript
test('user can purchase credits', async ({ page }) => {
  // 1. Login
  await page.login('user@test.com', 'password');

  // 2. Go to credits page
  await page.goto('/ai/credits');

  // 3. Select package
  await page.click('text=Standard - 2000 créditos');

  // 4. Pay with MP (simulated)
  await mpSimulator.completePayment();

  // 5. Verify balance updated
  await expect(page.locator('.balance')).toContainText('2000');
});
```

---

### TC-23: QA Flow completo

```typescript
test('user can ask question and get answer', async ({ page }) => {
  // 1. Go to product
  await page.goto('/product/typescript-course');

  // 2. Ask question
  await page.fill('input[name="question"]', 'Is this for beginners?');
  await page.click('button[type="submit"]');

  // 3. Verify question appears
  await expect(page.locator('.question')).toContainText('Is this for beginners?');

  // 4. Creator answers (as creator)
  await page.login('creator@test.com', 'password');
  await page.goto('/creator/questions');
  await page.fill('textarea[name="answer"]', 'Yes, it starts from zero!');
  await page.click('button:has-text("Responder")');

  // 5. Verify answer appears
  await expect(page.locator('.answer')).toContainText('Yes, it starts from zero!');
});
```

---

## 5. Manual Tests

### 5.1 Edge Cases

| ID | Test | Descripción |
|----|------|-------------|
| MT-01 | Expiración de créditos | Verificar que créditos vecen a los 12 meses |
| MT-02 | Concurrent usage | Múltiples requests simultáneos de uso de crédito |
| MT-03 | Embedding performance | Búsqueda semántica con 10k+ vectores |
| MT-04 | Large content | Q&A con contenido muy largo |
| MT-05 | Rate limiting | Verificar límites de requests a endpoints AI |

---

## 6. Coverage Goals

| Métrica | Target |
|---------|--------|
| Unit Test Coverage | > 80% |
| Integration Tests | Todos los endpoints |
| E2E Scenarios | Flujos principales |
| Manual Tests | Edge cases |

---

## 7. Run Commands

```bash
# Unit tests
pnpm vitest run --filter backend

# With coverage
pnpm vitest run --coverage

# Integration tests
pnpm vitest run --testNamePattern="integration"

# E2E tests
pnpm playwright test
```

---

**Documentos relacionados**:
- PRD-Crema-Interaccion-Analytics.md v1.2
- User-Stories-AI-Features.md
- TSD (en sdd/ai-features/design - engram)
- Tasks (en sdd/ai-features/tasks - engram)
