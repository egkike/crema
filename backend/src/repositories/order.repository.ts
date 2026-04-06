import type { PoolClient } from 'pg';

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
  gateway_taxes_detail: Record<string, number>;
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
      gateway_taxes_detail: row.gateway_taxes_detail || {},
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
  async invalidateGuarantee(orderId: string, client?: PoolClient): Promise<Order | null> {
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

  /**
   * Este es el método clave que llamará el Webhook de Mercado Pago.
   * Ahora permite pasar el desglose de impuestos.
   */
  async updateByExternalRef(
    externalReference: string,
    data: Partial<Order>,
    client?: PoolClient
  ): Promise<Order | null> {
    const schema = config.db?.schema || 'public';
    const entries = Object.entries(data);
    if (entries.length === 0) return this.getByExternalRef(externalReference);

    // Si data contiene gateway_taxes_detail, lo convertimos a string para PostgreSQL
    const processedValues = entries.map(([key, val]) => {
      if (key === 'gateway_taxes_detail') return JSON.stringify(val);
      return val;
    });

    const fields = entries.map(([key], i) => `"${key}" = $${i + 1}`).join(', ');

    const query = `
      UPDATE "${schema}".orders 
      SET ${fields}, updated_at = CURRENT_TIMESTAMP 
      WHERE external_reference = $${processedValues.length + 1} 
      RETURNING *;
    `;

    const db = client || pool;
    const { rows } = await db.query(query, [...processedValues, externalReference]);
    return this.mapRowToOrder(rows[0]);
  },

  async getByExternalRef(externalRef: string): Promise<Order | null> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT * FROM "${schema}".orders WHERE external_reference = $1`;
    const { rows } = await pool.query(query, [externalRef]);
    return this.mapRowToOrder(rows[0]);
  },

  async updateStatus(orderId: string, status: string, client?: PoolClient): Promise<Order | null> {
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

  async getById(orderId: string, client?: PoolClient): Promise<Order | null> {
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
      ORDER BY o.created_at DESC LIMIT 1
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

  // ==========================================
  // ADMIN - Métodos para panel de admin
  // ==========================================

  /**
   * Lista todas las órdenes de la plataforma con filtros y paginación
   */
  async getAllOrders(params: {
    status?: string;
    currency?: string;
    from?: string;
    to?: string;
    buyerId?: string;
    productId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ orders: any[]; total: number }> {
    const schema = config.db?.schema || 'public';
    const { status, currency, from, to, buyerId, productId, page = 1, limit = 20 } = params;

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (status) {
      conditions.push(`o.status = $${idx}`);
      values.push(status);
      idx++;
    }

    if (currency) {
      conditions.push(`o.currency = $${idx}`);
      values.push(currency);
      idx++;
    }

    if (from) {
      conditions.push(`o.created_at >= $${idx}::date`);
      values.push(from);
      idx++;
    }

    if (to) {
      conditions.push(`o.created_at <= $${idx}::date`);
      values.push(to);
      idx++;
    }

    if (buyerId) {
      conditions.push(`o.buyer_id = $${idx}`);
      values.push(buyerId);
      idx++;
    }

    if (productId) {
      conditions.push(`o.product_id = $${idx}`);
      values.push(productId);
      idx++;
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';

    // Query para total
    const countQuery = `
      SELECT COUNT(*)::int as total
      FROM "${schema}".orders o
      ${whereClause}
    `;

    // Query para datos con paginación
    const offset = (page - 1) * limit;
    const dataQuery = `
      SELECT 
        o.*,
        json_build_object(
          'id', u.id,
          'fullname', u.fullname,
          'email', u.email
        ) as buyer,
        json_build_object(
          'id', p.id,
          'title', p.title,
          'type', p.type
        ) as product,
        json_build_object(
          'id', COALESCE(a.id, null),
          'fullname', COALESCE(a.fullname, null)
        ) as affiliate
      FROM "${schema}".orders o
      LEFT JOIN "${schema}".users u ON o.buyer_id = u.id
      LEFT JOIN "${schema}".products p ON o.product_id = p.id
      LEFT JOIN "${schema}".users a ON o.affiliate_id = a.id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    values.push(limit, offset);

    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, values.slice(0, idx - 1)),
      pool.query(dataQuery, values),
    ]);

    const total = countResult.rows[0]?.total || 0;
    const orders = dataResult.rows.map(row => ({
      id: row.id,
      buyer_id: row.buyer_id,
      product_id: row.product_id,
      affiliate_id: row.affiliate_id,
      amount: Number(row.amount),
      currency: row.currency,
      commission_amount: Number(row.commission_amount || 0),
      status: row.status,
      payment_method: row.payment_method,
      external_reference: row.external_reference,
      gateway_fee: Number(row.gateway_fee || 0),
      gateway_tax: Number(row.gateway_tax || 0),
      net_platform_profit: Number(row.net_platform_profit || 0),
      transaction_id: row.transaction_id,
      commissions_calculated: row.commissions_calculated,
      balance_released: row.balance_released,
      is_guarantee_eligible: row.is_guarantee_eligible,
      release_at: row.release_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      buyer: row.buyer,
      product: row.product,
      affiliate: row.affiliate,
    }));

    return { orders, total };
  },

  /**
   * Obtiene una orden específica por ID con todos los datos relacionados
   */
  async getOrderByIdForAdmin(orderId: string): Promise<any | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        o.*,
        json_build_object(
          'id', u.id,
          'fullname', u.fullname,
          'email', u.email
        ) as buyer,
        json_build_object(
          'id', p.id,
          'title', p.title,
          'type', p.type,
          'creator_id', p.creator_id
        ) as product,
        json_build_object(
          'id', COALESCE(a.id, null),
          'fullname', COALESCE(a.fullname, null),
          'email', COALESCE(a.email, null)
        ) as affiliate,
        json_build_object(
          'id', c.id,
          'user_id', c.user_id,
          'type', c.type,
          'amount', c.amount,
          'fee_applied', c.fee_applied,
          'net_amount', c.net_amount
        ) as creator_commission,
        json_build_object(
          'id', ca.id,
          'user_id', ca.user_id,
          'type', ca.type,
          'amount', ca.amount,
          'fee_applied', ca.fee_applied,
          'net_amount', ca.net_amount
        ) as affiliate_commission
      FROM "${schema}".orders o
      LEFT JOIN "${schema}".users u ON o.buyer_id = u.id
      LEFT JOIN "${schema}".products p ON o.product_id = p.id
      LEFT JOIN "${schema}".users a ON o.affiliate_id = a.id
      LEFT JOIN "${schema}".commissions c ON o.id = c.order_id AND c.type = 'creator'
      LEFT JOIN "${schema}".commissions ca ON o.id = ca.order_id AND ca.type = 'affiliate'
      WHERE o.id = $1
    `;

    const { rows } = await pool.query(query, [orderId]);
    if (!rows[0]) return null;

    const row = rows[0];
    return {
      id: row.id,
      buyer_id: row.buyer_id,
      product_id: row.product_id,
      affiliate_id: row.affiliate_id,
      amount: Number(row.amount),
      currency: row.currency,
      original_amount: row.original_amount ? Number(row.original_amount) : null,
      discount_applied: Number(row.discount_applied || 0),
      commission_amount: Number(row.commission_amount || 0),
      status: row.status,
      payment_method: row.payment_method,
      external_reference: row.external_reference,
      gateway_fee: Number(row.gateway_fee || 0),
      gateway_tax: Number(row.gateway_tax || 0),
      net_platform_profit: Number(row.net_platform_profit || 0),
      transaction_id: row.transaction_id,
      commissions_calculated: row.commissions_calculated,
      balance_released: row.balance_released,
      is_guarantee_eligible: row.is_guarantee_eligible,
      days_of_guarantee_applied: row.days_of_guarantee_applied,
      release_at: row.release_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      buyer: row.buyer,
      product: row.product,
      affiliate: row.affiliate,
      creator_commission: row.creator_commission,
      affiliate_commission: row.affiliate_commission,
    };
  },
};
