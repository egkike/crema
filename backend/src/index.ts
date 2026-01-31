import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import cron from 'node-cron';

import { testCommissionLogic } from './controllers/test.controller';
import { handleWebhook } from './controllers/payment.controller';
import { loginLimiter, refreshLimiter, apiLimiter } from './middlewares/rateLimit';
import { AppError } from './errors/AppError';
import { config } from './config/index';
import logger from './utils/logger';
import { ReleaseService } from './services/release.service';
// Importamos las rutas
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import productsRoutes from './routes/products.routes';
import paymentsRouter from './routes/payments.routes';
import balanceRoutes from './routes/balance.routes';

const app = express();

// Helmet: añade headers de seguridad recomendados
app.use(
  helmet({
    // CSP ajustado - permite recursos locales + algunos externos comunes
    contentSecurityPolicy: {
      useDefaults: true, // mantiene los valores por defecto seguros
      directives: {
        defaultSrc: ["'self'"], // solo recursos de tu dominio
        //scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'], // sin unsafe-inline/eval
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net'], // permite scripts inline, eval (si usas React/Vue), y CDN ejemplo
        //styleSrc: ["'self'"], // sin unsafe-inline
        styleSrc: ["'self'", "'unsafe-inline'"], // permite estilos inline (necesario para muchos frameworks)
        imgSrc: ["'self'", 'data:', 'https://images.unsplash.com', 'https://via.placeholder.com'], // imágenes locales, data URLs, y ejemplos
        connectSrc: ["'self'", 'https://api.tu-dominio.com', 'wss://tu-dominio.com'], // Si conectas a otra API externa o WebSockets
        fontSrc: ["'self'", 'data:', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'], // fuentes de Google Fonts
        objectSrc: ["'none'"], // bloquea objetos (muy seguro)
        frameAncestors: ["'self'"], // evita clickjacking
        formAction: ["'self'"], // formularios solo a tu dominio
        upgradeInsecureRequests: [], // fuerza HTTPS
      },
    },

    // Otros headers de Helmet (mantén o ajusta según necesites)
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    noSniff: true,
    frameguard: { action: 'deny' },
    hsts:
      config.nodeEnv === 'production'
        ? {
            maxAge: 31536000, // 1 año
            includeSubDomains: true,
            preload: true,
          }
        : false,
  })
);

// Middlewares globales
app.use(express.json());
app.use(cookieParser());

// CORS usando configuración validada
app.use(
  cors({
    origin: config.cors.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Rate limiting específico por ruta
app.use('/api/login', loginLimiter); // Protege login
app.use('/api/refresh', refreshLimiter); // Protege refresh
// Ruta para Test de comisiones
app.post('/test/process-commissions', testCommissionLogic);

// Webhook público y dedicado (sin auth ni rate limit)
app.post('/api/payments/webhook', handleWebhook);

// Rate limiting general para rutas protegidas (opcional)
app.use('/api', apiLimiter); // Aplica a todo /api después de login/refresh

// Rutas públicas (login, logout - sin autenticación)
app.use('/api', authRoutes);

// Rutas protegidas (todas las operaciones de usuarios - con jwt middleware dentro del router)
app.use('/api', userRoutes);
app.use('/api/products', productsRoutes);

// monta el router de pagos (que incluye create-preference con auth)
app.use('/api/payments', paymentsRouter);

app.use('/api/balances', balanceRoutes);

// Ruta de health check (útil para monitoreo y pruebas rápidas)
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    environment: config.nodeEnv,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Ruta raíz simple para confirmar que el servidor está vivo
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Backend Template TS - Todo listo 🚀' });
});

// Swagger UI - Documentación interactiva
// Solo en desarrollo o staging (no en producción real)
if (config.nodeEnv !== 'production') {
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'API Template',
        version: '1.0.0',
        description: 'API REST Template para gestión de usuarios',
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Servidor de desarrollo',
        },
      ],
      components: {
        schemas: {
          ErrorResponse: {
            type: 'object',
            properties: {
              success: {
                type: 'boolean',
                example: false,
              },
              error: {
                type: 'string',
                example: 'Credenciales inválidas',
              },
              // Agrega más campos si tu error tiene (ej: message, details)
            },
            required: ['success', 'error'],
          },
          // Agrega otros schemas si usas $ref en más lugares
        },
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
    apis: [
      './src/routes/*.ts', // Rutas con comentarios JSDoc
      './src/controllers/*.ts', // Controladores con comentarios
      // Agrega más si tienes otros archivos con @swagger
    ],
  };

  const swaggerSpecs = swaggerJsdoc(swaggerOptions);

  // Ruta Swagger solo en dev
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));
} else {
  logger.info('Swagger desactivado en producción (seguridad)');
}

// 404 - Ruta no encontrada (lanzamos AppError para que pase al handler global)
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new AppError('Ruta no encontrada', 404));
});

// Error handler global profesional
app.use((err: any, req: Request, res: Response, _: NextFunction) => {
  // Si es un error controlado (AppError)
  if (err instanceof AppError) {
    logger.warn(
      {
        status: err.statusCode,
        message: err.message,
        path: req.path,
        method: req.method,
      },
      'Error controlado manejado'
    );

    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  // Errores inesperados (cualquier cosa que no sea AppError)
  const statusCode = err.status || 500;
  const message = err.message || 'Error interno del servidor';

  logger.error(
    {
      error: err.message || err.toString(),
      stack: err.stack,
      path: req.path,
      method: req.method,
    },
    'Error inesperado en el servidor'
  );

  // Respuesta segura (más detalles solo en desarrollo)
  const response = {
    success: false,
    error: message,
  };

  if (config.nodeEnv === 'development') {
    Object.assign(response, {
      stack: err.stack,
      details: err.details || null,
    });
  }

  res.status(statusCode).json(response);
});

// --- CONFIGURACIÓN DEL CRON JOB ---
/**
 * Programación de liberación de saldos (Garantía vencida)
 * Se ejecuta todos los días a las 00:00 (Medianoche)
 * Formato: (minuto hora día_del_mes mes día_de_la_semana)
 */
cron.schedule('0 0 * * *', async () => {
  logger.info('SISTEMA: Iniciando proceso automático de liberación de saldos...');
  try {
    await ReleaseService.processPendingBalances();
    logger.info('SISTEMA: Proceso de liberación completado con éxito.');
  } catch (error: any) {
    logger.error({ error: error.message }, 'SISTEMA: Error en el Cron Job de liberación');
  }
});

// Iniciar servidor
const PORT = config.port;

app.listen(PORT, () => {
  logger.info(`🚀 Servidor escuchando en http://localhost:${PORT}`);
  logger.info(`Entorno: ${config.nodeEnv}`);
  logger.info(`CORS permitidos: ${config.cors.origins.join(', ')}`);
});

export { app };
