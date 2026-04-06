# SDD - DESIGN: frontend-admin

**Change**: frontend-admin  
**Versión**: 1.0  
**Fecha**: Abril 2026  
**Estado**: Draft para revisión

---

## 1. Arquitectura del Proyecto

### 1.1 Estructura de Archivos

```
frontend-admin/
├── src/
│   ├── components/
│   │   ├── common/           # Componentes compartidos
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── Loader.tsx
│   │   ├── layout/           # Layout components
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── Layout.tsx
│   │   ├── dashboard/        # Componentes específicos del dashboard
│   │   │   ├── MetricCard.tsx
│   │   │   ├── ChartCard.tsx
│   │   │   └── RetentionChart.tsx
│   │   ├── users/             # Componentes de usuarios
│   │   ├── products/           # Componentes de productos
│   │   ├── orders/             # Componentes de órdenes
│   │   ├── payouts/            # Componentes de payouts
│   │   └── ai/                 # Componentes de AI stats
│   │
│   ├── pages/
│   │   ├── index.tsx          # Dashboard
│   │   ├── login.tsx           # Login
│   │   ├── users/
│   │   │   ├── index.tsx       # Lista usuarios
│   │   │   └── [id].tsx        # Detalle usuario
│   │   ├── products/
│   │   │   ├── index.tsx       # Lista productos
│   │   │   └── [id].tsx        # Detalle producto
│   │   ├── orders/
│   │   │   ├── index.tsx       # Lista órdenes
│   │   │   └── [id].tsx        # Detalle orden
│   │   ├── refunds/
│   │   │   └── index.tsx       # Lista refunds
│   │   ├── balance/
│   │   │   └── index.tsx       # Balance plataforma
│   │   ├── payouts/
│   │   │   └── index.tsx       # Payouts pending
│   │   ├── commissions/
│   │   │   └── index.tsx       # Stats comisiones
│   │   ├── ai-stats/
│   │   │   └── index.tsx       # AI usage
│   │   ├── reports/
│   │   │   └── index.tsx       # Exports
│   │   ├── config/
│   │   │   └── index.tsx       # Settings
│   │   └── lec/
│   │       └── index.tsx       # LEC compliance
│   │
│   ├── components/ui/          # Shadcn/UI components (futuro)
│   │
│   ├── hooks/
│   │   ├── useAuth.ts          # Auth hook
│   │   ├── useApi.ts           # Generic API hook
│   │   └── usePagination.ts    # Pagination hook
│   │
│   ├── stores/                 # Zustand stores
│   │   ├── authStore.ts        # Auth state
│   │   ├── uiStore.ts          # UI state (sidebar, theme)
│   │   └── filtersStore.ts     # Global filters
│   │
│   ├── services/               # API services
│   │   ├── api.ts              # Generic fetch wrapper
│   │   ├── auth.ts             # Auth endpoints
│   │   ├── admin.ts            # Admin endpoints
│   │   ├── users.ts            # User endpoints
│   │   ├── products.ts          # Product endpoints
│   │   ├── orders.ts            # Order endpoints
│   │   ├── payouts.ts           # Payout endpoints
│   │   └── ai.ts               # AI endpoints
│   │
│   ├── types/                  # TypeScript types
│   │   ├── api.ts              # Generic API types
│   │   ├── user.ts             # User types
│   │   ├── product.ts          # Product types
│   │   ├── order.ts            # Order types
│   │   └── admin.ts            # Admin types
│   │
│   ├── utils/
│   │   ├── format.ts           # Format helpers (currency, date)
│   │   ├── validation.ts       # Zod schemas
│   │   └── constants.ts        # Constants
│   │
│   ├── styles/
│   │   └── globals.css         # Global styles + Tailwind
│   │
│   └── env.ts                  # Environment variables
│
├── public/
│   └── favicon.ico
│
├── astro.config.mjs
├── tailwind.config.mjs
├── tsconfig.json
└── package.json
```

---

## 2. Integración con API

### 2.1 Cliente HTTP

```typescript
// src/services/api.ts
const API_BASE = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000';

class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string) {
    this.accessToken = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.accessToken && {
        'Authorization': `Bearer ${this.accessToken}`,
      }),
      ...options.headers,
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Intentar refresh token
      const refreshed = await this.refreshToken();
      if (refreshed) {
        return this.request(endpoint, options);
      }
      // Redirect to login
      window.location.href = '/login';
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'API Error');
    }

    return response.json();
  }

  get<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  post<T>(endpoint: string, data?: unknown) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  patch<T>(endpoint: string, data?: unknown) {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient(API_BASE);
```

### 2.2 Endpoints del Admin

```typescript
// src/services/admin.ts
import { api } from './api';

// Dashboard
export const getFinancialHealth = (currency: string, from?: string, to?: string) =>
  api.get(`/api/admin/financial-health?currency=${currency}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`);

export const getPlatformLedger = (currency: string, from?: string, to?: string) =>
  api.get(`/api/admin/ledger?currency=${currency}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`);

export const getRetentionSummary = (currency: string) =>
  api.get(`/api/admin/retention-summary?currency=${currency}`);

// Payouts
export const getPayoutsPending = () => api.get('/api/admin/payouts/pending');

export const approvePayout = (id: string, receipt?: string) =>
  api.patch(`/api/admin/payouts/${id}/status`, { status: 'completed', transaction_receipt: receipt });

export const rejectPayout = (id: string, reason: string) =>
  api.patch(`/api/admin/payouts/${id}/status`, { status: 'rejected', reason });

// Products (NEW - G1, G2, G3)
export const getAllProducts = (params: { page?: number; limit?: number; search?: string; type?: string; status?: string }) => {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.type) query.set('type', params.type);
  if (params.status) query.set('status', params.status);
  return api.get(`/api/admin/products?${query.toString()}`);
};

export const getProductById = (id: string) => api.get(`/api/admin/products/${id}`);

export const updateProduct = (id: string, data: Partial<Product>) =>
  api.patch(`/api/admin/products/${id}`, data);

// Orders (NEW - G4, G5)
export const getAllOrders = (params: { page?: number; limit?: number; status?: string; currency?: string; from?: string; to?: string }) => {
  const query = new URLSearchParams();
  // ... similar
  return api.get(`/api/admin/orders?${query.toString()}`);
};

export const getOrderById = (id: string) => api.get(`/api/admin/orders/${id}`);

// Users (STAFF endpoints)
export const getAllUsers = (params: { page?: number; limit?: number; search?: string; level?: string; status?: string }) =>
  api.get(`/api/users/users?${query.toString()}`);

export const getUserById = (id: string) => api.post('/api/users/user/getbyid', { id });

export const updateUser = (id: string, data: Partial<User>) => api.patch('/api/users/user/update', { ...data, userId: id });

export const banUser = (id: string, reason: string) => api.patch('/api/users/user/update', { userId: id, status: 'banned', banReason: reason });

// Exports
export const exportTaxReport = (currency: string) =>
  api.get(`/api/admin/export/tax-report?currency=${currency}`);

export const exportAudit = (currency: string) =>
  api.get(`/api/admin/export/audit?currency=${currency}`);

// LEC
export const getRDProjects = () => api.get('/api/admin/lec/projects');

export const logRDActivity = (projectId: string, hours: number, description: string) =>
  api.post('/api/admin/lec/rd-logs', { projectId, hours, description });

export const getLECCertificationStatus = () => api.get('/api/admin/lec/compliance-status');
```

---

## 3. State Management (Zustand)

### 3.1 Auth Store

```typescript
// src/stores/authStore.ts
import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  fullname: string;
  level: number;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  login: (email: string, password: string) => Promise<void>;
  verify2FA: (code: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    
    const data = await response.json();
    
    if (data.requires2FA) {
      // Set pending login, wait for 2FA
      set({ isLoading: false });
      throw new Error('2FA_REQUIRED');
    }
    
    if (data.access_token) {
      localStorage.setItem('access_token', data.access_token);
      set({ 
        user: data.user, 
        isAuthenticated: true, 
        isLoading: false 
      });
    }
  },

  verify2FA: async (code: string) => {
    const token = localStorage.getItem('access_token');
    const response = await fetch('/api/auth/login/2fa', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ code }),
    });
    
    const data = await response.json();
    
    if (data.access_token) {
      localStorage.setItem('access_token', data.access_token);
      set({ 
        user: data.user, 
        isAuthenticated: true, 
        isLoading: false 
      });
    }
  },

  logout: () => {
    localStorage.removeItem('access_token');
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      set({ isLoading: false });
      return;
    }
    
    try {
      const response = await fetch('/api/users/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const user = await response.json();
        set({ user, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
```

### 3.2 UI Store

```typescript
// src/stores/uiStore.ts
import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  currentPage: string;
  theme: 'dark' | 'light';
  
  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setCurrentPage: (page: string) => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  currentPage: 'dashboard',
  theme: 'dark',

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setTheme: (theme) => set({ theme }),
}));
```

---

## 4. Diseño UI/UX

### 4.1 Theme Configuration (Tailwind)

```typescript
// tailwind.config.mjs
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary - Warm Cream/Orange/Coffee
        cream: {
          50: '#FFF8F0',
          100: '#FFEDD9',
          200: '#FFD9B3',
          300: '#FFC18D',
          400: '#FFA066',
          500: '#FF8040',
          600: '#E66500',
          700: '#CC4D00',
          800: '#993900',
          900: '#662600',
        },
        // Secondary - Coffee
        coffee: {
          50: '#F5F0EB',
          100: '#E8DDD3',
          200: '#D4C4B0',
          300: '#C0AB8D',
          400: '#AC926A',
          500: '#8B7355',
          600: '#6E5A44',
          700: '#514033',
          800: '#342722',
          900: '#170D11',
        },
        // Accent - Orange
        orange: {
          50: '#FFF3E6',
          100: '#FFE0C2',
          200: '#FFCC9E',
          300: '#FFB87A',
          400: '#FFA04D',
          500: '#FF8820',
          600: '#E66B00',
          700: '#CC4D00',
          800: '#993900',
          900: '#662600',
        },
        // Background (Dark Mode)
        background: {
          DEFAULT: '#0F0F0F',
          paper: '#1A1A1A',
          card: '#242424',
          border: '#333333',
        },
        // Text
        text: {
          primary: '#FFFFFF',
          secondary: '#A0A0A0',
          muted: '#666666',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Poppins', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

### 4.2 Layout Base

```astro
---
// src/layouts/AdminLayout.astro
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';

interface Props {
  title: string;
}

const { title } = Astro.props;
---

<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width" />
  <title>{title} | Crema Admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap" rel="stylesheet">
</head>
<body class="bg-background text-text-primary font-sans antialiased">
  <div class="flex h-screen overflow-hidden">
    <!-- Sidebar -->
    <Sidebar />
    
    <!-- Main Content -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <Header />
      
      <main class="flex-1 overflow-y-auto p-6">
        <slot />
      </main>
    </div>
  </div>
</body>
</html>
```

### 4.3 Componentes Base

```tsx
// src/components/common/Button.tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  disabled, 
  loading, 
  children, 
  onClick 
}: ButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background';
  
  const variants = {
    primary: 'bg-crema-500 hover:bg-crema-600 text-white focus:ring-crema-500',
    secondary: 'bg-coffee-600 hover:bg-coffee-700 text-white focus:ring-coffee-500',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
    ghost: 'bg-transparent hover:bg-background-card text-text-secondary hover:text-text-primary',
  };
  
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };
  
  return (
    <button
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${disabled || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
```

---

## 5. Navegación / Rutas

### 5.1 Sidebar Structure

```tsx
// src/components/layout/Sidebar.tsx
const menuItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },
  { label: 'Usuarios', icon: Users, path: '/admin/users', permission: 'STAFF' },
  { label: 'Productos', icon: Package, path: '/admin/products' },
  { label: 'Órdenes', icon: ShoppingCart, path: '/admin/orders' },
  { label: 'Reembolsos', icon: RotateCcw, path: '/admin/refunds' },
  { label: 'Balance', icon: Wallet, path: '/admin/balance' },
  { label: 'Pagos', icon: CreditCard, path: '/admin/payouts' },
  { label: 'Comisiones', icon: Percent, path: '/admin/commissions' },
  { label: 'AI Stats', icon: Sparkles, path: '/admin/ai-stats' },
  { label: 'Reportes', icon: FileText, path: '/admin/reports' },
  { label: 'Configuración', icon: Settings, path: '/admin/config' },
  { label: 'LEC', icon: Scale, path: '/admin/lec', permission: 'ADMIN' },
];
```

### 5.2 Routes (Astro)

```typescript
// src/pages/admin/[...path].astro
export function getStaticPaths() {
  return [
    { params: { path: '' }, props: { component: Dashboard } },
    { params: { path: 'users' }, props: { component: UsersIndex } },
    { params: { path: 'users/[id]' }, props: { component: UsersDetail } },
    // ... todos los paths
  ];
}
```

---

## 6. Features Técnicas

### 6.1 Pagination

```typescript
// src/hooks/usePagination.ts
export function usePagination(total: number, perPage: number = 20) {
  const [page, setPage] = useState(1);
  
  const totalPages = Math.ceil(total / perPage);
  const offset = (page - 1) * perPage;
  
  return { page, setPage, totalPages, offset, perPage };
}
```

### 6.2 Protected Route

```tsx
// src/components/auth/ProtectedRoute.tsx
export function ProtectedRoute({ children, requiredLevel }: Props) {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  
  if (isLoading) return <Loading />;
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  if (requiredLevel && user.level < requiredLevel) {
    return <Navigate to="/admin" />;
  }
  
  return children;
}
```

---

## 7. Manejo de Errores

### 7.1 API Error Handler

```typescript
// src/services/api.ts (continuación)
interface ApiError {
  statusCode: number;
  message: string;
}

export function handleApiError(error: unknown): ApiError {
  if (error instanceof Error) {
    return {
      statusCode: 500,
      message: error.message,
    };
  }
  return {
    statusCode: 500,
    message: 'Error desconocido',
  };
}
```

### 7.2 Toast Notifications

```typescript
// Usar algún library como sonner o react-hot-toast
import { toast } from 'sonner';

toast.success('Usuario actualizado');
toast.error('Error al guardar');
```

---

## 8. Testing Strategy

### 8.1 Unit Tests (Vitest)

- Componentes de UI
- Zustand stores
- Utilidades (format, validation)

### 8.2 Integration Tests (Playwright)

- Login + 2FA flow
- Navegación completa
- Export CSV

---

## 9. Dependencias Requeridas

```json
{
  "dependencies": {
    "zustand": "^5.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.15.0",
    "@tanstack/react-table": "^8.21.0",
    "react-hook-form": "^7.54.0",
    "@hookform/resolvers": "^3.9.0",
    "zod": "^3.24.0",
    "sonner": "^1.7.0",
    "lucide-react": "^0.468.0",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8",
    "@vitejs/plugin-react": "^4.3.4"
  }
}
```

---

## 10. Definition of Done - Design

- [x] Estructura de archivos definida
- [x] Integración API documentada
- [x] State management especificado
- [x] UI/UX diseño establecido (dark mode, warm colors)
- [x] Navegación documentada
- [x] Features técnicas descritas
- [x] Dependencias listadas

---

**Design completado**: Abril 2026  
**Próximo paso**: Tasks - Desglose de tareas