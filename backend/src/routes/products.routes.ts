import { Router } from 'express';

import { productController } from '../controllers/product.controller';
import { contentController } from '../controllers/content.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';
import { checkContentAccess } from '../middlewares/checkAccess/checkAccess.middleware';

const router = Router();

/**
 * 🔓 RUTAS PÚBLICAS (Opcional)
 * Si decides que el catálogo sea abierto, mueve 'getProductById'
 * ANTES del middleware de JWT.
 */

// --- RUTAS PROTEGIDAS (Requieren Login) ---
router.use(jwtAuthMiddleware);

// 1. Crear (Solo Nivel 5+)
router.post('/create', restrictTo(5), (req, res, next) =>
  productController.createProduct(req, res, next)
);

// 2. Listar propios (Palabra fija 'my-products' siempre antes que el parámetro :productId)
router.get('/my-products', (req, res, next) => productController.getMyProducts(req, res, next));

// 3. Ver detalle (Ruta dinámica)
router.get('/:productId', (req, res, next) => productController.getProductById(req, res, next));

// 4. Acceso al contenido (Ruta dinámica con middleware de validación de compra)
router.get('/:productId/content', checkContentAccess, (req, res, next) =>
  contentController.getProductContent(req, res, next)
);

export default router;
