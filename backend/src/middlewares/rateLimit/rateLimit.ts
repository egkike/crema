// Rate Limiting avanzado, sirve para proteger tu API contra ataques de fuerza bruta,
// spam y sobrecarga (especialmente en rutas sensibles como /login y /refresh).
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { configService } from '../../services/config.service';
import logger from '../../utils/logger';

// Limite para login (anti-brute force)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 5, // máximo 5 intentos
  message: {
    success: false,
    error:
      'Has alcanzado el límite de intentos de inicio de sesión. Espera un momento y vuelve a intentarlo.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) return userId;
    return ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn(
      { key: req.rateLimit?.key, path: req.path },
      'Límite de inicio de sesión alcanzado'
    );
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Rate limiter para AI Content Assistant (Phase 6)
// Más restrictivo que aiLimiter general:
// - 10/min for content assist
// - 5/min for quiz generation
// - 3/min for transcription
export const aiContentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: 10, // 10 requests por minuto por usuario
  message: {
    success: false,
    error: 'Límite de contenido AI alcanzado. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) return userId;
    return ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de contenido AI alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Limite para refresh token (anti-abuso)
export const refreshLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutos
  limit: 10, // máximo 10 refreshes
  message: {
    success: false,
    error:
      'Has alcanzado el límite de refrescos de sesión. Espera un momento y vuelve a intentarlo.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) return userId;
    return ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de refresh alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Limite general para rutas protegidas (más permisivo)
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: 100, // máximo 100 peticiones
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
  limit: 30, // máximo 30 peticiones por minuto por usuario
  message: {
    success: false,
    error: 'Límite de peticiones de AI alcanzado. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) return userId;
    logger.debug(
      { path: req.path, ip: req.ip },
      'aiLimiter falling back to IP-based key (no userId)'
    );
    return ipKeyGenerator(req.ip || '');
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
  limit: 10, // máximo 10 chats por minuto por usuario
  message: {
    success: false,
    error: 'Límite de chats con IA alcanzado. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) return userId;
    return ipKeyGenerator(req.ip || '');
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
  limit: 60, // máximo 60 peticiones por minuto por IP (Blockonomics envía 1-3 por transacción)
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
  limit: 100, // máximo 100 peticiones por minuto para operaciones de lectura
  message: {
    success: false,
    error: 'Límite de peticiones de lectura alcanzado. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) return userId;
    return ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de lectura admin alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Rate limiter aún más restrictivo para operaciones de ESCRITURA de admin
export const adminWriteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: 50, // máximo 50 peticiones por minuto para operaciones de escritura
  message: {
    success: false,
    error: 'Límite de peticiones de escritura alcanzado. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) return userId;
    return ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de escritura admin alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});

// ============================================================================
// PRODUCT UPLOAD RATE LIMITER - Protect against upload flooding (product creation/update)
// Shared across POST /create and PATCH /:productId
// NOTE: When checkPlanLimits rejects a request, the rate limit slot is already consumed.
// This is an acceptable trade-off: the rate limiter protects DB queries for non-rate-limited
// requests, and the 10/min limit is generous enough that plan-check rejections (rare per user)
// don't materially impact legitimate upload capacity.
// ============================================================================

export const productUploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: 10, // máximo 10 solicitudes de upload por minuto por usuario
  message: {
    success: false,
    error:
      'Límite de uploads alcanzado. Máximo 10 solicitudes por minuto. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true, // No contar requests que fallan (error status >= 400)
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) {
      return userId;
    }
    logger.debug(
      { path: req.path, ip: req.ip },
      'productUploadLimiter falling back to IP-based key (no userId)'
    );
    return ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    const key = req.rateLimit?.key ?? req.user?.id ?? req.ip ?? 'unknown';
    logger.warn({ key, path: req.path }, 'Límite de uploads de producto alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Rate limiter específico para Interactive Agent (análisis)
// SPEC §4.2: 10 requests/min per user para análisis
export const interactiveAgentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: 10, // máximo 10 análisis por minuto por usuario
  message: {
    success: false,
    error: 'Demasiadas solicitudes de análisis. Intenta de nuevo en un minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) return userId;
    return ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn(
      { key: req.rateLimit?.key, path: req.path },
      'Límite de análisis interactivo alcanzado'
    );
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Rate limiter para Affiliate Chat — configurable via affiliate_chat.rate_limit
// SPEC AC-6: default 30/min, overrides aiChatLimiter (10/min) for this endpoint
// Uses module-level cache with TTL to avoid Redis/DB I/O on every request
// Promise-based dedup lock prevents TOCTOU race on concurrent cache misses
const affiliateChatLimitCache = { value: 30, timestamp: 0 };
const AFFILIATE_CHAT_CACHE_TTL_MS = 30_000; // 30 seconds
let affiliateChatLimitPromise: Promise<number> | null = null;

export const affiliateChatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: async () => {
    try {
      const now = Date.now();
      if (now - affiliateChatLimitCache.timestamp > AFFILIATE_CHAT_CACHE_TTL_MS) {
        if (!affiliateChatLimitPromise) {
          affiliateChatLimitPromise = configService
            .getNumber('affiliate_chat.rate_limit', 30)
            .then(val => {
              affiliateChatLimitCache.value = val;
              affiliateChatLimitCache.timestamp = Date.now();
              affiliateChatLimitPromise = null;
              return val;
            })
            .catch(err => {
              logger.error(
                { err },
                'affiliateChatLimiter: failed to get max, using cached default 30'
              );
              affiliateChatLimitPromise = null;
              return 30;
            });
        }
        return affiliateChatLimitPromise;
      }
      return affiliateChatLimitCache.value;
    } catch (err) {
      logger.error({ err }, 'affiliateChatLimiter: unexpected error in limit function');
      return affiliateChatLimitCache.value || 30;
    }
  },
  skipFailedRequests: true,
  message: {
    success: false,
    error: 'Límite de chat con IA alcanzado. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) return userId;
    return ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn(
      { key: req.rateLimit?.key, path: req.path },
      'Límite de chat de afiliado alcanzado'
    );
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Rate limiter para SEO Optimizer — 10 requests/min
// SPEC §4.12: dedicated limiter for SEO generation endpoint
export const seoOptimizerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: 10, // máximo 10 generaciones SEO por minuto por usuario
  message: {
    success: false,
    error: 'Límite de generación SEO alcanzado. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) return userId;
    return ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de generación SEO alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});

// TRANSCRIBE UPLOAD RATE LIMITER - Independent counter for transcription uploads
// Separate from productUploadLimiter so transcription usage doesn't consume product quota
// max: 3/min aligns with original design intent (documentado en ai-content.config.ts)
// ============================================================================

export const transcribeUploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: 3, // máximo 3 solicitudes de transcripción por minuto por usuario
  message: {
    success: false,
    error:
      'Límite de transcripciones alcanzado. Máximo 3 por minuto. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true, // No contar requests que fallan
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) {
      return userId;
    }
    logger.debug(
      { path: req.path, ip: req.ip },
      'transcribeUploadLimiter falling back to IP-based key (no userId)'
    );
    return ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    const key = req.rateLimit?.key ?? req.user?.id ?? req.ip ?? 'unknown';
    logger.warn({ key, path: req.path }, 'Límite de transcripciones alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Rate limiter para Churn Prediction — 5 requests/min (operación costosa de ML)
export const churnPredictionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  message: { success: false, error: 'Límite de predicción de churn alcanzado. Intenta de nuevo en 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) return userId;
    return ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de churn prediction alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Rate limiter para Recovery Email — 10 requests/min
export const recoveryEmailLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  message: { success: false, error: 'Límite de generación de email alcanzado. Intenta de nuevo en 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) return userId;
    return ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de recovery email alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Rate limiter para A/B Comparativas — 10 requests/min
export const compareLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  message: { success: false, error: 'Límite de comparativas alcanzado. Intenta de nuevo en 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: req => {
    const userId = req.user?.id;
    if (userId && typeof userId === 'string' && userId.length > 0) return userId;
    return ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de comparativas alcanzado');
    res.status(options.statusCode || 429).json(options.message);
  },
});
