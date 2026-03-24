/**
 * AI Agents Service
 * Phase 5: AI Agents (Basic)
 * Handles Q&A agent for products
 */

import pool from '../../db/postgres';
import { config } from '../../config/index';
import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';

import { aiCreditService } from './credits.service';
import { llmService } from './llm.service';

const schema = config.db?.schema || 'public';

// Default system prompt for QA Agent
const DEFAULT_QA_SYSTEM_PROMPT = `Eres un asistente de IA especializado en ayudar a usuarios con preguntas sobre productos digitales.
Tu rol es responder preguntas de manera clara, útil y amigable basándote únicamente en la información del contexto proporcionado.

INSTRUCCIONES:
1. Responde ONLY usando la información del contexto proporcionado
2. Si no tienes información suficiente, indica que no puedes responder esa pregunta específica
3. Usa un tono profesional pero amigable
4. Sé conciso pero completo en tus respuestas
5. Si la pregunta está fuera del alcance del producto, redirige al usuario
`;

// Default system prompt for Tutor AI
const DEFAULT_TUTOR_SYSTEM_PROMPT = `Eres un tutor personal de un curso online. Tu rol es ayudar al estudiante a entender el contenido del curso, resolver dudas, y guiarlo a través del aprendizaje.

INSTRUCCIONES:
1. Responde usando ONLY el contenido de las lecciones del curso proporcionado en el contexto
2. Si el estudiante tiene dudas técnicas específicas del contenido, ayúdalo a resolverlas
3. Usa un tono paciente, amigable y motivador
4. Si no sabes la respuesta, sé honesto y sugiere que contacte al creador del curso
5. Puedes dar ejemplos del contenido para ilustrar conceptos
6. Ayudas al estudiante a.progress en su aprendizaje

LIMITACIONES:
- No inventes información que no esté en las lecciones
- No des consejos fuera del alcance del curso
- No reemplaces la interacción humana si el estudiante necesita ayuda personalizada

Contexto de las lecciones del curso:
{lesson_context}`;

// Types
interface QAAgentConfig {
  id: string;
  product_id: string;
  is_enabled: boolean;
  model: string;
  system_prompt: string | null;
  temperature: number;
  max_tokens: number;
  use_memory: boolean;
  use_faqs: boolean;
  created_at: Date;
  updated_at: Date;
}

interface AgentConversation {
  id: string;
  agent_type: string;
  product_id: string | null;
  user_id: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface AgentMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens_used: number;
  created_at: Date;
}

export const qaAgentService = {
  /**
   * Get QA agent config for a product
   */
  async getConfig(productId: string): Promise<QAAgentConfig | null> {
    const query = `
      SELECT id, product_id, is_enabled, model, system_prompt, temperature, max_tokens, use_memory, use_faqs, created_at, updated_at
      FROM "${schema}".product_qa_agent_config
      WHERE product_id = $1
    `;
    const { rows } = await pool.query<QAAgentConfig>(query, [productId]);
    return rows[0] || null;
  },

  /**
   * Update QA agent config for a product
   */
  async updateConfig(
    productId: string,
    data: {
      isEnabled?: boolean;
      model?: string;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      useMemory?: boolean;
      useFaqs?: boolean;
    }
  ): Promise<QAAgentConfig> {
    const updates: string[] = [];
    const params: unknown[] = [productId];
    let paramIndex = 2;

    if (data.isEnabled !== undefined) {
      updates.push(`is_enabled = $${paramIndex++}`);
      params.push(data.isEnabled);
    }
    if (data.model) {
      updates.push(`model = $${paramIndex++}`);
      params.push(data.model);
    }
    if (data.systemPrompt !== undefined) {
      updates.push(`system_prompt = $${paramIndex++}`);
      params.push(data.systemPrompt);
    }
    if (data.temperature !== undefined) {
      updates.push(`temperature = $${paramIndex++}`);
      params.push(data.temperature);
    }
    if (data.maxTokens !== undefined) {
      updates.push(`max_tokens = $${paramIndex++}`);
      params.push(data.maxTokens);
    }
    if (data.useMemory !== undefined) {
      updates.push(`use_memory = $${paramIndex++}`);
      params.push(data.useMemory);
    }
    if (data.useFaqs !== undefined) {
      updates.push(`use_faqs = $${paramIndex++}`);
      params.push(data.useFaqs);
    }

    if (updates.length === 0) {
      const existing = await this.getConfig(productId);
      if (existing) return existing;
      throw new AppError('No config to create', 400);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const query = `
      INSERT INTO "${schema}".product_qa_agent_config (product_id, ${updates.join(', ')})
      VALUES ($1, ${updates.map((_, i) => `$${i + 2}`).join(', ')})
      ON CONFLICT (product_id) DO UPDATE SET
        ${updates.join(', ')}
      RETURNING id, product_id, is_enabled, model, system_prompt, temperature, max_tokens, use_memory, use_faqs, created_at, updated_at
    `;

    const { rows } = await pool.query<QAAgentConfig>(query, params);
    logger.info({ productId }, 'QA agent config updated');
    return rows[0];
  },

  /**
   * Create a new conversation
   */
  async createConversation(
    agentType: string,
    productId: string | null,
    userId: string,
    metadata: Record<string, unknown> = {}
  ): Promise<AgentConversation> {
    const query = `
      INSERT INTO "${schema}".agent_conversations (agent_type, product_id, user_id, metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING id, agent_type, product_id, user_id, status, metadata, created_at, updated_at
    `;
    const { rows } = await pool.query<AgentConversation>(query, [
      agentType,
      productId,
      userId,
      JSON.stringify(metadata),
    ]);
    return rows[0];
  },

  /**
   * Add a message to a conversation
   */
  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    tokensUsed: number = 0
  ): Promise<AgentMessage> {
    const query = `
      INSERT INTO "${schema}".agent_messages (conversation_id, role, content, tokens_used)
      VALUES ($1, $2, $3, $4)
      RETURNING id, conversation_id, role, content, tokens_used, created_at
    `;
    const { rows } = await pool.query<AgentMessage>(query, [conversationId, role, content, tokensUsed]);
    return rows[0];
  },

  /**
   * Get conversation with messages
   */
  async getConversation(conversationId: string): Promise<{ conversation: AgentConversation; messages: AgentMessage[] } | null> {
    const convQuery = `
      SELECT id, agent_type, product_id, user_id, status, metadata, created_at, updated_at
      FROM "${schema}".agent_conversations
      WHERE id = $1
    `;
    const { rows: convRows } = await pool.query<AgentConversation>(convQuery, [conversationId]);
    if (convRows.length === 0) return null;

    const msgQuery = `
      SELECT id, conversation_id, role, content, tokens_used, created_at
      FROM "${schema}".agent_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `;
    const { rows: msgRows } = await pool.query<AgentMessage>(msgQuery, [conversationId]);

    return {
      conversation: convRows[0],
      messages: msgRows,
    };
  },

  /**
   * Get user's conversations
   */
  async getUserConversations(userId: string, agentType?: string, limit: number = 20): Promise<AgentConversation[]> {
    let query = `
      SELECT id, agent_type, product_id, user_id, status, metadata, created_at, updated_at
      FROM "${schema}".agent_conversations
      WHERE user_id = $1
    `;
    const params: unknown[] = [userId];

    if (agentType) {
      query += ` AND agent_type = $2`;
      params.push(agentType);
    }

    query += ` ORDER BY updated_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query<AgentConversation>(query, params);
    return rows;
  },

  /**
   * Chat with QA agent - generates response using memory and FAQs
   */
  async chat(productId: string, userId: string, message: string): Promise<{ response: string; conversationId: string }> {
    // Get config
    const config = await this.getConfig(productId);
    if (!config || !config.is_enabled) {
      throw new AppError('QA agent no está habilitado para este producto', 400);
    }

    // Check credits
    const cost = aiCreditService.getOperationCost('search');
    const credits = await aiCreditService.getBalance(userId);
    if (!credits || credits.balance < cost) {
      throw new AppError('Créditos insuficientes', 402);
    }

    // Use credits
    await aiCreditService.useCredits(userId, cost, `QA Agent chat`);

    // Get or create conversation
    let conversationId: string;
    const conversations = await this.getUserConversations(userId, 'qa', 1);
    const activeConv = conversations.find(c => c.status === 'active' && c.product_id === productId);
    
    if (activeConv) {
      conversationId = activeConv.id;
    } else {
      const conv = await this.createConversation('qa', productId, userId, { productId });
      conversationId = conv.id;
    }

    // Save user message
    await this.addMessage(conversationId, 'user', message);

    // Retrieve context from memory if enabled
    let context = '';
    if (config.use_memory) {
      const embeddings = await pool.query(
        `SELECT content FROM "${schema}".ai_embeddings 
         WHERE product_id = $1 AND source_type IN ('lesson', 'faq')
         ORDER BY created_at DESC LIMIT 5`,
        [productId]
      );
      context += 'Información del producto:\n' + embeddings.rows.map(r => r.content).join('\n\n');
    }

    // Get FAQs if enabled
    if (config.use_faqs) {
      const faqs = await pool.query(
        `SELECT question, answer FROM "${schema}".product_faqs 
         WHERE product_id = $1 AND is_active = true
         ORDER BY sort_order LIMIT 10`,
        [productId]
      );
      context += '\n\nFAQs:\n' + faqs.rows.map(f => `P: ${f.question}\nR: ${f.answer}`).join('\n\n');
    }

    // Build system prompt
    const systemPrompt = config.system_prompt || DEFAULT_QA_SYSTEM_PROMPT;

    // Build messages for LLM
    const messages = llmService.buildPrompt(systemPrompt, context, message);

    // Call LLM
    let llmResponse;
    try {
      llmResponse = await llmService.chat({
        messages,
        temperature: config.temperature,
        maxTokens: config.max_tokens,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'LLM call failed, falling back to placeholder');
      llmResponse = {
        content: `Gracias por tu pregunta: "${message}". 

抱歉, hubo un problema al generar la respuesta. Pero acá está la información del contexto que recuperamos:

${context.substring(0, 500)}...`,
        model: llmService.getProvider(),
      };
    }

    const response = llmResponse.content;

    // Save assistant message
    await this.addMessage(conversationId, 'assistant', response, message.length / 4);

    logger.info({ productId, userId, conversationId }, 'QA agent response generated');
    return { response, conversationId };
  },
};

/**
 * Analytics Service
 * Phase 6: Analytics Dashboard
 * Handles creator metrics and dashboard data
 */

export const analyticsService = {
  /**
   * Get dashboard metrics for a creator
   */
  async getDashboardMetrics(
    creatorId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalSales: number;
    totalRevenue: number;
    totalCommissions: number;
    newCustomers: number;
    activeCustomers: number;
    productViews: number;
    conversionRate: number;
    aiCreditsUsed: number;
    dailyBreakdown: { date: string; sales: number; revenue: number }[];
  }> {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default 30 days
    const end = endDate || new Date();

    const query = `
      SELECT 
        COALESCE(SUM(total_sales), 0) as total_sales,
        COALESCE(SUM(total_revenue), 0) as total_revenue,
        COALESCE(SUM(total_commissions), 0) as total_commissions,
        COALESCE(SUM(new_customers), 0) as new_customers,
        COALESCE(SUM(active_customers), 0) as active_customers,
        COALESCE(SUM(product_views), 0) as product_views,
        COALESCE(AVG(conversion_rate), 0) as conversion_rate,
        COALESCE(SUM(ai_credits_used), 0) as ai_credits_used
      FROM "${schema}".creator_daily_metrics
      WHERE creator_id = $1 AND date >= $2 AND date <= $3
    `;
    const { rows } = await pool.query<{
      total_sales: number;
      total_revenue: number;
      total_commissions: number;
      new_customers: number;
      active_customers: number;
      product_views: number;
      conversion_rate: number;
      ai_credits_used: number;
    }>(query, [creatorId, start.toISOString().split('T')[0], end.toISOString().split('T')[0]]);

    const dailyQuery = `
      SELECT date, total_sales, total_revenue
      FROM "${schema}".creator_daily_metrics
      WHERE creator_id = $1 AND date >= $2 AND date <= $3
      ORDER BY date ASC
    `;
    const { rows: dailyRows } = await pool.query<{ date: string; total_sales: number; total_revenue: number }>(
      dailyQuery,
      [creatorId, start.toISOString().split('T')[0], end.toISOString().split('T')[0]]
    );

    return {
      totalSales: Number(rows[0]?.total_sales || 0),
      totalRevenue: Number(rows[0]?.total_revenue || 0),
      totalCommissions: Number(rows[0]?.total_commissions || 0),
      newCustomers: Number(rows[0]?.new_customers || 0),
      activeCustomers: Number(rows[0]?.active_customers || 0),
      productViews: Number(rows[0]?.product_views || 0),
      conversionRate: Number(rows[0]?.conversion_rate || 0),
      aiCreditsUsed: Number(rows[0]?.ai_credits_used || 0),
      dailyBreakdown: dailyRows.map(r => ({
        date: r.date,
        sales: Number(r.total_sales),
        revenue: Number(r.total_revenue),
      })),
    };
  },
};

/**
 * Tutor Service
 * Phase 7: Advanced AI (Tutor)
 * Handles AI tutor for products
 */

export const tutorService = {
  /**
   * Get tutor config for a product
   */
  async getConfig(productId: string): Promise<{
    id: string;
    productId: string;
    isEnabled: boolean;
    model: string;
    systemPrompt: string | null;
    temperature: number;
    maxTokens: number;
  } | null> {
    const query = `
      SELECT id, product_id, is_enabled, model, system_prompt, temperature, max_tokens
      FROM "${schema}".product_tutor_config
      WHERE product_id = $1
    `;
    const { rows } = await pool.query<{
      id: string;
      product_id: string;
      is_enabled: boolean;
      model: string;
      system_prompt: string | null;
      temperature: number;
      max_tokens: number;
    }>(query, [productId]);

    if (rows.length === 0) return null;

    const r = rows[0];
    return {
      id: r.id,
      productId: r.product_id,
      isEnabled: r.is_enabled,
      model: r.model,
      systemPrompt: r.system_prompt,
      temperature: r.temperature,
      maxTokens: r.max_tokens,
    };
  },

  /**
   * Update tutor config
   */
  async updateConfig(productId: string, data: {
    isEnabled?: boolean;
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<void> {
    const updates: string[] = [];
    const params: unknown[] = [productId];
    let paramIndex = 2;

    if (data.isEnabled !== undefined) {
      updates.push(`is_enabled = $${paramIndex++}`);
      params.push(data.isEnabled);
    }
    if (data.model) {
      updates.push(`model = $${paramIndex++}`);
      params.push(data.model);
    }
    if (data.systemPrompt !== undefined) {
      updates.push(`system_prompt = $${paramIndex++}`);
      params.push(data.systemPrompt);
    }
    if (data.temperature !== undefined) {
      updates.push(`temperature = $${paramIndex++}`);
      params.push(data.temperature);
    }
    if (data.maxTokens !== undefined) {
      updates.push(`max_tokens = $${paramIndex++}`);
      params.push(data.maxTokens);
    }

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const query = `
      INSERT INTO "${schema}".product_tutor_config (product_id, ${updates.join(', ')})
      VALUES ($1, ${updates.map((_, i) => `$${i + 2}`).join(', ')})
      ON CONFLICT (product_id) DO UPDATE SET ${updates.join(', ')}
    `;

    await pool.query(query, params);
    logger.info({ productId }, 'Tutor config updated');
  },

  /**
   * Get insights for a user/product
   */
  async getInsights(userId: string, productId: string): Promise<{
    insights: { id: string; type: string; content: string; isRead: boolean; createdAt: Date }[];
  }> {
    const query = `
      SELECT id, insight_type, content, is_read, created_at
      FROM "${schema}".tutor_insights
      WHERE user_id = $1 AND product_id = $2
      ORDER BY created_at DESC
      LIMIT 20
    `;
    const { rows } = await pool.query<{
      id: string;
      insight_type: string;
      content: string;
      is_read: boolean;
      created_at: Date;
    }>(query, [userId, productId]);

    return {
      insights: rows.map(r => ({
        id: r.id,
        type: r.insight_type,
        content: r.content,
        isRead: r.is_read,
        createdAt: r.created_at,
      })),
    };
  },

  /**
   * Chat with Tutor AI - generates response using lesson content
   */
  async chat(productId: string, userId: string, message: string): Promise<{ response: string; conversationId: string }> {
    // Get config
    const config = await this.getConfig(productId);
    if (!config || !config.isEnabled) {
      throw new AppError('Tutor no está habilitado para este producto', 400);
    }

    // Check credits
    const cost = aiCreditService.getOperationCost('search');
    const credits = await aiCreditService.getBalance(userId);
    if (!credits || credits.balance < cost) {
      throw new AppError('Créditos insuficientes', 402);
    }

    // Use credits
    await aiCreditService.useCredits(userId, cost, `Tutor chat`);

    // Get lesson content for context
    const lessonsQuery = `
      SELECT l.title, l.content, m.title as module_title
      FROM "${schema}".lessons l
      JOIN "${schema}".modules m ON l.module_id = m.id
      WHERE m.product_id = $1 AND l.is_free = true OR m.product_id = $1
      ORDER BY m.sort_order, l.sort_order
      LIMIT 20
    `;
    const { rows: lessons } = await pool.query<{ title: string; content: string; module_title: string }>(
      lessonsQuery,
      [productId]
    );

    // Build context from lessons
    const lessonContext = lessons
      .map(l => `Módulo: ${l.module_title}\nLección: ${l.title}\nContenido: ${l.content.substring(0, 1000)}`)
      .join('\n\n---\n\n');

    // Build system prompt
    const systemPrompt = (config.systemPrompt || DEFAULT_TUTOR_SYSTEM_PROMPT).replace(
      '{lesson_context}',
      lessonContext || 'No hay contenido de lecciones disponible.'
    );

    // Build messages for LLM
    const messages = llmService.buildPrompt(systemPrompt, '', message);

    // Call LLM
    let llmResponse;
    try {
      llmResponse = await llmService.chat({
        messages,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'LLM call failed for Tutor');
      llmResponse = {
        content: `Gracias por tu pregunta: "${message}". 

抱歉, houve un problema al generar la respuesta. Pero aquí está información de las lecciones que recuperamos:

${lessonContext.substring(0, 500)}...`,
        model: llmService.getProvider(),
      };
    }

    const response = llmResponse.content;

    logger.info({ productId, userId }, 'Tutor response generated');
    return { response, conversationId: productId };
  },
};

/**
 * Insights Service
 * Phase 7: Advanced AI (Insights)
 * Handles AI-powered data insights
 */

export const insightsService = {
  /**
   * Get user dashboards
   */
  async getDashboards(userId: string): Promise<{
    dashboards: { id: string; name: string; description: string | null; isDefault: boolean }[];
  }> {
    const query = `
      SELECT id, name, description, is_default
      FROM "${schema}".creator_dashboards
      WHERE creator_id = $1
      ORDER BY is_default DESC, name ASC
    `;
    const { rows } = await pool.query<{
      id: string;
      name: string;
      description: string | null;
      is_default: boolean;
    }>(query, [userId]);

    return {
      dashboards: rows.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isDefault: r.is_default,
      })),
    };
  },

  /**
   * Create a dashboard
   */
  async createDashboard(userId: string, name: string, description?: string): Promise<{ id: string }> {
    const query = `
      INSERT INTO "${schema}".creator_dashboards (creator_id, name, description)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    const { rows } = await pool.query<{ id: string }>(query, [userId, name, description || null]);
    return rows[0];
  },

  /**
   * Update a dashboard
   */
  async updateDashboard(dashboardId: string, data: { name?: string; description?: string; config?: Record<string, unknown> }): Promise<void> {
    const updates: string[] = [];
    const params: unknown[] = [dashboardId];
    let paramIndex = 2;

    if (data.name) {
      updates.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }
    if (data.config) {
      updates.push(`config = $${paramIndex++}`);
      params.push(JSON.stringify(data.config));
    }

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const query = `UPDATE "${schema}".creator_dashboards SET ${updates.join(', ')} WHERE id = $1`;
    await pool.query(query, params);
  },

  /**
   * Delete a dashboard
   */
  async deleteDashboard(dashboardId: string): Promise<boolean> {
    const query = `DELETE FROM "${schema}".creator_dashboards WHERE id = $1`;
    const result = await pool.query(query, [dashboardId]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Query data with AI (placeholder - requires LLM integration)
   */
  async query(userId: string, naturalLanguageQuery: string): Promise<{
    sql: string | null;
    results: unknown;
  }> {
    // TODO: Use LLM to convert natural language to SQL
    // For now, return placeholder
    
    logger.info({ userId, query: naturalLanguageQuery }, 'Insights query requested');

    // Save to history
    await pool.query(
      `INSERT INTO "${schema}".insights_history (user_id, query, sql_generated, results) VALUES ($1, $2, $3, $4)`,
      [userId, naturalLanguageQuery, null, JSON.stringify({ message: 'Placeholder - requires LLM integration' })]
    );

    return {
      sql: null,
      results: {
        message: 'Esta funcionalidad requiere integración con LLM para convertir lenguaje natural a SQL.',
        query: naturalLanguageQuery,
      },
    };
  },
};