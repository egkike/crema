import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export interface CreateOrderDTO {
  buyer_id: string; // UUID
  product_id: string; // UUID
  amount: number;
  payment_method: string;
  external_reference: string;
  status?: string;
  affiliate_id?: string | null;
  commission_amount?: number;
}

export const orderRepository = {
  /**
   * 1. Crear la orden (Antes de ir a Mercado Pago)
   * Aquí el transaction_id suele ser NULL porque aún no se pagó.
   */
  async create(data: CreateOrderDTO) {
    const query = `
      INSERT INTO "${schema}".orders (
        buyer_id, 
        product_id, 
        affiliate_id,
        amount, 
        commission_amount,
        status,
        payment_method, 
        external_reference
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const values = [
      data.buyer_id,
      data.product_id,
      data.affiliate_id || null,
      data.amount,
      data.commission_amount || 0,
      data.status || 'pending',
      data.payment_method,
      data.external_reference,
    ];

    try {
      const { rows } = await pool.query(query, values);
      return rows[0];
    } catch (error: any) {
      logger.error(
        { error: error.message, ref: data.external_reference },
        'Error al insertar orden'
      );
      throw error;
    }
  },

  /**
   * 2. Actualizar la orden (Cuando vuelve el Webhook de MP)
   * Aquí SI guardamos el transaction_id que nos da la pasarela.
   */
  async updateByExternalRef(
    externalRef: string,
    updates: {
      status: string;
      transaction_id: string; // ID de MP o Hash de Crypto
      gateway_status?: string | null; // Agregamos | null para compatibilidad
    }
  ) {
    try {
      const query = `
        UPDATE "${schema}".orders 
        SET 
          status = $1, 
          transaction_id = $2, 
          gateway_status = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE external_reference = $4
        RETURNING *;
      `;

      const values = [
        updates.status,
        updates.transaction_id, // Guardamos el ID oficial del pago
        updates.gateway_status || null,
        externalRef,
      ];

      const { rows } = await pool.query(query, values);
      return rows[0];
    } catch (error: any) {
      logger.error(
        { error: error.message, externalRef },
        'Error al actualizar orden con transaction_id'
      );
      throw error;
    }
  },
  /**
   * Obtener una orden completa por su referencia externa
   * Útil para procesar comisiones en el webhook
   */
  async getByExternalRef(externalRef: string) {
    const query = `
      SELECT * FROM "${schema}".orders 
      WHERE external_reference = $1;
    `;

    try {
      const { rows } = await pool.query(query, [externalRef]);
      return rows[0] || null;
    } catch (error: any) {
      logger.error(
        { error: error.message, externalRef },
        'Error al obtener orden por external_reference'
      );
      throw error;
    }
  },
};
