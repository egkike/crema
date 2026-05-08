import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import swaggerSpecs from './swagger';
import { loginLimiter, refreshLimiter, apiLimiter } from './middlewares/rateLimit/rateLimit';
import { requestIdMiddleware } from './middlewares/tracking/requestId.middleware';
import { globalErrorHandler } from './middlewares/global-error.middleware';
import { AppError } from './errors/AppError';
import { config } from './config/index';
// Importación de rutas
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import productsRoutes from './routes/products.routes';
import learningRoutes from './routes/learning.routes';
import paymentsRouter from './routes/payments.routes';
import balanceRoutes from './routes/balance.routes';
import refundRoutes from './routes/refund.routes';
import payoutRoutes from './routes/payout.routes';
import adminRoutes from './routes/admin.routes';
import adminConfigRoutes from './routes/admin.config.routes';
import payoutMethodRoutes from './routes/payout_method.routes';
import affiliateRoutes from './routes/affiliate.routes';
import aiRoutes from './routes/ai.routes';
import interactiveRoutes from './routes/interactive.routes';
import orchestratorRoutes from './routes/orchestrator.routes';

const app = express();

// --- CONFIGURACIÓN DE PROXY Y PARSERS ---
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- REQUEST ID (Traza) ---
app.use(requestIdMiddleware);

// --- HELMET & SECURITY ---
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          'https://cdn.jsdelivr.net',
          'https://*.mercadopago.com',
          'https://*.mux.com',
        ],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        imgSrc: [
          "'self'",
          'data:',
          'https://images.unsplash.com',
          'https://via.placeholder.com',
          'https://*.cloudflarestream.com',
          'https://*.mux.com',
        ],
        mediaSrc: ["'self'", 'blob:', 'https://*.cloudflarestream.com', 'https://*.mux.com'],
        frameSrc: ["'self'", 'https://*.cloudflarestream.com'],
        connectSrc: [
          "'self'",
          'https://*.mercadopago.com',
          'https://*.cloudflarestream.com',
          'https://*.mux.com',
        ],
        fontSrc: [
          "'self'",
          'data:',
          'https://fonts.googleapis.com',
          'https://fonts.gstatic.com',
          'https://*.mercadopago.com',
        ],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    noSniff: true,
    frameguard: { action: 'deny' },
    hsts:
      config.nodeEnv === 'production'
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
  })
);

// --- CORS ---
const corsOrigins = config.cors?.origins;

// In production, require explicit origins list
// In development, allow localhost for testing
const corsOrigin = Array.isArray(corsOrigins) && corsOrigins.length > 0
  ? corsOrigins
  : config.nodeEnv === 'production'
    ? []  // Block CORS in production if not configured
    : ['http://localhost:3000', 'http://localhost:4321']; // Allow localhost for dev

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// --- RUTAS DE SALUD ---
app.get('/health', async (_req: Request, res: Response) => {
  // Basic health check - returns simple status
  // SECURITY: Don't expose environment/uptime - aids attacker reconnaissance
  res.status(200).json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Crema Backend - Online 🚀' });
});

// --- RATE LIMITING (Solo fuera de tests) ---
if (config.nodeEnv !== 'test') {
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth/refresh', refreshLimiter);
  app.use('/api', apiLimiter);
}

// --- DEFINICIÓN DE RUTAS ---
app.use('/api/payments', paymentsRouter);
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/balances', balanceRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/config', adminConfigRoutes);
app.use('/api/payout-methods', payoutMethodRoutes);
app.use('/api/affiliates', affiliateRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/interactive', interactiveRoutes);
app.use('/api/orchestrator', orchestratorRoutes);
app.use('/api', userRoutes); // ← AL FINAL, como catch-all

// --- SWAGGER DOCS ---
if (config.nodeEnv !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));
}

// --- ERROR HANDLING ---
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError('Ruta no encontrada', 404));
});

// Global error handler - sends notifications and returns consistent response
app.use(globalErrorHandler);

export { app };
