import { Router } from 'express';

import { AuthController } from '../controllers/auth.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { loginSchema, registerPartnerSchema, forgotPasswordSchema, resetPasswordSchema, verifyEmailSchema } from '../schemas/users.schema';
import { validate } from '../middlewares/auth/validate.middleware';
import { loginLimiter, refreshLimiter, apiLimiter } from '../middlewares/rateLimit/rateLimit';

const router = Router();
const authController = new AuthController();

// --- AUTENTICACIÓN BÁSICA Y REGISTRO ---

/**
 * @swagger
 * /api/auth/register:
 * post:
 * summary: Registro manual exclusivo para Socios (Afiliados y Creadores)
 * tags: [Auth]
 */
router.post('/register', apiLimiter, validate(registerPartnerSchema), authController.register.bind(authController));

router.post('/verify-email', apiLimiter, validate(verifyEmailSchema), authController.verifyEmail.bind(authController));

router.post('/login', loginLimiter, validate(loginSchema), authController.login.bind(authController));

router.post('/refresh', refreshLimiter, authController.refresh.bind(authController));

router.post('/logout', apiLimiter, jwtAuthMiddleware, authController.logout.bind(authController));

// --- RECUPERACIÓN Y SEGURIDAD INICIAL ---

router.post(
  '/forgot-password', 
  apiLimiter,
  validate(forgotPasswordSchema), // Valida que venga un email real
  authController.forgotPassword.bind(authController)
);

router.post(
  '/reset-password', 
  apiLimiter,
  validate(resetPasswordSchema), // Valida token y robustez de pass
  authController.resetPassword.bind(authController)
);

router.post(
  '/change-password-first-login', 
  apiLimiter, 
  jwtAuthMiddleware, 
  authController.changePasswordFirstLogin.bind(authController)
);

// --- SECCIÓN 2FA (DOBLE FACTOR) ---

/**
 * Verificación de 2FA durante el Login (usa token parcial)
 */
router.post('/login/2fa', jwtAuthMiddleware, authController.verifyLogin2FA.bind(authController));

/**
 * Configuración inicial de 2FA
 */
router.post('/2fa/setup', jwtAuthMiddleware, authController.setup2FA.bind(authController));

/**
 * Activación final de 2FA
 */
router.post('/2fa/verify', jwtAuthMiddleware, authController.verifyAndEnable2FA.bind(authController));

// --- GESTIÓN DE SESIONES Y AUDITORÍA (FASE C & D) ---

/**
 * Obtiene el historial de acciones de seguridad del usuario
 */
router.get('/activity', jwtAuthMiddleware, authController.getActivity.bind(authController));

/**
 * Obtiene todas las sesiones activas
 */
router.get('/sessions', jwtAuthMiddleware, authController.getSessions.bind(authController));

/**
 * Cierra todas las sesiones excepto la actual (Botón de pánico)
 */
router.delete('/sessions/other', jwtAuthMiddleware, authController.revokeOtherSessions.bind(authController));

/**
 * Revoca una sesión específica por ID
 */
router.delete('/sessions/:sessionId', jwtAuthMiddleware, authController.revokeSession.bind(authController));

/**
 * Get current authenticated user profile
 */
router.get('/me', jwtAuthMiddleware, authController.getProfile.bind(authController));

export default router;
