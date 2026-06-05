import { z } from 'zod';
import dotenv from 'dotenv';

import logger from '../utils/logger';

// Allowed schemas for SQL injection prevention
const ALLOWED_SCHEMAS = ['public', 'crema'];

function getValidatedSchema(schemaFromEnv: string | undefined): string {
  const schema = schemaFromEnv || 'public';
  if (!ALLOWED_SCHEMAS.includes(schema)) {
    logger.warn(
      { schema, allowed: ALLOWED_SCHEMAS },
      'Invalid schema from config, falling back to public'
    );
    return 'public';
  }
  return schema;
}

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SECRET_JWT_KEY: z.string().min(32),
  SECRET_REFRESH_JWT_KEY: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('10m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
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
  BRAND_NAME: z.string().default('Crema').transform(s => s.trim()),
  OG_IMAGE_DEFAULT: z.string().default('').transform(s => s.trim()),
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
  FORCE_RELEASE_ON_STARTUP: z.boolean().default(false),
  // --- AI Configuration ---
  LLM_PROVIDER: z.enum(['openai', 'ollama', 'anthropic', 'gemini', 'simulator']).default('openai'),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().optional().default('gpt-4o-mini'),
  OPENAI_EMBEDDING_MODEL: z.string().optional().default('text-embedding-3-small'),
  OLLAMA_BASE_URL: z.string().optional().default(''),
  USE_OLLAMA: z.coerce.boolean().optional(),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().optional().default('claude-3-haiku-20240307'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().optional().default('gemini-1.5-flash'),
  // --- AI Memory Configuration ---
  MEMORY_QUOTA_MAX: z.coerce.number().default(10000),
  MEMORY_LRU_EVICT_BATCH: z.coerce.number().default(100),
  // --- Blockonomics Configuration ---
  BLOCKONOMICS_API_KEY: z.string().optional().default(''),
  BLOCKONOMICS_CALLBACK_URL: z.string().optional().default(''),
  BLOCKONOMICS_WEBHOOK_SECRET: z.string().optional().default(''),
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
  logger.error(
    { error: parsedEnv.error.format() },
    'Invalid environment variables'
  );
  process.exit(1);
}

// Use validated data or provide safe fallback
// In test mode with invalid config, we use the parsedEnv.data which may have issues
// but this maintains backward compatibility for tests
const env = parsedEnv.success 
  ? parsedEnv.data 
  : rawData as unknown as z.infer<typeof envSchema>;

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
    schema: getValidatedSchema(env.DB_SCHEMA), // Validated against allowlist
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
    host: env.REDIS_HOST || 'localhost',
    port: env.REDIS_PORT || 6379,
    password: env.REDIS_PASSWORD,
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
  brandName: env.BRAND_NAME,
  ogImageDefault: env.OG_IMAGE_DEFAULT,
  recaptchaSecretKey: env.RECAPTCHA_SECRET_KEY,
  passwordPepper: (() => {
    const pepper = process.env.PASSWORD_PEPPER;
    if (!pepper) {
      if (env.NODE_ENV === 'production') {
        throw new Error('PASSWORD_PEPPER environment variable is required in production');
      }
      return 'dev_pepper_fallback_local';
    }
    return pepper;
  })(),
  // Helper for repositories to get validated schema
  getValidatedSchema,
  // Export allowed schemas for reference
  allowedSchemas: ALLOWED_SCHEMAS,
  storage: {
    maxGlobalSizeMb: env.MAX_GLOBAL_UPLOAD_SIZE_MB,
    maxGlobalSizeBytes: env.MAX_GLOBAL_UPLOAD_SIZE_MB * 1024 * 1024, // Derived from MB setting
  },
  ai: {
    // LLM Provider selection: 'openai' | 'ollama' | 'anthropic' | 'gemini' | 'simulator'
    provider: (env.LLM_PROVIDER || 'openai') as 'openai' | 'ollama' | 'anthropic' | 'gemini' | 'simulator',
    // OpenAI Configuration
    openaiApiKey: env.OPENAI_API_KEY || '',
    openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',
    openaiEmbeddingModel: env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    // Anthropic (Claude) Configuration
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
    // Google Gemini Configuration
    geminiApiKey: env.GEMINI_API_KEY || '',
    geminiModel: env.GEMINI_MODEL || 'gemini-1.5-flash',
    // Ollama Configuration
    ollamaBaseUrl: env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaEnabled: env.USE_OLLAMA === true,
    // Default models for Ollama
    defaultOllamaChatModel: 'qwen2.5:3b',
    defaultOllamaEmbeddingModel: 'nomic-embed-text',
    // Memory quota: max embeddings per user (LRU eviction when exceeded)
    memoryQuotaMax: env.MEMORY_QUOTA_MAX || 10000,
    memoryLruEvictBatch: env.MEMORY_LRU_EVICT_BATCH || 100,
  },
  blockonomics: {
    apiKey: env.BLOCKONOMICS_API_KEY,
    callbackUrl: env.BLOCKONOMICS_CALLBACK_URL,
    webhookSecret: env.BLOCKONOMICS_WEBHOOK_SECRET,
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
