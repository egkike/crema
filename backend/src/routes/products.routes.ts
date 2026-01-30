import { Router } from 'express';

// 1. Importamos las instancias de los controladores
import { productController } from '../controllers/product.controller';
import { contentController } from '../controllers/content.controller';
// 2. Importamos los middlewares
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';
import { checkContentAccess } from '../middlewares/checkAccess.middleware';

const router = Router();

// Todas las rutas de productos requieren autenticación
router.use(jwtAuthMiddleware);

/**
 * Solo productores (level >= 5) pueden crear productos
 */
router.post('/create', restrictTo(5), (req, res, next) =>
  productController.createProduct(req, res, next)
);

/**
 * Listar MIS productos creados
 */
router.get('/my-products', (req, res, next) => productController.getMyProducts(req, res, next));

/**
 * RUTA CRÍTICA: Acceso al contenido comprado
 * Aplicamos checkContentAccess para validar la compra o autoría
 */
router.get('/:productId/content', checkContentAccess, (req, res, next) =>
  contentController.getProductContent(req, res, next)
);

export default router;
