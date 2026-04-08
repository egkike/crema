import type { PoolClient } from 'pg';

import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';
import { getErrorMessage } from '../utils/ip.util';

// --- INTERFACES ---

export interface CreateCommissionDTO {
  userId: string; // Creador o Afiliado que recibe el dinero
  orderId: string;
  amount: number; // Monto bruto (ej: 25000)
  feeApplied: number; // Comisión de plataforma (ej: 3225)
  netAmount: number; // Lo que se acredita (ej: 21775)
  currency: string;
  type: 'creator' | 'affiliate';
  status?: 'pending' | 'paid' | 'refunded' | 'cancelled';
}

export interface Commission extends CreateCommissionDTO {
  id: string;
  createdAt: Date;
  paidAt?: Date | null;
}

// --- REPOSITORIO ---

export const commissionRepository = {
  /**
   * Mapea los nombres de columna de la DB (snake_case) a la interfaz (camelCase)
   */
  mapRowToCommission(row: any): Commission | null {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      orderId: row.order_id,
      amount: Number(row.amount),
      feeApplied: Number(row.fee_applied),
      netAmount: Number(row.net_amount),
      currency: row.currency,
      type: row.type,
      status: row.status,
      createdAt: row.created_at,
      paidAt: row.paid_at,
    };
  },

  /**
   * Crea un registro de comisión persistente.
   * Soporta transacciones externas pasando el 'client'.
   */
  async create(data: CreateCommissionDTO, client?: PoolClient) {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".commissions (
        user_id, order_id, amount, fee_applied, net_amount, currency, type, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const values = [
      data.userId,
      data.orderId,
      data.amount,
      data.feeApplied,
      data.netAmount,
      data.currency,
      data.type,
      data.status || 'pending',
    ];

    try {
      const db = client || pool;
      const { rows } = await db.query(query, values);
      return this.mapRowToCommission(rows[0]);
    } catch (error: unknown) {
      logger.error(
        { error: getErrorMessage(error), orderId: data.orderId, userId: data.userId },
        'DB Error: Falló la creación de la comisión'
      );
      throw error;
    }
  },

  /**
   * Actualiza el estado de las comisiones (ej: de 'pending' a 'paid' o 'refunded')
   */
  async updateStatusByOrder(orderId: string, newStatus: string, client?: PoolClient) {
    const schema = config.db?.schema || 'public';
    const query = `
      UPDATE "${schema}".commissions 
      SET status = $1::text, 
          paid_at = CASE WHEN $1::text = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END
      WHERE order_id = $2::uuid
      RETURNING *;
    `;
    try {
      const db = client || pool;
      const { rows } = await db.query(query, [newStatus, orderId]);
      return rows.map(row => this.mapRowToCommission(row));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, orderId }, 'DB Error: updateStatusByOrder falló');
      throw error;
    }
  },

  /**
   * Obtiene todas las comisiones desglosadas de una orden específica
   */
  async getByOrderId(orderId: string): Promise<Commission[]> {
    const schema = config.db?.schema || 'public';
    try {
      const { rows } = await pool.query(
        `SELECT * FROM "${schema}".commissions WHERE order_id = $1`,
        [orderId]
      );
      return rows.map(row => this.mapRowToCommission(row)!);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, orderId }, 'DB Error: getByOrderId falló');
      throw error;
    }
  },

  /**
   * Obtiene el historial de ganancias de un usuario (para su panel)
   */
  async getByUserId(userId: string): Promise<Commission[]> {
    const schema = config.db?.schema || 'public';
    try {
      const query = `
        SELECT c.*, o.external_reference 
        FROM "${schema}".commissions c
        JOIN "${schema}".orders o ON c.order_id = o.id
        WHERE c.user_id = $1
        ORDER BY c.created_at DESC;
      `;
      const { rows } = await pool.query(query, [userId]);
      return rows.map(row => this.mapRowToCommission(row)!);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, userId }, 'DB Error: getByUserId falló');
      throw error;
    }
  },

  // ==========================================
  // ADMIN - Métodos para panel de admin
  // ==========================================

  /**
   * Obtiene estadísticas generales de comisiones de la plataforma
   */
  async getStats(): Promise<{
    totalPaid: number;
    totalPending: number;
    totalRefunded: number;
    totalCreatorCommissions: number;
    totalAffiliateCommissions: number;
  }> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        COALESCE(SUM(CASE WHEN status = 'paid' THEN net_amount ELSE 0 END), 0) as "totalPaid",
        COALESCE(SUM(CASE WHEN status = 'pending' THEN net_amount ELSE 0 END), 0) as "totalPending",
        COALESCE(SUM(CASE WHEN status = 'refunded' THEN net_amount ELSE 0 END), 0) as "totalRefunded",
        COALESCE(SUM(CASE WHEN type = 'creator' AND status = 'paid' THEN net_amount ELSE 0 END), 0) as "totalCreatorCommissions",
        COALESCE(SUM(CASE WHEN type = 'affiliate' AND status = 'paid' THEN net_amount ELSE 0 END), 0) as "totalAffiliateCommissions"
      FROM "${schema}".commissions
    `;
    const { rows } = await pool.query(query);
    const row = rows[0];
    return {
      totalPaid: Number(row.totalPaid),
      totalPending: Number(row.totalPending),
      totalRefunded: Number(row.totalRefunded),
      totalCreatorCommissions: Number(row.totalCreatorCommissions),
      totalAffiliateCommissions: Number(row.totalAffiliateCommissions),
    };
  },

  /**
   * Obtiene el top de productos por ventas de afiliados
   */
  async getTopProductsByAffiliateSales(limit: number = 10): Promise<any[]> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        p.id as "productId",
        p.title as "productTitle",
        p.type as "productType",
        COUNT(DISTINCT o.id) as "orderCount",
        COUNT(DISTINCT o.affiliate_id) as "affiliateCount",
        COALESCE(SUM(c.net_amount), 0) as "totalAffiliateEarnings"
      FROM "${schema}".products p
      JOIN "${schema}".orders o ON p.id = o.product_id AND o.affiliate_id IS NOT NULL
      JOIN "${schema}".commissions c ON o.id = c.order_id AND c.type = 'affiliate' AND c.status = 'paid'
      GROUP BY p.id, p.title, p.type
      ORDER BY "totalAffiliateEarnings" DESC
      LIMIT $1
    `;
    const { rows } = await pool.query(query, [limit]);
    return rows.map(row => ({
      product_id: row.productId,
      product_title: row.productTitle,
      product_type: row.productType,
      order_count: Number(row.orderCount),
      affiliate_count: Number(row.affiliateCount),
      total_affiliate_earnings: Number(row.totalAffiliateEarnings),
    }));
  },
};
