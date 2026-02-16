import crypto from 'crypto';

import bcrypt from 'bcrypt';

import pool from '../db/postgres';
import { config } from '../config/index';

// Agregamos esta interfaz para que AuthController pueda tipar el usuario correctamente
export interface UserWithPassword {
  id: string;
  username: string;
  email: string;
  fullname: string;
  password: string; // La incluimos porque el login la necesita para comparar
  level: number;
  active: number;
  must_change_password: boolean;
  createdate: Date;
}

export const userRepository = {
  /**
   * Busca un usuario por username o email para el proceso de Login.
   */
  async findByCredentials(identifier: string): Promise<UserWithPassword | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT id, username, password, email, fullname, level, active, must_change_password, createdate
      FROM "${schema}".users 
      WHERE username = $1 OR email = $1
    `;
    const { rows } = await pool.query(query, [identifier]);
    return rows[0] || null;
  },

  /**
   * Obtiene la información pública/básica de un usuario por su ID.
   */
  async getById(id: string) {
    const schema = config.db?.schema || 'public';
    const query = `SELECT id, username, email, fullname, level, active, must_change_password, createdate 
                   FROM "${schema}".users WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
  },

  /**
   * Obtiene lista de todos los usuarios (Requerido por UserController.getUsers)
   */
  async getUsers() {
    const schema = config.db?.schema || 'public';
    const query = `SELECT id, username, email, fullname, level, active, createdate FROM "${schema}".users ORDER BY createdate DESC`;
    const { rows } = await pool.query(query);
    return rows;
  },

  // --- MÉTODOS DE REFRESH TOKEN ---

  async saveRefreshToken(userId: string, tokenHash: string, expiresAt: Date) {
    const schema = config.db?.schema || 'public';
    // Sin ON CONFLICT para soportar múltiples sesiones activas
    const query = `
      INSERT INTO "${schema}".refresh_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `;
    await pool.query(query, [userId, tokenHash, expiresAt]);
  },

  /**
   * Alias para getRefreshToken que usa tu AuthController
   */
  async findRefreshToken(tokenHash: string) {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT * FROM "${schema}".refresh_tokens 
      WHERE token_hash = $1 AND revoked = FALSE AND expires_at > CURRENT_TIMESTAMP
    `;
    const { rows } = await pool.query(query, [tokenHash]);
    return rows[0] || null;
  },

  /**
   * Elimina un token específico (Requerido por Logout)
   */
  async deleteSpecificRefreshToken(tokenHash: string) {
    const schema = config.db?.schema || 'public';
    const query = `DELETE FROM "${schema}".refresh_tokens WHERE token_hash = $1`;
    await pool.query(query, [tokenHash]);
  },

  async deleteRefreshToken(userId: string) {
    const schema = config.db?.schema || 'public';
    const query = `DELETE FROM "${schema}".refresh_tokens WHERE user_id = $1`;
    await pool.query(query, [userId]);
  },

  // --- MÉTODOS DE GESTIÓN DE USUARIO ---

  async createUser(input: any) {
    const schema = config.db?.schema || 'public';
    const { password, email, fullname, level = 1, active = 0 } = input;

    // 1. GENERACIÓN AUTOMÁTICA DE USERNAME
    // Tomamos lo que está antes del '@' y le sumamos 3 números aleatorios
    // Ejemplo: "kike.perez@gmail.com" -> "kike.perez842"
    const baseName = email.split('@')[0].substring(0, 15); // Limitar a 15 caracteres
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const generatedUsername = `${baseName}${randomSuffix}`;

    // El slug inicial será igual al username base (más limpio)
    const affiliateSlug = generatedUsername;

    const mustChangePassword = Number(level) === 1;
    const passwordWithPepper = password + config.passwordPepper;
    const hash = await bcrypt.hash(passwordWithPepper, 12);

    // Tokens de verificación (opcionales según tu flujo de registro manual)
    const verificationToken = active === 0 ? crypto.randomBytes(32).toString('hex') : null;
    const expires = active === 0 ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;

    const query = `
    INSERT INTO "${schema}".users 
      (username, affiliate_slug, password, email, fullname, level, active, 
       verification_token, verification_token_expires, must_change_password)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, username, affiliate_slug, email, fullname;
    `;

    const { rows } = await pool.query(query, [
      generatedUsername,
      affiliateSlug,
      hash,
      email,
      fullname,
      level,
      active,
      verificationToken,
      expires,
      mustChangePassword,
    ]);
    return { ...rows[0], verificationToken };
  },

  /**
   * Verifica la cuenta mediante el token (Requerido por verifyEmail)
   */
  async verifyAccount(token: string) {
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

  async updUser({ id, input }: { id: string; input: any }) {
    const schema = config.db?.schema || 'public';
    const { fullname, level, active } = input;
    const updates: string[] = [];
    const values: any[] = [];
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

    if (updates.length === 0) return this.getById(id);

    values.push(id);
    const query = `UPDATE "${schema}".users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const { rows } = await pool.query(query, values);
    return rows[0] || null;
  },

  /**
   * Cambia la contraseña (Requerido por UserController)
   */
  async chgPassUser({ id, input }: { id: string; input: { password: string } }) {
    const schema = config.db?.schema || 'public';
    const passwordWithPepper = input.password + config.passwordPepper;
    const hash = await bcrypt.hash(passwordWithPepper, 12);
    const query = `UPDATE "${schema}".users SET password = $1, must_change_password = false WHERE id = $2`;
    await pool.query(query, [hash, id]);
  },

  /**
   * Actualiza contraseña y quita flag de cambio obligatorio (Requerido por AuthController)
   */
  async updatePasswordAndClearFlag(id: string, passwordHash: string) {
    const schema = config.db?.schema || 'public';
    const query = `UPDATE "${schema}".users SET password = $1, must_change_password = false WHERE id = $2`;
    const result = await pool.query(query, [passwordHash, id]);
    return (result.rowCount ?? 0) > 0;
  },

  /**
   * Elimina un usuario (Requerido por UserController)
   */
  async deleteUser(id: string) {
    const schema = config.db?.schema || 'public';
    const query = `DELETE FROM "${schema}".users WHERE id = $1`;
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async validateRefreshToken(tokenHash: string) {
    const token = await this.findRefreshToken(tokenHash);
    return token ? token.user_id : null;
  },

  /**
   * Guarda un token de recuperación de contraseña.
   */
  async saveResetToken(email: string, token: string, expires: Date) {
    const schema = config.db?.schema || 'public';
    const query = `
      UPDATE "${schema}".users 
      SET reset_password_token = $1, reset_password_expires = $2
      WHERE email = $3
      RETURNING id;
    `;
    const { rows } = await pool.query(query, [token, expires, email]);
    return rows[0] || null;
  },

  /**
   * Cambia la contraseña usando el token de recuperación.
   */
  async resetPasswordByToken(token: string, newPasswordHash: string) {
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

  /**
   * Busca un usuario específicamente por su slug de afiliado.
   */
  async findByAffiliateSlug(slug: string) {
    const schema = config.db?.schema || 'public';
    // Buscamos por slug, pero mantenemos compatibilidad por si pasan el ID directamente
    const query = `
      SELECT id, username, affiliate_slug 
      FROM "${schema}".users 
      WHERE affiliate_slug = $1 OR id::text = $1 
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [slug]);
    return rows[0] || null;
  },
};
