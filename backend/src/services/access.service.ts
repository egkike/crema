import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export class AccessService {
  /**
   * Valida el acceso y retorna el contenido del producto.
   */
  static async getProtectedContent(userId: string, productId: string) {
    // 1. Validar si la orden está pagada
    const hasAccess = await orderRepository.checkPaidOrder(userId, productId);

    if (!hasAccess) {
      logger.warn(`Intento de acceso no autorizado: User ${userId} -> Product ${productId}`);
      throw new AppError('No tienes acceso a este contenido. Debes adquirirlo primero.', 403);
    }

    // 2. Obtener los detalles del producto
    const productResult = await productRepository.getProductById(productId);

    // SOLUCIÓN AL ERROR DE LINT: Verificamos si hay un error en el resultado
    if ('error' in productResult) {
      throw new AppError(productResult.error, 404);
    }

    // Ahora TypeScript sabe que 'productResult' es un 'Product' y tiene .status
    const product = productResult;

    if (product.status !== 'published') {
      throw new AppError('El producto no está disponible actualmente.', 404);
    }

    // 3. Log de acceso exitoso
    logger.info(`Acceso concedido: User ${userId} visualizando ${product.title}`);

    return {
      title: product.title,
      type: product.type,
      content_url: product.content_url,
      description: product.description,
    };
  }
}
