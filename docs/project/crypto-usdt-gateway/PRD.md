# Product Requirements Document (PRD)
## Pasarela de Pagos Crypto (USDT) - Crema

**Versión**: 2.4  
**Fecha**: Marzo 2026  
**Estado**: Draft para revisión  
**Owner**: Kike García  

---

## 1. Visión General

### 1.1 Objetivo del Documento

Este PRD define los requisitos para implementar una pasarela de pagos con criptomonedas (USDT) en la plataforma Crema, permitiendo a los compradores pagar productos digitales con stablecoins.

### 1.2 Contexto y Justificación

#### Análisis Competitivo
- **Hotmart** (competidor principal): **NO** acepta criptomonedas como método de pago
- **Oportunidad**: Ser uno de los primeros platforms de cursos digitales en Argentina en aceptar USDT
- **Diferenciación**: Ventaja competitiva real vs la competencia

#### Datos de Mercado (Argentina 2025-2026)
| Métrica | Dato | Fuente |
|---------|------|--------|
| Adopción de población | 19.8% (top 20 mundial) | Chainalysis |
| USDT como % de operaciones | ~80% de transacciones crypto | Decrypto |
| Crecimiento usuarios activos | +185% año contra año | Informes 2025 |
| Comercios que aceptan crypto | 15,000+ | Cámara Argentina Fintech |
| Transacciones de pago con USDT | 72% de usuarios de apps | Oobit 2026 |

---

## 2. Modelo de Monedas de Crema (Contexto)

**Importante**: Este feature se integra en un modelo de negocio de monedas ya implementado. A continuación, las reglas actuales verificadas en código:

### 2.1 Reglas del Modelo de Monedas

| # | Regla | Implementado | Ubicación |
|---|-------|--------------|-----------|
| 1 | La plataforma define qué monedas están habilitadas | ✅ | `enabled_currencies` table |
| 2 | Para ser Creador/Afiliado debe cargar datos de cobro (banco o wallet crypto) | ✅ | Validado en `product.service.ts` |
| 3 | Creador solo puede crear productos en monedas que tiene habilitadas | ✅ | Línea 44-46 `product.service.ts` |
| 4 | Afiliado solo ve productos con monedas iguales a su perfil | ✅ | `product.repository.ts` getAvailableForAffiliate |
| 5 | Afiliado solo puede afiliarse a productos con monedas de su perfil | ✅ | Línea 206-214 `product.service.ts` |
| 6 | No hay conversiones entre monedas | ✅ | Sistema independiente por moneda |

### 2.2 Monedas Habilitadas Actuales

```sql
-- Tabla: enabled_currencies
('ARS', 'Pesos Argentinos', '$', ...)
('USDT', 'Tether', '₮', ...)  -- Ya existe!
```

### 2.3 Métodos de Cobro por Moneda

| Moneda | Campos Requeridos | Tipo |
|--------|-------------------|------|
| ARS | cbu, alias, tax_id, holder | bank_account |
| USDT | address, network | crypto_wallet |

**Nota**: El modelo ya soporta USDT como moneda. Solo falta la pasarela de pago.

---

## 3. Requisitos Funcionales

### 3.1 Pasarela de Pagos Crypto

#### RF-01: Integración con Blockonomics
- **Descripción**: Implementar proveedor de pagos Blockonomics para procesar transacciones USDT
- **Prioridad**: Alta

**Detalles Técnicos**:
- Blockonomics API para crear invoices
- Webhooks para confirmación de pagos
- **Blockonomics solo soporta ERC-20** para recibir pagos
- Fee: 1% por transacción (pagado mensualmente)

#### RF-02: Registro en Sistema de Pasarelas Dinámicas
- **Descripción**: Integrar Blockonomics al sistema de payment_gateways existente
- **Prioridad**: Alta

**Detalles Técnicos**:
- Agregar registro en tabla `payment_gateways`
- Mapear a moneda USDT en tabla `currency_gateways`
- Registrar en PaymentProviderFactory
- Validación contra allowedGateways por moneda

#### RF-03: Checkout con Opción USDT
- **Descripción**: El comprador con producto en USDT puede seleccionar USDT como método de pago
- **Prioridad**: Alta

**Flujo**:
1. Comprador selecciona producto en USDT
2. Frontend muestra pasarelas disponibles (MercadoPago, USDT)
3. Comprador selecciona "Pagar con USDT"
4. Redirigir a página de pago Blockonomics
5. Comprador envía USDT desde su wallet
6. Blockonomics detecta pago → webhook
7. Backend confirma orden → activa acceso

#### RF-04: Confirmación de Pago via Webhook
- **Descripción**: Procesar notificaciones de Blockonomics para confirmar transacciones
- **Prioridad**: Alta

**Detalles Técnicos**:
- Endpoint: `POST /api/payments/webhook/blockonomics`
- Validar firma del webhook
- Mapear status: pending → completed/failed
- Actualizar orden y balances

#### RF-05: Manejo de Tiempos de Espera
- **Descripción**: Definir comportamiento cuando el pago no se confirma en X tiempo
- **Prioridad**: Media

**Detalles**:
- Timeout: 30 minutos (recomendado por Blockonomics)
- Estado: "pending" hasta confirmación on-chain
- Cancelar y liberar si expira

### 3.2 Configuración

#### RF-06: Habilitación por Moneda
- **Descripción**: La pasarela USDT solo disponible para productos en moneda USDT
- **Prioridad**: Alta

**Detalles**:
- currency_gateways: ('USDT', 'blockonomics')
- Validar en payment controller

#### RF-07: Parámetros de Configuración
- **Descripción**: Variables de entorno para Blockonomics
- **Prioridad**: Alta

```env
BLOCKONOMICS_API_KEY=tu_api_key
BLOCKONOMICS_WEBHOOK_SECRET=tu_secret
BLOCKONOMICS_CALLBACK_URL=https://tu-dominio/api/payments/webhook/blockonomics
```

---

## 4. Requisitos No Funcionales

### 4.1 Seguridad

| Requisito | Descripción |
|-----------|-------------|
| **RNF-01** | Validar firma de webhooks Blockonomics |
| **RNF-02** | No almacenar claves API en texto plano (usar config) |
| **RNF-03** | Usar HTTPS para todos los endpoints |
| **RNF-04** | Rate limiting en endpoint de webhooks |

### 4.2 Rendimiento

| Requisito | Descripción |
|-----------|-------------|
| **RNF-05** | Tiempo de respuesta API < 500ms |
| **RNF-06** | Soporte para múltiples pagos simultáneos |
| **RNF-07** | Logging de todas las transacciones |

### 4.3 Compatibilidad

| Requisito | Descripción |
|-----------|-------------|
| **RNF-08** | Compatible con PaymentProvider interface existente |
| **RNF-09** | Funciona con el sistema currency_gateway existente |
| **RNF-10** | No rompe tests existentes |

---

## 5. Modelo de Datos

### 5.1 Tablas Existentes a Modificar

```sql
-- AGREGAR COLUMNAS: Si la tabla ya existe, agregar las nuevas columnas
ALTER TABLE payment_gateways ADD COLUMN supports_refunds BOOLEAN DEFAULT TRUE;
ALTER TABLE payment_gateways ADD COLUMN supports_subscriptions BOOLEAN DEFAULT TRUE;

-- Agregar Blockonomics como payment_gateway
-- Sopports_refunds = FALSE porque crypto es irreversible
-- Supports_subscriptions = FALSE porque Blockonomics no tiene billing nativo
INSERT INTO payment_gateways (id, name, liquidity_delay_days, supports_refunds, supports_subscriptions) VALUES 
('blockonomics', 'Crypto (USDT)', 0, FALSE, FALSE);

-- Mapear a moneda USDT (no USD - la moneda existente es USDT)
INSERT INTO currency_gateways (currency_code, gateway_id, is_default, priority) VALUES
('USDT', 'blockonomics', false, 1);
```

### 5.2 Código Existente a Modificar

La nueva columna `supports_refunds` requiere cambios en los siguientes archivos:

#### 5.2.1 `gateway.repository.ts` - Actualizar Interface y Métodos

```typescript
// ACTUALIZAR interface
export interface Gateway {
  id: string;
  name: string;
  liquidity_delay_days: number;
  is_active: boolean;
  supports_refunds: boolean;      // ← NUEVO
  supports_subscriptions: boolean; // ← NUEVO
}

// AGREGAR método para refunds
async getSupportsRefunds(gatewayId: string): Promise<boolean> {
  const schema = config.db?.schema || 'public';
  const query = `
    SELECT supports_refunds 
    FROM "${schema}".payment_gateways 
    WHERE id = $1
  `;
  
  try {
    const { rows } = await pool.query(query, [gatewayId]);
    return rows.length > 0 ? (rows[0].supports_refunds ?? true) : true;
  } catch (error: any) {
    logger.warn({ gatewayId, error: error.message }, '⚠️ Error getSupportsRefunds, defaults to true');
    return true;
  }
}

// AGREGAR método para suscripciones
async getSupportsSubscriptions(gatewayId: string): Promise<boolean> {
  const schema = config.db?.schema || 'public';
  const query = `
    SELECT supports_subscriptions 
    FROM "${schema}".payment_gateways 
    WHERE id = $1
  `;
  
  try {
    const { rows } = await pool.query(query, [gatewayId]);
    return rows.length > 0 ? (rows[0].supports_subscriptions ?? true) : true;
  } catch (error: any) {
    logger.warn({ gatewayId, error: error.message }, '⚠️ Error getSupportsSubscriptions, defaults to true');
    return true;
  }
}
```

#### 5.2.2 `order.service.ts` - Modificar Lógica de Garantía

```typescript
// En completeOrder(), línea 103-108 (aproximadamente)
// REEMPLAZAR la lógica actual:

// --- LÓGICA DE GARANTÍA + LIQUIDEZ + REFUNDS ---
// 1. Obtener info de la pasarela
const gateway = await gatewayRepository.getById(lockedOrder.payment_method);
const supportsRefunds = gateway?.supports_refunds ?? true;

// 2. Calcular días de garantía
let guaranteeDays: number;
if (supportsRefunds) {
  // Si la pasarela soporta refunds, usar garantía del producto
  guaranteeDays = await systemRepository.resolveGuaranteeDays(product.id);
} else {
  // Si la pasarela NO soporta refunds (ej: crypto), garantía = 0
  guaranteeDays = 0;
  logger.info({ orderId: lockedOrder.id, paymentMethod: lockedOrder.payment_method }, 
    '⚠️ Pasarela sin soporte de refunds - Garantía establecida en 0 días');
}

// 3. Obtener días de liquidez de la pasarela
const gatewayLiquidityDays = await gatewayRepository.getLiquidityDays(lockedOrder.payment_method);

// 4. El release final es el máximo entre garantía y liquidez
const finalDelayDays = Math.max(guaranteeDays, gatewayLiquidityDays);
```

#### 5.2.3 Schema de Base de Datos (01-create-tables.sql)

```sql
-- ACTUALIZAR tabla payment_gateways
CREATE TABLE IF NOT EXISTS payment_gateways (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    liquidity_delay_days INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    supports_refunds BOOLEAN DEFAULT TRUE  -- ← NUEVO
);
```

#### 5.2.4 Seeds (03-create-seeds.sql)

```sql
-- ACTUALIZAR seeds existentes con supports_refunds
INSERT INTO payment_gateways (id, name, liquidity_delay_days, supports_refunds) VALUES 
('mercadopago', 'Mercado Pago', 30, TRUE),
('simulator', 'Pay Simulator', 0, TRUE),
('blockonomics', 'Crypto (USDT)', 0, FALSE);  -- FALSE para crypto

-- Currency gateways se mantiene igual
INSERT INTO currency_gateways (currency_code, gateway_id) VALUES
('ARS', 'mercadopago'),
('ARS', 'simulator'),
('USDT', 'simulator'),
('USDT', 'blockonomics');
```

#### 5.2.5 Tests a Actualizar

| Test | Cambios necesarios |
|------|---------------------|
| `order.service.test.ts` | Verificar que con pasarela sin refunds, `days_of_guarantee_applied = 0` |
| `gateway.repository.test.ts` | Agregar test para `getSupportsRefunds()` |
| `refund.service.test.ts` | Verificar que refund es denegado automáticamente cuando `days_of_guarantee_applied = 0` |

---

### 5.3 Resumen de Cambios por Archivo

| Archivo | Tipo de Cambio | Impacto |
|---------|-----------------|---------|
| `01-create-tables.sql` | Schema (nueva columna) | Migración de DB |
| `03-create-seeds.sql` | Seeds (actualizar valores) | Datos iniciales |
| `gateway.repository.ts` | Interface + Método nuevo | Bajo |
| `order.service.ts` | Lógica de garantía | Medio |
| Tests existentes | Actualizar assertions | Bajo |

### 5.2 Notas sobre Platform Balance

El sistema actual `platform_balance_repository` ya soporta múltiples currencies. No requiere modificaciones para aceptar USDT.

---

## 6. Handling de Comisiones del Proveedor

### 6.1 Comparativa: MercadoPago vs Blockonomics

| Aspecto | MercadoPago | Blockonomics |
|---------|-------------|--------------|
| **Modelo de fee** | Por transacción inmediata | Fee mensual consolidado |
| **Detalle en webhook** | ✅ Sí (`fee_details` array) | ❌ No (solo basics) |
| **Campos disponibles** | `gatewayFee`, `gatewayTax` por transacción | No disponible por transacción |
| **Fee real** | ~5-10% (variable) | 1% fijo (mensual) |

### 6.2 Detalle: Webhook de MercadoPago (Referencia)

El código actual de MP provee:

```typescript
// De MercadoPagoProvider.ts línea 200-228
if (payment.fee_details && Array.isArray(payment.fee_details)) {
  payment.fee_details.forEach((fee: any) => {
    if (fee.type === 'mercadopago_fee') {
      gatewayFee += Number(fee.amount || 0);
    }
    else if (fee.type === 'tax') {
      gatewayTax += Number(fee.amount || 0);
    }
    else {
      gatewayFee += Number(fee.amount || 0);
    }
  });
}

return {
  externalReference: payment.external_reference,
  status: payment.status,
  transactionId: String(payment.id),
  gatewayFee,  // Comisión de la pasarela
  gatewayTax,  // Impuestos retenidos
};
```

### 6.3 Blockonomics: Información Disponible en Webhook

El webhook de Blockonomics provee:

```
Callback params:
- secret (si configurado)
- txid (transaction ID)
- value (monto en satoshis)
- addr (dirección de pago)
- status: 0 (Unconfirmed), 1 (Partially), 2 (Confirmed)
- rbf (replace-by-fee flag)
- uuid (order ID - si se usa Orders API)
```

**NO provee**:
- Fee detallado por transacción
- Impuestos
- Comisiones

### 6.4 Estrategia para Registrar Comisiones Blockonomics

Dado que Blockonomics no provee detalle por transacción, proponemos:

| Enfoque | Descripción | Pros | Contras |
|---------|-------------|------|----------|
| **A. Fee fijo estimado** | Usar 1% como fee estimado en cada transacción | Simple, inmediato | No es exacto |
| **B. Ajuste mensual** | Registrar sin fee, ajustar al recibir bill mensual | Preciso | Complejo, requiere reconciliación |
| **C. Combinado** | Registrar 1% estimado + ajustar monthly | Balance | Más trabajo |

**Recomendación: Enfoque A (Fee fijo estimado)**

```typescript
// BlockonomicsProvider handleWebhook
const gatewayFee = Number(data.expectedAmount) * 0.01; // 1% estimado

return {
  externalReference: data.externalReference,
  status: mapStatus(data.status), // 0→pending, 2→completed
  transactionId: data.txid || data.uuid,
  gatewayFee, // 1% estimado
  gatewayTax: 0, // No aplica para crypto
};
```

**Nota**: Para reportes exactos de comisiones, se recomienda:
1. Descargar monthly statement de Blockonomics dashboard
2. Reconciliar con transacciones registradas
3. Ajustar si hay discrepancia significativa

---

## 7. Arquitectura Técnica

### 6.1 Componentes a Crear

```
backend/src/services/payment/providers/
├── BlockonomicsProvider.ts    (NUEVO)
```

### 6.2 Modificaciones

```typescript
// PaymentProviderFactory.ts
import { BlockonomicsProvider } from './providers/BlockonomicsProvider';

private static providers: Record<string, PaymentProvider> = {
  mercadopago: new MercadoPagoProvider(),
  simulator: new SimulatorProvider(),
  blockonomics: new BlockonomicsProvider(), // ← AGREGAR
};
```

### 6.3 Endpoint de Webhook

```
POST /api/payments/webhook/blockonomics
├── Headers: X-Webhook-Signature (validar)
├── Body: { invoice_id, status, crypto_address, amount }
└── Response: 200 OK (acknowledge)
```

---

## 7. Flujo del Usuario

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Comprador   │     │   Frontend   │     │   Backend    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │ Selecciona prod    │                    │
       │ en USDT            │                    │
       │──────────────────> │                    │
       │                    │                    │
       │ Muestra checkout   │                    │
       │ (MP + USDT)        │                    │
       │<────────────────── │                    │
       │                    │                    │
       │ Selecciona USDT    │                    │
       │──────────────────> │                    │
       │                    │ POST /create-preference│
       │                    │ (gatewayId: blockonomics)|
       │                    │───────────────────>│
       │                    │                    │
       │                    │ ←───────────────── │
       │                    │ {initPoint: url}   │
       │                    │                    │
       │ Redirige a         │                    │
       │ Blockonomics       │                    │
       │<───────────────────│                    │
       │                    │                    │
       │ Paga con wallet    │                    │
       │ (MetaMask, etc)    │                    │
       │                    │                    │
       │                    │    WEBHOOK         │
       │                    │<───────────────────│
       │                    │                    │
       │                    │ Confirma pago      │
       │                    │ Activa acceso      │
       │                    │───────────────────>│
       │                    │                    │
       │ Acceso concedido   │                    │
       │<───────────────────│                    │
```

---

## 8. Pruebas

### 8.1 Tests Unitarios

| Test | Descripción |
|------|-------------|
| Crear invoice | Verificar que createPreference llama a Blockonomics API |
| Webhook validation | Verificar firma valida correctamente |
| Timeout handling | Verificar comportamiento cuando expira |

### 8.2 Tests de Integración

| Test | Descripción |
|------|-------------|
| Flow completo | Comprador → Blockonomics → Webhook → Confirmación |
| Fallback | Verificar que Simulator sigue funcionando |

### 8.3 Tests Manuales

| Test | Descripción |
|------|-------------|
| Pago real USDT | Hacer compra con USDT real en testnet |
| Webhook | Simular webhook de Blockonomics |

---

## 8. Configuración de Variables de Entorno

### 8.1 Variables Requeridas para Blockonomics

```env
# ===========================================
# BLOCKONOMICS - Pasarela de Pagos Crypto
# ===========================================

# API Key de Blockonomics (obtener desde dashboard > Stores > API)
BLOCKONOMICS_API_KEY=tu_api_key_aqui

# Store ID (identificador de tu tienda en Blockonomics)
BLOCKONOMICS_STORE_ID=tu_store_id

# Callback URL (webhook endpoint)
# debe ser accesible públicamente para producción
# para desarrollo local usar ngrok
BLOCKONOMICS_CALLBACK_URL=https://tu-dominio.com/api/payments/webhook/blockonomics

# (Opcional) Secret para validar webhooks
BLOCKONOMICS_WEBHOOK_SECRET=tu_secret_aqui
```

### 8.2 Ubicación del Archivo

| Entorno | Archivo |
|---------|---------|
| Desarrollo | `.env.local` |
| Staging | `.env.staging` |
| Producción | `.env` (no commitear) |

### 8.3 Ejemplo .env.example

Crear archivo `backend/.env.example` con las variables (sin valores reales):

```bash
# Blockonomics
BLOCKONOMICS_API_KEY=
BLOCKONOMICS_STORE_ID=
BLOCKONOMICS_CALLBACK_URL=
# BLOCKONOMICS_WEBHOOK_SECRET=  # opcional
```

### 8.4 Validación en Código

El provider debe validar al inicializar:

```typescript
// BlockonomicsProvider.ts
constructor() {
  if (!process.env.BLOCKONOMICS_API_KEY) {
    throw new Error('BLOCKONOMICS_API_KEY is required');
  }
  if (!process.env.BLOCKONOMICS_STORE_ID) {
    throw new Error('BLOCKONOMICS_STORE_ID is required');
  }
}
```

### 8.5 Notas de Seguridad

| Aspecto | Recomendación |
|---------|---------------|
| **API Key** | No commitear al repositorio |
| **Webhook Secret** | Usar para validar autenticidad de callbacks |
| **Callback URL** | Debe ser HTTPS en producción |
| **Logs** | No loguear la API key completa |

---

## 9. Estimación de Trabajo

| Fase | Tarea | Estimación |
|------|-------|------------|
| 1 | Setup Blockonomics (cuenta, API keys) | 1 hora |
| 2 | Modificar schema DB (agregar supports_refunds) | 0.5 hora |
| 3 | Actualizar gateway.repository.ts (interface + método) | 1 hora |
| 4 | Modificar order.service.ts (lógica de garantía) | 1 hora |
| 5 | Crear BlockonomicsProvider.ts | 2-3 horas |
| 6 | Registrar en Factory y DB | 1 hora |
| 7 | Implementar webhook handler | 1-2 horas |
| 8 | Actualizar tests existentes | 1 hora |
| 9 | Tests unitarios + integración | 1-2 horas |
| **Total** | | **10-13 horas** |

**Nota**: Las tareas 2-4 son cambios en código existente necesarios para el feature `supports_refunds`. No son opcionales.

---

## 14. Impacto en Otros Procesos del Sistema

### 14.1 Release Service (Liberación de Saldos)

#### Análisis
El Release Service procesa la liberación de saldos pendientes basándose en la columna `release_at` de la orden, que se calcula así:

```typescript
// order.service.ts línea 103-111
const guaranteeDays = ...; // Del producto
const gatewayLiquidityDays = ...; // De payment_gateways
const finalDelayDays = Math.max(guaranteeDays, gatewayLiquidityDays);

const releaseAt = new Date();
releaseAt.setDate(releaseAt.getDate() + finalDelayDays);
```

#### Impacto con supports_refunds

| Escenario | guaranteeDays | gatewayLiquidityDays | release_at | Resultado |
|-----------|---------------|---------------------|------------|-----------|
| MP (con garantía) | 7-30 | 30 | created + max(7,30) | Espera normales |
| **Blockonomics (sin garantía)** | **0** | **0** | **created + 0 = now** | **Liberación inmediata** |

#### Conclusión

| Aspecto | Estado |
|---------|--------|
| **Cambios necesarios** | NINGUNO |
| **Funcionamiento** | Ya funciona correctamente |

**Explicación**: Con `supports_refunds = false`, el `guaranteeDays = 0`, lo que significa `release_at = created_at` (ahora). La orden se libera inmediatamente, lo cual es correcto porque el dinero ya está disponible en la wallet de Crema y no hay garantía que esperar.

---

### 14.2 Suscripciones a Planes Pro (Creadores)

#### Análisis del Sistema Actual

El sistema de suscripciones (`SubscriptionService`) funciona así:

```typescript
// subscription.service.ts línea 15-70
async createSubscriptionLink(userId, planId, payerEmail, gatewayId) {
  // 1. Obtiene métodos de pago del usuario
  const payoutMethods = await payoutMethodRepository.getByUserId(userId);
  
  // 2. Busca plan compatible con la moneda del usuario
  const plan = await subscriptionRepository.getPlanById(planId, method.currency);
  
  // 3. Valida pasarela para esa moneda
  const allowedGateways = await configRepository.getGatewaysByCurrency(plan.currency);
  
  // 4. Crea suscripción en la pasarela
  const provider = PaymentProviderFactory.getProvider(gatewayId);
  const response = await provider.createSubscription({...});
}
```

**Planes existentes en DB**:
- Los planes Pro tienen precios en diferentes monedas (`plan_prices` table)
- Cada plan puede tener precios en ARS, USDT, etc.

#### Estado Actual de Soporte

| Pasarela | createSubscription | cancelSubscription |
|----------|-------------------|-------------------|
| MercadoPago | ✅ SÍ | ✅ SÍ |
| Simulator | ✅ SÍ | ✅ SÍ |
| Blockonomics | ❓ Por investigar | ❓ Por investigar |

#### Investigación: Blockonomics y Suscripciones

Según la documentación de Blockonomics:
- **Soporta suscripciones** a través de su API + plugins (WooCommerce + YITH, WHMCS)
- **Modelo**: No tiene suscripciones nativas como MP. Funciona mejor con sistemas externos de facturación.
- **Para Crema**: Las suscripciones recurrentes con Blockonomics requieren implementación adicional o usar un sistema de billing manual.

#### Opciones para Suscripciones en USDT

| Opción | Descripción | Pros | Contras |
|--------|-------------|------|----------|
| **A. No soportado inicialmente** | Las suscripciones Pro solo en ARS | Simple | Menos features |
| **B. Facturación manual** | Generar invoice mensual manualmente | Flexible | Operativo |
| **C. Plugins externos** | Integrar sistema de billing externo | Automatizado | Complejo |
| **D. API Blockonomics** | Implementar generación periódica de invoices | Automatizado | Desarrollo significativo |

#### Recomendación: Opción 1 (Columna supports_subscriptions)

**Para el MVP de crypto**, las suscripciones a Planes Pro **no serán compatibles con USDT**.

**Implementación con columna explícita**:

```sql
-- Agregar columna supports_subscriptions (opcional para futuro)
ALTER TABLE payment_gateways ADD COLUMN supports_subscriptions BOOLEAN DEFAULT TRUE;

-- MP sí, Blockonomics no (por ahora)
UPDATE payment_gateways SET supports_subscriptions = FALSE WHERE id = 'blockonomics';
```

**Justificación**:
1. Las suscripciones requieren infraestructura de billing compleja
2. El MVP de USDT es para pagos de productos (compras únicas)
3. Los creadores pueden pagar su plan Pro en ARS con MP
4. **Flexibilidad futura**: Si Blockonomics agrega soporte → solo actualizar columna a TRUE

**Cambios en código**:
```typescript
// En SubscriptionService (actualizar validación)
const gateway = await gatewayRepository.getById(gatewayId);
if (!gateway?.supports_subscriptions) {
  throw new AppError('Esta pasarela no soporta suscripciones recurrentes', 400);
}
```

**Ventaja**: En el futuro, si Blockonomics agrega soporte o agregamos otra pasarela, solo actualizamos la columna en la DB sin cambios de código.

---

### 14.3 Resumen de Impacto en Otros Procesos

| Proceso | Impacto | Cambios Necesarios |
|---------|---------|-------------------|
| **Release Service** | ✅ NINGUNO | Ninguno - funciona automáticamente |
| **Suscripciones Pro** | ⚠️ NO SOPORTADO | Ninguno - el sistema ya valida que el provider tenga createSubscription |

---

## 10. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|---------------|---------|------------|
| Volatilidad USDT | Alta | Medio | No convertir, mantener en crypto |
| API Blockonomics down | Baja | Alto | Logging y alertas |
| Webhook no llega | Media | Alto | Retry logic + status check |
| Usuario no tiene wallet crypto | Media | Bajo | No es problema nuestro |
| **Refund automático** | ✅ Solucionado | `supports_refunds = false` → garantía = 0 → siempre denegado |
| **Pago del bill mensual** | Media | Medio | Recordar pago día 10, grace period 30 días |

### 10.1 Detalle: Gestión de Comisiones

**Problema**: Blockonomics cobra su fee de forma mensual consolidada, no por transacción. El webhook no incluye el detalle del fee.

**Solución propuesta**:
- Registrar cada transacción con `gatewayFee = amount * 0.01` (1% estimado)
- Al recibir monthly bill de Blockonomics, reconciliar y ajustar si hay diferencia
- Para reportes precisos, usar monthly statement del dashboard

### 10.2 Costo del 1% - Decisión de Negocio

**Decisión**: **La plataforma Crema asume el 1%** (mismo modelo que MercadoPago)

**Justificación**:
| Aspecto | MercadoPago | Blockonomics |
|---------|-------------|--------------|
| Fee real | ~5-10% | 1% |
| Quién lo paga | Plataforma Crema | Plataforma Crema (mismo modelo) |

**Análisis comparativo**:
- MP (~5-10%) → Crema absorbe ~5-10% del total como costo
- Blockonomics (1%) → Crema absorbe 1% del total = **~5-10x más barato**

**Matemática ejemplo** (producto $100 USDT):
```
Pago: $100 USDT
├── Comisión plataforma (10%): $10 USDT
├── Fee Blockonomics (1%): $1 USDT (asumido por Crema)
└── Ganancia real Crema: $9 USDT (vs ~$2-5 con MP en ARS)
```

**Beneficio**: El modelo USDT es más rentable para Crema que ARS con MP.

---

## 11. Contabilidad

### 11.1 Cómo funciona el Fee de Blockonomics (Importante)

| Aspecto | MercadoPago | Blockonomics |
|---------|-------------|--------------|
| **Cuándo se descuenta** | Inmediato (por transacción) | Mensual consolidado |
| **Fondos disponibles** | Se descuenta automáticamente | 100% disponible al instante |
| **Cuándo pagar** | N/A (ya inmue) | Día 10 del mes siguiente |
| **Grace period** | N/A | 30 días si no paga |

**Flujo detallado Blockonomics**:
```
1. Cliente paga USDT → USDT va DIRECTO a wallet de Crema (non-custodial)
2. Wallet Crema: +$100 USDT (disponible inmediatamente)
3. Día 1 del mes siguiente: Blockonomics genera bill mensual
4. Día 10: Vence el pago del bill
5. Crema paga desde su Credit Balance en Blockonomics
```

**Conclusión**: El fee se paga DESPUÉS de recibir el dinero, no se descuenta de la transacción.

### 11.2 Registro de Transacciones USDT

El manejo contable de transacciones USDT requiere las siguientes consideraciones:

| Aspecto | Tratamiento | Notas |
|---------|-------------|-------|
| **Recibir USDT** | Registrar como activo (cripto) | Valor al tipo de cambio del día |
| **Fee Blockonomics (1%)** | Gasto operacional | Se paga mensual, no por transacción |
| **Plataforma fee (ej: 10%)** | Ingreso gravado | Se calcula sobre monto total |
| **Ganancia real** | Ingreso neto = Fee plataforma - Fee pasarela | Ej: $10 - $1 = $9 USDT |

### 11.3 Flujo Contable (Diferente a MP)

```typescript
// Al confirmar pago Blockonomics
// A DIFERENCIA DE MP: NO se descuenta el fee - el dinero está 100% disponible

return {
  gatewayFee: 0,  // $0 en este momento (se provisiona mensual)
  gatewayTax: 0
};

// Al cierre de mes:
// 1. Generar provisión: total_transacciones_mes * 0.01
// 2. Registrar gasto provisionado
// 3. Al recibir bill (día 1): reconciliar y ajustar si hay diferencia
// 4. Pagar bill (día 10): deducir del balance
```

| Campo en Order | Valor Blockonomics | Notas |
|----------------|-------------------|-------|
| `gateway_fee` | `0` (se registra después) | Provisionar mensualmente |
| `gateway_tax` | `0` | No aplica para crypto |
| `netProfit` | `platformFee - 0` (al momento) | Ajustar al cerrar mes |

### 11.4 Reconciliación Mensual

**Proceso recomendado**:
1. **Mensual (día 1)**: Blockonomics genera bill consolidado
2. **Calcular**: Sumar todos los `$amount * 0.01` de transacciones del mes
3. **Comparar**: Vs. el bill real de Blockonomics
4. **Ajustar**: Si hay diferencia > 5%, registrar ajuste contable
5. **Pagar**: Día 10 del mes (manual o auto-recharge)

### 11.5 Reportes Contables - Impacto y Ajustes

#### Reportes Existentes a Revisar

| Reporte | Ubicación | ¿Se adapta a USDT? | Ajuste Necesario |
|---------|-----------|-------------------|------------------|
| **platform_earnings** | `platform_earnings.repository.ts` | ⚠️ Parcial | Agregar campo `gateway_fee_provision` |
| **Financial Health** | `admin.routes.ts` `/financial-health` | ✅ Ya soporta multi-moneda | Ninguno |
| **Tax Report** | `admin.routes.ts` `/export/tax-report` | ✅ Soporta currencies | Ninguno |
| **Orders Report** | Orders table | ✅ Tiene campo `gateway_fee` | El campo arriving 0 para USDT |

#### Reportes Nuevos Recomendados

| Reporte | Descripción | Frecuencia |
|---------|-------------|------------|
| **Provision Report** | Lista de transacciones con 1% estimado para provisionar | Mensual |
| **Blockonomics Reconciliation** | Comparación: provisioned vs bill real | Mensual |
| **Crypto Holdings** | Saldo de USDT en wallets + valoración | Diario/Semanal |

#### Ajuste propuesto a platform_earnings

```sql
-- Agregar campo para tracking de provisión de fees crypto
ALTER TABLE platform_earnings 
ADD COLUMN gateway_fee_provisioned DECIMAL(18,8) DEFAULT 0,
ADD COLUMN gateway_fee_adjustment DECIMAL(18,8) DEFAULT 0,
ADD COLUMN gateway_fee_actual DECIMAL(18,8) DEFAULT 0;
```

**Flujo de registro**:
```typescript
// 1. Al confirmar orden (inmediato)
platformEarnings = {
  gateway_fee_provisioned: 0,  // Por ahora $0
  gateway_fee_adjustment: 0,
  gateway_fee_actual: 0,
  netProfit: totalPlatformFee  // 100% disponible
};

// 2. Al cerrar mes (reconciliación)
platformEarnings = {
  gateway_fee_provisioned: amount * 0.01,
  gateway_fee_adjustment: difference,  // Si hay diff
  gateway_fee_actual: bill_amount,
  netProfit: totalPlatformFee - gateway_fee_actual
};
```

### 11.6 Consideraciones Fiscales para la Plataforma

| Aspecto | Tratamiento |
|---------|-------------|
| **Tenencia de USDT** | Declarar en Bienes Personales al 31/12 |
| **Ganancia por volatilidad** | Si el valor USDT/ARS varía entre recepción y conversión |
| **Gasto deducible** | Fee de Blockonomics es gasto operacional |

**Nota**: Se recomienda consultar con contador especializado en cripto para validación de este esquema contable.

### 11.7 Costos de Gas/Red para Transacciones USDT

#### Costos por Red (Marzo 2026)

| Red | Costo por Transacción | Notas |
|-----|---------------------|-------|
| **ERC-20** | $1-3 USD (en ETH) | Más caro, necesario para recibir |
| **TRC-20** | $1-2 USD (en TRX) | Barato y rápido |
| **BEP-20** | $0.50-1 USD (en BNB) | El más económico |

#### Quién Paga el Gas

| Momento | Quién paga | Costo |
|---------|-----------|-------|
| Cliente → Blockonomics | Cliente | $1-3 (incluido en su tx) |
| Blockonomics → Crema | Nadie | $0 |
| Crema → Creador | Crema | $0.50-2 por transacción |

#### Estimación de Costos Mensuales (Pagos a Creadores)

| Volumen (payouts/mes) | Costo Gas |
|------------------------|----------|
| 10 | $5-20 |
| 50 | $25-100 |
| 100 | $50-200 |
| 500 | $250-1,000 |

#### Recomendación
El costo de gas para pagar a creadores debe considerarse como **gasto operacional** de la pasarela crypto. Se recomienda provisionar un monto mensual estimado basado en el volumen de payouts.

### 11.8 Análisis de Volatilidad

#### Tipos de Volatilidad a Considerar

| Tipo | Descripción | Riesgo para Crema |
|------|-------------|-------------------|
| **USDT vs USD** | USDT está diseñado para mantener 1:1 con USD | ✅ Muy bajo |
| **USDT vs ARS** | Par ARS/USDT varia según mercado blue/oficial | ⚠️ Medio (si se convierte a ARS) |
| **ETH/BNB/TRX (gas)** | Costo de red varía | ✅ Bajo (asumido por cliente/Crema) |

#### Escenario: USDT como Moneda Final

**Supuesto del modelo**:
- El comprador paga en USDT
- El creador recibe en USDT
- **No hay conversión a ARS**

```
FLUJO ACTUAL (sin conversión):
Cliente → Paga USDT → Crema recibe USDT → Creador recibe USDT
```

**En este escenario**:
- La volatilidad USDT/USD es prácticamente nula
- La volatilidad USDT/ARS NO afecta porque no se convierte
- El riesgo de volatilidad es **mínimo**

#### Escenario: Si Crema Necesitara Convertir a ARS

| Momento | Riesgo | Mitigación |
|---------|--------|------------|
| Cliente paga → Se convierte a ARS | Bajo | Hacer conversión inmediatamente |
| ARS guardado → Se usa para pagar | Medio | Mantener reservas en USDT |
| USDT/ARS baja entretx y payout | Alto | NO CONVERTIR - pagar en USDT |

**Decisión**: El modelo USDT funciona porque **no se convierte a ARS**. El creador recibe USDT, no ARS.

####结论

| Aspecto | Análisis | Resultado |
|---------|----------|----------|
| Volatilidad USDT/USD | Stablecoin, mantiene paridad | ✅ Sin riesgo |
| Volatilidad USDT/ARS | No se convierte | ✅ Sin riesgo |
| Volatilidad gas networks | Costo variable | ✅ Asumido por Crema |

**Veredicto**: El modelo USDT **NO tiene problema de volatilidad** porque no involucra conversión de monedas. El flujo es 100% en USDT.

---

## 13. Impacto en Procesos Existentes

### 13.1 Refunds (Devoluciones por Garantías)

#### Análisis del Problema
Las transacciones crypto son **IRREVERSIBLES**. No se puede hacer refund automático como con tarjetas.

#### Solución Propuesta: Columna `supports_refunds` en payment_gateways

| Aspecto | Implementación |
|---------|-----------------|
| **Nueva columna** | `payment_gateways.supports_refunds` (BOOLEAN, default TRUE) |
| **Comportamiento** | Si `supports_refunds = FALSE` → garantía = 0 días |
| **Verificación** | El sistema verifica `days_of_guarantee_applied = 0` para denegar refund |

#### Cambios Técnicos

**1. Schema de la tabla**:
```sql
ALTER TABLE payment_gateways 
ADD COLUMN supports_refunds BOOLEAN DEFAULT TRUE;

-- Blockonomics no soporta refunds
UPDATE payment_gateways 
SET supports_refunds = FALSE 
WHERE id = 'blockonomics';
```

**2. Lógica en order.service.ts**:
```typescript
// Obtener si la pasarela soporta refunds
const gateway = await gatewayRepository.getById(order.payment_method);
const supportsRefunds = gateway?.supports_refunds ?? true;

// Si la pasarela no soporta refunds, garantía = 0
const guaranteeDays = supportsRefunds 
  ? await systemRepository.resolveGuaranteeDays(product.id)
  : 0;
```

**3. El refund service ya valida esto automáticamente** (línea 67-73):
```typescript
// Si days_of_guarantee_applied = 0, la fecha de expiración es inmediata
expirationDate.setDate(expirationDate.getDate() + (order.days_of_guarantee_applied || 7));
if (now > expirationDate) {
  throw new AppError('El periodo de garantía ha expirado.', 400);
}
```

**Resultado**: Un producto pagado con Blockonomics tendrá `days_of_guarantee_applied = 0`, lo que significa que la garantía ya expiró al momento de la compra → **Refund siempre denegado automáticamente**.

#### Comunicación al Comprador

| Momento | Mensaje |
|---------|----------|
| **Checkout** | "Este producto se paga con USDT - No aplica garantía de reembolso" |
| **Producto** | "Medio de pago: USDT - Sin garantía" |
| **Email confirmación** | "Tu compra con USDT no tiene garantía de reembolso" |

#### Beneficios

| Aspecto | Beneficio |
|---------|------------|
| **Automático** | No necesita intervención manual |
| **Transparente** | El buyer sabe que no tiene garantía al comprar |
| **No rompe MP** | Los pagos con MP siguen teniendo garantía |
| **Simple** | Una columna booleana lo resuelve |

---

### 13.2 Payouts (Retiros a Creadores y Afiliados)

#### Flujo Actual
- El usuario solicita retiro via `POST /api/payouts`
- El admin procesa manualmente via `PATCH /api/admin/payouts/:id/status`
- **No hay integración automática** con pasarela de envío de dinero
- El admin registra manualmente el `transactionReceipt`

#### Análisis con Blockonomics

| Aspecto | Estado | Notas |
|---------|--------|-------|
| **Payouts ARS** | ✅ Manual actual | Admin hace transferencia desde banco |
| **Payouts USDT** | ✅ Manual actual (mismo) | Admin hace transferencia desde wallet |
| **Wallet del usuario** | ✅ Disponible | user_payout_methods tiene `address` y `network` |

#### Proceso actual de payouts ya soporta USDT

El modelo de payout actual **YA FUNCIONA** para USDT:
```typescript
// payout.service.ts línea 60-62
if (method.currency !== currency) {
  throw new AppError(`Este método de retiro no coincide con la moneda ${currency}`, 400);
}
```

El usuario con método de pago USDT (wallet address) puede:
1. Solicitar retiro en USDT
2. Admin revisa y aprueba manualmente
3. Admin transfiere desde la wallet de Crema a la wallet del usuario

#### Sin cambios necesarios para payouts

| Proceso | Cambio necesario |
|---------|-----------------|
| Solicitud de retiro | Ninguno (ya soporta USDT) |
| Aprobación manual | Ninguno (ya es manual) |
| Transferencia | El admin transfiere desde wallet Crema |

#### Estrategia de Redes para Payouts

**Contexto**: Blockonomics solo permite recibir en ERC-20. Sin embargo, para pagar a creadores/afiliados podemos usar redes más económicas.

**Estrategia Dual**:
```
1. CLIENTE → PAGA a Crema
   └─→ Blockonomics (solo ERC-20)
       └─→ Costo gas: $0 (lo paga el cliente)

2. CREMA → PAGA a Creador
   └─→ Wallet TRC20 o BEP20 de Crema
       └─→ Costo gas: $0.50-2 (asumido por Crema)
```

**Control de Redes** (Solución A implementada):
- El seed de USDT se modifica para **permitir solo TRC20 y BEP20** (no ERC20)
- El usuario selecciona la red de su preferencia al configurar su wallet
- Al pagar, Crema usa la red que el usuario eligió

**Modificación necesaria**:
```sql
-- En 03-create-seeds.sql, cambiar validation_rules de USDT:
"pattern": "^(TRC20|BEP20)$"  -- Antes: "^(TRC20|ERC20|BEP20)$"
```

**Validación en Backend** (ya implementada):
- El backend usa `payout_method.service.ts` línea 105
- Valida contra el `pattern` del seed automáticamente
- Si el usuario envía una red inválida, recibe error 400

**Frontend** (requiere verificación):
- El dropdown de selección de red debe mostrar solo TRC20 y BEP20
- Se recomienda obtener las redes permitidas desde la API del backend
- Si el frontend envía una red inválida, el backend la rechazará

**Wallets que necesita Crema**:
| Red | Para qué |
|-----|----------|
| ERC-20 | Recibir de Blockonomics |
| TRC-20 | Pagar a creadores |
| BEP-20 | Pagar a creadores (backup) |

---

## 14. Consideraciones Legales (Resumen)

### 11.1 Situación en Argentina (2026)

| Aspecto | Estado |
|---------|--------|
| Legalidad | ✅ Legal operar con crypto |
| Registro CNV | ⚠️ Requiere evaluación (PSAV vs merchant) |
| Impuestos usuario | Ganancias 5-15%, Bienes Personales 0.5-1.5% |
| Reporte a ARCA | ⚠️ Exchanges locales reportan; merchant probablemente no |

### 11.2 Recomendación Legal

> Se recomienda consultar con abogado especializado en fintech antes de lanzar a producción, para confirmar si Crema necesita registrarse como PSAV ante la CNV.

---

## 15. Alternativas Consideradas

### 12.1 Otros Proveedores Evaluados

| Proveedor | Modelo | Fee | KYC | Estado |
|-----------|--------|-----|-----|--------|
| **Blockonomics** | Non-custodial | 1% | ❌ No | ✅ SELECCIONADO |
| NOWPayments | Custodial | 1% | ⚠️ Puede variar | Descartado |
| BitPay | Custodial | 1% | ✅ Sí | Descartado |
| BTCPay Server | Self-hosted | 0% | ❌ No | Descartado (complejo) |

### 12.2 Justificación de Selección

- **Non-custodial**: Fondos van directo a wallet de Crema
- **Sin KYC**: Onboarding rápido
- **USDT support**: La stablecoin más usada en Argentina
- **API simple**: Rápido de integrar
- **Fee competitivo**: 1% por transacción

---

## 17. Plan de Contingencia

### 17.1 Escenarios de Falla

| Escenario | Probabilidad | Impacto | Plan de Contingencia |
|-----------|--------------|---------|---------------------|
| Blockonomics no responde | Baja | Alto | Mostrar mensaje de error, ofrecer pago con ARS |
| Webhook no llega | Baja | Alto | Sistema de polling manual + retry |
| Wallet sin fondos para pagar | Baja | Alto | Alertar al admin, pausar payouts |
| Red crypto congestionada | Media | Bajo | Aumentar tiempo de confirmación |

### 17.2 Proveedor de Respaldo (Fallback)

**Proveedor alternativo**: NOWPayments o Coinremitter (Premium)

| Criterio | Blockonomics | NOWPayments | Coinremitter |
|----------|--------------|------------|--------------|
| **Modelo** | Non-custodial | Custodial | Non-custodial |
| **Fee** | 1% | 1% | 0.23% + $99.99/mes |
| **USDT networks** | Solo ERC-20 | 350+ | ERC20, TRC20, BEP20 |
| **KYC** | ❌ No | ⚠️ Puede variar | ❌ No |
| **Switch time** | N/A | 2-3 días | 2-3 días |

### 17.3 Activación del Fallback

```
PROCESO DE FALLBACK:

1. Detectar falla:
   - API timeout repetido (3+ intentos)
   - Dashboard Blockonomics no responde
   - Alertas de monitoreo

2. Comunicación interna:
   - Alertar al equipo via Slack/Email
   - Documentar incidente

3. Decisión:
   - Si es temporal (< 1 hora): esperar
   - Si es prolongado (> 1 hora): evaluar fallback

4. Activación (si aplica):
   - Crear cuenta en proveedor alternativo
   - Actualizar configuración en DB (currency_gateways)
   - Notificar a usuarios que crypto está temporalmente deshabilitado

5. Rollback:
   - Cuando Blockonomics vuelva, revertir cambios
```

### 17.4 Recomendación: Monitoreo

| Métrica | Umbral de Alerta |
|---------|------------------|
| Tiempo de respuesta API | > 5 segundos |
| Errores consecutivos | > 3 en 10 minutos |
| Webhooks no recibidos | > 5% del total |
| Tasa de pagos fallidos | > 2% |

### 17.5 Scripts de Emergencia

```bash
# Deshabilitar pasarela Blockonomics
UPDATE payment_gateways SET is_active = false WHERE id = 'blockonomics';

# Habilitar pasarela fallback
UPDATE payment_gateways SET is_active = true WHERE id = 'nowpayments';

# Verificar estado
SELECT id, name, is_active FROM payment_gateways;
```

---

## 18. Criterios de Éxito

El feature será considerado exitoso si:

1. ✅ Compradores pueden pagar productos en USDT con USDT
2. ✅ Transacciones se confirman automáticamente via webhook
3. ✅ Sistema es dinámico (agregado sin cambiar arquitectura)
4. ✅ Todos los tests pasan
5. ✅ Diferenciación vs Hotmart es tangible
6. ✅ Plan de contingencia documentado y testeable

---

## 19. Roadmap Sugerido

```
Semana 1: Revisión y aprobación del PRD
Semana 2: Implementación técnica (BlockonomicsProvider + DB)
Semana 3: Testing (unit + integración)
Semana 4: Testing manual + deploy a staging
Semana 5: QA + deploy a producción
```

---

## Anexo: Código Existente Verificado

### A.1 Validación al crear producto (product.service.ts)

```typescript
// El usuario debe tener al menos un método de cobro
const userMethods = await payoutMethodRepository.getByUserId(creatorId);
if (!userMethods || userMethods.length === 0) {
  throw new AppError('Debes configurar al menos un método de cobro...', 400);
}

// La moneda del producto debe estar en sus métodos de cobro
const userCurrencies = userMethods.map(m => m.currency);
if (!userCurrencies.includes(p.currency)) {
  throw new AppError(`No tienes método de cobro para: ${p.currency}`, 400);
}
```

### A.2 Marketplace filtrado (product.repository.ts)

```sql
-- El producto debe tener al menos una moneda que el afiliado tenga configurada
AND EXISTS (
  SELECT 1 FROM product_prices pp
  WHERE pp.product_id = p.id
  AND pp.currency IN (
    SELECT currency FROM user_payout_methods WHERE user_id = $1
  )
)
```

---

**Documento preparado**: Marzo 2026  
**Versión**: 2.8 - Actualizado con columna supports_subscriptions  
**Próximo paso**: Revisión del equipo y aprobación para proceder