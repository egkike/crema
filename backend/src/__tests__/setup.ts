import { vi } from 'vitest';
import bcrypt from 'bcrypt';

const MOCK_PASSWORD_HASH = bcrypt.hashSync('p1' + 'test-pepper', 10);

// --- CONFIG MOCK ---
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

// --- REPOSITORY MOCKS ---

export const userRepositoryMock = {
  getUsers: vi.fn(async () => [
    { id: 'admin-uuid', username: 'admin', level: 99 },
    { id: 'user-uuid', username: 'kike', level: 2 },
  ]),
  getUserSessions: vi.fn(async () => [
    { id: 'sess-1', last_active: new Date(), device: 'Test Browser' },
  ]),
  findByCredentials: vi.fn(async (email: string) => {
    const isAdmin = email.includes('admin');
    return {
      id: isAdmin ? 'admin-uuid' : 'user-uuid',
      email,
      level: isAdmin ? 99 : 2,
      active: 1,
      password: MOCK_PASSWORD_HASH,
    };
  }),
  getById: vi.fn(async (id: string) => ({
    id,
    level: id === 'admin-uuid' ? 99 : 2,
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
  getProductById: vi.fn(async (id: string) => ({
    id,
    creator_id: 'user-uuid',
    size_bytes: 100,
    status: 'published',
    type: 'course',
    prices: [{ amount: 100, currency: 'ARS' }],
  })),
  getProductByIdOrSlug: vi.fn(async (id: string) => ({
    id,
    creator_id: 'user-uuid',
    title: 'Test Product',
    status: 'published',
    type: 'course',
    prices: [{ amount: 100, currency: 'ARS' }],
    content_url: 'https://cdn.test.com/file.zip',
  })),
  getProductsByCreator: vi.fn().mockResolvedValue([]),
  getPublicProducts: vi.fn().mockResolvedValue([]),
  getAvailableForAffiliate: vi.fn().mockResolvedValue([]),
  updateProduct: vi.fn().mockResolvedValue({ id: 'updated-prod' }),
  deleteProduct: vi.fn().mockResolvedValue(true),
  // Añadimos métodos que usa el controlador de contenido
  getUserProductProgress: vi.fn(async () => ({
    percent: 0,
    total_lessons: 10,
    completed_lessons: 0,
  })),
  getProductWithNestedContent: vi.fn(async id => ({ id, title: 'Course', modules: [] })),
};

// --- CORRECCIÓN CRÍTICA: Nombre de función verifyAccess ---
export const orderRepositoryMock = {
  verifyAccess: vi.fn(async (userId: string, productId: string) => {
    return {
      isOwner: productId === 'id-propia' || userId === 'admin-uuid',
      hasPaid: productId === 'id-comprada',
    };
  }),
};

export const subscriptionRepositoryMock = {
  getCreatorPlanLimits: vi.fn(async () => ({
    planName: 'Pro',
    features: { storage_mb: 1024, max_products: 100, custom_fee_percent: 10 },
    allowedTypes: ['course', 'digital_download', 'membership'],
    currentStorageBytes: 0,
  })),
  getUserStorageUsage: vi.fn().mockResolvedValue(0),
};

export const configRepositoryMock = {
  getUserLevels: vi.fn(async () => ({ GUEST: 0, USER: 1, CREATOR: 2, STAFF: 50, ADMIN: 99 })),
  getSetting: vi.fn(async key => (key === 'min_global_affiliate_commission' ? '10' : 'ARS')),
  getConfigsByCurrency: vi.fn(async () => ({ fee_percent: '0.1' })),
};

// --- SERVICE MOCKS ---

// Mockeamos AccessService porque es lo que usa el controlador de contenido
export const AccessServiceMock = {
  getProtectedContent: vi.fn(async (_userId, _productId) => ({
    has_structured_content: false,
    contentUrl: 'https://cdn.test.com/file.zip',
    title: 'Test Product',
    type: 'course',
  })),
  evaluateGuaranteeStatus: vi.fn().mockResolvedValue(undefined),
  // Si tu controlador usa getProtectedLesson, añádela también aquí:
  getProtectedLesson: vi.fn(async (_userId, _lessonId) => ({
    id: _lessonId,
    title: 'Lección de prueba',
    contentUrl: 'https://youtube.com/watch?v=123',
  })),
};

// --- APLICACIÓN DE MOCKS ---

vi.mock('../repositories/user.repository', () => ({ userRepository: userRepositoryMock }));
vi.mock('../repositories/product.repository', () => ({ productRepository: productRepositoryMock }));
vi.mock('../repositories/order.repository', () => ({ orderRepository: orderRepositoryMock }));
vi.mock('../repositories/subscription.repository', () => ({
  subscriptionRepository: subscriptionRepositoryMock,
}));
vi.mock('../repositories/config.repository', () => ({ configRepository: configRepositoryMock }));
vi.mock('../repositories/payout_method.repository', () => ({
  payoutMethodRepository: { getByUserId: vi.fn(async () => [{ currency: 'ARS' }]) },
}));

vi.mock('../services/access.service', () => ({ AccessService: AccessServiceMock }));

// --- RESTO DE MOCKS (DB, LOGS, ETC) ---
const dbResponse = { rows: [], rowCount: 0 };
vi.mock('../db/postgres', () => ({
  default: { query: vi.fn().mockResolvedValue(dbResponse) },
  pool: {
    query: vi.fn().mockResolvedValue(dbResponse),
    connect: vi.fn(() => ({ query: vi.fn().mockResolvedValue(dbResponse), release: vi.fn() })),
    on: vi.fn(),
  },
}));

vi.mock('../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

export const extractCookies = (res: any) => {
  const cookies = res.headers['set-cookie'] || [];
  return cookies.map((c: string) => c.split(';')[0]).join('; ');
};
