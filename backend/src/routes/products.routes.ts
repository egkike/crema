import { Router } from 'express';

import { productController } from '../controllers/product.controller';
import { contentController } from '../controllers/content.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';
import { checkContentAccess } from '../middlewares/checkAccess/checkAccess.middleware';
import { checkPlanLimits } from '../middlewares/auth/checkPlanLimits.middleware';
import { affiliateTracking } from '../middlewares/tracking/affiliateTracking.middleware';
import { upload } from '../middlewares/storage/upload.middleware';

const router = Router();

// 1. RUTA PÚBLICA: Ver producto y Tracking (DEBE IR ANTES DEL MIDDLEWARE GLOBAL)
router.get('/:productId', affiliateTracking, productController.getProductById);

// --- RUTAS PROTEGIDAS (Requieren Login) ---
router.use(jwtAuthMiddleware);

/**
 * NUEVA: Marketplace Filtrado
 * Solo muestra productos que el usuario puede cobrar según sus monedas configuradas.
 */
router.get('/marketplace/compatible', productController.getMyAvailableMarketplace);

/**
 * NUEVA: Unirse como Afiliado
 * Permite que el usuario se vincule a un producto para empezar a venderlo.
 * restrictTo('AFFILIATE') o el rol que manejes para nivel 2.
 */
router.post(
  '/:productId/join',
  restrictTo('AFFILIATE'), // Ajustar según tus roles ('CREATOR' también suele poder)
  productController.joinProductProgram
);

/**
 * 2. Crear Producto - Ahora usa el rol 'CREATOR' de la DB
 */
router.post(
  '/create',
  restrictTo('CREATOR'),
  // 1. Validación previa (basada en el body.sizeBytes que estima el front)
  checkPlanLimits,
  // 2. Recibimos el archivo real
  upload.single('file'),
  // 3. Controlador
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
 * 2.2 Elimina Producto
 */
router.delete('/:productId', restrictTo('CREATOR'), productController.deleteProduct);

// 3. Listar propios
router.get('/my-products', (req, res, next) => productController.getMyProducts(req, res, next));

// 4. Acceso al contenido (Validación de compra/acceso)
router.get('/:productId/content', checkContentAccess, (req, res, next) =>
  contentController.getProductContent(req, res, next)
);

export default router;
