/**
 * Admin Config Routes
 * APIs para gestionar configuración global de la plataforma
 * Parte del SDD: docs/project/architecture-improvements/sdd/config-service/
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { configService, ConfigCategory } from '../services/config.service';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';
import { requireAdmin2FA } from '../middlewares/auth/admin2fa.middleware';
import { adminWriteLimiter } from '../middlewares/rateLimit/rateLimit';

const router = Router();

// Schemas de validación
const updateConfigSchema = z.object({
  configValue: z.string().min(1, 'El valor es requerido'),
  configType: z.enum(['string', 'number', 'boolean', 'json']).optional(),
  category: z.string().optional(),
});

const batchConfigSchema = z.object({
  configs: z.record(z.string(), z.string()),
});

//Protección: Solo admins nivel 10 + 2FA obligatorio
router.use(jwtAuthMiddleware);
router.use(restrictTo('ADMIN'));
router.use(requireAdmin2FA);

/**
 * GET /admin/config
 * Lista todos los configs o filtra por categoría
 * Query: ?category=ai
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = req.query.category as string | undefined;

    const configs = await configService.getAll(category as ConfigCategory | undefined);

    res.json({
      success: true,
      data: configs,
      count: configs.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/config/:key
 * Obtiene un config específico por key
 */
router.get('/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = req.params.key as string;

    const config = await configService.getByKey(key);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Config not found',
      });
    }

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /admin/config/:key
 * Actualiza un config existente
 * Body: { configValue: "123", configType: "number", category: "retry" }
 */
router.put('/:key', adminWriteLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = req.params.key as string;
    const validatedData = updateConfigSchema.parse(req.body);

    await configService.set(
      key,
      validatedData.configValue,
      validatedData.configType,
      validatedData.category as ConfigCategory | undefined
    );

    res.json({
      success: true,
      message: `Config "${key}" updated successfully`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/config/batch
 * Actualiza múltiples configs a la vez
 * Body: { configs: { "ai.model": "gpt-4o", "retry.delay": "5000" } }
 */
router.post('/batch', adminWriteLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = batchConfigSchema.parse(req.body);
    const configs = parsed.configs as Record<string, string>;

    await configService.setMany(configs);

    res.json({
      success: true,
      message: `${Object.keys(configs).length} configs updated successfully`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;