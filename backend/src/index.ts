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

// --- HELMET & SECURITY ---
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net', 'https://*.mercadopago.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://images.unsplash.com', 'https://via.placeholder.com'],
        connectSrc: ["'self'", 'https://api.tu-dominio.com', 'wss://tu-dominio.com', 'https://*.mercadopago.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://*.mercadopago.com'],
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
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: config.cors.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// --- RATE LIMITING ---
app.use('/api/login', loginLimiter);
app.use('/api/refresh', refreshLimiter);

// --- RUTAS ESPECIALES ---
// Nota: En producción deberías proteger estas rutas o eliminarlas
app.post('/test/process-commissions', testController.processCommissions);
app.post('/test/force-release', testController.forceRelease);
app.post('/test/reset-balance', testController.resetBalance);

app.post('/api/payments/webhook', handleWebhook); // Webhook público

// --- RUTAS DE LA API ---
app.use('/api', apiLimiter);
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/payments', paymentsRouter);
app.use('/api/balances', balanceRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/admin/payouts', adminPayoutRoutes);

// --- HEALTH & STATUS ---
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
/**
 * Liberación de saldos automática a medianoche
 */
cron.schedule('0 0 * * *', async () => {
  const startTime = Date.now();
  logger.info('SISTEMA: Iniciando proceso diario de liberación de saldos...');

  try {
    // Capturamos el resultado del servicio
    const result = await ReleaseService.processPendingBalances();

    const duration = Date.now() - startTime;

    // Log detallado del éxito
    logger.info(
      {
        duration: `${duration}ms`,
        ordersProcessed: result.count,
        totalAmount: result.totalAmount, // Ejemplo: { ARS: 50000, USD: 200 }
      },
      'SISTEMA: Liberación de saldos completada con éxito'
    );
  } catch (error: any) {
    logger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      'SISTEMA: Error crítico en Cron Job de liberación'
    );
  }
});

// Ejecutar limpieza de tokens cada día a la medianoche
cron.schedule('0 3 * * *', async () => {
  await AuthCleanupService.cleanExpiredTokens();
});

// --- START SERVER ---
const server = app.listen(config.port, () => {
  logger.info(`🚀 Servidor en puerto ${config.port} (${config.nodeEnv})`);

  // Ejecución inicial con log controlado
  ReleaseService.processPendingBalances()
    .then(res => logger.info({ count: res.count }, 'SISTEMA: Liberación inicial completada'))
    .catch(err => logger.error('SISTEMA: Error en liberación inicial post-arranque', err));
});

// --- GRACEFUL SHUTDOWN ---
process.on('SIGTERM', () => {
  logger.info('SIGTERM recibido: Cerrando servidor HTTP de forma segura...');
  server.close(() => {
    logger.info('Servidor HTTP cerrado.');
    process.exit(0);
  });
});

export { app };
