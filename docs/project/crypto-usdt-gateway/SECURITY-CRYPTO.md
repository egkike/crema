# Documentación de Seguridad: Pasarela Crypto USDT

**Versión**: 1.0  
**Fecha**: Marzo 2026  
**Change**: crypto-usdt-gateway  
**Estado**: Draft  
**Owner**: Kike García

---

## 1. Visión General

Este documento define las medidas de seguridad, políticas de gestión de claves, planes de respuesta a incidentes y requisitos de cumplimiento legal para la pasarela de pagos crypto USDT de Crema.

> **Importante**: Este documento complementa el `SECURITY.md` general del proyecto. Las medidas aquí descritas son específicas para operaciones con criptomonedas.

---

## 2. Seguridad de Wallets

### 2.1 Arquitectura de Almacenamiento

Crema opera con un modelo **non-custodial** a través de Blockonomics. Los fondos van directamente a wallets controladas por Crema, no a cuentas de terceros.

#### Estructura de Wallets

| Tipo | Red | Propósito | Nivel de Seguridad |
|------|-----|-----------|-------------------|
| **Recepción** | ERC-20 | Recibir pagos de Blockonomics | 🔴 Hot Wallet (operativa) |
| **Payouts** | TRC-20 | Pagar a creadores/afiliados | 🟡 Hot Wallet (operativa) |
| **Payouts Backup** | BEP-20 | Pagar a creadores (fallback) | 🟡 Hot Wallet (operativa) |
| **Reserva** | ERC-20 | Almacenamiento a largo plazo | 🟢 Cold Storage (offline) |

### 2.2 Protección de Claves Privadas

#### ❌ NUNCA HACER

```
- Almacenar private keys en el repositorio
- Hardcodear claves en código o variables de entorno
- Compartir claves por email, Slack o cualquier canal no cifrado
- Usar la misma wallet para recepción y payouts
- Mantener todos los fondos en hot wallets
```

#### ✅ POLÍTICA OBLIGATORIA

| Medida | Implementación | Prioridad |
|--------|---------------|-----------|
| **Separación de wallets** | Una wallet para recibir, otra para pagar | CRÍTICA |
| **Límite en hot wallets** | Máximo 20% del total en wallets operativas | CRÍTICA |
| **Cold storage** | 80% de fondos en wallet offline (hardware wallet) | ALTA |
| **Multi-sig** | Para montos > $1,000 USDT, requerir 2 firmas | ALTA |
| **Backup cifrado** | Seed phrases en almacenamiento cifrado (AES-256) | CRÍTICA |

### 2.3 Gestión de Seed Phrases

#### Almacenamiento Seguro

```
SEED PHRASE BACKUP PROCEDURE:

1. Escribir la seed phrase en papel (no digital)
2. Guardar en caja fuerte o lugar seguro físico
3. Crear 2 copias en ubicaciones separadas
4. NUNCA fotografiar, escanear o almacenar digitalmente
5. NUNCA compartir por email, chat o cloud storage
```

#### Recuperación de Emergencia

| Escenario | Procedimiento |
|-----------|--------------|
| Wallet comprometida | 1. Transferir fondos a wallet nueva 2. Revocar accesos 3. Rotar API keys |
| Seed phrase perdida | Usar copia de backup en ubicación secundaria |
| Acceso perdido a hardware wallet | Restaurar desde seed phrase en nuevo dispositivo |

---

## 3. Gestión de Claves API

### 3.1 Blockonomics API Key

#### Almacenamiento

```env
# .env (NUNCA commitear)
BLOCKONOMICS_API_KEY=sk_live_...
BLOCKONOMICS_STORE_ID=store_...
BLOCKONOMICS_WEBHOOK_SECRET=whsec_...
```

#### Rotación de Claves

| Evento | Acción | Frecuencia |
|--------|--------|-----------|
| Sospecha de compromiso | Rotación inmediata | Según necesidad |
| Cambio de personal | Rotar todas las keys | Según necesidad |
| Rotación programada | Generar nueva key, actualizar, revocar anterior | Cada 90 días |

#### Procedimiento de Rotación

```bash
# 1. Generar nueva API Key en Blockonomics Dashboard
# 2. Actualizar en .env y secrets manager
# 3. Deploy con nueva key
# 4. Verificar funcionamiento (crear invoice de prueba)
# 5. Revocar API Key anterior en Dashboard
# 6. Confirmar que la key anterior ya no funciona
```

### 3.2 Webhook Secret

El webhook secret se usa para validar que los callbacks vienen realmente de Blockonomics.

#### Validación de Firma

```typescript
// BlockonomicsProvider.ts
import crypto from 'crypto';

function validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

#### Protección contra Replay Attacks

| Medida | Implementación |
|--------|---------------|
| **Timestamp validation** | Rechazar webhooks con timestamp > 5 minutos |
| **Nonce tracking** | Registrar txid procesados, rechazar duplicados |
| **Idempotencia** | Si la orden ya está "completed", retornar 200 sin reprocesar |

---

## 4. Seguridad de Webhooks

### 4.1 Threat Model

| Amenaza | Impacto | Mitigación |
|---------|---------|-----------|
| **Webhook spoofing** | Pagos falsos confirmados | Validar firma HMAC + IP whitelist |
| **Replay attack** | Doble procesamiento de pago | Nonce tracking + idempotencia |
| **Man-in-the-middle** | Intercepción de datos | HTTPS obligatorio + certificate pinning |
| **DDoS en webhook** | Servicio interrumpido | Rate limiting + Cloudflare protection |

### 4.2 IP Whitelist (Blockonomics)

Blockonomics envía webhooks desde IPs específicas. Validar el origen:

```typescript
const BLOCKONOMICS_IPS = [
  '52.206.156.157',
  '54.164.225.217',
  // Verificar documentación actualizada de Blockonomics
];

function isBlockonomicsIP(ip: string): boolean {
  return BLOCKONOMICS_IPS.includes(ip);
}
```

### 4.3 Rate Limiting Específico

```typescript
// Webhook endpoint con rate limiting estricto
router.post(
  '/webhook/blockonomics',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 50, // máximo 50 webhooks por ventana
    message: { error: 'Too many webhook requests' },
    skipSuccessfulRequests: false,
  }),
  webhookHandler
);
```

---

## 5. Prevención de Lavado de Dinero (AML)

### 5.1 Marco Legal Argentina

| Requisito | Estado | Acción Requerida |
|-----------|--------|-----------------|
| **Registro PSAV** | ⚠️ Evaluar | Consultar abogado fintech |
| **Reporte a ARCA** | ⚠️ Umbral $50M ARS | Implementar tracking |
| **KYC usuarios** | ✅ Parcial | Email verificado + 2FA |
| **Límites de transacción** | ❌ No implementado | Ver sección 5.2 |

### 5.2 Límites de Transacción

Para mitigar riesgo de lavado de dinero, se implementan los siguientes límites:

| Límite | Valor | Período |
|--------|-------|---------|
| **Máximo por transacción** | $1,000 USDT | Por orden |
| **Máximo por usuario/día** | $5,000 USDT | 24 horas |
| **Máximo por usuario/mes** | $20,000 USDT | 30 días |
| **Mínimo payout** | $50 USDT | Por retiro |

#### Implementación

```typescript
// order.service.ts - Validación de límites
const DAILY_LIMIT = 5000; // USDT
const MONTHLY_LIMIT = 20000; // USDT

async function validateTransactionLimits(userId: string, amount: number): Promise<void> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [dailyTotal, monthlyTotal] = await Promise.all([
    orderRepository.sumByUserIdAndDate(userId, dayAgo, 'USDT'),
    orderRepository.sumByUserIdAndDate(userId, monthAgo, 'USDT'),
  ]);

  if (dailyTotal + amount > DAILY_LIMIT) {
    throw new AppError('Límite diario de transacciones USDT excedido', 429);
  }
  if (monthlyTotal + amount > MONTHLY_LIMIT) {
    throw new AppError('Límite mensual de transacciones USDT excedido', 429);
  }
}
```

### 5.3 Monitoreo de Actividad Sospechosa

| Patrón | Alerta | Acción |
|--------|--------|--------|
| Múltiples órdenes pequeñas en corto tiempo | Email al admin | Revisar manualmente |
| Usuario nuevo con transacción > $500 USDT | Email al admin | Verificar identidad |
| Múltiples wallets para un mismo usuario | Email al admin | Investigar |
| Payouts frecuentes justo debajo del límite | Email al admin | Revisar patrones |

---

## 6. Plan de Respuesta a Incidentes

### 6.1 Escenarios de Incidente

#### Nivel 1: Crítico (Respuesta Inmediata)

| Escenario | Impacto | Tiempo de Respuesta |
|-----------|---------|-------------------|
| **Wallet comprometida** | Pérdida de fondos | < 15 minutos |
| **API Key filtrada** | Acceso no autorizado | < 30 minutos |
| **Webhook spoofing exitoso** | Pagos falsos confirmados | < 1 hora |

#### Nivel 2: Alto (Respuesta Rápida)

| Escenario | Impacto | Tiempo de Respuesta |
|-----------|---------|-------------------|
| **Blockonomics API down** | Pagos interrumpidos | < 2 horas |
| **Red crypto congestionada** | Confirmaciones lentas | < 4 horas |
| **Error en cálculo de comisiones** | Discrepancia contable | < 24 horas |

#### Nivel 3: Medio (Respuesta Planificada)

| Escenario | Impacto | Tiempo de Respuesta |
|-----------|---------|-------------------|
| **Discrepancia en reconciliación mensual** | Error contable menor | < 48 horas |
| **Usuario reporta pago no confirmado** | UX issue | < 24 horas |

### 6.2 Procedimiento: Wallet Comprometida

```
INCIDENT RESPONSE PROCEDURE - WALLET COMPROMISE

FASE 1: CONTENCIÓN (< 15 minutos)
1. Transferir TODOS los fondos de la wallet comprometida a wallet de emergencia
2. Deshabilitar pasarela Blockonomics en DB:
   UPDATE payment_gateways SET is_active = false WHERE id = 'blockonomics';
3. Rotar API Key de Blockonomics
4. Revocar cualquier acceso a la wallet comprometida

FASE 2: INVESTIGACIÓN (< 2 horas)
5. Revisar logs de acceso a la wallet
6. Verificar si hay transacciones no autorizadas
7. Identificar vector de compromiso
8. Documentar timeline del incidente

FASE 3: RECUPERACIÓN (< 24 horas)
9. Crear nueva wallet segura (generar nueva seed phrase)
10. Actualizar configuración de Blockonomics con nueva wallet
11. Re-habilitar pasarela: UPDATE payment_gateways SET is_active = true...
12. Notificar a usuarios afectados (si aplica)

FASE 4: POST-MORTEM (< 72 horas)
13. Root cause analysis
14. Actualizar políticas de seguridad
15. Implementar controles adicionales
16. Documentar lecciones aprendidas
```

### 6.3 Procedimiento: API Key Filtrada

```
INCIDENT RESPONSE PROCEDURE - API KEY LEAK

1. Rotar API Key inmediatamente en Blockonomics Dashboard
2. Actualizar .env y secrets manager con nueva key
3. Deploy de emergencia con nueva key
4. Revocar key anterior
5. Revisar logs para detectar uso no autorizado
6. Si hubo uso no autorizado: seguir procedimiento de wallet comprometida
```

### 6.4 Contactos de Emergencia

| Rol | Contacto | Método |
|-----|----------|--------|
| **Admin Principal** | Kike García | Email + Teléfono |
| **Soporte Blockonomics** | help.blockonomics.co | Email |
| **Abogado Fintech** | [Por definir] | Teléfono |
| **Contador Crypto** | [Por definir] | Email |

---

## 7. Auditoría y Logging

### 7.1 Eventos a Auditar

| Evento | Nivel | Datos a Registrar |
|--------|-------|------------------|
| Creación de orden USDT | INFO | orderId, userId, amount, timestamp |
| Confirmación de pago | INFO | orderId, txid, amount, confirmations |
| Webhook recibido | INFO | txid, status, signature_valid, ip |
| Webhook rechazado | WARN | reason, ip, signature |
| Límite de transacción excedido | WARN | userId, amount, limit |
| Error de API Blockonomics | ERROR | error, endpoint, retry_count |
| Rotación de API Key | INFO | old_key_last_4, new_key_created |
| Payout procesado | INFO | payoutId, userId, amount, txid |
| Sospecha de fraude | CRITICAL | userId, pattern, details |

### 7.2 Retención de Logs

| Tipo de Log | Retención | Almacenamiento |
|-------------|-----------|---------------|
| Logs de transacciones | 7 años | Archivo + Base de datos |
| Logs de seguridad | 3 años | Archivo cifrado |
| Logs de auditoría | 5 años | Archivo + Base de datos |
| Logs de errores | 90 días | Sistema de logging |

### 7.3 Reconciliación Mensual

```
MONTHLY RECONCILIATION PROCEDURE

Día 1 del mes:
1. Descargar monthly statement de Blockonomics
2. Exportar todas las transacciones USDT del mes anterior
3. Comparar: total_transacciones * 0.01 vs bill real
4. Si diferencia > 5%: investigar y ajustar

Día 10 del mes:
5. Pagar bill de Blockonomics
6. Registrar pago en sistema contable
7. Actualizar provisiones

Documentación:
8. Generar reporte de reconciliación
9. Archivar en /docs/security/reports/crypto-reconciliation-YYYY-MM.pdf
```

---

## 8. Cumplimiento Legal

### 8.1 Obligaciones en Argentina

| Obligación | Estado | Responsable |
|-----------|--------|------------|
| **Registro PSAV ante CNV** | ⚠️ Evaluar | Admin + Abogado |
| **Reporte a ARCA** | ⚠️ Umbral $50M ARS | Contador |
| **Declaración de tenencia** | ✅ Bienes Personales | Contador |
| **Impuesto a las Ganancias** | ✅ 5-15% | Contador |

### 8.2 Recomendaciones Legales

> ⚠️ **IMPORTANTE**: Se recomienda consultar con abogado especializado en fintech y criptomonedas antes de lanzar la pasarela a producción.

#### Temas a Consultar

1. **¿Crema necesita registrarse como PSAV?**
   - Si opera como merchant (vende productos propios): probablemente NO
   - Si opera como PSP (procesa pagos para terceros): probablemente SÍ

2. **¿Se requiere KYC obligatorio para compradores?**
   - Actualmente: email verificado + 2FA
   - Para montos altos: considerar verificación de identidad adicional

3. **¿Cómo se reportan las transacciones crypto a ARCA?**
   - Consultar con contador especializado

---

## 9. Checklist de Seguridad Pre-Lanzamiento

### 9.1 Wallets

- [ ] Wallets de recepción y payouts separadas
- [ ] Seed phrases almacenadas en cold storage (papel, caja fuerte)
- [ ] Límite del 20% en hot wallets implementado
- [ ] Procedimiento de backup de wallets documentado
- [ ] Multi-sig configurado para montos > $1,000 USDT

### 9.2 API Keys

- [ ] API Key almacenada en variables de entorno (no en código)
- [ ] Webhook secret configurado y validado
- [ ] Procedimiento de rotación de keys documentado
- [ ] Primera rotación programada (90 días)

### 9.3 Webhooks

- [ ] Validación de firma HMAC implementada
- [ ] IP whitelist configurada
- [ ] Rate limiting en endpoint de webhook
- [ ] Idempotencia implementada (nonce tracking)
- [ ] Logging de todos los webhooks recibidos

### 9.4 AML

- [ ] Límites de transacción implementados
- [ ] Monitoreo de actividad sospechosa configurado
- [ ] Alertas de email al admin configuradas
- [ ] Procedimiento de reporte a ARCA documentado

### 9.5 Incident Response

- [ ] Plan de respuesta a incidentes documentado
- [ ] Contactos de emergencia actualizados
- [ ] Wallet de emergencia configurada
- [ ] Simulacro de incidente realizado

### 9.6 Legal

- [ ] Consulta con abogado fintech completada
- [ ] Consulta con contador crypto completada
- [ ] Términos y condiciones actualizados (crypto payments)
- [ ] Política de privacidad actualizada

---

## 10. Glosario

| Término | Definición |
|---------|-----------|
| **Hot Wallet** | Wallet conectada a internet, usada para operaciones diarias |
| **Cold Storage** | Wallet offline, usada para almacenamiento a largo plazo |
| **Multi-sig** | Wallet que requiere múltiples firmas para autorizar transacciones |
| **Seed Phrase** | Frase de 12-24 palabras que permite recuperar una wallet |
| **PSAV** | Proveedor de Servicios de Activos Virtuales (registro CNV) |
| **ARCA** | Administración Federal de Ingresos Públicos (ex AFIP) |
| **AML** | Anti-Money Laundering (prevención de lavado de dinero) |
| **Nonce** | Número usado una vez, para prevenir replay attacks |

---

## 11. Referencias

- [SECURITY.md](../../security/SECURITY.md) — Documentación general de seguridad
- [PRD Crypto USDT](../PRD.md) — Product Requirements Document
- [TSD Crypto USDT](../specs/TSD-Pasarela-Crypto-USDT.md) — Technical Specification
- [Blockonomics API Docs](https://developers.blockonomics.co)
- [CNV Resolución 1058/2025](https://www.cnv.gov.ar) — Registro PSAV
- [ARCA RG 5804/2025](https://www.argentina.gob.ar/afip) — Reporte de criptoactivos

---

**Documento creado**: Marzo 2026  
**Versión**: 1.0  
**Próxima revisión**: Junio 2026 (trimestral)
