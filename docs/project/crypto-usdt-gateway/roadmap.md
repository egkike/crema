# Development Roadmap
## Pasarela de Pagos Crypto (USDT) - Crema

**Versión**: 1.0  
**Fecha**: Marzo 2026  
**Change**: crypto-usdt-gateway  
**Estado**: ✅ COMPLETADO (Abril 2026)

---

> **Estado de Implementación**: ✅ COMPLETO
> - BlockonomicsProvider implementado ✅
> - Webhook handler implementado ✅
> - Tests unitarios agregado ✅
> - Soporte para USDT y BTC ✅
> - No soporta refunds (crypto irreversible) ✅

## Resumen de Fases

| Fase | Descripción | Duración Estimada |
|------|-------------|-------------------|
| 1 | Setup y Configuración | 1 hora |
| 2 | Base de Datos | 1 hora |
| 3 | BlockonomicsProvider | 3 horas |
| 4 | Integración con Sistema | 2 horas |
| 5 | Testing | 3 horas |
| **Total** | | **10 horas** |

---

## Fase 1: Setup y Configuración

### Tarea 1.1: Crear cuenta Blockonomics

- [ ] Registrarse en https://blockonomics.co
- [ ] Configurar tienda en dashboard
- [ ] Obtener API Key
- [ ] Configurar Callback URL (webhook)
- [ ] Generar Webhook Secret (opcional)

**Responsable**: Kike  
**Estimación**: 30 min

---

### Tarea 1.2: Configurar variables de entorno

```bash
# Agregar a .env.local
BLOCKONOMICS_API_KEY=tu_api_key
BLOCKONOMICS_STORE_ID=tu_store_id
BLOCKONOMICS_CALLBACK_URL=http://localhost:3000/api/payments/webhook/blockonomics
```

- [ ] Agregar variables en `.env.local`
- [ ] Agregar a `.env.example` (sin valores)
- [ ] Agregar a documentación de variables

**Responsable**: Dev  
**Estimación**: 15 min

---

### Tarea 1.3: Verificar dependencias

- [ ] Verificar que `axios` está instalado (para HTTP requests)
- [ ] Verificar que `crypto` está disponible (Node.js built-in)

**Responsable**: Dev  
**Estimación**: 5 min

---

## Fase 2: Base de Datos

### Tarea 2.1: Agregar columnas a payment_gateways

```sql
-- En backend/db/init/01-create-tables.sql
ALTER TABLE payment_gateways 
ADD COLUMN IF NOT EXISTS supports_refunds BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS supports_subscriptions BOOLEAN DEFAULT TRUE;
```

- [ ] Modificar `01-create-tables.sql`
- [ ] Regenerar tablas o ejecutar ALTER

**Responsable**: Dev  
**Estimación**: 15 min

---

### Tarea 2.2: Actualizar seeds

```sql
-- En backend/db/init/03-create-seeds.sql

-- Actualizar Blockonomics
INSERT INTO payment_gateways (id, name, liquidity_delay_days, is_active, supports_refunds, supports_subscriptions) 
VALUES ('blockonomics', 'Crypto (USDT)', 0, TRUE, FALSE, FALSE)
ON CONFLICT (id) DO UPDATE SET
  supports_refunds = FALSE,
  supports_subscriptions = FALSE;

-- Agregar currency gateway
INSERT INTO currency_gateways (currency_code, gateway_id, is_default, priority)
VALUES ('USDT', 'blockonomics', FALSE, 1)
ON CONFLICT DO NOTHING;
```

- [ ] Modificar `03-create-seeds.sql`
- [ ] Re-ejecutar seeds

**Responsable**: Dev  
**Estimación**: 15 min

---

### Tarea 2.3: Verificar estructura de tablas

- [ ] Conectar a DB local
- [ ] Verificar que columnas existen
- [ ] Verificar datos en currency_gateways

**Responsable**: Dev  
**Estimación**: 15 min

---

## Fase 3: BlockonomicsProvider

### Tarea 3.1: Crear BlockonomicsProvider.ts

```typescript
// backend/src/services/payment/providers/BlockonomicsProvider.ts
```

- [ ] Crear archivo con estructura PaymentProvider
- [ ] Implementar constructor con validación de variables
- [ ] Implementar createPreference()
- [ ] Implementar handleWebhook()
- [ ] Agregar manejo de errores

**Responsable**: Dev  
**Estimación**: 2 horas

---

### Tarea 3.2: Implementar createPreference

```typescript
async createPreference(data: CreatePreferenceDTO): Promise<PreferenceResponse> {
  // 1. Calcular amount en satoshis (1 USDT = 100,000,000 satoshis)
  // 2. Crear invoice en Blockonomics API
  // 3. Retornar checkout_url y order ID
}
```

- [ ] Llamar a Blockonomics API (POST /api/v2/invoice)
- [ ] Mapear response a PreferenceResponse
- [ ] Manejar timeout (30 segundos)
- [ ] Manejar errores de API

**Responsable**: Dev  
**Estimación**: 1 hora

---

### Tarea 3.3: Implementar handleWebhook

```typescript
async handleWebhook(payload: any): Promise<PaymentResponse> {
  // 1. Validar firma (si hay secret)
  // 2. Buscar orden por uuid
  // 3. Mapear status: 0→pending, 2→completed
  // 4. Retornar PaymentResponse
}
```

- [ ] Validar firma del webhook
- [ ] Mapear status codes
- [ ] Manejar idempotencia (duplicados)
- [ ] Registrar en log

**Responsable**: Dev  
**Estimación**: 1 hora

---

## Fase 4: Integración con Sistema

### Tarea 4.1: Registrar en PaymentProviderFactory

```typescript
// backend/src/services/payment/PaymentProviderFactory.ts

import { BlockonomicsProvider } from './providers/BlockonomicsProvider';

private static providers: Record<string, PaymentProvider> = {
  mercadopago: new MercadoPagoProvider(),
  simulator: new SimulatorProvider(),
  blockonomics: new BlockonomicsProvider(),  // AGREGAR
};
```

- [ ] Importar BlockonomicsProvider
- [ ] Agregar al providers map
- [ ] Verificar que funciona

**Responsable**: Dev  
**Estimación**: 15 min

---

### Tarea 4.2: Actualizar GatewayRepository

```typescript
// backend/src/repositories/gateway.repository.ts

// Agregar métodos
async getSupportsRefunds(gatewayId: string): Promise<boolean> { ... }
async getSupportsSubscriptions(gatewayId: string): Promise<boolean> { ... }
```

- [ ] Agregar método getSupportsRefunds
- [ ] Agregar método getSupportsSubscriptions
- [ ] Agregar tests unitarios

**Responsable**: Dev  
**Estimación**: 30 min

---

### Tarea 4.3: Actualizar OrderService (Garantía Cero)

```typescript
// En order.service.ts - createOrder o completeOrder

const supportsRefunds = await gatewayRepository.getSupportsRefunds(order.payment_method);
const guaranteeDays = supportsRefunds 
  ? await systemRepository.resolveGuaranteeDays(product.id)
  : 0;
```

- [ ] Modificar lógica de cálculo de garantía
- [ ] Verificar que se usa en release_at
- [ ] Testear con orden blockonomics

**Responsable**: Dev  
**Estimación**: 30 min

---

### Tarea 4.4: Crear webhook route

```typescript
// backend/src/routes/payment.routes.ts

router.post(
  '/webhook/blockonomics',
  rateLimit({ windowMs: 15*60*1000, max: 100 }),
  async (req, res) => {
    const provider = PaymentProviderFactory.getProvider('blockonomics');
    const result = await provider.handleWebhook(req.body);
    res.json(result);
  }
);
```

- [ ] Agregar endpoint webhook
- [ ] Agregar rate limiting
- [ ] Probar con mock

**Responsable**: Dev  
**Estimación**: 30 min

---

## Fase 5: Testing

### Tarea 5.1: Unit Tests - BlockonomicsProvider

- [ ] TC-01: createPreference happy path
- [ ] TC-02: createPreference API error
- [ ] TC-03: handleWebhook confirmed
- [ ] TC-04: handleWebhook invalid signature
- [ ] TC-05: handleWebhook duplicate

**Responsable**: Dev  
**Estimación**: 1 hora

---

### Tarea 5.2: Unit Tests - GatewayRepository

- [ ] TC-06: getSupportsRefunds
- [ ] TC-07: getSupportsSubscriptions

**Responsable**: Dev  
**Estimación**: 30 min

---

### Tarea 5.3: Unit Tests - OrderService

- [ ] TC-08: days_of_guarantee_applied = 0 para blockonomics

**Responsable**: Dev  
**Estimación**: 30 min

---

### Tarea 5.4: Integration Tests

- [ ] TC-09: POST /api/payments/create-preference
- [ ] TC-10: POST /api/payments/webhook/blockonomics
- [ ] TC-11: Full purchase flow

**Responsable**: Dev  
**Estimación**: 1 hora

---

### Tarea 5.5: Testing Manual

- [ ] MT-01: Pago real en testnet (si hay cuenta)
- [ ] MT-02: Verificar expiración
- [ ] MT-03: Verificar denegación de refund
- [ ] MT-04: Testing con Simulator

**Responsable**: QA/Dev  
**Estimación**: 30 min

---

## Fase 6: Documentación y Deploy

### Tarea 6.1: Documentar variables de entorno

- [ ] Agregar a README.md del backend
- [ ] Agregar a documentación de onboarding

**Responsable**: Dev  
**Estimación**: 15 min

---

### Tarea 6.2: Deploy a Staging

- [ ] Push código a rama feature
- [ ] Crear PR
- [ ] Merge a master
- [ ] Deploy a staging
- [ ] Verificar funcionamiento

**Responsable**: Dev  
**Estimación**: 30 min

---

## Checklist Final

- [x] Todos los unit tests pasan
- [x] Todos los integration tests pasan
- [x] Testing manual completado
- [x] Documentación actualizada
- [x] PR creado y aprobado
- [x] Deploy a producción

---

## Notas

- **Dependencias**: Las tareas de una fase pueden hacerse en paralelo si hay múltiples desarrolladores
- **Bloqueos**: Si Blockonomics API no responde, usar Simulator como fallback para testing
- **Rollback**: Si hay problemas en producción, deshabilitar pasarela: `UPDATE payment_gateways SET is_active = false WHERE id = 'blockonomics'`

---

**Documentos relacionados**:
- User-Stories-Crypto-USDT.md
- TSD-Pasarela-Crypto-USDT.md
- Test-Plan-Crypto-USDT.md
- PRD-Pasarela-Crypto-USDT.md v2.4
