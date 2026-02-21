import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { initMainWorker, closeWorker } from './queues/main.worker';
import { initScheduler, closeScheduler } from './queues/scheduler';
import swaggerSpecs from './swagger';
import { loginLimiter, refreshLimiter, apiLimiter } from './middlewares/rateLimit/rateLimit';
import { AppError } from './errors/AppError';
import { config } from './config/index';
import logger from './utils/logger';
import { ReleaseService } from './services/release.service';
// Importación de rutas
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import productsRoutes from './routes/products.routes';
import paymentsRouter from './routes/payments.routes';
import balanceRoutes from './routes/balance.routes';
import refundRoutes from './routes/refund.routes';
import payoutRoutes from './routes/payout.routes';
import adminRoutes from './routes/admin.routes';
import payoutMethodRoutes from './routes/payout_method.routes';
import affiliateRoutes from './routes/affiliate.routes';

const app = express();

// --- CONFIGURACIÓN DE PROXY Y PARSERS ---
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- HELMET & SECURITY (Completo como lo tenías) ---
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
        connectSrc: ["'self'", 'https://*.mercadopago.com'],
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

// --- CORS ---
app.use(
  cors({
    origin: config.cors?.origins || true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// --- RUTAS DE SALUD ---
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

// --- RATE LIMITING (Solo fuera de tests para evitar 429 inesperados) ---
if (config.nodeEnv !== 'test') {
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth/refresh', refreshLimiter);
  app.use('/api', apiLimiter);
}

// --- DEFINICIÓN DE RUTAS ---
app.use('/api/payments', paymentsRouter);
app.use('/api/auth', authRoutes);
app.use('/api', userRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/balances', balanceRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payout-methods', payoutMethodRoutes);
app.use('/api/affiliates', affiliateRoutes);

// --- SWAGGER DOCS ---
if (config.nodeEnv !== 'production') {
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

// --- PROCESOS DE ARRANQUE Y CRONS (Excluidos en Test) ---
if (config.nodeEnv !== 'test') {
  // Ejecución inmediata al arrancar para liberar órdenes pendientes
  (async () => {
    try {
      logger.info('SISTEMA: Ejecutando liberación de saldos inicial (Startup)...');
      const result = await ReleaseService.processPendingBalances(config.forceReleaseOnStartup);
      logger.info({ ordersProcessed: result.count }, 'SISTEMA: Proceso inicial completado');
    } catch (error: any) {
      logger.error({ error: error.message }, 'SISTEMA: Error en ejecución inicial');
    }
  })();

  // Inicializar el motor distribuido
  initMainWorker();
  initScheduler();
}

// --- START SERVER ---
let server: any;
if (config.nodeEnv !== 'test') {
  server = app.listen(config.port, () => {
    logger.info(`🚀 Servidor en puerto ${config.port} (${config.nodeEnv})`);
  });
}

// --- GRACEFUL SHUTDOWN ---
const handleShutdown = async (signal: string) => {
  logger.info(`SISTEMA: Recibida señal ${signal}. Iniciando apagado elegante...`);

  if (server) {
    server.close(async () => {
      logger.info('SISTEMA: Servidor HTTP cerrado.');
      try {
        // Cerramos conexiones de colas en paralelo
        await Promise.all([closeWorker(), closeScheduler()]);
        logger.info('SISTEMA: Apagado completado con éxito. 👋');
        process.exit(0);
      } catch (error: any) {
        logger.error({ error: error.message }, 'SISTEMA: Error durante el cierre de colas');
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export { app };
