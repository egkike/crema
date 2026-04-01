import crypto from 'crypto';

import {
  PaymentProvider,
  PaymentResponse,
  WebhookResult,
} from '../PaymentProvider';
import { config } from '../../../config';
import { AppError } from '../../../errors/AppError';
import logger from '../../../utils/logger';

/**
 * BlockonomicsProvider - Pasarela de pagos crypto (USDT/BTC)
 * 
 * Blockonomics es non-custodial: los fondos van directo a tu wallet.
 * 
 * API Reference: https://developers.blockonomics.co
 * - Create Address: POST /api/new_address
 * - Monitor USDT: POST /api/monitor-tx
 * - Webhook: Callback configurado en el Store
 * 
 * Status codes:
 * - 0: Unconfirmed (pending)
 * - 1: Partially confirmed
 * - 2: Confirmed (completed)
 * - -1: Cancelled/Expired
 */
export class BlockonomicsProvider implements PaymentProvider {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://www.blockonomics.co/api';
  // Map payment address -> externalReference for BTC webhooks (store-level callback URL doesn't support per-transaction params)
  private readonly addressOrderMap = new Map<string, string>();
  // Replay protection: track processed txids with TTL
  // LIMITACIÓN: Este Map en memoria se pierde al reiniciar el proceso.
  // La solución definitiva requiere Redis o tabla en DB para persistencia cross-restart.
  // El Map actual sigue siendo útil para protección dentro de la misma sesión del proceso.
  private static readonly processedTxids = new Map<string, number>();
  private static readonly TXID_TTL_MS = 60 * 60 * 1000; // 1 hour
  private static readonly MAX_TXIDS = 10000;
  private static readonly CLEANUP_THRESHOLD = 5000;

  constructor() {
    this.apiKey = config.blockonomics?.apiKey || '';

    if (!this.apiKey) {
      logger.warn('Blockonomics provider inicializado sin API key');
    }
  }

  /**
   * Crea una dirección de pago única para la orden
   * 
   * Blockonomics no tiene un "checkout URL" como MercadoPago.
   * Genera una dirección de pago única y el usuario envía los fondos.
   * 
   * Para mejor UX, retornamos una URL de pago que muestra
   * la dirección y el monto esperado.
   */
  async createPreference(data: {
    product: Record<string, unknown>;
    amount: number;
    currency: string;
    externalReference: string;
    email: string;
    tempPassword?: string;
  }): Promise<PaymentResponse> {
    if (!this.apiKey) {
      throw new AppError('Blockonomics no está configurado correctamente', 500);
    }

    try {
      // 1. Generar dirección de pago única
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/new_address`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            addr_count: 1,
            show_addr: true,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, body: errorText }, 'Blockonomics new_address failed');
        throw new AppError('Error al crear dirección de pago en Blockonomics', 502);
      }

      const result = await response.json();

      if (!result.address) {
        throw new AppError('Blockonomics no retornó una dirección válida', 502);
      }

      const paymentAddress = result.address;

      // 2. Build callback URL with order_ref for ALL currencies
      // Blockonomics forwards callback URL params in the webhook, so order_ref
      // is available for both BTC and USDT webhooks.
      const callbackBaseUrl = config.blockonomics?.callbackUrl || '';
      const callbackUrl = callbackBaseUrl
        ? (callbackBaseUrl.includes('?')
            ? `${callbackBaseUrl}&order_ref=${encodeURIComponent(data.externalReference)}`
            : `${callbackBaseUrl}?order_ref=${encodeURIComponent(data.externalReference)}`)
        : '';

      // 3. For USDT, register the address with Blockonomics monitor-tx API
      if (data.currency === 'USDT') {
        await this.monitorUSDTTransaction(paymentAddress, data.externalReference, callbackUrl);
      }

      // 4. For BTC, store address->order mapping as fallback (Blockonomics store-level webhook
      //    may not forward per-transaction callback params; we resolve order_ref from the map)
      if (data.currency !== 'USDT') {
        // Size limit: si excede 10000, borrar las primeras 5000 entradas
        if (this.addressOrderMap.size >= 10000) {
          const keys = Array.from(this.addressOrderMap.keys());
          for (let i = 0; i < 5000; i++) {
            this.addressOrderMap.delete(keys[i]);
          }
          logger.warn('addressOrderMap excedió 10000 entradas — 5000 entradas viejas eliminadas');
        }
        this.addressOrderMap.set(paymentAddress, data.externalReference);
        // Cleanup after 24h to prevent memory leak
        setTimeout(() => this.addressOrderMap.delete(paymentAddress), 24 * 60 * 60 * 1000).unref();
      }

      // 5. Construir URL de pago
      // Blockonomics tiene una página de pago simple donde se muestra
      // la dirección y el monto a enviar
      const checkoutUrl = `${this.baseUrl}/pay?addr=${encodeURIComponent(paymentAddress)}&amount=${encodeURIComponent(String(data.amount))}&crypto=${data.currency === 'USDT' ? 'usdt' : 'btc'}`;

      logger.info(
        {
          externalReference: data.externalReference,
          address: paymentAddress,
          amount: data.amount,
          currency: data.currency,
        },
        '✅ Blockonomics payment address created'
      );

      return {
        initPoint: checkoutUrl,
        providerReference: paymentAddress,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: message }, 'Error creating Blockonomics preference');
      throw new AppError('Error al crear preferencia de pago crypto', 500);
    }
  }

  /**
   * Monitorea una transacción USDT en la dirección generada
   * 
   * Blockonomics necesita saber qué dirección monitorear para USDT
   * ya que las transacciones USDT son diferentes a BTC en la blockchain.
   * 
   * El externalReference (order ID) se incluye en el callback URL como query param
   * para que Blockonomics lo reenvíe en el webhook y podamos mapear la orden.
   */
  private async monitorUSDTTransaction(address: string, externalReference: string, callbackUrl: string): Promise<void> {
    if (!callbackUrl) {
      throw new AppError('callbackUrl es requerido para monitorear transacciones USDT', 500);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${this.baseUrl}/monitor-tx`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          addr: address,
          order_id: externalReference,
          callback_url: callbackUrl,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          { address, status: response.status, body: errorText },
          '⚠️ monitorUSDTTransaction failed — USDT webhook will NOT be registered'
        );
        throw new AppError(`Failed to monitor USDT address: ${response.status} ${errorText}`, 502);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Procesa el webhook de Blockonomics
   * 
   * Blockonomics envía el webhook como query parameters:
   * - status: 0 (pending), 1 (partial), 2 (confirmed), -1 (cancelled)
   * - addr: dirección de pago
   * - value: monto en satoshis (BTC) o wei (USDT)
   * - txid: transaction ID en blockchain
   * - secret: si está configurado en el callback URL
   * - rbf: replace-by-fee flag
   * 
   * Para USDT, el webhook incluye además:
   * - txid: hash de la transacción en Ethereum/TRON
   * - value: monto en la unidad mínima del token
   */
  async handleWebhook({ body, headers: _headers, query }: {
    body: Record<string, unknown>;
    headers: Record<string, string>;
    query: Record<string, string>;
  }): Promise<WebhookResult | null> {
    try {
      const rawStatus = query.status ?? (body.status as string) ?? '0';
      const status = Number(rawStatus);
      // Validate status is a known Blockonomics status code (0, 1, 2, -1)
      if (![0, 1, 2, -1].includes(status)) {
        logger.warn({ status, rawStatus }, '⚠️ Webhook rechazado: status inválido');
        return null;
      }
      const address = query.addr || (body.addr as string);
      const value = Number(query.value || (body.value as string));
      const txid = query.txid || (body.txid as string);
      const secret = query.secret;

      // Validar secret si está configurado (timing-safe comparison)
      // REJECT webhooks without a valid secret — prevents forged payment notifications
      if (!config.blockonomics?.webhookSecret) {
        logger.warn('⚠️ Webhook rechazado: webhookSecret no configurado en Blockonomics');
        return null;
      }

      if (!secret) {
        logger.warn('⚠️ Webhook rechazado: secret ausente en la solicitud');
        return null;
      }

      const secretBuffer = Buffer.from(String(secret));
      const expectedBuffer = Buffer.from(config.blockonomics.webhookSecret);
      if (
        secretBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(secretBuffer, expectedBuffer)
      ) {
        logger.warn({ secret: '***' }, '⚠️ Webhook secret inválido');
        return null;
      }

      // Si no hay datos mínimos, ignorar
      if (!address || !txid) {
        logger.warn({ query, body }, '⚠️ Webhook de Blockonomics sin datos mínimos');
        return null;
      }

      // Validar que el monto recibido sea un número válido (NaN bypasses ALL comparisons)
      if (Number.isNaN(value)) {
        logger.warn({ value, txid, address }, '⚠️ Webhook rechazado: value es NaN, posible intento de bypass');
        return null;
      }

      // Validar que el monto recibido sea mayor a 0 (previene payment bypass con valor mínimo)
      if (value <= 0) {
        logger.warn({ value, txid, address }, '⚠️ Webhook rechazado: value <= 0, posible intento de bypass');
        return null;
      }

      // Sanity check: valor mínimo razonable (100000 satoshis ≈ 0.001 BTC ≈ ~0.1 USDT)
      // Previene ataques con montos insignificantes.
      // NOTA: La validación completa contra el monto esperado de la orden requiere
      // consultar la orden en el webhook handler (arquitectura adicional necesaria).
      // Este hardening intermedio establece un piso mínimo más estricto.
      if (value < 100000) {
        logger.warn({ value, txid, address }, '⚠️ Webhook rechazado: value < 100000, monto por debajo del mínimo aceptable');
        return null;
      }

      // Replay protection: verificar si txid ya fue procesado
      if (BlockonomicsProvider.isTxidProcessed(txid)) {
        logger.warn({ txid }, '⚠️ Webhook rechazado: txid ya procesado (replay detected)');
        return null;
      }
      BlockonomicsProvider.markTxidProcessed(txid);

      logger.info(
        { value, order_ref: query.order_ref, txid, address },
        '📊 Webhook payment value received (audit log)'
      );

      // Extraer order_ref del callback URL (incluido en monitorUSDTTransaction)
      // Blockonomics reenvía los parámetros del callback URL en el webhook
      let orderRef = query.order_ref;

      // Fallback: para BTC, usar el mapeo address->orderRef almacenado en createPreference
      if (!orderRef && address) {
        orderRef = this.addressOrderMap.get(address);
        if (orderRef) {
          logger.info({ address, orderRef }, '📌 order_ref resuelto desde addressOrderMap (BTC fallback)');
        }
      }

      if (!orderRef) {
        logger.warn({ query, body }, '⚠️ Webhook de Blockonomics sin order_ref — no se puede mapear la orden');
        return null;
      }

      // Mapear status de Blockonomics a status interno
      const statusMap: Record<number, string> = {
        0: 'pending',
        1: 'pending',
        2: 'completed',
        '-1': 'failed',
      };

      const mappedStatus = statusMap[status] || 'pending';

      // Blockonomics cobra suscripción mensual, no fee por transacción
      const gatewayFee = 0;

      logger.info(
        {
          txid,
          address,
          status: mappedStatus,
          value,
          blockonomicsStatus: status,
        },
        '✅ Blockonomics webhook processed'
      );

      return {
        externalReference: orderRef, // Order ID from callback URL param
        status: mappedStatus,
        transactionId: txid,
        metadata: {
          blockonomicsStatus: status,
          address,
          value,
        },
        type: 'payment',
        gatewayFee,
        gatewayTax: 0, // No aplica para crypto
      };
    } catch (error: unknown) {
      // Re-lanzar errores inesperados (no AppError) para que no se traguen bugs de programación
      if (!(error instanceof AppError)) {
        logger.error({ error }, '💥 Error inesperado procesando Blockonomics webhook');
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: message }, 'Error processing Blockonomics webhook');
      return null;
    }
  }

  /**
   * Replay protection: verificar si un txid ya fue procesado
   */
  private static isTxidProcessed(txid: string): boolean {
    const timestamp = BlockonomicsProvider.processedTxids.get(txid);
    if (!timestamp) return false;
    // TTL expired
    if (Date.now() - timestamp > BlockonomicsProvider.TXID_TTL_MS) {
      BlockonomicsProvider.processedTxids.delete(txid);
      return false;
    }
    return true;
  }

  /**
   * Replay protection: marcar un txid como procesado
   */
  private static markTxidProcessed(txid: string): void {
    // LRU simple: si excede el límite, limpiar las entradas más viejas
    if (BlockonomicsProvider.processedTxids.size >= BlockonomicsProvider.MAX_TXIDS) {
      // Map maintains insertion order — delete oldest entries without allocating full array
      let count = 0;
      for (const key of BlockonomicsProvider.processedTxids.keys()) {
        if (count++ >= BlockonomicsProvider.CLEANUP_THRESHOLD) break;
        BlockonomicsProvider.processedTxids.delete(key);
      }
    }
    BlockonomicsProvider.processedTxids.set(txid, Date.now());
  }

  /**
   * Blockonomics no soporta refunds (transacciones crypto son irreversibles)
   * 
   * El sistema de garantías maneja esto a nivel de orden:
   * - orders.days_of_guarantee_applied = 0 para crypto
   * - refund.service.ts deniega automáticamente
   */
  async refund(_transactionId: string, _amount: number): Promise<void> {
    logger.warn(
      { transactionId: _transactionId },
      '⚠️ Refund solicitado para Blockonomics - crypto es irreversible'
    );
    throw new AppError('Las transacciones crypto no pueden ser reembolsadas', 400);
  }
}
