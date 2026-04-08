import { vi } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const MOCK_PASSWORD_HASH = bcrypt.hashSync('p1' + 'test-pepper', 10);

// Test JWT secrets (must match the config mock above)
const TEST_JWT_SECRET = 'static-test-secret-32-chars-long-!!';
const TEST_REFRESH_SECRET = 'static-refresh-secret-32-chars-long-!!';

/**
 * Generate a valid JWT access token for testing
 */
export const generateTestAccessToken = (payload: {
  id: string;
  username: string;
  email?: string;
  level: number;
  active?: number;
}) => {
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' });
};

/**
 * Generate a valid JWT refresh token for testing
 */
export const generateTestRefreshToken = (payload: {
  id: string;
  username: string;
  email?: string;
  level: number;
}) => {
  return jwt.sign(payload, TEST_REFRESH_SECRET, { expiresIn: '7d' });
};

/**
 * Create mock cookies with valid JWT tokens for testing
 */
export const createMockCookies = (user: { id: string; username: string; email: string; level: number; active?: number }) => {
  const accessToken = generateTestAccessToken({
    id: user.id,
    username: user.username,
    email: user.email,
    level: user.level,
    active: user.active ?? 1,
  });
  const refreshToken = generateTestRefreshToken({
    id: user.id,
    username: user.username,
    email: user.email,
    level: user.level,
  });

  return [
    `access_token=${accessToken}; Path=/; HttpOnly`,
    `refresh_token=${refreshToken}; Path=/; HttpOnly`,
  ].join('; ');
};

// ============================================
// TYPES - Typed Mocks for Services Tests
// ============================================

export interface MockUser {
  id: string;
  email: string;
  username: string;
  level: number;
  active: number;
  password?: string;
  created_at?: Date;
}

export interface MockProduct {
  id: string;
  creator_id: string;
  title: string;
  type: 'course' | 'ebook' | 'digital_download' | 'membership' | 'podcast' | 'software';
  status: 'draft' | 'published' | 'archived';
  prices: Array<{ amount: number; currency: string }>;
  content_url?: string;
  size_bytes?: number;
  is_downloadable?: boolean;
}

export interface MockOrder {
  id: string;
  buyer_id: string;
  product_id: string;
  total_amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected' | 'refunded';
  is_guarantee_eligible: boolean;
  created_at: Date;
}

export interface MockBalance {
  id: string;
  user_id: string;
  available: number;
  pending: number;
  currency: string;
}

export interface MockPayout {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected' | 'cancelled';
  created_at: Date;
}

export interface MockCommission {
  id: string;
  order_id: string;
  recipient_id: string;
  amount: number;
  currency: string;
  type: 'affiliate' | 'platform';
  status: 'pending' | 'released' | 'cancelled';
}

export interface MockAffiliateRate {
  affiliate_id: string;
  product_id: string;
  rate_percent: number;
}

// ============================================
// HELPER FUNCTIONS - Mock Factories
// ============================================

export const createMockUser = (overrides: Partial<MockUser> = {}): MockUser => ({
  id: USER_ID,
  email: 'test@test.com',
  username: 'testuser',
  level: 1,
  active: 1,
  password: MOCK_PASSWORD_HASH,
  ...overrides,
});

export const createMockCreator = (overrides: Partial<MockUser> = {}): MockUser => ({
  id: CREATOR_ID,
  email: 'creator@test.com',
  username: 'creator',
  level: 3,
  active: 1,
  password: MOCK_PASSWORD_HASH,
  ...overrides,
});

export const createMockAdmin = (overrides: Partial<MockUser> = {}): MockUser => ({
  id: ADMIN_ID,
  email: 'admin@test.com',
  username: 'admin',
  level: 99,
  active: 1,
  password: MOCK_PASSWORD_HASH,
  ...overrides,
});

export const createMockProduct = (overrides: Partial<MockProduct> = {}): MockProduct => ({
  id: PRODUCT_ID,
  creator_id: CREATOR_ID,
  title: 'Test Product',
  type: 'course',
  status: 'published',
  prices: [{ amount: 5000, currency: 'ARS' }],
  size_bytes: 1024,
  is_downloadable: false,
  ...overrides,
});

export const createMockDownloadableProduct = (overrides: Partial<MockProduct> = {}): MockProduct => ({
  ...createMockProduct({ type: 'digital_download', is_downloadable: true, ...overrides }),
});

export const createMockOrder = (overrides: Partial<MockOrder> = {}): MockOrder => ({
  id: ORDER_ID,
  buyer_id: USER_ID,
  product_id: PRODUCT_ID,
  total_amount: 5000,
  currency: 'ARS',
  status: 'approved',
  is_guarantee_eligible: true,
  created_at: new Date(),
  ...overrides,
});

export const createMockBalance = (overrides: Partial<MockBalance> = {}): MockBalance => ({
  id: 'balance-1',
  user_id: USER_ID,
  available: 1000,
  pending: 500,
  currency: 'ARS',
  ...overrides,
});

export const createMockPayout = (overrides: Partial<MockPayout> = {}): MockPayout => ({
  id: 'payout-1',
  user_id: USER_ID,
  amount: 1000,
  currency: 'ARS',
  status: 'pending',
  created_at: new Date(),
  ...overrides,
});

export const createMockCommission = (overrides: Partial<MockCommission> = {}): MockCommission => ({
  id: 'commission-1',
  order_id: ORDER_ID,
  recipient_id: AFFILIATE_ID,
  amount: 1500,
  currency: 'ARS',
  type: 'affiliate',
  status: 'pending',
  ...overrides,
});

export const createMockAffiliateRate = (overrides: Partial<MockAffiliateRate> = {}): MockAffiliateRate => ({
  affiliate_id: AFFILIATE_ID,
  product_id: PRODUCT_ID,
  rate_percent: 30,
  ...overrides,
});

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
    ai: {
      provider: 'simulator',
      openaiApiKey: '',
      openaiModel: 'gpt-4o-mini',
      openaiEmbeddingModel: 'text-embedding-3-small',
      anthropicApiKey: '',
      anthropicModel: 'claude-3-haiku-20240307',
      geminiApiKey: '',
      geminiModel: 'gemini-1.5-flash',
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaEnabled: false,
      defaultOllamaChatModel: 'qwen2.5:3b',
      defaultOllamaEmbeddingModel: 'nomic-embed-text',
    },
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
  verifyAccount: vi.fn(async (token: string) => {
    // Mock: token válido es cualquier string de 64 hex chars
    return /^[a-f0-9]{64}$/i.test(token);
  }),
};

export const productRepositoryMock = {
  countPublishedByCreator: vi.fn(async () => 0),
  createProduct: vi.fn(async (data: Partial<MockProduct>) => ({
    id: PRODUCT_ID,
    ...data,
    prices: data.prices || [],
  })),
  getProductById: vi.fn(async (id: string) => ({
    id,
    creator_id: CREATOR_ID,
    size_bytes: 100,
    status: 'published' as const,
    title: 'Test Product',
    type: 'course' as const,
    prices: [{ amount: 5000, currency: 'ARS' }],
  })),
  getProductByIdOrSlug: vi.fn(async (id: string) => ({
    id,
    creator_id: CREATOR_ID,
    title: 'Test Product',
    status: 'published' as const,
    type: 'course' as const,
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
// Mocks para repositories necesarios en tests de integración
// Los servicios que necesitan coverage propio definen sus propios mocks en sus archivos.
// NOTA: El mock de user.repository es CRÍTICO para auth - debe estar aquí
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

// NOTA: AccessService NO se mockea globalmente aquí - los tests unitarios en
// services/access.service.test.ts definen sus propios mocks para coverage

// --- MOCKS FOR REFUNDSERVICE ---
// (Estos se mantienen porque no hay tests directos de estos repositories)
export const balanceRepositoryMock = {
  deductPendingEarnings: vi.fn().mockResolvedValue(true),
  addPendingBalance: vi.fn().mockResolvedValue(true),
};

export const commissionRepositoryMock = {
  getByOrderId: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue({ id: 'comm-1' }),
  updateStatusByOrder: vi.fn().mockResolvedValue(true),
};

export const historyRepositoryMock = {
  createRecordWithClient: vi.fn().mockResolvedValue(true),
  createRecord: vi.fn().mockResolvedValue(true),
};

export const refundRepositoryMock = {
  create: vi.fn().mockResolvedValue({ id: 'refund-1' }),
};

export const platformBalanceRepositoryMock = {
  addToPending: vi.fn().mockResolvedValue(true),
  deductFromPending: vi.fn().mockResolvedValue(true),
};

vi.mock('../repositories/balance.repository', () => ({ balanceRepository: balanceRepositoryMock }));
vi.mock('../repositories/commission.repository', () => ({ commissionRepository: commissionRepositoryMock }));
vi.mock('../repositories/history.repository', () => ({ historyRepository: historyRepositoryMock }));
vi.mock('../repositories/refund.repository', () => ({ refundRepository: refundRepositoryMock }));
vi.mock('../repositories/platform_balance.repository', () => ({ platformBalanceRepository: platformBalanceRepositoryMock }));

vi.mock('../services/payment/PaymentProviderFactory', () => ({
  PaymentProviderFactory: {
    getProvider: vi.fn().mockReturnValue({
      refund: vi.fn().mockResolvedValue(true),
      createPayment: vi.fn().mockResolvedValue({ id: 'payment-1' }),
    }),
  },
}));

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
  default: { 
    info: vi.fn(), 
    error: vi.fn(), 
    warn: vi.fn(), 
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
  },
}));

// --- OTPlib mock (used by twoFactor.service.ts) ---
vi.mock('otplib', () => ({
  generateSecret: () => 'JBSWY3DPEHPK3PXP',
  generateURI: () => 'otpauth://totp/Test:user@test.com?secret=JBSWY3DPEHPK3PXP',
  verifySync: () => true,
}));

// --- QRCode mock (used by twoFactor.service.ts) ---
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,mock')),
  },
}));

export const extractCookies = (res: { headers: Record<string, string | string[] | undefined> }) => {
  const cookies = res.headers['set-cookie'];
  if (!Array.isArray(cookies)) {
    return '';
  }
  return cookies.map((c: string) => c.split(';')[0]).join('; ');
};
