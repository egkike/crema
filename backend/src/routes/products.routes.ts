import { Router } from 'express';

import { productController } from '../controllers/product.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';
import { checkPlanLimits } from '../middlewares/auth/checkPlanLimits.middleware';
import { affiliateTracking } from '../middlewares/tracking/affiliateTracking.middleware';
import { upload } from '../middlewares/storage/upload.middleware';

const router = Router();

/**
 * 1. RUTA PÚBLICA: Ver producto y Tracking
 */
router.get('/:productId', affiliateTracking, productController.getProductById);

// --- RUTAS PROTEGIDAS ---
router.use(jwtAuthMiddleware);

/**
 * Marketplace Filtrado
 */
router.get('/marketplace/compatible', productController.getMyAvailableMarketplace);

/**
 * Unirse como Afiliado
 */
router.post('/:productId/join', restrictTo('AFFILIATE'), productController.joinProductProgram);

/**
 * 2. Crear Producto
 */
router.post(
  '/create',
  restrictTo('CREATOR'),
  checkPlanLimits,
  upload.single('file'),
  productController.createProduct
);

/**
 * 2.1 Actualizar Producto
 */
router.put(
  '/:productId',
  restrictTo('CREATOR'),
  checkPlanLimits,
  upload.single('file'),
  productController.updateProduct
);

/**
 * 2.2 Eliminar Producto
 */
router.delete('/:productId', restrictTo('CREATOR'), productController.deleteProduct);

/**
 * 3. Listar propios (Panel del Creador)
 */
router.get('/my-products', (req, res, next) => productController.getMyProducts(req, res, next));

export default router;
