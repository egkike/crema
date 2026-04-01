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

      const response = await fetch(`${this.baseUrl}/new_address`, {
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

      clearTimeout(timeout);

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

      // 2. Para USDT, monitorear la transacción
      if (data.currency === 'USDT') {
        await this.monitorUSDTTransaction(paymentAddress, data.externalReference);
      }

      // 3. Construir URL de pago
      // Blockonomics tiene una página de pago simple donde se muestra
      // la dirección y el monto a enviar
      const checkoutUrl = `${this.baseUrl}/pay?addr=${paymentAddress}&amount=${data.amount}&crypto=${data.currency === 'USDT' ? 'usdt' : 'btc'}`;

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
   */
  private async monitorUSDTTransaction(address: string, externalReference: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/monitor-tx`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          addr: address,
          order_id: externalReference,
          callback_url: config.blockonomics?.callbackUrl || '',
        }),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn({ error: message, address }, '⚠️ No se pudo monitorear transacción USDT');
      // No lanzamos error porque el webhook aún puede funcionar
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
      const status = Number(query.status || (body.status as string));
      const address = query.addr || (body.addr as string);
      const value = Number(query.value || (body.value as string));
      const txid = query.txid || (body.txid as string);
      const secret = query.secret;

      // Validar secret si está configurado (timing-safe comparison)
      if (config.blockonomics?.webhookSecret && secret) {
        const secretBuffer = Buffer.from(String(secret));
        const expectedBuffer = Buffer.from(config.blockonomics.webhookSecret);
        if (
          secretBuffer.length !== expectedBuffer.length ||
          !crypto.timingSafeEqual(secretBuffer, expectedBuffer)
        ) {
          logger.warn({ secret: '***' }, '⚠️ Webhook secret inválido');
          return null;
        }
      }

      // Si no hay datos mínimos, ignorar
      if (!address || !txid) {
        logger.warn({ query, body }, '⚠️ Webhook de Blockonomics sin datos mínimos');
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

      // Calcular fee estimado (1% para Blockonomics, configurable)
      // El fee real se provisiona mensualmente
      const estimatedFeePercent = 0.01; // Blockonomics cobra 1% mensual
      const amountInUSD = value / 100000000; // Asumiendo que value viene en satoshis para BTC
      const gatewayFee = amountInUSD * estimatedFeePercent;

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
        externalReference: address, // Usamos la dirección como referencia
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: message }, 'Error processing Blockonomics webhook');
      return null;
    }
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
