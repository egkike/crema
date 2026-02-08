import crypto from 'crypto';

import bcrypt from 'bcrypt';

import pool from '../db/postgres';
import { config } from '../config/index';

const schema = config.db.schema;

export const userRepository = {
  /**
   * Busca un usuario por username o email para el proceso de Login.
   */
  async findByCredentials(identifier: string) {
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
    const query = `SELECT id, username, email, fullname, level, active, must_change_password, createdate 
                   FROM "${schema}".users WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
  },

  // --- MÉTODOS DE REFRESH TOKEN (Ajustados a tu tabla SQL) ---

  /**
   * Guarda el hash del token de refresco.
   * Limpia tokens anteriores para mantener un solo dispositivo/sesión activa por simplicidad.
   */
  async saveRefreshToken(userId: string, tokenHash: string, expiresAt: Date) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Eliminamos tokens previos del usuario
      await client.query(`DELETE FROM "${schema}".refresh_tokens WHERE user_id = $1`, [userId]);

      // Insertamos el nuevo hash según tu esquema (token_hash)
      const query = `
        INSERT INTO "${schema}".refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
      `;
      await client.query(query, [userId, tokenHash, expiresAt]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Busca un token de refresco válido.
   */
  async getRefreshToken(tokenHash: string) {
    const query = `
      SELECT * FROM "${schema}".refresh_tokens 
      WHERE token_hash = $1 AND revoked = FALSE AND expires_at > CURRENT_TIMESTAMP
    `;
    const { rows } = await pool.query(query, [tokenHash]);
    return rows[0] || null;
  },

  /**
   * Elimina el token (útil para Logout).
   */
  async deleteRefreshToken(userId: string) {
    const query = `DELETE FROM "${schema}".refresh_tokens WHERE user_id = $1`;
    await pool.query(query, [userId]);
  },

  // --- MÉTODOS DE GESTIÓN DE USUARIO ---

  /**
   * Crea un nuevo usuario con cifrado Pepper + Bcrypt.
   */
  async createUser(input: any) {
    const { username, password, email, fullname, level = 1 } = input;
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    const passwordWithPepper = password + config.passwordPepper;
    const hash = await bcrypt.hash(passwordWithPepper, 12);

    const query = `
      INSERT INTO "${schema}".users 
        (username, password, email, fullname, level, active, verification_token, verification_token_expires)
      VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
      RETURNING id, username, email, fullname, level, active, createdate
    `;

    const { rows } = await pool.query(query, [
      username,
      hash,
      email,
      fullname,
      level,
      verificationToken,
      expires,
    ]);
    return { ...rows[0], verificationToken };
  },

  /**
   * Actualiza datos del usuario de forma dinámica.
   */
  async updUser({ id, input }: { id: string; input: any }) {
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
};
