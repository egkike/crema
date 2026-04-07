// API Client for Admin Panel
const API_BASE_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000/api';

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | undefined>;
}

class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;
  
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

  // Get token from cookie/localStorage
  const token = typeof window !== 'undefined' 
    ? document.cookie.split('; ').find(row => row.startsWith('access_token='))?.split('=')[1]
    : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.error || errorData.message || 'Request failed', errorData);
  }

  return response.json();
}

// Products API
export const productsApi = {
  list: (params?: {
    search?: string;
    type?: string;
    status?: string;
    creator_id?: string;
    page?: number;
    limit?: number;
  }) => request<{ success: boolean; data: unknown[]; pagination: unknown }>('/admin/products', { params }),

  get: (id: string) => request<{ success: boolean; data: unknown }>(`/admin/products/${id}`),

  update: (id: string, data: {
    title?: string;
    description?: string;
    status?: string;
    affiliate_commission_percent?: number;
  }) => request<{ success: boolean; data: unknown }>(`/admin/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
};

// Orders API
export const ordersApi = {
  list: (params?: {
    status?: string;
    currency?: string;
    from?: string;
    to?: string;
    buyer_id?: string;
    product_id?: string;
    page?: number;
    limit?: number;
  }) => request<{ success: boolean; data: unknown[]; pagination: unknown }>('/admin/orders', { params }),

  get: (id: string) => request<{ success: boolean; data: unknown }>(`/admin/orders/${id}`),
};

// Commissions API
export const commissionsApi = {
  stats: () => request<{ success: boolean; data: unknown }>('/admin/commissions/stats'),
  topProducts: (limit?: number) => request<{ success: boolean; data: unknown[] }>('/admin/commissions/top-products', { 
    params: limit ? { limit } : undefined 
  }),
};

// Auth API
export const authApi = {
  login: (credentials: { username: string; password: string }) => 
    request<{ success: boolean; user?: unknown; requires2FA?: boolean; access_token?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  verify2FA: (code: string) =>
    request<{ success: boolean; user?: unknown }>('/auth/login/2fa', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
};

// Dashboard API
export const dashboardApi = {
  financialHealth: () => request<{ success: boolean; data: unknown }>('/admin/financial-health'),
  ledger: (params?: { from?: string; to?: string; currency?: string }) => 
    request<{ success: boolean; data: unknown[] }>('/admin/ledger', { params }),
  retentionSummary: (currency?: string) => request<{ success: boolean; data: unknown }>('/admin/retention-summary', {
    params: currency ? { currency } : undefined
  }),
  userStats: (userId: string) => request<{ success: boolean; data: unknown }>(`/admin/user-stats/${userId}`),
};

// Audit Logs API
export const auditApi = {
  list: (params?: {
    from?: string;
    to?: string;
    action?: string;
    admin_id?: string;
    page?: number;
    limit?: number;
  }) => request<{ success: boolean; data: unknown[]; pagination: unknown }>('/admin/audit-logs', { params }),
};

export default {
  products: productsApi,
  orders: ordersApi,
  commissions: commissionsApi,
  auth: authApi,
  dashboard: dashboardApi,
  audit: auditApi,
};