import { z } from 'zod';
import dotenv from 'dotenv';

import logger from '../utils/logger';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SECRET_JWT_KEY: z.string().min(32),
  // Nota: Usamos nombres que coincidan con tu .env
  JWT_ACCESS_EXPIRY: z.string().default('10m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  DAYSOFGUARANTEE: z.coerce.number().default(7),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  DB_SCHEMA: z.string().default('public'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().min(30),
  MERCADO_PAGO_PUBLIC_KEY: z.string().min(30),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().optional(),
  API_BASE_URL: z.string().optional(),
  APP_URL: z.string().default('http://localhost:5173'), // Coincide con tu .env
  RECAPTCHA_SECRET_KEY: z.string().optional().default(''),
  SMTP_HOST: z.string().default('sandbox.smtp.mailtrap.io'),
  SMTP_PORT: z.coerce.number().default(2525),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('"Crema" <noreply@crema.com>'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    '❌ Error en las variables de entorno:',
    JSON.stringify(parsedEnv.error.format(), null, 2)
  );
  process.exit(1);
}

const env = parsedEnv.data;

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  jwt: {
    secret: env.SECRET_JWT_KEY,
    accessTokenExpiry: env.JWT_ACCESS_EXPIRY,
    refreshTokenExpiry: env.JWT_REFRESH_EXPIRY,
  },
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    schema: env.DB_SCHEMA,
  },
  cors: {
    origins: env.CORS_ORIGINS.split(',').map(o => o.trim().replace(/\/$/, '')),
  },
  mercadoPago: {
    accessToken: env.MERCADO_PAGO_ACCESS_TOKEN,
    publicKey: env.MERCADO_PAGO_PUBLIC_KEY,
    webhookSecret: env.MERCADO_PAGO_WEBHOOK_SECRET,
  },
  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.EMAIL_FROM,
  },
  // Limpieza estricta de barras para evitar la "doble barra" en los controladores
  apiBaseUrl: (env.API_BASE_URL || `http://localhost:${env.PORT}`).trim().replace(/\/$/, ''),
  frontendUrl: env.APP_URL.trim().replace(/\/$/, ''),
  recaptchaSecretKey: env.RECAPTCHA_SECRET_KEY,
  passwordPepper: process.env.PASSWORD_PEPPER || 'dev_pepper_fallback_local',
  daysOfGuarantee: env.DAYSOFGUARANTEE
} as const;

if (config.nodeEnv === 'development') {
  logger.info(
    {
      port: config.port,
      apiBaseUrl: config.apiBaseUrl,
      frontendUrl: config.frontendUrl,
    },
    '🔧 Configuración cargada correctamente'
  );
}
