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
    // El repo lanza error si falla la DB, así que aquí solo manejamos la lógica
    const hasAccess = await orderRepository.checkPaidOrder(userId, productId);

    if (!hasAccess) {
      logger.warn(`Intento de acceso no autorizado: User ${userId} -> Product ${productId}`);
      throw new AppError('No tienes acceso a este contenido. Debes adquirirlo primero.', 403);
    }

    // 2. Obtener los detalles del producto
    const product = await productRepository.getProductById(productId);

    // SOLUCIÓN: Si es null, lanzamos AppError 404.
    // Esto elimina el error de "posiblemente null" para las líneas siguientes.
    if (!product) {
      throw new AppError('El producto solicitado no existe.', 404);
    }

    // 3. Validar estado del producto
    if (product.status !== 'published') {
      throw new AppError('El producto no está disponible actualmente.', 404);
    }

    // 4. Log de acceso exitoso
    logger.info(`Acceso concedido: User ${userId} visualizando ${product.title}`);

    return {
      title: product.title,
      type: product.type,
      content_url: product.content_url,
      description: product.description,
    };
  }
}
