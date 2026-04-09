import { productRepository, Product } from '../repositories/product.repository';
import { orderRepository } from '../repositories/order.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';
import { mainQueue } from '../queues/scheduler';

import { EmailService } from './email.service';

// Interface matching the return type from getProtectedContent
interface ProductGuaranteeInfo {
  title: string;
  hasStructuredContent: boolean;
  type: string;
}

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
      AccessService.evaluateGuaranteeStatus(userId, productId, {
        title: product.title,
        hasStructuredContent: product.has_structured_content,
        type: product.type,
      }).catch((err) => {
        logger.error({ err }, 'Error evaluando estado de garantía');
      });
    }

    // 2. Devolver el contenido
    return {
      id: product.id,
      title: product.title,
      type: product.type,
      description: product.description,
      contentUrl: product.content_url,
      hasStructuredContent: product.has_structured_content,
      creator_id: product.creator_id,
      // No exposed: prices, affiliate_commission_percent
    };
  }

  static async evaluateGuaranteeStatus(userId: string, productId: string, product: ProductGuaranteeInfo) {
    try {
      const order = await orderRepository.getActiveOrderWithBuyer(userId, productId);

      // Si no es elegible para garantía (ya pasó el tiempo o ya se invalidó), salimos.
      if (!order || !order.is_guarantee_eligible) return;

      let shouldInvalidate = false;
      let reason: 'progress' | 'download' = 'progress';

      // REGLA A: Cursos (Umbral de progreso)
      if (product.hasStructuredContent) {
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
  private static triggerSafeGuard(userId: string, productId: string, product: Product) {
    if (product.creator_id !== userId) {
      this.evaluateGuaranteeStatus(userId, productId, {
        title: product.title,
        hasStructuredContent: product.has_structured_content,
        type: product.type,
      }).catch(err =>
        logger.error({ err, userId, productId }, 'Error silencioso en Safe-Guard Centralizado')
      );
    }
  }
}
