// Rate Limiting avanzado, sirve para proteger tu API contra ataques de fuerza bruta,
// spam y sobrecarga (especialmente en rutas sensibles como /login y /refresh).
import rateLimit from 'express-rate-limit';

import logger from '../../utils/logger';

// Limite para login (anti-brute force)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos
  message: {
    success: false,
    error:
      'Has alcanzado el límite de intentos de inicio de sesión. Espera un momento y vuelve a intentarlo.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.id;
    return userId || (req.ip ? String(req.ip) : 'unknown');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, ip: req.ip }, 'Límite de login alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Limite para refresh token (anti-abuso)
export const refreshLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutos
  max: 10, // máximo 10 refreshes
  message: {
    success: false,
    error:
      'Has alcanzado el límite de refrescos de sesión. Espera un momento y vuelve a intentarlo.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.id;
    return userId || (req.ip ? String(req.ip) : 'unknown');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, ip: req.ip }, 'Límite de refresh alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Limite general para rutas protegidas (más permisivo)
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100, // máximo 100 peticiones
  message: {
    success: false,
    error: 'Demasiadas peticiones. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter específico para endpoints de AI (más restrictivo)
// Los operaciones de AI son más costosas computacionalmente
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // máximo 30 peticiones por minuto por usuario
  message: {
    success: false,
    error: 'Límite de peticiones de AI alcanzado. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.id;
    return userId || (req.ip ? String(req.ip) : 'unknown');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de AI alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Rate limiter aún más restrictivo para operaciones de chat/generación
// Estas operaciones usan créditos y son las más costosas
export const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // máximo 10 chats por minuto por usuario
  message: {
    success: false,
    error: 'Límite de chats con IA alcanzado. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.id;
    return userId || (req.ip ? String(req.ip) : 'unknown');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de chat AI alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Rate limiter permisivo para webhooks de pasarelas de pago
// Las pasarelas pueden reintentar, así que el límite es alto
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 60, // máximo 60 peticiones por minuto por IP (Blockonomics envía 1-3 por transacción)
  message: {
    success: false,
    error: 'Demasiadas peticiones de webhook. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter específico para endpoints de ADMIN (más restrictivo)
// Los endpoints de admin tienen operaciones sensibles
export const adminReadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100, // máximo 100 peticiones por minuto para operaciones de lectura
  message: {
    success: false,
    error: 'Límite de peticiones de lectura alcanzado. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.id;
    return userId || (req.ip ? String(req.ip) : 'unknown');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de lectura admin alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Rate limiter aún más restrictivo para operaciones de ESCRITURA de admin
export const adminWriteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 50, // máximo 50 peticiones por minuto para operaciones de escritura
  message: {
    success: false,
    error: 'Límite de peticiones de escritura alcanzado. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.id;
    return userId || (req.ip ? String(req.ip) : 'unknown');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de escritura admin alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});
