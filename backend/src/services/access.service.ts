import { productRepository } from '../repositories/product.repository';
import { orderRepository } from '../repositories/order.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

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

    // 2. Retorno estructurado (Normalizando nombres de propiedades)
    return {
      id: product.id,
      title: product.title,
      type: product.type,
      contentUrl: product.content_url,
      description: product.description,
      has_structured_content: product.has_structured_content,
      updatedAt: product.updated_at,
    };
  }

  static async evaluateGuaranteeStatus(userId: string, productId: string, product: any) {
    try {
      const order = await orderRepository.getActiveOrder(userId, productId);

      // Si no hay orden pagada o ya perdió la garantía, salimos
      if (!order || !order.is_guarantee_eligible) return;

      let shouldInvalidate = false;

      // REGLA A: Cursos Estructurados (Basado en % de progreso)
      if (product.has_structured_content) {
        const progress = await productRepository.getUserProductProgress(productId, userId);

        // Umbral del 30% (puedes parametrizarlo luego en platform_configs)
        if (progress.percent > 30) {
          shouldInvalidate = true;
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
        logger.warn(
          { orderId: order.id, type: product.type },
          'Safe-Guard: Garantía invalidada por acceso a producto descargable'
        );
      }

      if (shouldInvalidate) {
        await orderRepository.invalidateGuarantee(order.id);
      }
    } catch (error) {
      // No bloqueamos el acceso al contenido si falla la auditoría de garantía,
      // pero lo logueamos para revisión técnica.
      logger.error({ error, userId, productId }, 'Error en Safe-Guard evaluation');
    }
  }
}
