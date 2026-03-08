import { vi } from 'vitest';
import bcrypt from 'bcrypt';

// UUIDs constantes y válidos para pasar validaciones de Zod
export const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
export const USER_ID = '00000000-0000-0000-0000-000000000002';
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
    { id: ADMIN_ID, username: 'admin', level: 99 },
    { id: USER_ID, username: 'kike', level: 3 },
  ]),
  getUserSessions: vi.fn(async () => [
    { id: 'sess-1', last_active: new Date(), device: 'Test Browser' },
  ]),
  findByCredentials: vi.fn(async (email: string) => {
    const isAdmin = email.includes('admin');
    return {
      id: isAdmin ? ADMIN_ID : USER_ID,
      email,
      level: isAdmin ? 99 : 3,
      active: 1,
      password: MOCK_PASSWORD_HASH,
    };
  }),
  getById: vi.fn(async (id: string) => ({
    id,
    level: id === ADMIN_ID ? 99 : 3,
    active: 1,
  })),
  findRefreshToken: vi.fn(async () => ({
    id: 't',
    user_id: ADMIN_ID,
    expires_at: new Date(Date.now() + 99999),
  })),
  saveRefreshToken: vi.fn().mockResolvedValue(true),
  addActivityLog: vi.fn().mockResolvedValue(true),
};

export const productRepositoryMock = {
  countPublishedByCreator: vi.fn(async () => 0),
  createProduct: vi.fn(async (data: any) => ({
    id: '00000000-0000-0000-0000-000000000099',
    ...data,
    prices: data.prices || [],
  })),
  getProductById: vi.fn(async (id: string) => ({
    id,
    creator_id: USER_ID,
    size_bytes: 100,
    status: 'published',
    title: 'Test Product',
    type: 'course',
    prices: [{ amount: 5000, currency: 'ARS' }],
  })),
  getProductByIdOrSlug: vi.fn(async (id: string) => ({
    id,
    creator_id: USER_ID,
    title: 'Test Product',
    status: 'published',
    type: 'course',
    prices: [{ amount: 5000, currency: 'ARS' }],
    content_url: 'https://cdn.test.com/file.zip',
  })),
  getProductsByCreator: vi.fn().mockResolvedValue([]),
  getPublicProducts: vi.fn().mockResolvedValue([]),
  getAvailableForAffiliate: vi.fn().mockResolvedValue([]),
  updateProduct: vi.fn().mockResolvedValue({ id: 'updated-prod' }),
  deleteProduct: vi.fn().mockResolvedValue(true),
  toggleLessonProgress: vi.fn().mockResolvedValue(undefined),
  getUserProductProgress: vi.fn(async () => ({
    percent: 0,
    total_lessons: 10,
    completed_lessons: 0,
  })),
  getLessonQuiz: vi.fn(async (lessonId: string) => ({
    id: 'quiz-123',
    lesson_id: lessonId,
    passing_score: 70,
    questions: [{ id: 1, text: 'Pregunta 1', options: ['A', 'B'], correct: 0 }],
  })),
  saveQuizAttempt: vi.fn().mockResolvedValue(undefined),
  getUserQuizStatus: vi.fn(async () => ({
    best_score: 0,
    attempts_count: 0,
    has_passed: false,
  })),
  issueCertificate: vi.fn(async (userId: string, productId: string) => ({
    id: 'cert-1',
    user_id: userId,
    product_id: productId,
    certificate_code: 'mock-cert-uuid-' + Math.random(),
    issued_at: new Date(),
  })),
  getCertificateByCode: vi.fn().mockResolvedValue(null),
  getProductWithNestedContent: vi.fn(async id => ({
    id,
    title: 'Course Mock',
    type: 'course',
    modules: [],
  })),
};

export const orderRepositoryMock = {
  verifyAccess: vi.fn(async (userId: string, productId: string) => {
    // El Admin siempre es dueño, o si el producto es marcado como propio en el test
    return {
      isOwner: userId === ADMIN_ID || productId.includes('propia'),
      hasPaid: productId.includes('comprada'),
    };
  }),
  invalidateGuarantee: vi.fn().mockResolvedValue(true),
  getActiveOrderWithBuyer: vi.fn().mockResolvedValue({
    id: 'order-123',
    buyer_email: 'user@test.com',
    buyer_name: 'Test User',
    is_guarantee_eligible: true,
  }),
};

export const subscriptionRepositoryMock = {
  getCreatorPlanLimits: vi.fn(async () => ({
    planName: 'Creador Pro',
    features: {
      storage_mb: 25600,
      max_products: 100,
      custom_fee_percent: 0.07,
    },
    allowedTypes: ['course', 'digital_download', 'membership'],
    currentStorageBytes: 0,
  })),
  getUserStorageUsage: vi.fn().mockResolvedValue(0),
};

export const configRepositoryMock = {
  getUserLevels: vi.fn(async () => ({
    GUEST: 0,
    USER: 1,
    AFFILIATE: 2,
    CREATOR: 3,
    STAFF: 10,
    ADMIN: 99,
  })),
  getSetting: vi.fn(async key => {
    if (key === 'min_global_affiliate_commission') return '5';
    if (key === 'platform_currency') return 'ARS';
    return '7';
  }),
  getConfigsByCurrency: vi.fn(async () => ({ fee_percent: 0.1 })),
};

// --- SERVICE MOCKS ---
export const AccessServiceMock = {
  getProtectedContent: vi.fn(async (_userId, _productId) => ({
    id: _productId,
    has_structured_content: false,
    contentUrl: 'https://cdn.test.com/file.zip',
    title: 'Test Product',
    type: 'course',
    creator_id: USER_ID,
  })),
  evaluateGuaranteeStatus: vi.fn().mockResolvedValue(undefined),
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
