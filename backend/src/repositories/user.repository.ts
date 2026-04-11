import crypto from 'crypto';

import type { PoolClient } from 'pg';
import bcrypt from 'bcryptjs';

import pool from '../db/postgres';
import { config } from '../config/index';

// --- INTERFACES DE CONTRATO ---

export interface UserBase {
  id: string;
  username: string;
  email: string;
  fullname: string;
  level: number;
  active: number;
  affiliate_slug: string;
  must_change_password: boolean;
  tax_id?: string;
  tax_condition?: 'ri' | 'monotax' | 'exempt' | 'final_consumer';
  createdate: Date;
}

export interface UserWithPassword extends UserBase {
  password: string;
  two_factor_secret?: string;
  two_factor_enabled: boolean;
  two_factor_backup_codes: string[]; // Guardados como JSONB en DB
}

export interface CreateUserInput {
  email: string;
  fullname: string;
  username?: string | undefined;
  password?: string | undefined;
  level?: number;
  active?: number;
  tax_id?: string;
  tax_condition?: string;
}

export interface UpdateUserInput {
  fullname?: string;
  level?: number;
  active?: number;
  tax_id?: string;
  tax_condition?: string;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked: boolean;
  created_at: Date;
  user_agent?: string;
  ip_address?: string;
  device_type?: string;
  last_active?: Date;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  ip_address: string;
  user_agent: string;
  created_at: Date;
}

export const userRepository = {
  /**
   * Busca un usuario por username o email para el proceso de Login.
   */
  async findByCredentials(identifier: string): Promise<UserWithPassword | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT id, username, password, email, fullname, level, active, 
             must_change_password, createdate, affiliate_slug,
             two_factor_secret, two_factor_enabled, two_factor_backup_codes,
             tax_id, tax_condition
      FROM "${schema}".users 
      WHERE username = $1 OR email = $1
    `;
    const { rows } = await pool.query<UserWithPassword>(query, [identifier]);
    return rows[0] || null;
  },

  /**
   * Obtiene la información pública/básica de un usuario por su ID.
   */
  async getById(id: string): Promise<UserBase | null> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT id, username, email, fullname, level, active, 
                          must_change_password, createdate, affiliate_slug,
                          tax_id, tax_condition
                   FROM "${schema}".users WHERE id = $1`;
    const { rows } = await pool.query<UserBase>(query, [id]);
    return rows[0] || null;
  },

  /**
   * Obtiene lista de todos los usuarios
   */
  async getUsers(): Promise<UserBase[]> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT id, username, email, fullname, level, active, createdate, affiliate_slug, must_change_password,
                    tax_id, tax_condition 
                   FROM "${schema}".users ORDER BY createdate DESC`;
    const { rows } = await pool.query<UserBase>(query);
    return rows;
  },

  // --- MÉTODOS DE REFRESH TOKEN ---

  async saveRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    metadata?: { userAgent?: string; ip?: string; deviceType?: string }
  ): Promise<void> {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address, device_type)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    await pool.query(query, [
      userId,
      tokenHash,
      expiresAt,
      metadata?.userAgent || null,
      metadata?.ip || null,
      metadata?.deviceType || 'unknown',
    ]);
  },

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRow | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT * FROM "${schema}".refresh_tokens 
      WHERE token_hash = $1 AND revoked = FALSE AND expires_at > CURRENT_TIMESTAMP
    `;
    const { rows } = await pool.query<RefreshTokenRow>(query, [tokenHash]);
    return rows[0] || null;
  },

  async deleteSpecificRefreshToken(tokenHash: string): Promise<void> {
    const schema = config.db?.schema || 'public';
    const query = `DELETE FROM "${schema}".refresh_tokens WHERE token_hash = $1`;
    await pool.query(query, [tokenHash]);
  },

  async deleteRefreshToken(userId: string): Promise<void> {
    const schema = config.db?.schema || 'public';
    const query = `DELETE FROM "${schema}".refresh_tokens WHERE user_id = $1`;
    await pool.query(query, [userId]);
  },

  // Obtener todas las sesiones activas de un usuario
  async getUserSessions(userId: string): Promise<RefreshTokenRow[]> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT id, user_id, token_hash, expires_at, created_at, user_agent, ip_address, device_type, last_active
      FROM "${schema}".refresh_tokens 
      WHERE user_id = $1 AND revoked = FALSE AND expires_at > CURRENT_TIMESTAMP
      ORDER BY last_active DESC
    `;
    const { rows } = await pool.query<RefreshTokenRow>(query, [userId]);
    return rows;
  },

  // Revocar sesión por ID (Cerrar sesión remota)
  async revokeSessionById(sessionId: string, userId: string): Promise<boolean> {
    const schema = config.db?.schema || 'public';
    const query = `DELETE FROM "${schema}".refresh_tokens WHERE id = $1 AND user_id = $2`;
    const result = await pool.query(query, [sessionId, userId]);
    return (result.rowCount ?? 0) > 0;
  },

  // --- MÉTODOS DE GESTIÓN DE USUARIO ---

  /**
   * Crea un usuario incluyendo lógica fiscal inicial.
   */
  async createUser(input: CreateUserInput) {
    const schema = config.db?.schema || 'public';
    const {
      password,
      email,
      fullname,
      level = 1,
      active = 0,
      username,
      tax_id = null,
      tax_condition = 'monotax',
    } = input;

    let finalUsername: string;
    if (username && username.trim() !== '') {
      finalUsername = username.toLowerCase().trim();
    } else {
      const baseName = email.split('@')[0].substring(0, 15);
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      finalUsername = `${baseName}${randomSuffix}`;
    }

    const affiliateSlug = finalUsername;
    const mustChangePassword = Number(level) === 1;
    const rawPassword = password || crypto.randomBytes(12).toString('hex');
    // Use HMAC for password pepper (consistent with auth.controller)
    const passwordWithPepper = crypto.createHmac('sha256', config.passwordPepper).update(rawPassword).digest('hex');
    const hash = await bcrypt.hash(passwordWithPepper, 12);

    const verificationToken = active === 0 ? crypto.randomBytes(32).toString('hex') : null;
    const expires = active === 0 ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;

    const query = `
    INSERT INTO "${schema}".users 
      (username, affiliate_slug, password, email, fullname, level, active, 
       verification_token, verification_token_expires, must_change_password,
       tax_id, tax_condition)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id, username, affiliate_slug, email, fullname, level, active, tax_id, tax_condition;
    `;

    const { rows } = await pool.query(query, [
      finalUsername,
      affiliateSlug,
      hash,
      email,
      fullname,
      level,
      active,
      verificationToken,
      expires,
      mustChangePassword,
      tax_id,
      tax_condition,
    ]);

    return { ...rows[0], verificationToken };
  },

  async verifyAccount(token: string): Promise<boolean> {
    const schema = config.db?.schema || 'public';
    const query = `
      UPDATE "${schema}".users 
      SET active = 1, verification_token = NULL, verification_token_expires = NULL
      WHERE verification_token = $1 AND verification_token_expires > CURRENT_TIMESTAMP
      RETURNING id
    `;
    const { rows } = await pool.query(query, [token]);
    return rows.length > 0;
  },

  /**
   * Actualiza usuario permitiendo modificar CUIT y Condición frente al IVA.
   */
  async updUser(
    { id, input }: { id: string; input: UpdateUserInput },
    client?: PoolClient
  ): Promise<UserBase | null> {
    const schema = config.db?.schema || 'public';
    const { fullname, level, active, tax_id, tax_condition } = input;
    const updates: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (fullname !== undefined) {
      updates.push(`fullname = $${paramIndex++}`);
      values.push(fullname);
    }
    if (level !== undefined) {
      updates.push(`level = $${paramIndex++}`);
      values.push(level);
    }
    if (active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      values.push(active);
    }
    if (tax_id !== undefined) {
      updates.push(`tax_id = $${paramIndex++}`);
      values.push(tax_id);
    }
    if (tax_condition !== undefined) {
      updates.push(`tax_condition = $${paramIndex++}`);
      values.push(tax_condition);
    }

    if (updates.length === 0) return this.getById(id);

    values.push(id);
    const query = `UPDATE "${schema}".users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const db = client || pool;
    const { rows } = await db.query(query, values);

    return (rows[0] as UserBase) || null;
  },

  async chgPassUser({ id, input }: { id: string; input: { password: string } }): Promise<void> {
    const schema = config.db?.schema || 'public';
    // Use HMAC for password pepper (consistent with auth.controller)
    const passwordWithPepper = crypto.createHmac('sha256', config.passwordPepper).update(input.password).digest('hex');
    const hash = await bcrypt.hash(passwordWithPepper, 12);
    const query = `UPDATE "${schema}".users SET password = $1, must_change_password = false WHERE id = $2`;
    await pool.query(query, [hash, id]);
  },

  async updatePasswordAndClearFlag(id: string, passwordHash: string): Promise<boolean> {
    const schema = config.db?.schema || 'public';
    const query = `UPDATE "${schema}".users SET password = $1, must_change_password = false WHERE id = $2`;
    const result = await pool.query(query, [passwordHash, id]);
    return (result.rowCount ?? 0) > 0;
  },

  async deleteUser(id: string): Promise<boolean> {
    const schema = config.db?.schema || 'public';
    const query = `DELETE FROM "${schema}".users WHERE id = $1`;
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async validateRefreshToken(tokenHash: string): Promise<string | null> {
    const token = await this.findRefreshToken(tokenHash);
    return token ? token.user_id : null;
  },

  async saveResetToken(
    email: string,
    token: string,
    expires: Date
  ): Promise<{ id: string } | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      UPDATE "${schema}".users 
      SET reset_password_token = $1, reset_password_expires = $2
      WHERE email = $3
      RETURNING id;
    `;
    const { rows } = await pool.query<{ id: string }>(query, [token, expires, email]);
    return rows[0] || null;
  },

  async resetPasswordByToken(token: string, newPasswordHash: string): Promise<boolean> {
    const schema = config.db?.schema || 'public';
    const query = `
      UPDATE "${schema}".users 
      SET password = $1, 
          reset_password_token = NULL, 
          reset_password_expires = NULL,
          must_change_password = false
      WHERE reset_password_token = $2 AND reset_password_expires > CURRENT_TIMESTAMP
      RETURNING id;
    `;
    const { rows } = await pool.query(query, [newPasswordHash, token]);
    return rows.length > 0;
  },

  async findByAffiliateSlug(
    slug: string
  ): Promise<Pick<UserBase, 'id' | 'username' | 'affiliate_slug'> | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT id, username, affiliate_slug 
      FROM "${schema}".users 
      WHERE affiliate_slug = $1 OR id::text = $1 
      LIMIT 1
    `;
    const { rows } = await pool.query<Pick<UserBase, 'id' | 'username' | 'affiliate_slug'>>(query, [
      slug,
    ]);
    return rows[0] || null;
  },

  /**
   * Guarda el secreto de 2FA pero NO lo activa todavía.
   * El usuario debe verificar un código primero.
   */
  async update2FASecret(userId: string, secret: string, backupCodes: string[]): Promise<void> {
    const schema = config.db?.schema || 'public';
    const query = `
      UPDATE "${schema}".users 
      SET two_factor_secret = $1, 
          two_factor_backup_codes = $2::jsonb,
          two_factor_enabled = FALSE 
      WHERE id = $3
    `;
    await pool.query(query, [secret, JSON.stringify(backupCodes), userId]);
  },

  /**
   * Activa oficialmente el 2FA para el usuario.
   */
  async enable2FA(userId: string): Promise<void> {
    const schema = config.db?.schema || 'public';
    const query = `UPDATE "${schema}".users SET two_factor_enabled = TRUE WHERE id = $1`;
    await pool.query(query, [userId]);
  },

  /**
   * Desactiva el 2FA y limpia los secretos.
   */
  async disable2FA(userId: string): Promise<void> {
    const schema = config.db?.schema || 'public';
    const query = `
      UPDATE "${schema}".users 
      SET two_factor_enabled = FALSE, 
          two_factor_secret = NULL, 
          two_factor_backup_codes = '[]'::jsonb 
      WHERE id = $1
    `;
    await pool.query(query, [userId]);
  },

  /**
   * Elimina todas las sesiones de un usuario excepto la actual
   */
  async revokeOtherSessions(userId: string, currentTokenHash: string): Promise<number> {
    const schema = config.db?.schema || 'public';
    const query = `
      DELETE FROM "${schema}".refresh_tokens 
      WHERE user_id = $1 AND token_hash != $2
    `;
    const result = await pool.query(query, [userId, currentTokenHash]);
    return result.rowCount ?? 0;
  },

  /**
   * Registra una acción de seguridad en el historial
   */
  async addActivityLog(
    userId: string,
    action: string,
    metadata: { ip?: string; userAgent?: string }
  ): Promise<void> {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".activity_logs (user_id, action, ip_address, user_agent)
      VALUES ($1, $2, $3, $4)
    `;
    await pool.query(query, [userId, action, metadata.ip || null, metadata.userAgent || null]);
  },

  /**
   * Obtiene los últimos logs de actividad de un usuario
   */
  async getActivityLogs(userId: string, limit: number = 20): Promise<ActivityLog[]> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT id, action, ip_address, user_agent, created_at
      FROM "${schema}".activity_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const { rows } = await pool.query<ActivityLog>(query, [userId, limit]);
    return rows;
  },
};
