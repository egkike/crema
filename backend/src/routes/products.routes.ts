import { Router } from 'express';

import { productController } from '../controllers/product.controller';
import { contentController } from '../controllers/content.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';
import { checkContentAccess } from '../middlewares/checkAccess/checkAccess.middleware';
import { checkPlanLimits } from '../middlewares/auth/checkPlanLimits.middleware';

const router = Router();

// --- RUTAS PROTEGIDAS (Requieren Login) ---
router.use(jwtAuthMiddleware);

/**
 * 1. Crear Producto
 * - restrictTo(3): Permite que Creadores (3), Admins (5) y SuperAdmins (99) entren.
 * - checkPlanLimits: Valida que el Creador tenga espacio, cupo de productos y plan activo.
 */
router.post('/create', restrictTo(3), checkPlanLimits, (req, res, next) =>
  productController.createProduct(req, res, next)
);

// 2. Listar propios
router.get('/my-products', (req, res, next) => productController.getMyProducts(req, res, next));

// 3. Ver detalle
router.get('/:productId', (req, res, next) => productController.getProductById(req, res, next));

// 4. Acceso al contenido (Validación de compra/acceso)
router.get('/:productId/content', checkContentAccess, (req, res, next) =>
  contentController.getProductContent(req, res, next)
);

export default router;
