import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

// --- INTERFACES ---

export interface ProductPrice {
  currency: string;
  amount: number;
}

// Interfaz para lecciones
export interface LessonInput {
  title: string;
  description?: string;
  contentType: string;
  contentUrl?: string;
  bodyText?: string;
  durationSeconds?: number;
  isPreview?: boolean;
  orderIndex?: number;
}

// Interfaz para módulos
export interface ModuleInput {
  title: string;
  orderIndex?: number;
  lessons: LessonInput[];
}

export interface Product {
  id: string;
  slug: string;
  creator_id: string;
  title: string;
  description?: string | null;
  type: string;
  content_url?: string | null;
  affiliate_commission_percent: number;
  size_bytes: number;
  has_structured_content: boolean;
  status: string;
  guarantee_days: number | null;
  created_at: Date;
  updated_at: Date;
  prices: ProductPrice[];
}

export interface ProductInput {
  creatorId: string;
  title: string;
  slug: string;
  type: string;
  prices: ProductPrice[];
  description?: string | undefined;
  contentUrl?: string | undefined;
  commissionPercent?: number | undefined;
  status?: string | undefined;
  sizeBytes?: number | undefined;
  guaranteeDays?: number | undefined;
  hasStructuredContent?: boolean;
  modules?: ModuleInput[];
}

// --- REPOSITORIO ---

export const productRepository = {
  mapRowToProduct(row: any): Product {
    return {
      id: row.id,
      slug: row.slug,
      creator_id: row.creator_id,
      title: row.title,
      description: row.description,
      type: row.type,
      content_url: row.content_url || row.contentUrl,
      affiliate_commission_percent: Number(row.affiliate_commission_percent),
      size_bytes: row.size_bytes ? Number(row.size_bytes) : 0,
      has_structured_content: !!row.has_structured_content,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      guarantee_days: row.guarantee_days !== undefined ? row.guarantee_days : null,
      prices: row.prices || [],
    };
  },

  async createProduct(input: ProductInput): Promise<Product> {
    const schema = config.db?.schema || 'public';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Insertar el Producto base
      const productQuery = `
        INSERT INTO "${schema}".products (
          creator_id, title, slug, description, type, content_url, 
          affiliate_commission_percent, size_bytes, status, guarantee_days,
          has_structured_content
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *;
      `;

      const productRes = await client.query(productQuery, [
        input.creatorId,
        input.title,
        input.slug,
        input.description ?? null,
        input.type,
        input.contentUrl ?? null,
        input.commissionPercent ?? 10.0,
        input.sizeBytes ?? 0,
        input.status ?? 'draft',
        input.guaranteeDays ?? null,
        input.hasStructuredContent ?? false,
      ]);

      const productRow = productRes.rows[0];
      const productId = productRow.id;

      // 2. Insertar Precios (Bulk)
      if (input.prices && input.prices.length > 0) {
        const values: any[] = [];
        const valueRows: string[] = [];

        input.prices.forEach((p, index) => {
          const offset = index * 3;
          valueRows.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
          values.push(productId, p.currency, p.amount);
        });

        const priceBulkQuery = `
          INSERT INTO "${schema}".product_prices (product_id, currency, amount)
          VALUES ${valueRows.join(', ')};
        `;
        await client.query(priceBulkQuery, values);
      }

      // 3. Insertar Contenido Estructurado (Módulos y Lecciones)
      if (input.hasStructuredContent && input.modules && input.modules.length > 0) {
        for (const mod of input.modules) {
          // Insertar Módulo
          const modRes = await client.query(
            `
            INSERT INTO "${schema}".product_modules (product_id, title, order_index)
            VALUES ($1, $2, $3) RETURNING id;
          `,
            [productId, mod.title, mod.orderIndex ?? 0]
          );

          const moduleId = modRes.rows[0].id;

          // Insertar Lecciones del Módulo
          for (const lesson of mod.lessons) {
            await client.query(
              `
              INSERT INTO "${schema}".product_lessons (
                module_id, title, description, content_type, content_url, 
                body_text, duration_seconds, is_preview, order_index
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
            `,
              [
                moduleId,
                lesson.title,
                lesson.description ?? null,
                lesson.contentType ?? 'video',
                lesson.contentUrl ?? null,
                lesson.bodyText ?? null,
                lesson.durationSeconds ?? 0,
                lesson.isPreview ?? false,
                lesson.orderIndex ?? 0,
              ]
            );
          }
        }
      }

      await client.query('COMMIT');
      return this.mapRowToProduct({ ...productRow, prices: input.prices });
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, title: input.title }, 'Error creando producto');
      throw error;
    } finally {
      client.release();
    }
  },

  async getPublicProducts(): Promise<Product[]> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT p.*, 
             COALESCE(
               (SELECT json_agg(json_build_object('currency', pp.currency, 'amount', pp.amount))
                FROM "${schema}".product_prices pp WHERE pp.product_id = p.id),
               '[]'::json
             ) as prices
      FROM "${schema}".products p
      WHERE p.status = 'published'
      ORDER BY p.created_at DESC;
    `;
    const { rows } = await pool.query(query);
    return rows.map(row => this.mapRowToProduct(row));
  },

  async getProductStatus(productId: string): Promise<string | null> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT status FROM "${schema}".products WHERE id = $1`;
    const { rows } = await pool.query(query, [productId]);
    return rows[0] ? rows[0].status : null;
  },

  async getProductByIdOrSlug(identifier: string): Promise<Product | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT p.*, 
             COALESCE(
               (SELECT json_agg(json_build_object('currency', pp.currency, 'amount', pp.amount))
                FROM "${schema}".product_prices pp WHERE pp.product_id = p.id),
               '[]'::json
             ) as prices
      FROM "${schema}".products p
      WHERE p.id::text = $1 OR p.slug = $1;
    `;
    const { rows } = await pool.query(query, [identifier]);
    return rows[0] ? this.mapRowToProduct(rows[0]) : null;
  },

  async getProductById(id: string): Promise<Product | null> {
    return this.getProductByIdOrSlug(id);
  },

  async getProductsByCreator(creatorId: string): Promise<Product[]> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT p.*, 
             COALESCE(
               (SELECT json_agg(json_build_object('currency', pp.currency, 'amount', pp.amount))
                FROM "${schema}".product_prices pp WHERE pp.product_id = p.id),
               '[]'::json
             ) as prices
      FROM "${schema}".products p
      WHERE p.creator_id = $1
      ORDER BY p.created_at DESC;
    `;
    const { rows } = await pool.query(query, [creatorId]);
    return rows.map(row => this.mapRowToProduct(row));
  },

  async getPriceByCurrency(productId: string, currency: string): Promise<number | null> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT amount FROM "${schema}".product_prices WHERE product_id = $1 AND currency = $2`;
    const { rows } = await pool.query(query, [productId, currency]);
    return rows[0] ? Number(rows[0].amount) : null;
  },

  async countProductsByCreator(userId: string): Promise<number> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT COUNT(*) FROM "${schema}".products WHERE creator_id = $1`;
    const { rows } = await pool.query(query, [userId]);
    return parseInt(rows[0].count, 10);
  },

  async countPublishedByCreator(userId: string): Promise<number> {
    const schema = config.db?.schema || 'public';
    // Solo contamos los que están en estado 'published'
    const query = `SELECT COUNT(*)::int as count FROM "${schema}".products WHERE creator_id = $1 AND status = 'published'`;
    const { rows } = await pool.query(query, [userId]);
    return rows[0].count;
  },

  async updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
    const schema = config.db?.schema || 'public';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Actualizar datos básicos
      const updateFields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      const fieldMap: Record<string, string> = {
        title: 'title',
        slug: 'slug',
        description: 'description',
        type: 'type',
        contentUrl: 'content_url',
        commissionPercent: 'affiliate_commission_percent',
        sizeBytes: 'size_bytes',
        status: 'status',
        guaranteeDays: 'guarantee_days',
        hasStructuredContent: 'has_structured_content',
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (input[key as keyof ProductInput] !== undefined) {
          updateFields.push(`${dbField} = $${idx}`);
          values.push(input[key as keyof ProductInput]);
          idx++;
        }
      }

      if (updateFields.length > 0) {
        values.push(id);
        const productUpdateQuery = `
          UPDATE "${schema}".products 
          SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
          WHERE id = $${idx} RETURNING *;
        `;
        await client.query(productUpdateQuery, values);
      }

      // 2. Actualizar precios (si se proporcionan)
      if (input.prices) {
        await client.query(`DELETE FROM "${schema}".product_prices WHERE product_id = $1`, [id]);

        for (const p of input.prices) {
          await client.query(
            `INSERT INTO "${schema}".product_prices (product_id, currency, amount) VALUES ($1, $2, $3)`,
            [id, p.currency, p.amount]
          );
        }
      }

      await client.query('COMMIT');

      const updatedProduct = await this.getProductById(id);
      if (!updatedProduct) throw new Error('Error al recuperar el producto actualizado');
      return updatedProduct;
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, productId: id }, 'Error actualizando producto');
      throw error;
    } finally {
      client.release();
    }
  },

  async deleteProduct(id: string): Promise<boolean> {
    const schema = config.db?.schema || 'public';
    // Borramos el producto (los precios se borran solos si hay CASCADE,
    // sino, habría que borrarlos manualmente en una transacción)
    const query = `DELETE FROM "${schema}".products WHERE id = $1`;
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async getAvailableForAffiliate(affiliateId: string): Promise<Product[]> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT p.*, 
             COALESCE(
               (SELECT json_agg(json_build_object('currency', pp.currency, 'amount', pp.amount))
                FROM "${schema}".product_prices pp WHERE pp.product_id = p.id),
               '[]'::json
             ) as prices
      FROM "${schema}".products p
      WHERE p.status = 'published'
      AND p.creator_id != $1
      -- Filtro: El producto debe tener al menos una moneda que el afiliado tenga configurada
      AND EXISTS (
          SELECT 1 FROM "${schema}".product_prices pp
          WHERE pp.product_id = p.id
          AND pp.currency IN (
              SELECT currency FROM "${schema}".user_payout_methods 
              WHERE user_id = $1
          )
      )
      ORDER BY p.created_at DESC;
    `;
    const { rows } = await pool.query(query, [affiliateId]);
    return rows.map(row => this.mapRowToProduct(row));
  },

  async getProductsByIds(ids: string[]): Promise<Product[]> {
    if (!ids || ids.length === 0) return [];

    const schema = config.db?.schema || 'public';
    const query = `
    SELECT p.*, 
           COALESCE(
             (SELECT json_agg(json_build_object('currency', pp.currency, 'amount', pp.amount))
              FROM "${schema}".product_prices pp WHERE pp.product_id = p.id),
             '[]'::json
           ) as prices
    FROM "${schema}".products p
    WHERE p.id = ANY($1)
    ORDER BY p.created_at DESC;
  `;

    try {
      const { rows } = await pool.query(query, [ids]);
      return rows.map(row => this.mapRowToProduct(row));
    } catch (error: any) {
      logger.error({ error: error.message, ids }, 'Error obteniendo productos por lista de IDs');
      throw error;
    }
  },

  /**
   * Obtiene el contenido anidado, procesa URLs de streaming e incluye info de Quizzes
   */
  async getProductWithNestedContent(productId: string, userId: string): Promise<any> {
    const schema = config.db?.schema || 'public';
    const query = `
    SELECT p.*,
    (
      SELECT json_agg(m_data)
      FROM (
        SELECT m.id, m.title, m.order_index,
        (
          SELECT json_agg(l_data)
          FROM (
            SELECT l.id, l.title, l.description, l.content_type, l.content_url, 
                   l.body_text, l.duration_seconds, l.order_index, l.is_preview,
                   EXISTS (
                     SELECT 1 FROM "${schema}".user_lessons_progress ulp 
                     WHERE ulp.lesson_id = l.id AND ulp.user_id = $2
                   ) as is_completed,
                   -- SUBCONSULTA PARA QUIZZES
                   (
                     SELECT json_build_object(
                       'quiz_id', q.id,
                       'passing_score', q.passing_score,
                       'max_attempts', q.max_attempts,
                       'has_passed', COALESCE(
                         (SELECT passed FROM "${schema}".user_quiz_attempts 
                          WHERE quiz_id = q.id AND user_id = $2 
                          ORDER BY score DESC LIMIT 1), false),
                       -- Enviamos las preguntas pero filtramos la respuesta correcta por seguridad
                       'questions', (
                          SELECT jsonb_agg(elem - 'correct')
                          FROM jsonb_array_elements(q.questions) AS elem
                       )
                     )
                     FROM "${schema}".product_lesson_quizzes q 
                     WHERE q.lesson_id = l.id
                   ) as quiz_info
            FROM "${schema}".product_lessons l
            WHERE l.module_id = m.id
            ORDER BY l.order_index ASC
          ) l_data
        ) as lessons
        FROM "${schema}".product_modules m
        WHERE m.product_id = p.id
        ORDER BY m.order_index ASC
      ) m_data
    ) as modules
    FROM "${schema}".products p
    WHERE p.id = $1;
  `;

    const { rows } = await pool.query(query, [productId, userId]);
    const product = rows[0];

    if (!product || !product.modules) {
      return product;
    }

    // --- PROCESAMIENTO DE STREAMING SEGURO ---
    try {
      const { streamingUtil } = await import('../utils/streaming.util');

      await Promise.all(
        product.modules.map(async (mod: any) => {
          if (mod.lessons) {
            await Promise.all(
              mod.lessons.map(async (lesson: any) => {
                if (lesson.content_type === 'video' && lesson.content_url) {
                  lesson.content_url = await streamingUtil.getSignedUrl(
                    lesson.content_url,
                    'video'
                  );
                }
              })
            );
          }
        })
      );
    } catch {
      logger.error('Error al procesar URLs firmadas de streaming en el repositorio');
    }

    return product;
  },

  async toggleLessonProgress(
    userId: string,
    productId: string,
    lessonId: string,
    completed: boolean
  ): Promise<void> {
    const schema = config.db?.schema || 'public';

    if (completed) {
      // Validamos que la lección pertenezca al producto a través del módulo
      const query = `
        INSERT INTO "${schema}".user_lessons_progress (user_id, product_id, lesson_id)
        SELECT $1, $2, $3
        WHERE EXISTS (
          SELECT 1 FROM "${schema}".product_lessons l
          JOIN "${schema}".product_modules m ON l.module_id = m.id
          WHERE l.id = $3 AND m.product_id = $2
        )
        ON CONFLICT (user_id, lesson_id) DO NOTHING;
      `;
      await pool.query(query, [userId, productId, lessonId]);
    } else {
      await pool.query(
        `DELETE FROM "${schema}".user_lessons_progress 
         WHERE user_id = $1 AND lesson_id = $2;`,
        [userId, lessonId]
      );
    }
  },

  /**
   * Obtiene el progreso real del usuario en un producto
   * Vital para la lógica de Safe-Guard (Garantía)
   */
  async getUserProductProgress(
    productId: string,
    userId: string
  ): Promise<{
    total_lessons: number;
    completed_lessons: number;
    percent: number;
  }> {
    const schema = config.db?.schema || 'public';

    const query = `
      SELECT 
        COUNT(l.id)::int as total_lessons,
        COUNT(ulp.lesson_id)::int as completed_lessons
      FROM "${schema}".product_lessons l
      JOIN "${schema}".product_modules m ON l.module_id = m.id
      LEFT JOIN "${schema}".user_lessons_progress ulp ON l.id = ulp.lesson_id AND ulp.user_id = $2
      WHERE m.product_id = $1;
    `;

    const { rows } = await pool.query(query, [productId, userId]);
    const total = rows[0].total_lessons || 0;
    const completed = rows[0].completed_lessons || 0;

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total_lessons: total,
      completed_lessons: completed,
      percent,
    };
  },

  /**
   * Lista productos comprados.
   */
  async getMyPurchasedProductsWithProgress(userId: string): Promise<any[]> {
    const schema = config.db?.schema || 'public';

    const query = `
      SELECT 
        p.id, p.title, p.slug, p.type,
        COUNT(l.id)::int as total_lessons,
        COUNT(ulp.lesson_id)::int as completed_lessons,
        CASE 
          WHEN COUNT(l.id) > 0 THEN ROUND((COUNT(ulp.lesson_id)::float / COUNT(l.id)::float) * 100)
          ELSE 0 
        END as progress_percent,
        o.is_guarantee_eligible,
        o.created_at as purchase_date
      FROM "${schema}".orders o
      JOIN "${schema}".products p ON o.product_id = p.id
      LEFT JOIN "${schema}".product_modules m ON p.id = m.product_id
      LEFT JOIN "${schema}".product_lessons l ON m.id = l.module_id
      LEFT JOIN "${schema}".user_lessons_progress ulp ON l.id = ulp.lesson_id AND ulp.user_id = $1
      WHERE o.buyer_id = $1 AND o.status = 'paid'
      GROUP BY p.id, p.title, p.slug, p.type, o.is_guarantee_eligible, o.created_at
      ORDER BY o.created_at DESC;
    `;

    const { rows } = await pool.query(query, [userId]);
    return rows;
  },

  // --- MÉTODOS DE QUIZZES / EXÁMENES ---

  /**
   * Obtiene el Quiz configurado para una lección
   */
  async getLessonQuiz(lessonId: string): Promise<any | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT * FROM "${schema}".product_lesson_quizzes 
      WHERE lesson_id = $1;
    `;
    const { rows } = await pool.query(query, [lessonId]);
    return rows[0] || null;
  },

  /**
   * Obtiene el estado de intentos de un usuario para un quiz
   */
  async getUserQuizStatus(
    userId: string,
    quizId: string
  ): Promise<{
    best_score: number;
    attempts_count: number;
    has_passed: boolean;
  }> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        COALESCE(MAX(score), 0) as best_score,
        COUNT(*)::int as attempts_count,
        COALESCE(bool_or(passed), false) as has_passed
      FROM "${schema}".user_quiz_attempts
      WHERE user_id = $1 AND quiz_id = $2;
    `;
    const { rows } = await pool.query(query, [userId, quizId]);
    return rows[0];
  },

  /**
   * Guarda un intento de examen realizado por el alumno
   */
  async saveQuizAttempt(data: {
    userId: string;
    quizId: string;
    score: number;
    passed: boolean;
    answers: any;
  }): Promise<void> {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".user_quiz_attempts (user_id, quiz_id, score, passed, answers)
      VALUES ($1, $2, $3, $4, $5);
    `;
    await pool.query(query, [
      data.userId,
      data.quizId,
      data.score,
      data.passed,
      JSON.stringify(data.answers),
    ]);
  },

  /**
   * Genera un certificado si el usuario completó el 100%
   */
  async issueCertificate(userId: string, productId: string): Promise<any> {
    const schema = config.db?.schema || 'public';

    // 1. Verificar si ya existe para evitar duplicados
    const existing = await pool.query(
      `SELECT * FROM "${schema}".user_certificates WHERE user_id = $1 AND product_id = $2`,
      [userId, productId]
    );
    if (existing.rows[0]) return existing.rows[0];

    // 2. Insertar nuevo certificado con un código único (UUID)
    const query = `
      INSERT INTO "${schema}".user_certificates (user_id, product_id, certificate_code)
      VALUES ($1, $2, gen_random_uuid())
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [userId, productId]);
    return rows[0];
  },

  /**
   * Obtiene un certificado por su código único (Para la página pública de verificación)
   */
  async getCertificateByCode(code: string): Promise<any> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        uc.*, 
        u.fullname as student_name, -- Ajustado de full_name a fullname
        p.title as course_name, 
        p.updated_at as completion_date
      FROM "${schema}".user_certificates uc
      JOIN "${schema}".users u ON uc.user_id = u.id
      JOIN "${schema}".products p ON uc.product_id = p.id
      WHERE uc.certificate_code = $1;
    `;
    const { rows } = await pool.query(query, [code]);
    return rows[0] || null;
  },

  async countActiveByCreatorAndCurrency(creatorId: string, currency: string): Promise<number> {
    const schema = config.db?.schema || 'public';

    // Contamos productos que:
    // 1. Sean del creador
    // 2. Estén en estado 'published'
    // 3. Tengan al menos un precio en la moneda que se quiere borrar/cambiar
    const query = `
    SELECT COUNT(DISTINCT p.id) as count
    FROM "${schema}".products p
    JOIN "${schema}".product_prices pp ON p.id = pp.product_id
    WHERE p.creator_id = $1 
      AND p.status = 'published'
      AND pp.currency = $2
  `;

    const { rows } = await pool.query(query, [creatorId, currency]);
    return parseInt(rows[0].count, 10);
  },

  async getLessonWithAccess(lessonId: string, userId: string): Promise<any | null> {
    const schema = config.db?.schema || 'public';
    const query = `
    SELECT l.*, p.id as product_id, p.creator_id
    FROM "${schema}".product_lessons l
    JOIN "${schema}".product_modules m ON l.module_id = m.id
    JOIN "${schema}".products p ON m.product_id = p.id
    LEFT JOIN "${schema}".orders o ON o.product_id = p.id AND o.buyer_id = $2 AND o.status = 'paid'
    WHERE l.id = $1 
    AND (o.id IS NOT NULL OR p.creator_id = $2); -- Acceso si compró o si es el dueño
  `;

    const { rows } = await pool.query(query, [lessonId, userId]);
    return rows[0] || null;
  },
};
