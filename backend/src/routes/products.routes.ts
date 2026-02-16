import { Router } from 'express';

import { productController } from '../controllers/product.controller';
import { contentController } from '../controllers/content.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';
import { checkContentAccess } from '../middlewares/checkAccess/checkAccess.middleware';
import { checkPlanLimits } from '../middlewares/auth/checkPlanLimits.middleware';
import { affiliateTracking } from '../middlewares/tracking/affiliateTracking.middleware';

const router = Router();

// 1. RUTA PÚBLICA: Ver producto y Tracking (DEBE IR ANTES DEL MIDDLEWARE GLOBAL)
// Nota: Quitamos la duplicidad y la movemos antes de la protección de JWT
router.get('/:productId', affiliateTracking, productController.getProductById);

// --- RUTAS PROTEGIDAS (Requieren Login) ---
router.use(jwtAuthMiddleware);

/**
 * 2. Crear Producto
 */
router.post('/create', restrictTo(3), checkPlanLimits, (req, res, next) =>
  productController.createProduct(req, res, next)
);

// 3. Listar propios
router.get('/my-products', (req, res, next) => productController.getMyProducts(req, res, next));

// 4. Acceso al contenido (Validación de compra/acceso)
router.get('/:productId/content', checkContentAccess, (req, res, next) =>
  contentController.getProductContent(req, res, next)
);

export default router;
