# Test Plan + Test Cases
## Pasarela de Pagos Crypto (USDT) - Crema

**Versión**: 1.0  
**Fecha**: Marzo 2026  
**Change**: crypto-usdt-gateway  
**Estado**: Draft

---

## 1. Estrategia de Testing

### 1.1 Tipos de Tests

| Tipo | Cobertura | Herramienta |
|------|-----------|-------------|
| Unit Tests | BlockonomicsProvider, GatewayRepository | Vitest |
| Integration | API endpoints, Webhooks | Vitest + Supertest |
| E2E | Flujo completo de compra | Playwright |
| Manual | Pago real, edge cases | - |

### 1.2 Ambiente de Testing

| Ambiente | URL | Notas |
|----------|-----|-------|
| Local | http://localhost:3000 | Con Blockonomics testnet |
| Staging | https://staging.crema.com | Testing pre-producción |
| Production | https://crema.com | Solo con cuenta real |

---

## 2. Unit Tests

### 2.1 BlockonomicsProvider

#### TC-01: createPreference - Happy Path

```typescript
// test/providers/blockonomics-provider.test.ts

describe('BlockonomicsProvider', () => {
  describe('createPreference', () => {
    it('should create invoice and return checkout_url', async () => {
      // GIVEN: Valid CreatePreferenceDTO
      const dto = {
        productId: 'prod_123',
        amount: 100,
        currency: 'USDT',
        orderId: 'order_456',
        returnUrl: 'https://crema.com/checkout/success',
      };

      // WHEN: createPreference is called
      const result = await provider.createPreference(dto);

      // THEN: Returns checkout_url
      expect(result).toHaveProperty('checkoutUrl');
      expect(result.checkoutUrl).toContain('blockonomics.co');
    });
  });
});
```

**Criterio de aceptación**: AC-04.1, AC-04.2

---

#### TC-02: createPreference - API Error

```typescript
it('should throw AppError when Blockonomics API fails', async () => {
  // GIVEN: Blockonomics API returns 500
  mockAxios.post.mockRejectedValue(new Error('API Error'));

  // WHEN/THEN: Should throw with proper error message
  await expect(provider.createPreference(dto))
    .rejects.toThrow('Error creating Blockonomics invoice');
});
```

**Criterio de aceptación**: AC-04.4

---

#### TC-03: handleWebhook - Valid Signature

```typescript
describe('handleWebhook', () => {
  it('should process confirmed payment correctly', async () => {
    // GIVEN: Valid webhook payload with status = 2 (confirmed)
    const payload = {
      uuid: 'order_123',
      txid: '0xabc123',
      status: 2,
      value: 1000000, // 0.01 USDT in satoshis
    };

    // WHEN: handleWebhook is called
    const result = await provider.handleWebhook(payload);

    // THEN: Returns completed status
    expect(result.status).toBe('completed');
    expect(result.transactionId).toBe('0xabc123');
  });
});
```

**Criterio de aceptación**: AC-05.1, AC-05.2, AC-05.3

---

#### TC-04: handleWebhook - Invalid Signature

```typescript
it('should reject webhook with invalid signature', async () => {
  // GIVEN: Webhook with wrong signature
  const payload = { uuid: 'order_123', status: 2 };
  const headers = { 'x-webhook-signature': 'invalid' };

  // WHEN/THEN: Should throw 401
  await expect(provider.handleWebhook(payload, headers))
    .rejects.toThrow('Invalid webhook signature');
});
```

**Criterio de aceptación**: AC-05.2

---

#### TC-05: handleWebhook - Duplicate (Idempotency)

```typescript
it('should handle duplicate webhook gracefully', async () => {
  // GIVEN: Same webhook sent twice
  const payload = { uuid: 'order_123', status: 2 };

  // WHEN: First webhook
  await provider.handleWebhook(payload);

  // THEN: Second webhook should not throw
  await expect(provider.handleWebhook(payload)).resolves.not.toThrow();
});
```

**Criterio de aceptación**: AC-05.5

---

### 2.2 GatewayRepository

#### TC-06: getSupportsRefunds

```typescript
describe('GatewayRepository', () => {
  it('should return false for blockonomics', async () => {
    // WHEN
    const result = await repository.getSupportsRefunds('blockonomics');

    // THEN
    expect(result).toBe(false);
  });

  it('should return true for mercadopago', async () => {
    // WHEN
    const result = await repository.getSupportsRefunds('mercadopago');

    // THEN
    expect(result).toBe(true);
  });
});
```

**Criterio de aceptación**: AC-07.1

---

#### TC-07: getSupportsSubscriptions

```typescript
it('should return false for blockonomics', async () => {
  const result = await repository.getSupportsSubscriptions('blockonomics');
  expect(result).toBe(false);
});
```

**Criterio de aceptación**: AC-09.1

---

### 2.3 OrderService

#### TC-08: createOrder with Blockonomics - Zero Guarantee

```typescript
describe('OrderService', () => {
  it('should set days_of_guarantee_applied = 0 for blockonomics', async () => {
    // GIVEN: Order with payment_method = 'blockonomics'
    const orderData = {
      productId: 'prod_123',
      paymentMethod: 'blockonomics',
      currency: 'USDT',
    };

    // WHEN: Order is created
    const order = await orderService.createOrder(orderData);

    // THEN: days_of_guarantee_applied should be 0
    expect(order.daysOfGuaranteeApplied).toBe(0);
  });
});
```

**Criterio de aceptación**: AC-07.1, AC-07.2

---

## 3. Integration Tests

### 3.1 API Endpoints

#### TC-09: POST /api/payments/create-preference with Blockonomics

```typescript
// test/integration/payments.test.ts

describe('POST /api/payments/create-preference', () => {
  it('should return checkout_url for USDT product', async () => {
    // GIVEN: Authenticated user, USDT product
    const response = await request(app)
      .post('/api/payments/create-preference')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'prod_usdt', gatewayId: 'blockonomics' });

    // THEN: Returns 200 with checkout_url
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('checkoutUrl');
  });
});
```

---

#### TC-10: POST /api/payments/webhook/blockonomics

```typescript
it('should complete order on webhook', async () => {
  // WHEN: Valid webhook received
  const response = await request(app)
    .post('/api/payments/webhook/blockonomics')
    .send({ uuid: 'order_123', status: 2, txid: '0xabc' });

  // THEN: Returns 200
  expect(response.status).toBe(200);

  // AND: Order is completed in DB
  const order = await orderRepository.findById('order_123');
  expect(order.status).toBe('completed');
});
```

---

### 3.2 Payment Flow

#### TC-11: Full Purchase Flow

```typescript
it('should complete full USDT purchase flow', async () => {
  // GIVEN: User with USDT wallet, product in USDT
  
  // STEP 1: Create preference
  const pref = await request(app)
    .post('/api/payments/create-preference')
    .send({ productId: 'prod_123', gatewayId: 'blockonomics' });
  
  // STEP 2: Simulate payment (would be done on Blockonomics side)
  // STEP 3: Receive webhook
  await request(app)
    .post('/api/payments/webhook/blockonomics')
    .send({ uuid: pref.body.orderId, status: 2 });
  
  // STEP 4: Verify order completed
  const order = await orderRepository.findById(pref.body.orderId);
  expect(order.status).toBe('completed');
});
```

---

## 4. E2E Tests (Playwright)

### TC-12: Complete USDT Purchase

```typescript
// test/e2e/usdt-purchase.spec.ts

test('user can purchase product with USDT', async ({ page }) => {
  // 1. Navigate to product
  await page.goto('/product/prod-usdt');
  
  // 2. Click "Buy Now"
  await page.click('text=Comprar ahora');
  
  // 3. Select USDT payment
  await page.click('text=Pagar con USDT');
  
  // 4. Verify redirected to Blockonomics
  await page.waitForURL(/blockonomics/);
  
  // 5. Complete payment (simulated)
  // ... user completes payment on Blockonomics
  
  // 6. Verify redirected back to success
  await page.waitForURL(/success/);
  await expect(page.locator('text=Compra exitosa')).toBeVisible();
});
```

---

## 5. Manual Tests

### 5.1 Test Cases that Require Manual Testing

| ID | Test | Steps | Expected Result |
|----|------|-------|-----------------|
| MT-01 | Pago real en testnet | 1. Usar cuenta Blockonomics testnet 2. Hacer compra real | Pago se confirma |
| MT-02 | Expiración de orden | 1. Iniciar compra 2. Esperar 30+ min | Orden expira |
| MT-03 |Refund denegado | 1. Comprar con USDT 2. Solicitar refund | Se deniega automáticamente |
| MT-04 |Payout USDT | 1. Solicitar retiro 2. Admin aprobar | Se procesa |

### 5.2 Exploratory Testing

| Area | Escenarios a probar |
|------|---------------------|
| Checkout | Cambio de método de pago, recargar página |
| Webhook | Retry de red, duplicate calls |
| Dashboard | Verificar que ordenes USDT aparecen correctamente |

---

## 6. Test Coverage Goals

| Métrica | Target |
|---------|--------|
| Unit Test Coverage | > 80% |
| Integration Tests | Todos los endpoints |
| E2E Scenarios | Flujo principal |
| Manual Tests | Edge cases |

---

## 7. Run Commands

```bash
# Unit tests
pnpm vitest run --filter backend

# Integration tests
pnpm vitest run --filter backend --testNamePattern="integration"

# E2E tests
pnpm playwright test

# With coverage
pnpm vitest run --coverage
```

---

## 8. Defect Tracking

| Severity | Descripción | Ejemplos |
|----------|-------------|----------|
| Critical | Pago no funciona, dinero perdido | No se confirma pago |
| High | Flow roto | No llega webhook |
| Medium | Error visible | Mensaje de error feo |
| Low | Mejora | UX payment page |

---

**Documentos relacionados**:
- User-Stories-Crypto-USDT.md
- TSD-Pasarela-Crypto-USDT.md
- PRD-Pasarela-Crypto-USDT.md v2.4
