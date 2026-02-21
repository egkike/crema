import { Router } from 'express';

import { affiliateController } from '../controllers/affiliate.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';

const router = Router();

router.use(jwtAuthMiddleware);

// Ver mis productos afiliados (Portfolio)
router.get('/my-portfolio', affiliateController.getMyPortfolio);

// Abandonar un programa de afiliación
router.delete(
  '/portfolio/:productId',
  restrictTo('AFFILIATE'),
  affiliateController.removeFromPortfolio
);

export default router;
