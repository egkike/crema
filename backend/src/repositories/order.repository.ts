import pool from '../db/postgres';
import { config } from '../config/index';

export interface CreateOrderDTO {
  buyerId: string;
  productId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  externalReference: string;
  status?: string;
  affiliateId?: string | null;
  commissionAmount?: number;
}

export const orderRepository = {
  mapRowToOrder(row: any) {
    if (!row) return null;

    // >>> Cálculo de fecha de liberación estimada <<<
    let releaseDate: Date | null = null;
    if (row.created_at && row.days_of_guarantee_applied !== undefined) {
      const date = new Date(row.created_at);
      const days = row.days_of_guarantee_applied !== null ? row.days_of_guarantee_applied : 7;
      date.setDate(date.getDate() + Number(days));
      releaseDate = date;
    }

    return {
      ...row,
      amount: Number(row.amount),
      commission_amount: row.commission_amount ? Number(row.commission_amount) : 0,
      total_amount: Number(row.amount),
      buyerId: row.buyer_id,
      productId: row.product_id,
      affiliateId: row.affiliate_id,
      release_date: releaseDate,
      // creator_id viene del JOIN en getById
      creator_id: row.creator_id || null,
    };
  },

  async create(data: CreateOrderDTO) {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".orders (
        buyer_id, product_id, affiliate_id, amount, currency,
        commission_amount, status, payment_method, external_reference
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

    const values = [
      data.buyerId,
      data.productId,
      data.affiliateId || null,
      data.amount,
      data.currency,
      data.commissionAmount || 0,
      data.status || 'pending',
      data.paymentMethod,
      data.externalReference,
    ];

    const { rows } = await pool.query(query, values);
    return this.mapRowToOrder(rows[0]);
  },

  async updateByExternalRef(externalReference: string, data: Partial<any>, client?: any) {
    const schema = config.db?.schema || 'public';
    const fields = Object.keys(data)
      .map((key, i) => `"${key}" = $${i + 1}`)
      .join(', ');

    const values = Object.values(data);
    const query = `
      UPDATE "${schema}".orders 
      SET ${fields}, updated_at = CURRENT_TIMESTAMP 
      WHERE external_reference = $${values.length + 1} 
      RETURNING *;
    `;

    const db = client || pool;
    const { rows } = await db.query(query, [...values, externalReference]);
    return this.mapRowToOrder(rows[0]);
  },

  async getByExternalRef(externalRef: string) {
    const schema = config.db?.schema || 'public';
    const query = `SELECT * FROM "${schema}".orders WHERE external_reference = $1`;
    const { rows } = await pool.query(query, [externalRef]);
    return this.mapRowToOrder(rows[0]);
  },

  async updateStatus(orderId: string, status: string, client?: any) {
    const schema = config.db?.schema || 'public';
    const query = `
      UPDATE "${schema}".orders 
      SET status = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2 
      RETURNING *;
    `;
    const db = client || pool;
    const { rows } = await db.query(query, [status, orderId]);
    return this.mapRowToOrder(rows[0]);
  },

  async checkAccess(userId: string, productId: string): Promise<boolean> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT id FROM "${schema}".orders 
      WHERE buyer_id = $1 AND product_id = $2 AND status = 'paid'
      UNION
      SELECT id FROM "${schema}".products 
      WHERE creator_id = $1 AND id = $2
      LIMIT 1;
    `;
    const { rows } = await pool.query(query, [userId, productId]);
    return rows.length > 0;
  },

  /**
   * getById AJUSTADO:
   * 1. Incluye JOIN con products para obtener creator_id.
   * 2. Soporta FOR UPDATE para bloquear la fila durante reembolsos/liberaciones.
   */
  async getById(orderId: string, client?: any) {
    const schema = config.db?.schema || 'public';
    const db = client || pool;

    // Si hay un cliente (transacción), bloqueamos la fila para evitar "double spending"
    const lockClause = client ? 'FOR UPDATE' : '';

    const query = `
      SELECT o.*, p.creator_id 
      FROM "${schema}".orders o
      JOIN "${schema}".products p ON o.product_id = p.id
      WHERE o.id = $1
      ${lockClause}
    `;

    const { rows } = await db.query(query, [orderId]);
    return this.mapRowToOrder(rows[0]);
  },
};
