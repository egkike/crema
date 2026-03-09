import pool from '../db/postgres';
import { config } from '../config/index';

// --- INTERFACES ---

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
  originalAmount?: number;
  discountApplied?: number;
  couponId?: string | null;
}

export interface Order {
  id: string;
  buyer_id: string;
  product_id: string;
  affiliate_id: string | null;
  amount: number;
  currency: string;
  commission_amount: number;
  original_amount: number | null;
  discount_applied: number;
  coupon_id: string | null;
  status: string;
  payment_method: string;
  external_reference: string;
  gateway_fee: number;
  gateway_tax: number;
  net_platform_profit: number;
  transaction_id?: string | undefined;
  commissions_calculated: boolean;
  balance_released: boolean;
  days_of_guarantee_applied: number | null;
  is_guarantee_eligible: boolean;
  gateway_liquidity_days_applied: number;
  release_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Campos agregados por el mapeador o joins
  release_date: Date | null;
  creator_id: string | null;
}

export const orderRepository = {
  mapRowToOrder(row: any): Order | null {
    if (!row) return null;

    // Cálculo dinámico de fecha de liberación si no existe release_at
    let releaseDate = row.release_at ? new Date(row.release_at) : null;

    if (!releaseDate && row.created_at) {
      const date = new Date(row.created_at);
      const days = row.days_of_guarantee_applied ?? 7;
      date.setDate(date.getDate() + Number(days));
      releaseDate = date;
    }

    return {
      ...row,
      amount: Number(row.amount),
      commission_amount: Number(row.commission_amount || 0),
      gateway_fee: Number(row.gateway_fee || 0),
      gateway_tax: Number(row.gateway_tax || 0),
      net_platform_profit: Number(row.net_platform_profit || 0),
      is_guarantee_eligible: Boolean(row.is_guarantee_eligible),
      // release_date es para el frontend, release_at es el valor real de DB
      release_date: releaseDate,
      release_at: row.release_at ? new Date(row.release_at) : null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      creator_id: row.creator_id || null,
    } as Order;
  },

  /**
   * Obtiene la orden pagada activa de un usuario para un producto específico
   */
  async getActiveOrder(userId: string, productId: string): Promise<Order | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT * FROM "${schema}".orders 
      WHERE buyer_id = $1 AND product_id = $2 AND status = 'paid'
      ORDER BY created_at DESC LIMIT 1;
    `;
    const { rows } = await pool.query(query, [userId, productId]);
    return this.mapRowToOrder(rows[0]);
  },

  /**
   * Inactiva la elegibilidad de reembolso por consumo.
   * El WHERE asegura que si ya era FALSE, el RETURNING no devuelva nada (Idempotencia).
   */
  async invalidateGuarantee(orderId: string, client?: any): Promise<Order | null> {
    const schema = config.db?.schema || 'public';
    const db = client || pool;
    const query = `
      UPDATE "${schema}".orders 
      SET is_guarantee_eligible = FALSE, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND is_guarantee_eligible = TRUE
      RETURNING *;
    `;
    const { rows } = await db.query(query, [orderId]);
    return this.mapRowToOrder(rows[0]);
  },

  async create(data: CreateOrderDTO): Promise<Order | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".orders (
        buyer_id, product_id, affiliate_id, amount, currency,
        commission_amount, status, payment_method, external_reference,
        original_amount, discount_applied, coupon_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
      data.originalAmount || data.amount,
      data.discountApplied || 0,
      data.couponId || null,
    ];

    const { rows } = await pool.query(query, values);
    return this.mapRowToOrder(rows[0]);
  },

  async updateByExternalRef(
    externalReference: string,
    data: Partial<Order>,
    client?: any
  ): Promise<Order | null> {
    const schema = config.db?.schema || 'public';
    const entries = Object.entries(data);
    if (entries.length === 0) return this.getByExternalRef(externalReference);

    // Filtramos para asegurar que no intentamos actualizar campos inexistentes o protegidos
    const fields = entries.map(([key], i) => `"${key}" = $${i + 1}`).join(', ');
    const values = entries.map(([, val]) => val);

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

  async getByExternalRef(externalRef: string): Promise<Order | null> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT * FROM "${schema}".orders WHERE external_reference = $1`;
    const { rows } = await pool.query(query, [externalRef]);
    return this.mapRowToOrder(rows[0]);
  },

  async updateStatus(orderId: string, status: string, client?: any): Promise<Order | null> {
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
    LIMIT 1;
  `;
    const { rows } = await pool.query(query, [userId, productId]);
    return rows.length > 0;
  },

  /**
   * Verifica autoría y compra en una sola consulta.
   * Ajustado para manejar casos donde el producto no existe.
   */
  async verifyAccess(
    userId: string,
    productId: string
  ): Promise<{ isOwner: boolean; hasPaid: boolean }> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        (creator_id = $1) as "isOwner",
        EXISTS (
          SELECT 1 FROM "${schema}".orders 
          WHERE buyer_id = $1 AND product_id = $2 AND status = 'paid'
        ) as "hasPaid"
      FROM "${schema}".products
      WHERE id = $2;
    `;

    const { rows } = await pool.query(query, [userId, productId]);
    if (!rows.length) return { isOwner: false, hasPaid: false };

    return {
      isOwner: Boolean(rows[0].isOwner),
      hasPaid: Boolean(rows[0].hasPaid),
    };
  },

  async getById(orderId: string, client?: any): Promise<Order | null> {
    const schema = config.db?.schema || 'public';
    const db = client || pool;
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

  /**
   * Obtiene la orden pagada activa incluyendo datos del comprador (Email y Nombre)
   * Optimiza el envío de notificaciones en el AccessService.
   */
  async getActiveOrderWithBuyer(userId: string, productId: string): Promise<any | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT o.*, u.email as buyer_email, u.fullname as buyer_name
      FROM "${schema}".orders o
      JOIN "${schema}".users u ON o.buyer_id = u.id
      WHERE o.buyer_id = $1 AND o.product_id = $2 AND o.status = 'paid'
      ORDER BY o.created_at DESC LIMIT 1;
    `;
    const { rows } = await pool.query(query, [userId, productId]);
    if (!rows[0]) return null;

    // Mapeamos la fila base y conservamos los campos del JOIN
    const order = this.mapRowToOrder(rows[0]);
    return {
      ...order,
      buyer_email: rows[0].buyer_email,
      buyer_name: rows[0].buyer_name,
    };
  },
};
