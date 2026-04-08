// API Client for Admin Panel
import { z } from 'zod';

import config from '../config';

const API_BASE_URL = config.apiUrl;

// ============================================================================
// Types - API Response Interfaces
// ============================================================================

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email(),
  fullname: z.string(),
  level: z.number(),
  two_factor_enabled: z.boolean().default(false),
}).strict();

export type User = z.infer<typeof UserSchema>;

export interface Product {
  id: string;
  title: string;
  description: string;
  type: string;
  status: 'draft' | 'published' | 'archived';
  price: number;
  currency: string;
  creator_id: string;
  creator_fullname?: string;
  affiliate_commission_percent: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  buyer_id: string;
  buyer_fullname?: string;
  buyer_email?: string;
  product_id: string;
  product_title?: string;
  affiliate_id?: string;
  affiliate_fullname?: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  payment_method?: string;
  created_at: string;
  paid_at?: string;
  commission_amount?: number;
  platform_fee?: number;
}

export interface CommissionStats {
  totalPaid: number;
  totalPending: number;
  totalRefunded: number;
  byType: {
    affiliate: number;
    creator: number;
    platform: number;
  };
}

export interface TopProduct {
  product_id: string;
  product_title: string;
  total_sales: number;
  total_commission: number;
}

export interface DashboardStats {
  users: {
    total: number;
    active: number;
    newThisMonth: number;
  };
  products: {
    total: number;
    active: number;
    newThisMonth: number;
  };
  orders: {
    total: number;
    totalAmount: number;
    thisMonth: number;
  };
  revenue: {
    ars: number;
    usdt: number;
  };
  commissions: {
    paid: number;
    pending: number;
  };
  payouts: {
    pending: number;
    completed: number;
  };
  taxRetention?: {
    iva: number;
    iibb: number;
  };
}

export interface FinancialHealth {
  totalPaidVolume: number;
  totalPlatformEarnings: number;
  totalPlatformEarningsNet: number;
  totalPayoutsCompleted: number;
  pendingBalance: number;
  discrepanciesCount: number;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  user_id: string;
  user_fullname?: string;
  amount: number;
  currency: string;
  type: 'earning' | 'withdrawal' | 'refund' | 'fee' | 'commission';
  description: string;
  created_at: string;
}

export interface RetentionSummary {
  totalIva: number;
  totalIibb: number;
  byCurrency: Record<string, { iva: number; iibb: number }>;
}

export interface UserStats {
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: string;
  productsBought: string[];
}

export interface AuditLog {
  id: string;
  action: string;
  admin_id: string;
  admin_fullname?: string;
  target_type: string;
  target_id: string;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: PaginationMeta;
}

// ============================================================================
// Zod Schemas - Input Validation
// ============================================================================

const LoginCredentialsSchema = z.object({
  username: z.string().min(3).max(100).regex(/^[a-zA-Z0-9_]+$/, 'Usuario debe ser alfanumérico'),
  password: z.string().min(8).max(200),
}).strict();

const TwoFactorCodeSchema = z.string().regex(/^\d{6}$/, 'Código debe ser de 6 dígitos');

const ProductUpdateSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  affiliate_commission_percent: z.number().int().min(0).max(100).optional(),
}).strict();

const ProductListParamsSchema = z.object({
  search: z.string().max(200).optional(),
  type: z.enum(['course', 'ebook', 'membership', 'audio', 'video', 'software']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  creator_id: z.string().uuid().optional(),
  page: z.number().int().positive().max(1000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

const OrderListParamsSchema = z.object({
  status: z.enum(['pending', 'paid', 'cancelled', 'refunded']).optional(),
  currency: z.enum(['ARS', 'USDT']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  buyer_id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  page: z.number().int().positive().max(1000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

const LedgerParamsSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  currency: z.enum(['ARS', 'USDT']).optional(),
}).strict();

const AuditLogParamsSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  action: z.string().max(100).optional(),
  admin_id: z.string().uuid().optional(),
  page: z.number().int().positive().max(1000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

// ============================================================================
// Helper Functions
// ============================================================================

class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Safe Zod validation with structured error handling
 */
function validateWithZod<T>(schema: z.ZodSchema<T>, data: unknown, errorPrefix: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.flatten();
    throw new ApiError(400, `${errorPrefix}: ${JSON.stringify(errors)}`, errors);
  }
  return result.data;
}

/**
 * Sanitize error messages from the backend to prevent internal details leakage
 * Returns safe, user-friendly messages only
 */
function sanitizeErrorMessage(msg: unknown): string {
  if (!msg || typeof msg !== 'string') {
    return 'Error de conexión';
  }
  
  // Known safe messages from our backend
  const safeMessages: Record<string, string> = {
    'Credenciales inválidas': 'Credenciales incorrectas',
    'Invalid credentials': 'Credenciales incorrectas',
    'Usuario no encontrado': 'Usuario no encontrado',
    'User not found': 'Usuario no encontrado',
    'Password incorrecto': 'Contraseña incorrecta',
    'Invalid password': 'Contraseña incorrecta',
    'Token expired': 'Sesión expirada',
    'Token inválido': 'Sesión inválida',
    'Invalid token': 'Sesión inválida',
    'Account locked': 'Cuenta bloqueada',
    'Account inactive': 'Cuenta inactiva',
    '2FA required': 'Se requiere verificación en dos pasos',
    'Invalid 2FA code': 'Código de verificación inválido',
    'Request failed': 'Error de conexión',
  };
  
  if (safeMessages[msg]) {
    return safeMessages[msg];
  }
  
  // Filter out messages that might contain internal details
  // (too long, contains paths, special chars that might be stack traces)
  if (msg.length > 60 || /[/\\:\n\r\t]/.test(msg)) {
    return 'Error de conexión';
  }
  
  // Return safe generic message for unknown errors
  return 'Error de conexión';
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | undefined> | undefined;
  timeout?: number;
}

const DEFAULT_TIMEOUT = 10000; // 10 seconds

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;
  
  let url = `${API_BASE_URL}${endpoint}`;
  
  // Add query params
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  // Create abort controller with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Note: Backend uses httpOnly cookies for authentication
    // No need to manually set Authorization header - cookies are sent automatically with credentials: 'include'

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...headers,
        ...options.headers,
      },
      credentials: 'include',
      signal: controller.signal,
    });

    // Clear timeout after response
    clearTimeout(timeoutId);

    if (!response.ok) {
      // Sanitize error data to prevent internal details leakage
      const errorData = await response.json().catch(() => ({}));
      
      // Sanitize the error message to prevent leaking internal details
      const rawMessage = errorData.error || errorData.message || 'Request failed';
      const sanitizedMessage = sanitizeErrorMessage(rawMessage);
      
      throw new ApiError(
        response.status,
        sanitizedMessage,
        // Don't expose internal server details
        response.status >= 500 ? undefined : errorData
      );
    }

    return response.json();
  } catch (err) {
    // Clear timeout on error
    clearTimeout(timeoutId);
    
    // Handle timeout and abort errors
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(408, 'Request timeout');
    }
    throw err;
  }
}

// ============================================================================
// API Methods - Products
// ============================================================================

export const productsApi = {
  list: (params?: z.infer<typeof ProductListParamsSchema>) => {
    const validated = params ? ProductListParamsSchema.parse(params) : undefined;
    return request<PaginatedResponse<Product>>('/admin/products', { params: validated });
  },

  get: (id: string) => {
    if (!id || typeof id !== 'string') {
      throw new ApiError(400, 'Invalid product ID');
    }
    return request<ApiResponse<Product>>(`/admin/products/${encodeURIComponent(id)}`);
  },

  update: (id: string, data: z.infer<typeof ProductUpdateSchema>) => {
    if (!id || typeof id !== 'string') {
      throw new ApiError(400, 'Invalid product ID');
    }
    const validated = validateWithZod(ProductUpdateSchema, data, 'Invalid product data');
    return request<ApiResponse<Product>>(`/admin/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(validated),
    });
  },
};

// ============================================================================
// API Methods - Orders
// ============================================================================

export const ordersApi = {
  list: (params?: z.infer<typeof OrderListParamsSchema>) => {
    const validated = params ? OrderListParamsSchema.parse(params) : undefined;
    return request<PaginatedResponse<Order>>('/admin/orders', { params: validated });
  },

  get: (id: string) => {
    if (!id || typeof id !== 'string') {
      throw new ApiError(400, 'Invalid order ID');
    }
    return request<ApiResponse<Order>>(`/admin/orders/${encodeURIComponent(id)}`);
  },
};

// ============================================================================
// API Methods - Commissions
// ============================================================================

export const commissionsApi = {
  stats: () => request<ApiResponse<CommissionStats>>('/admin/commissions/stats'),

  topProducts: (limit?: number) => {
    const params = limit ? { limit: Math.min(Math.max(limit, 1), 50) } : undefined;
    return request<ApiResponse<TopProduct[]>>('/admin/commissions/top-products', { params });
  },
};

// ============================================================================
// API Methods - Auth
// ============================================================================

export const authApi = {
  login: (credentials: z.infer<typeof LoginCredentialsSchema>) => {
    const validated = validateWithZod(LoginCredentialsSchema, credentials, 'Invalid credentials');
    return request<{
      success: boolean;
      user?: User;
      requires2FA?: boolean;
      mustChangePassword?: boolean;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(validated),
    });
  },

  verify2FA: (code: string) => {
    const validatedCode = validateWithZod(TwoFactorCodeSchema, code, 'Invalid 2FA code');
    return request<{ success: boolean; user?: User }>('/auth/login/2fa', {
      method: 'POST',
      body: JSON.stringify({ code: validatedCode }),
    });
  },

  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  
  // Check if user is authenticated (returns user data if cookie valid)
  checkAuth: () => request<ApiResponse<User>>('/auth/me'),
};

// ============================================================================
// API Methods - Dashboard
// ============================================================================

export const dashboardApi = {
  stats: () => request<ApiResponse<DashboardStats>>('/admin/dashboard'),

  financialHealth: () => request<ApiResponse<FinancialHealth>>('/admin/financial-health'),

  ledger: (params?: z.infer<typeof LedgerParamsSchema>) => {
    const validated = params ? LedgerParamsSchema.parse(params) : undefined;
    return request<ApiResponse<LedgerEntry[]>>('/admin/ledger', { params: validated });
  },

  retentionSummary: (currency?: string) => {
    // Validate currency against allowlist to prevent parameter injection
    const allowedCurrencies = ['ARS', 'USDT'];
    const validatedCurrency = currency && allowedCurrencies.includes(currency) ? currency : undefined;
    const params = validatedCurrency ? { currency: validatedCurrency } : undefined;
    return request<ApiResponse<RetentionSummary>>('/admin/retention-summary', { params });
  },

  userStats: (userId: string) => {
    if (!userId || typeof userId !== 'string') {
      throw new ApiError(400, 'Invalid user ID');
    }
    return request<ApiResponse<UserStats>>(`/admin/user-stats/${encodeURIComponent(userId)}`);
  },
};

// ============================================================================
// API Methods - Audit Logs
// ============================================================================

export const auditApi = {
  list: (params?: z.infer<typeof AuditLogParamsSchema>) => {
    const validated = params ? AuditLogParamsSchema.parse(params) : undefined;
    return request<PaginatedResponse<AuditLog>>('/admin/audit-logs', { params: validated });
  },
};

// ============================================================================
// Default Export
// ============================================================================

export default {
  products: productsApi,
  orders: ordersApi,
  commissions: commissionsApi,
  auth: authApi,
  dashboard: dashboardApi,
  audit: auditApi,
};

// ============================================================================
// Demo Data (Development Only)
// ============================================================================

/**
 * Demo stats for development mode only
 * This is tree-shaken in production builds when config.isDev is false
 */
export function getDemoStats(): DashboardStats | null {
  if (config.isDev) {
    return {
      users: { total: 1247, active: 892, newThisMonth: 45 },
      products: { total: 156, active: 89, newThisMonth: 12 },
      orders: { total: 3421, totalAmount: 15420000, thisMonth: 234 },
      revenue: { ars: 8450000, usdt: 12500 },
      commissions: { paid: 2340000, pending: 456000 },
      payouts: { pending: 1230000, completed: 5670000 },
      taxRetention: { iva: 1234567, iibb: 567890 },
    };
  }
  return null;
}