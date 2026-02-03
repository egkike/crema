import { z } from 'zod';
import dotenv from 'dotenv';

import logger from '../utils/logger';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  SECRET_JWT_KEY: z.string().min(32, 'JWT secret debe tener al menos 32 caracteres'),
  TOKEN_TIME: z.string().default('15m'),
  REFRESH_TOKEN_TIME: z.string().default('7d'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  DB_SCHEMA: z.string().default('public'),

  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),

  // Mercado Pago
  MERCADO_PAGO_ACCESS_TOKEN: z.string().min(30, 'Access Token de Mercado Pago inválido'),
  MERCADO_PAGO_PUBLIC_KEY: z.string().min(30, 'Public Key de Mercado Pago inválida'),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().optional(),

  // URL Base para Webhooks y Callbacks
  API_BASE_URL: z.string().url('API_BASE_URL debe ser una URL válida').optional(),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
});

const env = envSchema.parse({
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  SECRET_JWT_KEY: process.env.SECRET_JWT_KEY,
  TOKEN_TIME: process.env.TOKEN_TIME,
  REFRESH_TOKEN_TIME: process.env.REFRESH_TOKEN_TIME,
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_NAME: process.env.DB_NAME,
  DB_SCHEMA: process.env.DB_SCHEMA,
  CORS_ORIGINS: process.env.CORS_ORIGINS,

  MERCADO_PAGO_ACCESS_TOKEN: process.env.MERCADO_PAGO_ACCESS_TOKEN,
  MERCADO_PAGO_PUBLIC_KEY: process.env.MERCADO_PAGO_PUBLIC_KEY,
  MERCADO_PAGO_WEBHOOK_SECRET: process.env.MERCADO_PAGO_WEBHOOK_SECRET,

  API_BASE_URL: process.env.API_BASE_URL,
});

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',

  jwt: {
    secret: env.SECRET_JWT_KEY,
    accessTokenExpiry: env.TOKEN_TIME,
    refreshTokenExpiry: env.REFRESH_TOKEN_TIME,
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
    origins: env.CORS_ORIGINS.split(',').map(o => o.trim()),
  },

  mercadoPago: {
    accessToken: env.MERCADO_PAGO_ACCESS_TOKEN,
    publicKey: env.MERCADO_PAGO_PUBLIC_KEY,
    webhookSecret: env.MERCADO_PAGO_WEBHOOK_SECRET,
  },

  // Esta es la URL que usará el controlador para notificaciones
  apiBaseUrl: env.API_BASE_URL || `http://localhost:${env.PORT}`,
  frontendUrl: env.FRONTEND_URL,
} as const;

if (config.nodeEnv === 'development') {
  logger.info(
    {
      port: config.port,
      apiBaseUrl: config.apiBaseUrl, // Agregado para verificar en el inicio
      dbHost: config.db.host,
      mpAccessToken: config.mercadoPago.accessToken ? '[set]' : '[missing]',
    },
    '🔧 Configuración cargada correctamente'
  );
}
