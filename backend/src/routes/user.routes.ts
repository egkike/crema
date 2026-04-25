import { Router } from 'express';

import type { AuthenticatedRequest } from '../types/express';
import { UserController } from '../controllers/user.controller';
import { subscriptionController } from '../controllers/subscription.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';
import { enforceFullAuth } from '../middlewares/auth/password.middleware';
import { validate, validateParams } from '../middlewares/auth/validate.middleware';
import { userContextService } from '../services/user-context.service';
import { userNotesService } from '../services/user-notes.service';
import {
  productIdSchema,
  noteIdSchema,
  updateProgressSchema,
  saveQuestionSchema,
  createNoteSchema,
  updateNoteSchema,
} from '../schemas/user-context.schema';

const router = Router();
const userController = new UserController();

// --- RUTAS PROTEGIDAS ---
router.use(jwtAuthMiddleware);
router.use(enforceFullAuth);

/**
 * Gestión de Perfil (Cualquier usuario logueado)
 */
router.get('/session', userController.getSession.bind(userController));
router.patch('/profile/change-password', userController.changeMyPassword.bind(userController));
router.post('/upgrade', userController.upgradeMyLevel.bind(userController));

/**
 * Suscripciones y Límites (Específico para Creadores/Partners)
 */
router.get('/subscription/status', subscriptionController.getMySubscriptionStatus);

/**
 * User Context y Notes (Auth requerido)
 */
// Context
router.get('/context/:productId', validateParams(productIdSchema, ['productId']), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    const productId = req.validatedParams?.productId as string;
    const context = await userContextService.getContext(userId, productId);
    res.json({ success: true, data: context });
  } catch (error) {
    next(error);
  }
});

router.put('/context/:productId/progress', validateParams(productIdSchema, ['productId']), validate(updateProgressSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    const productId = req.validatedParams?.productId as string;
    const { progress } = req.validatedBody as { progress: number };
    const context = await userContextService.updateProgress(userId, productId, progress);
    res.json({ success: true, data: context });
  } catch (error) {
    next(error);
  }
});

router.post('/context/:productId/question', validateParams(productIdSchema, ['productId']), validate(saveQuestionSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    const productId = req.validatedParams?.productId as string;
    const { question } = req.validatedBody as { question: string };
    const context = await userContextService.saveQuestion(userId, productId, question);
    res.json({ success: true, data: context });
  } catch (error) {
    next(error);
  }
});

// Notes
router.get('/notes/:productId', validateParams(productIdSchema, ['productId']), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    const productId = req.validatedParams?.productId as string;
    const notes = await userNotesService.getNotes(userId, productId);
    res.json({ success: true, data: notes, count: notes.length });
  } catch (error) {
    next(error);
  }
});

router.post('/notes/:productId', validateParams(productIdSchema, ['productId']), validate(createNoteSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    const productId = req.validatedParams?.productId as string;
    const { noteText, noteType, position } = req.validatedBody as { noteText: string; noteType: string; position?: number };
    const note = await userNotesService.createNote(userId, productId, noteText, noteType, position);
    res.status(201).json({ success: true, data: note });
  } catch (error) {
    next(error);
  }
});

router.put('/notes/:noteId', validateParams(noteIdSchema, ['noteId']), validate(updateNoteSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    const { noteText } = req.validatedBody as { noteText: string };
    const noteId = req.validatedParams?.noteId as string;
    const note = await userNotesService.updateNote(noteId, userId, noteText);
    res.json({ success: true, data: note });
  } catch (error) {
    next(error);
  }
});

router.delete('/notes/:noteId', validateParams(noteIdSchema, ['noteId']), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    const noteId = req.validatedParams?.noteId as string;
    const deleted = await userNotesService.deleteNote(noteId, userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Note not found or not owned by user' });
    }
    res.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * Rutas Administrativas (Solo Level >= STAFF)
 */
router.post('/user/create', restrictTo('STAFF'), userController.createUser.bind(userController));
router.get('/users', restrictTo('STAFF'), userController.getUsers.bind(userController));
router.post('/user/getbyid', restrictTo('STAFF'), userController.getById.bind(userController));
router.patch('/user/update', restrictTo('STAFF'), userController.updUser.bind(userController));
router.patch('/user/chgpass-admin', restrictTo('STAFF'), userController.chgPassUser.bind(userController));
router.delete('/user/delete', restrictTo('STAFF'), userController.deleteUser.bind(userController));

export default router;
