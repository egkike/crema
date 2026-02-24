import { Router } from 'express';

import { contentController } from '../controllers/content.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { checkContentAccess } from '../middlewares/checkAccess/checkAccess.middleware';

const router = Router();

router.use(jwtAuthMiddleware);

/**
 * Dashboard de estudio: Lista de cursos comprados con progreso
 * URL: /api/learning/my-dashboard
 */
router.get('/my-dashboard', contentController.getMyLearningDashboard);

/**
 * Actualizar progreso de lecciones
 * URL: /api/learning/progress
 */
router.post('/progress', contentController.updateLessonProgress);

/**
 * Consumo de contenido: Ver curso/descargar ebook
 * Usamos el middleware checkContentAccess para validar compra
 * URL: /api/learning/:productId/content
 */
router.get('/:productId/content', checkContentAccess, contentController.getProductContent);

export default router;
