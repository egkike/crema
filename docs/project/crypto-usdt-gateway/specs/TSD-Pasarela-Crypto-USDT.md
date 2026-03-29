# Technical Specification Document (TSD)
## Pasarela de Pagos Crypto (USDT) - Crema

**Versión**: 1.0  
**Fecha**: Marzo 2026  
**Change**: crypto-usdt-gateway  
**Estado**: Draft  
**Owner**: Kike García

---

## 1. Arquitectura del Sistema

### 1.1 Componentes Principales

```
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────┐                   │
│  │ PaymentProvider │◄───│ PaymentProvider  │                   │
│  │    Factory      │    │    Factory       │                   │
│  └────────┬────────┘    └────────┬─────────┘                   │
│           │                       │                               │
│           ▼                       ▼                               │
│  ┌─────────────────────────────────────────────┐                │
│  │              Providers                       │                │
│  │  ┌─────────────┐ ┌──────────┐ ┌─────────┐ │                │
│  │  │MercadoPago  │ │ Simulator │ │Blockono-│ │                │
│  │  │ Provider    │ │ Provider  │ │ mics    │ │                │
│  │  └─────────────┘ └──────────┘ │ Provider│ │                │
│  │                              └─────────┘                   │
│  └─────────────────────────────────────────────┘                │
│                                                                  │
│  ┌─────────────────────────────────────────────┐                │
│  │              Webhooks                        │                │
│  │  POST /api/payments/webhook/blockonomics   │                │
│  └─────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Flujo de Datos

```
Comprador → Frontend → Backend API → Blockonomics API → Webhook → Backend
                 │                                    │
                 ▼                                    ▼
           Order Created                      Order Completed
```

---

## 2. Diseño de Base de Datos

### 2.1 Tablas Existentes a Modificar

#### payment_gateways

```sql
-- Agregar columnas (migración)
ALTER TABLE payment_gateways 
ADD COLUMN IF NOT EXISTS supports_refunds BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS supports_subscriptions BOOLEAN DEFAULT TRUE;

-- Actualizar Blockonomics
UPDATE payment_gateways 
SET supports_refunds = FALSE, 
    supports_subscriptions = FALSE
WHERE id = 'blockonomics';
```

#### currency_gateways (existente)

```sql
-- Ya existe, solo agregar mapping
INSERT INTO currency_gateways (currency_code, gateway_id, is_default, priority) 
VALUES ('USDT', 'blockonomics', false, 1)
ON CONFLICT DO NOTHING;
```

### 2.2 Estructura de Datos

| Tabla | Columnas | Tipo |
|-------|----------|------|
| payment_gateways | id, name, liquidity_delay_days, is_active, supports_refunds, supports_subscriptions | Existente + nuevas |
| currency_gateways | currency_code, gateway_id, is_default, priority | Existente |
| orders | (no cambio) | - |
| order_transactions | (no cambio) | - |

---

## 3. Diseño de API

### 3.1 Endpoints Existentes a Utilizar

| Endpoint | Método | Uso |
|----------|--------|-----|
| `/api/payments/create-preference` | POST | Crear preferencia de pago |
| `/api/payments/webhook/blockonomics` | POST | Recibir notificaciones |
| `/api/payments/webhook/:gatewayId` | POST | Generic webhook handler |

### 3.2 Nuevo Endpoint: Webhook Blockonomics

```
POST /api/payments/webhook/blockonomics
Headers:
  - X-Webhook-Signature: string (optional, validar si está configurado)

Body (Blockonomics callback):
{
  "invoice_id": "string",
  "txid": "string",
  "value": number,        -- en satoshis
  "addr": "string",       -- dirección de pago
  "status": 0|1|2,        -- 0=pending, 1=partial, 2=confirmed
  "rbf": boolean,
  "uuid": "string"        -- order ID externo
}

Response: 200 OK
```

### 3.3 Response del Provider

```typescript
interface PaymentResponse {
  externalReference: string;  // order ID
  status: 'pending' | 'completed' | 'failed' | 'expired';
  transactionId: string;
  gatewayFee: number;         // 0 para crypto (se provisiona mensual)
  gatewayTax: number;        // 0 para crypto
}
```

---

## 4. BlockonomicsProvider Implementation

### 4.1 Interface (PaymentProvider)

```typescript
// backend/src/services/payment/PaymentProvider.ts
export interface PaymentProvider {
  readonly id: string;
  readonly name: string;
  
  createPreference(data: CreatePreferenceDTO): Promise<PreferenceResponse>;
  handleWebhook(payload: any): Promise<PaymentResponse>;
  createSubscription?(data: CreateSubscriptionDTO): Promise<SubscriptionResponse>;
  cancelSubscription?(subscriptionId: string): Promise<void>;
}
```

### 4.2 BlockonomicsProvider Class

```typescript
// backend/src/services/payment/providers/BlockonomicsProvider.ts

export class BlockonomicsProvider implements PaymentProvider {
  readonly id = 'blockonomics';
  readonly name = 'Crypto (USDT)';

  private readonly apiKey: string;
  private readonly storeId: string;
  private readonly callbackUrl: string;
  private readonly webhookSecret?: string;

  constructor() {
    this.apiKey = process.env.BLOCKONOMICS_API_KEY;
    this.storeId = process.env.BLOCKONOMICS_STORE_ID;
    this.callbackUrl = process.env.BLOCKONOMICS_CALLBACK_URL;
    this.webhookSecret = process.env.BLOCKONOMICS_WEBHOOK_SECRET;

    if (!this.apiKey || !this.storeId) {
      throw new Error('BLOCKONOMICS_API_KEY and BLOCKONOMICS_STORE_ID are required');
    }
  }

  async createPreference(data: CreatePreferenceDTO): Promise<PreferenceResponse> {
    // 1. Crear invoice en Blockonomics
    // 2. Retornar con checkout_url
  }

  async handleWebhook(payload: any): Promise<PaymentResponse> {
    // 1. Validar firma (si hay secret)
    // 2. Mapear status: 0→pending, 2→completed
    // 3. Retornar PaymentResponse
  }
}
```

### 4.3 Métodos del Provider

| Método | Descripción | Tiempo estimado |
|--------|-------------|-----------------|
| `createPreference` | Crear invoice en Blockonomics | 30 min timeout |
| `handleWebhook` | Procesar callback de pago | < 100ms |

---

## 5. Integración con Código Existente

### 5.1 PaymentProviderFactory

```typescript
// backend/src/services/payment/PaymentProviderFactory.ts

import { BlockonomicsProvider } from './providers/BlockonomicsProvider';

export class PaymentProviderFactory {
  private static providers: Record<string, PaymentProvider> = {
    mercadopago: new MercadoPagoProvider(),
    simulator: new SimulatorProvider(),
    blockonomics: new BlockonomicsProvider(),  // AGREGAR
  };

  static getProvider(gatewayId: string): PaymentProvider {
    const provider = this.providers[gatewayId];
    if (!provider) {
      throw new AppError(`Provider ${gatewayId} not found`, 404);
    }
    return provider;
  }
}
```

### 5.2 GatewayRepository

```typescript
// backend/src/repositories/gateway.repository.ts

export interface Gateway {
  id: string;
  name: string;
  liquidity_delay_days: number;
  is_active: boolean;
  supports_refunds: boolean;      // NUEVO
  supports_subscriptions: boolean; // NUEVO
}

// Método existente a actualizar
async getLiquidityDays(gatewayId: string): Promise<number> {
  // ...ya existe
}

// Métodos nuevos a agregar
async getSupportsRefunds(gatewayId: string): Promise<boolean> {
  // SELECT supports_refunds FROM payment_gateways WHERE id = $1
}

async getSupportsSubscriptions(gatewayId: string): Promise<boolean> {
  // SELECT supports_subscriptions FROM payment_gateways WHERE id = $1
}
```

### 5.3 OrderService - Lógica de Garantía

```typescript
// backend/src/services/order.service.ts

// En createOrder() o completeOrder()
const gateway = await gatewayRepository.getById(order.payment_method);
const supportsRefunds = gateway?.supports_refunds ?? true;

let guaranteeDays: number;
if (supportsRefunds) {
  guaranteeDays = await systemRepository.resolveGuaranteeDays(product.id);
} else {
  guaranteeDays = 0;  // Crypto = sin garantía
  logger.info({ orderId: order.id }, 'Pasarela sin soporte de refunds - Garantía = 0');
}
```

---

## 6. Manejo de Errores

### 6.1 Errores del Provider

| Error | Código | Causa | Acción |
|-------|--------|-------|--------|
| API_TIMEOUT | 504 | Blockonomics no responde | Retry con exponential backoff |
| INVALID_SIGNATURE | 401 | Webhook spoofing | Ignorar request |
| DUPLICATE_WEBHOOK | 200 | Webhook reenviado | Ack solo, no reprocesar |
| ORDER_NOT_FOUND | 404 | UUID inválido | Log y error |

### 6.2 Handling deTimeouts

```typescript
// createPreference con timeout
const response = await axios.post(
  'https://www.blockonomics.co/api/v2/invoice',
  payload,
  { timeout: 30000 }  // 30 segundos
);
```

---

## 7. Seguridad

### 7.1 Validación de Webhook

```typescript
// Validar firma si hay secret configurado
if (webhookSecret) {
  const signature = req.headers['x-webhook-signature'];
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  if (signature !== expected) {
    throw new AppError('Invalid webhook signature', 401);
  }
}
```

### 7.2 Rate Limiting

```typescript
// En router
router.post(
  '/webhook/blockonomics',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 100 // 100 requests por window
  }),
  webhookHandler
);
```

---

## 8. Configuración de Variables de Entorno

```bash
# Blockonomics
BLOCKONOMICS_API_KEY=tu_api_key
BLOCKONOMICS_STORE_ID=tu_store_id
BLOCKONOMICS_CALLBACK_URL=https://tu-dominio.com/api/payments/webhook/blockonomics
BLOCKONOMICS_WEBHOOK_SECRET=tu_secret  # opcional
```

---

## 9. Diagrama de Secuencia

```
┌─────────┐     ┌──────────┐     ┌─────────────┐     ┌────────────┐
│Frontend │     │  Backend │     │Blockonomics │     │   DB       │
└────┬────┘     └─────┬────┘     └──────┬──────┘     └─────┬──────┘
     │                │                  │                  │
     │ POST /create   │                  │                  │
     │ preference     │                  │                  │
     │───────────────>│                  │                  │
     │                │                  │                  │
     │                │ POST /invoice    │                  │
     │                │─────────────────>│                  │
     │                │                  │                  │
     │                │<─────────────────│                  │
     │                │ {checkout_url}   │                  │
     │                │                  │                  │
     │<───────────────│                  │                  │
     │ redirect       │                  │                  │
     │                │                  │                  │
     │                │     WEBHOOK      │                  │
     │                │<─────────────────│                  │
     │                │                  │                  │
     │                │ INSERT order     │                  │
     │                │─────────────────>│                  │
     │                │                  │                  │
     │                │<─────────────────│                  │
     │                │ OK               │                  │
```

---

## 10. Testing Strategy

### 10.1 Unit Tests

| Componente | Test |
|------------|------|
| BlockonomicsProvider | createPreference retorna checkout_url |
| BlockonomicsProvider | handleWebhook mapea status correctamente |
| BlockonomicsProvider | invalid signature lanza error |
| GatewayRepository | getSupportsRefunds retorna boolean |

### 10.2 Integration Tests

| Escenario | Descripción |
|-----------|-------------|
| Flow completo | Checkout → Blockonomics → Webhook → Orden completada |
| Timeout | Verificar manejo cuando Blockonomics no responde |
| Duplicado | Webhook reenviado no crea duplicados |

### 10.3 Manual Tests

| Test | Descripción |
|------|-------------|
| Pago real | Comprar con USDT real en testnet |
| Expiración | Verificar que orden expira después de 30 min |

---

## 11. Dependencias

### 11.1 Paquetes NPM

No se requieren paquetes adicionales. Blockonomics usa API REST simple.

### 11.2 Recursos Externos

| Recurso | URL | Uso |
|---------|-----|-----|
| Blockonomics API | `https://www.blockonomics.co/api/v2` | Crear invoices |
| Blockonomics Status | `https://www.blockonomics.co/api/v1/status` | Verificar estado |

---

## 12. Checklist de Implementación

- [ ] 1. Agregar columnas a `payment_gateways` (supports_refunds, supports_subscriptions)
- [ ] 2. Insertar registro blockonomics en `payment_gateways`
- [ ] 3. Insertar mapping USDT → blockonomics en `currency_gateways`
- [ ] 4. Crear `BlockonomicsProvider.ts`
- [ ] 5. Registrar en `PaymentProviderFactory`
- [ ] 6. Implementar webhook handler
- [ ] 7. Actualizar `gateway.repository.ts` con métodos nuevos
- [ ] 8. Actualizar `order.service.ts` para garantía = 0
- [ ] 9. Agregar variables de entorno
- [ ] 10. Tests unitarios
- [ ] 11. Tests de integración
- [ ] 12. Testing manual

---

**Documento basado en**: PRD-Pasarela-Crypto-USDT.md v2.4  
**User Stories**: User-Stories-Crypto-USDT.md  
**Próximo paso**: Development Roadmap (sdd-tasks)
