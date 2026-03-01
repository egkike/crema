import { z } from 'zod';
import dotenv from 'dotenv';

import logger from '../utils/logger';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SECRET_JWT_KEY: z.string().min(32),
  SECRET_REFRESH_JWT_KEY: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('10m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  FORCE_RELEASE_ON_STARTUP: z.preprocess(val => val === 'true', z.boolean()).default(false),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  DB_SCHEMA: z.string().default('public'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().min(30),
  MERCADO_PAGO_PUBLIC_KEY: z.string().min(30),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().optional().default(''),
  API_BASE_URL: z.string().optional(),
  APP_URL: z.string().default('http://localhost:5173'),
  RECAPTCHA_SECRET_KEY: z.string().optional().default(''),
  SMTP_HOST: z.string().default('sandbox.smtp.mailtrap.io'),
  SMTP_PORT: z.coerce.number().default(2525),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('"Crema" <noreply@crema.com>'),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(), // Por si usas Redis con pass en prod
  CLOUDFLARE_ACCOUNT_ID: z.string().optional().default(''),
  CLOUDFLARE_STREAM_KEY_ID: z.string().optional().default(''),
  CLOUDFLARE_STREAM_KEY_SECRET: z.string().optional().default(''),
  // --- VARIABLES MUX ---
  MUX_TOKEN_ID: z.string().min(1),
  MUX_TOKEN_SECRET: z.string().min(1),
  MUX_SIGNING_KEY_ID: z.string().min(1),
  MUX_SIGNING_KEY: z.string().min(1),
  MAX_GLOBAL_UPLOAD_SIZE_MB: z.coerce.number().default(100),
});

const isTest = process.env.NODE_ENV === 'test';

// Forzamos valores fijos para tests que NUNCA dependan del timing de dotenv
const TEST_CONFIG = {
  SECRET_JWT_KEY: 'static-test-secret-32-chars-long-!!',
  SECRET_REFRESH_JWT_KEY: 'static-refresh-secret-32-chars-long-!!',
  DB_USER: 'test_user',
  DB_PASSWORD: 'test_pass',
  DB_NAME: 'test_db',
  MERCADO_PAGO_ACCESS_TOKEN: 'test_access_token_min_30_chars_long',
  MERCADO_PAGO_PUBLIC_KEY: 'test_public_key_min_30_chars_long',
  // Valores fake para tests
  CLOUDFLARE_ACCOUNT_ID: 'test_account_id',
  CLOUDFLARE_STREAM_KEY_ID: 'test_key_id',
  CLOUDFLARE_STREAM_KEY_SECRET: 'test_key_secret',
  // Valores fake para Mux en tests
  MUX_TOKEN_ID: 'test_token_id',
  MUX_TOKEN_SECRET: 'test_token_secret',
  MUX_SIGNING_KEY_ID: 'test_signing_key_id',
  MUX_SIGNING_KEY: 'test_signing_key_base64',
};

// --- TRUCO PARA TESTS ---
// Si estamos en test, creamos un objeto con valores mínimos para que Zod no explote.
// Si no, usamos el process.env real.
const rawData = isTest
  ? { ...process.env, ...TEST_CONFIG } // TEST_CONFIG pisa cualquier variable de entorno en test
  : process.env;

const parsedEnv = envSchema.safeParse(rawData);

if (!parsedEnv.success && !isTest) {
  console.error(
    '❌ Error en las variables de entorno:',
    JSON.stringify(parsedEnv.error.format(), null, 2)
  );
  process.exit(1);
}

// Usamos los datos validados o el rawData si falló en test
const env = parsedEnv.success ? parsedEnv.data : (rawData as any);

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  forceReleaseOnStartup: env.FORCE_RELEASE_ON_STARTUP,
  jwt: {
    secret: env.SECRET_JWT_KEY,
    refreshSecret: env.SECRET_REFRESH_JWT_KEY,
    accessTokenExpiry: env.JWT_ACCESS_EXPIRY,
    refreshTokenExpiry: env.JWT_REFRESH_EXPIRY,
    accessTokenMaxAge: 15 * 60 * 1000, // 15 min
    refreshTokenMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
  },
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    schema: env.DB_SCHEMA || 'public', // Valor seguro para evitar errores en repositorios
  },
  cors: {
    origins: String(env.CORS_ORIGINS || '')
      .split(',')
      .map((o: string) => o.trim().replace(/\/$/, '')),
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
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  streaming: {
    cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareKeyId: env.CLOUDFLARE_STREAM_KEY_ID,
    cloudflareKeySecret: env.CLOUDFLARE_STREAM_KEY_SECRET,
  },
  mux: {
    tokenId: env.MUX_TOKEN_ID,
    tokenSecret: env.MUX_TOKEN_SECRET,
    signingKeyId: env.MUX_SIGNING_KEY_ID,
    signingKey: env.MUX_SIGNING_KEY,
  },
  apiBaseUrl: (env.API_BASE_URL || `http://localhost:${env.PORT}`).trim().replace(/\/$/, ''),
  frontendUrl: (env.APP_URL || '').trim().replace(/\/$/, ''),
  recaptchaSecretKey: env.RECAPTCHA_SECRET_KEY,
  passwordPepper: process.env.PASSWORD_PEPPER || 'dev_pepper_fallback_local',
  storage: {
    maxGlobalSizeMb: env.MAX_GLOBAL_UPLOAD_SIZE_MB,
    maxGlobalSizeBytes: env.MAX_GLOBAL_UPLOAD_SIZE_MB * 1024 * 1024,
  },
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
