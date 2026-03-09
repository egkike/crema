import pool from '../db/postgres';
import { config } from '../config/index';

export interface Coupon {
  id: string;
  product_id: string;
  creator_id: string;
  code: string;
  discount_percent: number;
  max_uses: number;
  current_uses: number;
  is_active: boolean;
  expires_at: Date;
  created_at: Date;
}

export const couponRepository = {
  mapRowToCoupon(row: any): Coupon | null {
    if (!row) return null;
    return {
      ...row,
      discount_percent: Number(row.discount_percent),
      current_uses: Number(row.current_uses),
      max_uses: Number(row.max_uses),
      expires_at: new Date(row.expires_at),
      created_at: new Date(row.created_at),
    };
  },

  async create(data: any): Promise<Coupon | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".product_coupons (product_id, creator_id, code, discount_percent, max_uses, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
    `;
    const { rows } = await pool.query(query, [
      data.productId,
      data.creatorId,
      data.code.toUpperCase(),
      data.discountPercent,
      data.maxUses,
      data.expiresAt,
    ]);
    return this.mapRowToCoupon(rows[0]);
  },

  async findValidCoupon(productId: string, code: string): Promise<Coupon | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT * FROM "${schema}".product_coupons
      WHERE product_id = $1 AND code = $2 AND is_active = TRUE 
      AND expires_at > CURRENT_TIMESTAMP AND current_uses < max_uses
      LIMIT 1;
    `;
    const { rows } = await pool.query(query, [productId, code.toUpperCase()]);
    return this.mapRowToCoupon(rows[0]);
  },

  async validatePriceFloor(productId: string, currency: string, discountPercent: number) {
    const schema = config.db?.schema || 'public';
    // Buscamos el precio del producto y los factores de tu SEED
    const query = `
      SELECT 
        pp.amount as original_price,
        (pc_low.value * pc_factor.value) as min_required
      FROM "${schema}".product_prices pp
      JOIN "${schema}".platform_configs pc_low ON pc_low.currency = pp.currency AND pc_low.key = 'fixed_fee_low'
      JOIN "${schema}".platform_configs pc_factor ON pc_factor.currency = pp.currency AND pc_factor.key = 'min_product_price_factor'
      WHERE pp.product_id = $1 AND pp.currency = $2;
    `;
    const { rows } = await pool.query(query, [productId, currency]);
    if (!rows.length) return null;

    const originalPrice = Number(rows[0].original_price);
    const minRequired = Number(rows[0].min_required);
    const finalPrice = originalPrice * (1 - discountPercent / 100);

    return {
      isValid: finalPrice >= minRequired,
      originalPrice,
      finalPrice,
      minRequired,
    };
  },

  async incrementUses(couponId: string, client?: any): Promise<void> {
    const db = client || pool;
    const schema = config.db?.schema || 'public';
    await db.query(
      `UPDATE "${schema}".product_coupons SET current_uses = current_uses + 1 WHERE id = $1`,
      [couponId]
    );
  },

  async findByProductId(productId: string): Promise<Coupon[]> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT * FROM "${schema}".product_coupons WHERE product_id = $1 ORDER BY created_at DESC`;
    const { rows } = await pool.query(query, [productId]);
    return rows.map(row => this.mapRowToCoupon(row)!);
  },
};
