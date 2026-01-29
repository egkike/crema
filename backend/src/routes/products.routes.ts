import { Router } from 'express';

import { createProduct, getMyProducts } from '../controllers/product.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';
import { getProductContent } from '../controllers/content.controller';

const router = Router();

// Todas las rutas de productos requieren autenticación
router.use(jwtAuthMiddleware);

// Solo productores (level >= 5) pueden crear productos
router.post('/create', restrictTo(5), createProduct);

// Listar MIS productos (cualquier usuario autenticado)
router.get('/my-products', getMyProducts);

// Ruta para que el comprador acceda a su curso/ebook
router.get('/:productId/content', getProductContent);

export default router;
