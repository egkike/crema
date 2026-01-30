import { productRepository } from '../repositories/product.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export class AccessService {
  /**
   * Retorna el contenido del producto.
   * Nota: La validación de compra/autoría ya se realizó en el Middleware.
   */
  static async getProtectedContent(userId: string, productId: string) {
    // 1. Obtener los detalles del producto
    const product = await productRepository.getProductById(productId);

    // Validación de existencia
    if (!product) {
      throw new AppError('El producto solicitado no existe.', 404);
    }

    // 2. Validar estado del producto (opcional, por si quieres ocultar productos pausados)
    if (product.status !== 'published') {
      // Si el usuario es el creador, quizás sí deba verlo aunque no esté publicado
      if (product.creator_id !== userId) {
        throw new AppError('El contenido no está disponible temporalmente.', 403);
      }
    }

    // 3. Log de acceso exitoso
    logger.info({ userId, productId }, `Acceso concedido al contenido: ${product.title}`);

    // 4. Retornamos solo lo necesario para el cliente
    return {
      id: product.id,
      title: product.title,
      type: product.type,
      contentUrl: product.content_url, // URL del video, PDF, etc.
      description: product.description,
      instructions: (product as any).access_instructions || '', // Por si tienes campo de texto extra
    };
  }
}
