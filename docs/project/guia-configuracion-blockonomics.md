# Guía de Configuración: Blockonomics para Crema

**Fecha**: Marzo 2026  
**Objetivo**: Configurar cuenta Blockonomics para aceptar pagos en USDT y BTC en la plataforma Crema

---

## Prerrequisitos

Antes de comenzar, necesitás tener:

- [ ] Cuenta de email activa
- [ ] Wallet que soporte USDT (MetaMask, Trust Wallet, etc.)
- [ ] (Opcional) Wallet Bitcoin si también vas a aceptar BTC
- [ ] Dominio público accesible para el webhook (necesario para producción)

---

## Paso 1: Crear Cuenta en Blockonomics

### 1.1 Registro Inicial

1. Ir a [blockonomics.co](https://blockonomics.co)
2. Click en **"Get Started For Free"** o **"Signup"**
3. Elegir método de registro:

| Método | Pasos |
|--------|-------|
| **Email + Password** | 1. Ingresar email y password<br>2. Click en "Signup"<br>3. Revisar email y completar OTP |
| **Google OAuth** | 1. Click en signup con Google<br>2. Seleccionar cuenta de Google<br>3. Aprobar permisos |

### 1.2 Verificación

- Si usaste email: llegó un email con código OTP de 6 dígitos
- Ingresar el código y click en "Continue"

### 1.3 Acceso al Dashboard

Una vez verificado, tendrás acceso al dashboard en:
```
https://dashboard.blockonomics.co
```

---

## Paso 2: Configurar Wallets (Donde recibirás fondos)

Blockonomics es **non-custodial**: los fondos van directamente a TU wallet, no a Blockonomics.

### 2.1 Agregar Wallet USDT (ERC-20)

1. En el dashboard, click en **"+ Add a wallet"**
2. Seleccionar el tipo de wallet:
   - **USDT** (ERC-20) - si está disponible
   - **ETH** - si vas a usar USDT sobre Ethereum
3. Conectar tu wallet (MetaMask, Trust Wallet, etc.)
4. Blockonomics deriving addresses automáticamente

### 2.2 Agregar Wallet Bitcoin (Opcional)

1. Click en **"+ Add a wallet"**
2. Seleccionar **"BTC"**
3. Elegir cómo conectar:

| Opción | Descripción |
|--------|-------------|
| **xPub Key** | Recomendado. Tenés que obtener el xPub de tu wallet Bitcoin (Electrum, BlueWallet, etc.) |
| **Sample Address** | Si no tenés xPub, podés usar una dirección de receive como muestra |

#### Cómo obtener xPub de tu wallet:

```
Electrum:
1. Wallet > Information > Master Public Key (xpub)

BlueWallet:
1. Wallet > Export > Watch-only
2. Copiar el xpub

Ledger/Trezor:
1. Usar Ledger Live o Trezor Suite
2. Exportar xpub de la cuenta desired
```

---

## Paso 3: Crear Store (Tu "tienda" en Blockonomics)

El store es la entidad que agrupa tu configuración de pagos.

### 3.1 Crear Store

1. Ir a **Dashboard > Stores**
2. Click en **"Add a Store"** (botón superior derecho)
3. Completar los datos:

| Campo | Valor recomendado |
|-------|-------------------|
| **Name** | Crema Platform |
| **Callback URL** | `https://tu-dominio.com/api/payments/webhook/blockonomics` |

**Importante**: El callback URL es donde Blockonomics envía las notificaciones de pago. Para desarrollo local, vas a necesitar algo como ngrok.

### 3.2 Callback URL para Diferentes Entornos

| Entorno | URL |
|---------|-----|
| **Producción** | `https://api.tu-dominio.com/payments/webhook/blockonomics` |
| **Desarrollo** | Usar ngrok: `https://tu-ngrok.io/webhook` |

### 3.3 Guardar Store

Click en **"Create Store"**

---

## Paso 4: Obtener API Key

La API Key es necesaria para autenticación en todas las llamadas API.

### 4.1 Generar/Encontrar API Key

1. Ir a **Dashboard > Stores**
2. Click en tu store creado
3. Buscar sección **"API"** o **"Settings"**
4. Copiar el **API Key**

Debería verse algo como:
```
2cDNOlCN985d7Rx3atSDOlmMeYaxzho2uPmHheIw4eU
```

### 4.2 Formato de Uso

En los headers de cada request HTTP:
```
Authorization: Bearer TU_API_KEY
```

### 4.3 (Opcional) Rotar API Key

Si necesitás regenerar:
1. Dashboard > Stores > Tu Store
2. Click en el botón 🔄 (refresh)
3. Nueva key se genera automáticamente
4. **Actualizar en tu código inmediatamente**

---

## Paso 5: Habilitar Payment Methods

Ahora activás los métodos de pago que querés aceptar.

### 5.1 Configurar Payment Methods

1. Ir a **Dashboard > Stores**
2. Click en tu store
3. Verás opciones para cada crypto:
   - **BTC** (Bitcoin)
   - **USDT** (ERC-20)
   - **BCH** (Bitcoin Cash) - si está disponible

### 5.2 Activar cada Crypto

| Crypto | Toggle | Wallet |
|--------|--------|--------|
| **BTC** | ✅ Activar | Seleccionar wallet BTC configurada |
| **USDT** | ✅ Activar | Seleccionar wallet USDT/ETH |
| **BCH** | ⬜ Opcional | Seleccionar si tenés |

### 5.3 Guardar

Click en **"Update Store"**

---

## Paso 6: Configurar Webhook/Callback

El webhook es el mecanismo por el cual Blockonomics notifica a Crema cuando un pago se confirma.

### 6.1 Estructura del Callback

Cuando alguien paga, Blockonomics hace un POST a tu callback URL con:
```
/api/payments/webhook/blockonomics?status=2&addr=TU_DIRECCION&value=10000&txid=ABC123
```

| Parámetro | Descripción |
|-----------|-------------|
| `status` | 0 = pending, 1 = confirmar, 2 = confirmado |
| `addr` | Dirección de pago (la única por orden) |
| `value` | Cantidad en satoshis (para BTC) o wei (para USDT) |
| `txid` | Transaction ID en blockchain |

### 6.2 Recomendaciones de Seguridad

1. **Secret en callback**: Podés agregar un parámetro `secret` en el callback URL para validar que viene de Blockonomics
2. **HTTPS**: Siempre usar HTTPS en producción
3. **Verificar IP**: Opcionalmente verificar que viene de IPs de Blockonomics

### 6.3 Para Desarrollo Local

Si estás desarrollando en local, usá **ngrok**:
```bash
ngrok http 3000
# Te da una URL como https://abc123.ngrok.io
# Usá esa URL como callback
```

---

## Resumen: Variables de Entorno para Crema

Una vez completado todo, vas a tener estas variables:

```env
# Blockonomics
BLOCKONOMICS_API_KEY=2cDNOlCN985d7Rx3atSDOlmMeYaxzho2uPmHheIw4eU
BLOCKONOMICS_STORE_ID=tu_store_id_aqui
BLOCKONOMICS_CALLBACK_URL=https://tu-dominio.com/payments/webhook
```

---

## Checklist de Verificación

Antes de pasar a producción, verificá:

- [ ] Cuenta creada y verificada
- [ ] Wallet USDT conectada y funcionando
- [ ] Wallet BTC conectada (si aplica)
- [ ] Store creado con callback URL correcto
- [ ] API Key obtenida y guardada de forma segura
- [ ] Payment methods (BTC, USDT) habilitados
- [ ] Webhook responding correctamente (testear)

---

## Próximos Pasos (desde la perspectiva de desarrollo)

1. **Implementar BlockonomicsProvider.ts** - El provider en el backend
2. **Agregar configuraciones en DB** - payment_gateways, currency_gateways
3. **Registrar provider en Factory** - PaymentProviderFactory
4. **Implementar webhook endpoint** - Para recibir notificaciones
5. **Testing** - Con transacciones reales de small amount

---

##links Útiles

| Recurso | URL |
|--------|-----|
| Dashboard Blockonomics | https://dashboard.blockonomics.co |
| Documentación API | https://developers.blockonomics.co |
| Docs de Payments API | https://devlibrary.blockonomics.co/2021/08/02/payments-api-introduction/ |
| Soporte | help.blockonomics.co |

---

**Documento creado**: Marzo 2026