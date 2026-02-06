import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import cron from 'node-cron';

import { testController } from './controllers/test.controller';
import { handleWebhook } from './controllers/payment.controller';
import { loginLimiter, refreshLimiter, apiLimiter } from './middlewares/rateLimit';
import { AppError } from './errors/AppError';
import { config } from './config/index';
import logger from './utils/logger';
import { ReleaseService } from './services/release.service';
import { AuthCleanupService } from './services/auth.cleanup.service';
// Importamos las rutas
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import productsRoutes from './routes/products.routes';
import paymentsRouter from './routes/payments.routes';
import balanceRoutes from './routes/balance.routes';
import refundRoutes from './routes/refund.routes';
import payoutRoutes from './routes/payout.routes';
import adminPayoutRoutes from './routes/admin.payout.routes';

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- HELMET & SECURITY ---
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://cdn.jsdelivr.net',
          'https://*.mercadopago.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://images.unsplash.com', 'https://via.placeholder.com'],
        connectSrc: [
          "'self'",
          'https://api.tu-dominio.com',
          'wss://tu-dominio.com',
          'https://*.mercadopago.com',
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
    crossOriginResourcePolicy: { policy: 'cross-origin' },
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

// --- MIDDLEWARES GLOBALES ---
app.use(cookieParser());
app.use(
  cors({
    origin: config.cors.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// --- HEALTH & STATUS (Público total) ---
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    environment: config.nodeEnv,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Crema Backend - Online 🚀' });
});

// --- RATE LIMITING ---
app.use('/api/login', loginLimiter);
app.use('/api/refresh', refreshLimiter);
app.use('/api', apiLimiter);

// --- 1. RUTAS PÚBLICAS Y WEBHOOKS (Sin candados) ---
// El webhook debe estar arriba de todo para que MP nunca encuentre bloqueos
app.post('/api/payments/webhook', handleWebhook);

// --- 2. RUTAS ESPECIALES DE TEST (Solo Dev) ---
if (config.nodeEnv === 'development') {
  app.post('/test/process-commissions', testController.processCommissions);
  app.post('/test/force-release', testController.forceRelease);
  app.post('/test/reset-balance', testController.resetBalance);
}

// --- 3. RUTAS CON AUTH OPCIONAL O PÚBLICAS ---
// Ponemos payments aquí para que el checkout de invitados funcione
app.use('/api/payments', paymentsRouter);
app.use('/api', authRoutes); // Contiene /login, /verify, etc.

// --- 4. RUTAS PROTEGIDAS (Las que tienen middlewares estrictos adentro) ---
// Estas van al final porque sus archivos internos usan router.use(jwtAuthMiddleware)
app.use('/api', userRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/balances', balanceRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/admin/payouts', adminPayoutRoutes);

// --- SWAGGER DOCS ---
if (config.nodeEnv !== 'production') {
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Fintech API',
        version: '1.0.0',
        description: 'API para gestión de productos digitales y comisiones',
      },
      servers: [{ url: `http://localhost:${config.port}`, description: 'Local Dev' }],
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
    apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
  };
  const swaggerSpecs = swaggerJsdoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));
}

// --- ERROR HANDLING ---
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new AppError('Ruta no encontrada', 404));
});

app.use((err: any, req: Request, res: Response, _: NextFunction) => {
  if (err instanceof AppError) {
    logger.warn(
      { status: err.statusCode, message: err.message, path: req.path },
      'Error controlado'
    );
    return res.status(err.statusCode).json({ success: false, error: err.message });
  }

  const statusCode = err.status || 500;
  logger.error({ error: err.message, stack: err.stack, path: req.path }, 'Error inesperado');

  res.status(statusCode).json({
    success: false,
    error: err.message || 'Error interno del servidor',
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
  });
});

// --- CRON JOBS ---
cron.schedule('0 0 * * *', async () => {
  try {
    const result = await ReleaseService.processPendingBalances();
    logger.info({ ordersProcessed: result.count }, 'SISTEMA: Liberación de saldos completada');
  } catch (error: any) {
    logger.error({ error: error.message }, 'SISTEMA: Error en Cron Job');
  }
});

cron.schedule('0 3 * * *', async () => {
  await AuthCleanupService.cleanExpiredTokens();
});

// --- START SERVER ---
const server = app.listen(config.port, () => {
  logger.info(`🚀 Servidor en puerto ${config.port} (${config.nodeEnv})`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    logger.info('Servidor HTTP cerrado.');
    process.exit(0);
  });
});

export { app };
