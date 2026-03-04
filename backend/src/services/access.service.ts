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
      await this.evaluateGuaranteeStatus(userId, productId, product);
    }

    logger.info({ userId, productId }, `Acceso concedido al contenido: ${product.title}`);

    let finalUrl = product.content_url;
    if (product.type === 'video' && !product.has_structured_content && finalUrl) {
      const { streamingUtil } = await import('../utils/streaming.util');
      finalUrl = await streamingUtil.getSignedUrl(finalUrl, 'video');
    }

    // 2. Retorno estructurado (Normalizando nombres de propiedades)
    return {
      id: product.id,
      title: product.title,
      type: product.type,
      contentUrl: finalUrl,
      description: product.description,
      has_structured_content: product.has_structured_content,
      updatedAt: product.updated_at,
    };
  }

  static async evaluateGuaranteeStatus(userId: string, productId: string, product: any) {
    try {
      // Usamos el nuevo método con JOIN
      const order = await orderRepository.getActiveOrderWithBuyer(userId, productId);

      // Si no hay orden pagada o ya perdió la garantía, salimos
      if (!order || !order.is_guarantee_eligible) return;

      let shouldInvalidate = false;
      let reason: 'progress' | 'download' = 'progress';

      // REGLA A: Cursos Estructurados (Basado en % de progreso)
      if (product.has_structured_content) {
        const progress = await productRepository.getUserProductProgress(productId, userId);

        // Umbral del 30% (puedes parametrizarlo luego en platform_configs)
        if (progress.percent > 30) {
          shouldInvalidate = true;
          reason = 'progress';
          logger.warn(
            { orderId: order.id, percent: progress.percent },
            'Safe-Guard: Garantía invalidada por progreso > 30%'
          );
        }
      }
      // REGLA B: Productos de descarga directa (Ebooks, Software, Audiobooks)
      // Se invalidan al primer acceso exitoso al contenido protegido
      else if (['ebook', 'software', 'audiobook'].includes(product.type)) {
        shouldInvalidate = true;
        reason = 'download';
        logger.warn(
          { orderId: order.id, type: product.type },
          'Safe-Guard: Garantía invalidada por acceso a producto descargable'
        );
      }

      if (shouldInvalidate) {
        // 1. Intentamos invalidar en la DB (Atómico)
        const invalidatedOrder = await orderRepository.invalidateGuarantee(order.id);

        // 2. Si se invalidó justo ahora, disparamos el email
        if (invalidatedOrder) {
          // Usamos los datos que ya vienen del JOIN en 'getActiveOrderWithBuyer'
          const targetEmail = order.buyer_email;
          const targetName = order.buyer_name;

          if (mainQueue) {
            await mainQueue.add(
              'send-email',
              {
                type: 'GUARANTEE_INVALIDATED',
                to: targetEmail,
                data: {
                  fullname: targetName,
                  productTitle: product.title,
                  reason: reason,
                },
              },
              { attempts: 3, backoff: 2000 }
            );
          } else {
            await EmailService.sendGuaranteeInvalidatedEmail(
              targetEmail,
              targetName,
              product.title,
              reason
            );
          }
          logger.info(
            { orderId: order.id },
            'Safe-Guard: Notificación de pérdida de garantía enviada'
          );
        }
      }
    } catch (error) {
      // No bloqueamos el acceso al contenido si falla la auditoría de garantía,
      // pero lo logueamos para revisión técnica.
      logger.error({ error, userId, productId }, 'Error en Safe-Guard evaluation');
    }
  }

  /**
   * Obtiene una lección específica validando acceso y resolviendo streaming si aplica.
   */
  static async getProtectedLesson(userId: string, lessonId: string) {
    // 1. Buscamos la lección y verificamos que el usuario haya pagado el producto padre
    const lesson = await productRepository.getLessonWithAccess(lessonId, userId);

    if (!lesson) {
      throw new AppError('No tienes acceso a esta lección o el producto no ha sido pagado.', 403);
    }

    let finalUrl = lesson.content_url;

    // 2. Si es un video y NO es un link externo (YouTube/Vimeo),
    // podríamos usar tu utilidad de streaming firmado (Cloudflare/AWS)
    if (
      lesson.content_type === 'video' &&
      finalUrl &&
      !finalUrl.includes('youtube.com') &&
      !finalUrl.includes('vimeo.com')
    ) {
      const { streamingUtil } = await import('../utils/streaming.util');
      finalUrl = await streamingUtil.getSignedUrl(finalUrl, 'video');
    }

    // 3. Si es YouTube/Vimeo, el Frontend recibirá el link pero bajo demanda (una por una)
    return {
      ...lesson,
      content_url: finalUrl,
    };
  }
}
