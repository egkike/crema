/**
 * Embedding Sync Hooks
 * Sincronización automática de embeddings cuando se crea/actualiza contenido
 * 
 * IMPORTANTE: Estos hooks deben ser llamados desde los servicios correspondientes cuando:
 * - Se crea/actualiza/elimina una lección
 * - Se crea/actualiza/elimina una FAQ
 * - Se crea/actualiza/elimina una pregunta Q&A
 * - Se crea/actualiza/elimina una política de contenido
 * 
 * Uso en servicios:
 * import { onLessonChange, onFaqChange, onQuestionCreated, onPolicyChange, onReviewCreated } from '../hooks/sync-embeddings';
 * 
 * // En tu servicio, después de guardar en DB:
 * await onLessonChange({ id: lesson.id, title: lesson.title, ... }, 'create');
 */

import { memoryService } from '../services/ai/memory.service';
import logger from '../utils/logger';
import type { EmbeddingSourceType } from '../types/ai.types';

/**
 * Hook para lecciones
 * Llamar cuando se crea o actualiza una lección
 */
export async function onLessonChange(
  lesson: {
    id: string;
    title: string;
    content?: string;
    description?: string;
    productId?: string;
    creatorId?: string;
    moduleTitle?: string;
    orderIndex?: number;
  },
  action: 'create' | 'update' | 'delete'
): Promise<void> {
  try {
    if (action === 'delete') {
      await memoryService.deleteEmbedding('lesson', lesson.id);
      logger.info({ lessonId: lesson.id }, 'Embedding deleted for lesson');
      return;
    }

    // Formatear contenido para embedding
    const content = formatLessonContent(lesson);
    
    // Verificar si necesita re-embebido
    const needsReembed = await memoryService.needsReembed('lesson', lesson.id, content);
    
    if (!needsReembed) {
      logger.debug({ lessonId: lesson.id }, 'Lesson content unchanged, skipping embedding');
      return;
    }

    // Build metadata
    const metadata: Record<string, unknown> = {};
    if (lesson.moduleTitle) metadata.moduleTitle = lesson.moduleTitle;
    if (lesson.orderIndex !== undefined) metadata.orderIndex = lesson.orderIndex;

    // Call embed with explicit handling of optional values
    const embedParams: {
      type: EmbeddingSourceType;
      id: string;
      content: string;
      title: string;
      metadata?: Record<string, unknown>;
      productId?: string;
      creatorId?: string;
    } = {
      type: 'lesson',
      id: lesson.id,
      content,
      title: lesson.title,
    };
    
    if (lesson.productId) embedParams.productId = lesson.productId;
    if (lesson.creatorId) embedParams.creatorId = lesson.creatorId;
    if (Object.keys(metadata).length > 0) embedParams.metadata = metadata;

    await memoryService.embed(embedParams);
    logger.info({ lessonId: lesson.id, action }, 'Embedding created/updated for lesson');
  } catch (error: any) {
    logger.error({ lessonId: lesson.id, error: error.message }, 'Failed to sync lesson embedding');
  }
}

/**
 * Hook para FAQs
 * Llamar cuando se crea o actualiza una FAQ
 */
export async function onFaqChange(
  faq: {
    id: string;
    question: string;
    answer: string;
    productId?: string;
    creatorId?: string;
    orderIndex?: number;
  },
  action: 'create' | 'update' | 'delete'
): Promise<void> {
  try {
    if (action === 'delete') {
      await memoryService.deleteEmbedding('faq', faq.id);
      logger.info({ faqId: faq.id }, 'Embedding deleted for FAQ');
      return;
    }

    const content = `Pregunta: ${faq.question}\nRespuesta: ${faq.answer}`;
    const needsReembed = await memoryService.needsReembed('faq', faq.id, content);
    
    if (!needsReembed) {
      logger.debug({ faqId: faq.id }, 'FAQ content unchanged, skipping embedding');
      return;
    }

    const embedParams: {
      type: EmbeddingSourceType;
      id: string;
      content: string;
      title: string;
      metadata?: Record<string, unknown>;
      productId?: string;
      creatorId?: string;
    } = {
      type: 'faq',
      id: faq.id,
      content,
      title: faq.question,
    };

    if (faq.productId) embedParams.productId = faq.productId;
    if (faq.creatorId) embedParams.creatorId = faq.creatorId;
    if (faq.orderIndex !== undefined) embedParams.metadata = { orderIndex: faq.orderIndex };

    await memoryService.embed(embedParams);
    logger.info({ faqId: faq.id, action }, 'Embedding created/updated for FAQ');
  } catch (error: any) {
    logger.error({ faqId: faq.id, error: error.message }, 'Failed to sync FAQ embedding');
  }
}

/**
 * Hook para preguntas Q&A
 * Llamar cuando se crea una pregunta (para auto-respuesta futura)
 */
export async function onQuestionCreated(
  question: {
    id: string;
    question: string;
    productId?: string;
    creatorId?: string;
    isAnswered?: boolean;
  }
): Promise<void> {
  try {
    const content = `Pregunta: ${question.question}`;
    const needsReembed = await memoryService.needsReembed('qa', question.id, content);
    
    if (!needsReembed) {
      logger.debug({ questionId: question.id }, 'Question unchanged, skipping embedding');
      return;
    }

    const embedParams: {
      type: EmbeddingSourceType;
      id: string;
      content: string;
      title: string;
      metadata?: Record<string, unknown>;
      productId?: string;
      creatorId?: string;
    } = {
      type: 'qa',
      id: question.id,
      content,
      title: question.question.substring(0, 50),
    };

    if (question.productId) embedParams.productId = question.productId;
    if (question.creatorId) embedParams.creatorId = question.creatorId;
    if (question.isAnswered !== undefined) embedParams.metadata = { isAnswered: question.isAnswered };

    await memoryService.embed(embedParams);
    logger.info({ questionId: question.id }, 'Embedding created for question');
  } catch (error: any) {
    logger.error({ questionId: question.id, error: error.message }, 'Failed to sync question embedding');
  }
}

/**
 * Hook para políticas de contenido (admin)
 * Llamar cuando se crea/actualiza una política
 */
export async function onPolicyChange(
  policy: {
    id: string;
    title_es: string;
    title_en: string;
    content_es: string;
    content_en: string;
    category?: string;
    version?: number;
  },
  action: 'create' | 'update' | 'delete'
): Promise<void> {
  try {
    if (action === 'delete') {
      await memoryService.deleteEmbedding('policy', policy.id);
      logger.info({ policyId: policy.id }, 'Embedding deleted for policy');
      return;
    }

    const content = `${policy.title_es}\n${policy.content_es}`;
    const needsReembed = await memoryService.needsReembed('policy', policy.id, content);
    
    if (!needsReembed) {
      logger.debug({ policyId: policy.id }, 'Policy unchanged, skipping embedding');
      return;
    }

    const embedParams: {
      type: EmbeddingSourceType;
      id: string;
      content: string;
      title: string;
      metadata?: Record<string, unknown>;
    } = {
      type: 'policy',
      id: policy.id,
      content,
      title: policy.title_es,
    };

    if (policy.version !== undefined || policy.category) {
      embedParams.metadata = {};
      if (policy.version !== undefined) embedParams.metadata.version = policy.version;
      if (policy.category) embedParams.metadata.category = policy.category;
    }

    await memoryService.embed(embedParams);
    logger.info({ policyId: policy.id, action }, 'Embedding created/updated for policy');
  } catch (error: any) {
    logger.error({ policyId: policy.id, error: error.message }, 'Failed to sync policy embedding');
  }
}

/**
 * Hook para reviews
 * Llamar cuando se crea una review (para análisis de sentiment)
 */
export async function onReviewCreated(
  review: {
    id: string;
    title?: string;
    content?: string;
    rating: number;
    productId?: string;
    creatorId?: string;
    isPublic?: boolean;
  }
): Promise<void> {
  try {
    // Solo embedding para reviews públicas
    if (!review.isPublic) {
      return;
    }

    const title = review.title || '';
    const content = review.content || '';
    const fullContent = `${title} ${content} Rating: ${review.rating}/5`.trim();
    
    const needsReembed = await memoryService.needsReembed('review', review.id, fullContent);
    
    if (!needsReembed) {
      logger.debug({ reviewId: review.id }, 'Review unchanged, skipping embedding');
      return;
    }

    const embedParams: {
      type: EmbeddingSourceType;
      id: string;
      content: string;
      title: string;
      metadata: Record<string, unknown>;
      productId?: string;
      creatorId?: string;
    } = {
      type: 'review',
      id: review.id,
      content: fullContent,
      title: title || `Review ${review.rating} estrellas`,
      metadata: { rating: review.rating },
    };

    if (review.productId) embedParams.productId = review.productId;
    if (review.creatorId) embedParams.creatorId = review.creatorId;

    await memoryService.embed(embedParams);
    logger.info({ reviewId: review.id }, 'Embedding created for review');
  } catch (error: any) {
    logger.error({ reviewId: review.id, error: error.message }, 'Failed to sync review embedding');
  }
}

/**
 * Helper: Formatear contenido de lección para embedding
 */
function formatLessonContent(lesson: {
  title: string;
  content?: string;
  description?: string;
}): string {
  const parts: string[] = [];
  
  if (lesson.title) {
    parts.push(`Título: ${lesson.title}`);
  }
  if (lesson.description) {
    parts.push(`Descripción: ${lesson.description}`);
  }
  if (lesson.content) {
    parts.push(`Contenido: ${lesson.content}`);
  }
  
  return parts.join('\n\n');
}