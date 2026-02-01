import { productRepository } from '../repositories/product.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export class AccessService {
  /**
   * Retorna el contenido del producto.
   * La validación de compra/autoría reside en el middleware de acceso.
   */
  static async getProtectedContent(userId: string, productId: string) {
    const product = await productRepository.getProductById(productId);

    if (!product) {
      throw new AppError('El producto solicitado no existe.', 404);
    }

    // 1. Lógica de estados
    // Si está archivado, bloqueamos acceso total.
    if (product.status === 'archived') {
      throw new AppError('Este producto ha sido retirado permanentemente.', 410); // 410 Gone
    }

    // Si no está publicado y el usuario NO es el dueño, bloqueamos.
    if (product.status !== 'published' && product.creator_id !== userId) {
      throw new AppError('El contenido no está disponible actualmente.', 403);
    }

    logger.info({ userId, productId }, `Acceso concedido al contenido: ${product.title}`);

    // 2. Retorno estructurado
    return {
      id: product.id,
      title: product.title,
      type: product.type,
      contentUrl: product.content_url,
      description: product.description,
      // Usamos el nombre de columna tal cual está en la DB o fallback
      updatedAt: product.updated_at,
    };
  }
}
