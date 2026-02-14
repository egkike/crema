import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import cron from 'node-cron';

import swaggerSpecs from './swagger';
import { loginLimiter, refreshLimiter, apiLimiter } from './middlewares/rateLimit/rateLimit';
import { AppError } from './errors/AppError';
import { config } from './config/index';
import logger from './utils/logger';
import { ReleaseService } from './services/release.service';
import { AuthCleanupService } from './services/auth.cleanup.service';
import { subscriptionRepository } from './repositories/subscription.repository';
import { EmailService } from './services/email.service';
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
  // La variable debe estar aquí para que los crons puedan leerla y modificarla
  let isReleaseTaskRunning = false;

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

  // Programación de tareas cada 30 minutos para liberar órdenes pendientes
  cron.schedule('*/30 * * * *', async () => {
    if (isReleaseTaskRunning) {
      logger.warn(
        'SISTEMA: El cron de liberación se saltó porque el anterior aún está en ejecución.'
      );
      return;
    }

    try {
      isReleaseTaskRunning = true;
      // Usamos debug para el inicio, así solo se ve si activas logs detallados
      logger.debug('SISTEMA: Revisando órdenes para liberar...');

      const result = await ReleaseService.processPendingBalances();

      if (result.count > 0) {
        logger.info({ count: result.count }, 'SISTEMA: Dinero liberado exitosamente');
      } else {
        // Esto confirma que el cron funciona pero no hubo nada que hacer
        logger.debug('SISTEMA: Sin órdenes pendientes para liberar en este ciclo.');
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'SISTEMA: Error crítico en Cron Release');
    } finally {
      isReleaseTaskRunning = false;
    }
  });

  // CRON: Verificación diaria de suscripciones (00:05 AM)
  cron.schedule('5 0 * * *', async () => {
    try {
      logger.info('SISTEMA: Iniciando verificación de suscripciones vencidas...');

      // 1. Avisar a los que vencen en 3 días
      const nearExpiration = await subscriptionRepository.getExpiringSubscriptions(3);
      for (const sub of nearExpiration) {
        await EmailService.sendExpirationWarning(sub.email, sub.fullname, sub.plan_name, 3);
      }

      // 2. Avisar a los que vencen HOY
      const expiresToday = await subscriptionRepository.getExpiringSubscriptions(0);
      for (const sub of expiresToday) {
        await EmailService.sendExpirationWarning(sub.email, sub.fullname, sub.plan_name, 0);
      }

      // 3. Desactivar suscripciones ya pasadas
      const deactivated = await subscriptionRepository.deactivateExpiredSubscriptions();
      if (deactivated.length > 0) {
        logger.info(
          { count: deactivated.length },
          'SISTEMA: Suscripciones desactivadas por vencimiento.'
        );
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'SISTEMA: Error en Cron de Suscripciones');
    }
  });

  // CRON: Limpieza de Tokens expirados
  cron.schedule('0 3 * * *', async () => {
    await AuthCleanupService.cleanExpiredTokens();
  });
}

// --- START SERVER ---
let server: any;
if (config.nodeEnv !== 'test') {
  server = app.listen(config.port, () => {
    logger.info(`🚀 Servidor en puerto ${config.port} (${config.nodeEnv})`);
  });
}

process.on('SIGTERM', () => {
  if (server) {
    server.close(() => {
      logger.info('Servidor HTTP cerrado.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

export { app };
