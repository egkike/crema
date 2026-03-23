import { Router } from 'express';

import { productController } from '../controllers/product.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';
import { checkPlanLimits } from '../middlewares/auth/checkPlanLimits.middleware';
import { affiliateTracking } from '../middlewares/tracking/affiliateTracking.middleware';
import { upload } from '../middlewares/storage/upload.middleware';

const router = Router();

/**
 * RUTAS ESTÁTICAS PROTEGIDAS (definir ANTES de rutas dinámicas con parámetros)
 */
// Marketplace Filtrado (requiere auth)
router.get('/marketplace/compatible', jwtAuthMiddleware, productController.getMyAvailableMarketplace);

// Listar propios (Panel del Creador) (requiere auth)
router.get('/my-products', jwtAuthMiddleware, (req, res, next) => productController.getMyProducts(req, res, next));

// Quiz management (requiere auth + rol CREATOR)
router.post('/quiz/manage', jwtAuthMiddleware, restrictTo('CREATOR'), productController.upsertQuiz);

/**
 * 1. RUTA PÚBLICA: Ver producto y Tracking
 */
router.get('/:productId', affiliateTracking, productController.getProductById);

// Endpoint para validar cupón en el checkout (Público)
router.post('/validate-coupon', productController.validateCouponForCheckout);

// --- RUTAS PROTEGIDAS ---
router.use(jwtAuthMiddleware);

/**
 * Unirse como Afiliado
 */
router.post('/:productId/join', restrictTo('AFFILIATE'), productController.joinProductProgram);

/**
 * 2. Crear Producto
 * checkPlanLimits actúa como "Bouncer". Si el Content-Length excede el plan, 
 * rebota la petición antes de que Multer empiece a escribir en disco/S3.
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
 * Se aplica la misma lógica. Si es un PATCH, productId se pasa por params
 * y checkPlanLimits lo detecta para no contar doble el cupo de activos.
 */
router.patch(
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
 * 3. GESTIÓN DE CUPONES (CREADORES)
 */
// Listar cupones de un producto específico
router.get(
  '/:productId/coupons', 
  restrictTo('CREATOR'), 
  productController.getProductCoupons
);

// Crear un nuevo cupón
router.post(
  '/:productId/coupons', 
  restrictTo('CREATOR'), 
  productController.createCoupon
);

export default router;
