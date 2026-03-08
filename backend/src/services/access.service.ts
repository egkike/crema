import { productRepository } from '../repositories/product.repository';
import { orderRepository } from '../repositories/order.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';
import { mainQueue } from '../queues/scheduler';

import { EmailService } from './email.service';

export class AccessService {
  /**
   * Retorna el contenido del producto.
   * La validación de compra/autoría reside en el middleware 'checkContentAccess'.
   */
  static async getProtectedContent(userId: string, productId: string) {
    const product = await productRepository.getProductById(productId);

    if (!product) {
      throw new AppError('El producto solicitado no existe.', 404);
    }

    // 1. Lógica de estados del producto
    if (product.status === 'archived') {
      throw new AppError('Este producto ha sido retirado permanentemente.', 410);
    }

    // Un creador puede ver su contenido aunque sea 'draft', un comprador solo si es 'published'
    if (product.status !== 'published' && product.creator_id !== userId) {
      throw new AppError('El contenido no está disponible actualmente.', 403);
    }

    // --- LÓGICA SAFE-GUARD: Evaluación de Garantía ---
    // Solo evaluamos si el usuario NO es el dueño (es un comprador)
    if (product.creator_id !== userId) {
      // Importante: No bloqueamos el await aquí para que el acceso sea instantáneo,
      // pero lo lanzamos para que procese la regla.
      this.evaluateGuaranteeStatus(userId, productId, product).catch(err =>
        logger.error({ err }, 'Error silencioso en Safe-Guard')
      );
    }

    let finalUrl = product.content_url;

    // 2. Resolución de Video firmado
    if (product.type === 'video' && finalUrl && !product.has_structured_content) {
      try {
        const { streamingUtil } = await import('../utils/streaming.util');
        finalUrl = await streamingUtil.getSignedUrl(finalUrl, 'video');
      } catch (err) {
        logger.error({ err }, 'Error al firmar URL de video');
        // No lanzamos error para no romper la experiencia, enviamos la original o null
      }
    }

    // 2. Retorno estructurado (Normalizando nombres de propiedades)
    return {
      id: product.id,
      title: product.title,
      type: product.type,
      contentUrl: finalUrl,
      description: product.description,
      has_structured_content: !!product.has_structured_content,
      updatedAt: product.updated_at,
    };
  }

  static async evaluateGuaranteeStatus(userId: string, productId: string, product: any) {
    try {
      const order = await orderRepository.getActiveOrderWithBuyer(userId, productId);

      // Si no es elegible para garantía (ya pasó el tiempo o ya se invalidó), salimos.
      if (!order || !order.is_guarantee_eligible) return;

      let shouldInvalidate = false;
      let reason: 'progress' | 'download' = 'progress';

      // REGLA A: Cursos (Umbral de progreso)
      if (product.has_structured_content) {
        const progress = await productRepository.getUserProductProgress(productId, userId);
        if (progress.percent > 30) {
          shouldInvalidate = true;
          reason = 'progress';
        }
      }
      // REGLA B: Descargables (Acceso inmediato invalida garantía)
      else if (['ebook', 'software', 'audiobook', 'archive'].includes(product.type)) {
        shouldInvalidate = true;
        reason = 'download';
      }

      if (shouldInvalidate) {
        const wasInvalidated = await orderRepository.invalidateGuarantee(order.id);

        if (wasInvalidated) {
          const emailData = {
            type: 'GUARANTEE_INVALIDATED',
            to: order.buyer_email,
            data: {
              fullname: order.buyer_name,
              productTitle: product.title,
              reason:
                reason === 'progress'
                  ? 'haber superado el 30% del contenido'
                  : 'haber accedido a la descarga del producto',
            },
          };

          if (mainQueue) {
            await mainQueue.add('send-email', emailData, { attempts: 3, backoff: 2000 });
          } else {
            await EmailService.sendGuaranteeInvalidatedEmail(
              emailData.to,
              emailData.data.fullname,
              product.title,
              reason
            );
          }
        }
      }
    } catch (error) {
      logger.error({ error, userId, productId }, 'Safe-Guard Failure');
    }
  }

  /**
   * Obtiene una lección específica validando acceso y resolviendo streaming si aplica.
   */
  static async getProtectedLesson(userId: string, lessonId: string) {
    // El repo debe validar: existencia de lección + existencia de orden pagada para el producto padre
    const lesson = await productRepository.getLessonWithAccess(lessonId, userId);

    if (!lesson) {
      throw new AppError('Acceso denegado o lección no encontrada.', 403);
    }

    // Lanzamos Safe-Guard asíncrono también aquí
    // El lesson debe traer el product_id y los datos del producto padre (puedes ajustar el repo para esto)
    this.triggerSafeGuard(userId, lesson.product_id, lesson.product_data);

    let finalUrl = lesson.content_url;

    // Solo firmamos si es video propio (no embebido externo)
    if (lesson.content_type === 'video' && finalUrl && !finalUrl.match(/youtube|vimeo/)) {
      const { streamingUtil } = await import('../utils/streaming.util');
      finalUrl = await streamingUtil.getSignedUrl(finalUrl, 'video');
    }

    return {
      ...lesson,
      content_url: finalUrl,
    };
  }

  /**
   * MÉTODO HELPER: Dispara la evaluación sin bloquear el hilo principal
   */
  private static triggerSafeGuard(userId: string, productId: string, product: any) {
    if (product.creator_id !== userId) {
      this.evaluateGuaranteeStatus(userId, productId, product).catch(err =>
        logger.error({ err, userId, productId }, 'Error silencioso en Safe-Guard Centralizado')
      );
    }
  }
}
