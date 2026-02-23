import { vi } from 'vitest';
import bcrypt from 'bcrypt';

const MOCK_PASSWORD_HASH = bcrypt.hashSync('p1' + 'test-pepper', 10);

vi.mock('../config/index', () => ({
  config: {
    redis: { host: 'localhost', port: 6379, password: '' },
    jwt: {
      secret: 'static-test-secret-32-chars-long-!!',
      refreshSecret: 'static-refresh-secret-32-chars-long-!!',
      accessTokenExpiry: '1h',
      refreshTokenExpiry: '7d',
      accessTokenMaxAge: 900000,
      refreshTokenMaxAge: 604800000,
    },
    passwordPepper: 'test-pepper',
    nodeEnv: 'test',
    db: { schema: 'public' },
    smtp: { host: 'localhost', port: 587, user: 'test', pass: 'test', from: 'test@crema.com' },
    mercadoPago: { accessToken: 'test' },
    cors: { origins: '*' },
    apiBaseUrl: 'http://localhost:3000',
    frontendUrl: 'http://localhost:5173',
    daysOfGuarantee: 7,
  },
}));

export const userRepositoryMock = {
  getUsers: vi.fn(async () => [
    { id: 'admin-uuid', username: 'admin', level: 99 },
    { id: 'user-uuid', username: 'kike', level: 1 },
  ]),
  getUserSessions: vi.fn(async () => [
    { id: 'sess-1', last_active: new Date(), device: 'Test Browser' },
  ]),
  findByCredentials: vi.fn(async (email: string) => {
    const isAdmin = email.includes('admin');
    return {
      // Usamos 'user-uuid' para el usuario normal, clave para content.test.ts
      id: isAdmin ? 'admin-uuid' : 'user-uuid',
      email,
      level: isAdmin ? 99 : 1, // Admin es > STAFF(50), User es < STAFF
      active: 1,
      password: MOCK_PASSWORD_HASH,
    };
  }),
  getById: vi.fn(async (id: string) => ({
    id,
    level: id === 'admin-uuid' ? 99 : 1,
    active: 1,
  })),
  findRefreshToken: vi.fn(async () => ({
    id: 't',
    user_id: 'admin-uuid',
    expires_at: new Date(Date.now() + 99999),
  })),
  saveRefreshToken: vi.fn().mockResolvedValue(true),
  addActivityLog: vi.fn().mockResolvedValue(true),
};

export const productRepositoryMock = {
  countProductsByCreator: vi.fn(async () => 0),
  createProduct: vi.fn(async (data: any) => ({
    id: 'new-prod',
    ...data,
    prices: data.prices || [],
  })),
  getProductById: vi.fn(async (id: string) => ({ id, creator_id: 'admin-uuid', size_bytes: 100 })),
  getProductByIdOrSlug: vi.fn(async (id: string) => ({
    id,
    creator_id: 'admin-uuid',
    title: 'Test',
    prices: [],
  })),
  getProductsByCreator: vi.fn().mockResolvedValue([]),
  getPublicProducts: vi.fn().mockResolvedValue([]),
  getAvailableForAffiliate: vi.fn().mockResolvedValue([]),
  updateProduct: vi.fn().mockResolvedValue({ id: 'updated-prod' }),
  deleteProduct: vi.fn().mockResolvedValue(true),
};

vi.mock('../repositories/user.repository', () => ({ userRepository: userRepositoryMock }));
vi.mock('../repositories/product.repository', () => ({ productRepository: productRepositoryMock }));

// 1. Mock de ConfigRepository (para los niveles de usuario)
export const configRepositoryMock = {
  // El middleware restrictTo('STAFF') buscará este valor
  getUserLevels: vi.fn(async () => ({
    GUEST: 0,
    USER: 1,
    CREATOR: 2,
    STAFF: 50,
    ADMIN: 99,
  })),
  getSetting: vi.fn(async key => (key === 'min_global_affiliate_commission' ? '10' : 'ARS')),
  getConfigsByCurrency: vi.fn(async () => ({ fee_percent: '0.1' })),
};

// 2. Mock de PayoutMethodRepository (para validar la moneda al crear producto)
export const payoutMethodRepositoryMock = {
  getByUserId: vi.fn(async () => [{ currency: 'ARS' }, { currency: 'USD' }]),
};

// 3. Actualiza el SubscriptionRepository con los campos del middleware
vi.mock('../repositories/subscription.repository', () => ({
  subscriptionRepository: {
    getActiveSubscription: vi.fn().mockResolvedValue({
      status: 'active',
      allowed_types: ['course', 'digital_download', 'membership'], // <--- Requerido por middleware
      features: {
        max_products: 100, // <--- Requerido por middleware
        storage_mb: 1024, // <--- Requerido por middleware
        custom_fee_percent: 0.05,
      },
    }),
    getUserStorageUsage: vi.fn().mockResolvedValue(0),
  },
}));

// Aplica los nuevos mocks
vi.mock('../repositories/config.repository', () => ({ configRepository: configRepositoryMock }));
vi.mock('../repositories/payout_method.repository', () => ({
  payoutMethodRepository: payoutMethodRepositoryMock,
}));

const dbResponse = { rows: [], rowCount: 0 };
vi.mock('../db/postgres', () => ({
  default: { query: vi.fn().mockResolvedValue(dbResponse) },
  pool: {
    query: vi.fn().mockResolvedValue(dbResponse),
    connect: vi.fn(() => ({ query: vi.fn().mockResolvedValue(dbResponse), release: vi.fn() })),
    on: vi.fn(),
  },
}));

vi.mock('../config/redis', () => ({ redisConnection: { host: 'localhost', port: 6379 } }));
vi.mock('../queues/scheduler', () => ({ mainQueue: { add: vi.fn() } }));
vi.mock('../queues/main.worker', () => ({ default: { on: vi.fn(), close: vi.fn() } }));
vi.mock('../services/release.service', () => ({
  ReleaseService: { processPendingBalances: vi.fn() },
}));
vi.mock('../services/auth.cleanup.service', () => ({
  AuthCleanupService: { cleanExpiredTokens: vi.fn() },
}));
vi.mock('../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn().mockReturnValue({ sendMail: vi.fn(), verify: vi.fn() }) },
}));

export const extractCookies = (res: any) => {
  const cookies = res.headers['set-cookie'] || [];
  return cookies.map((c: string) => c.split(';')[0]).join('; ');
};
