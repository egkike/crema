/**
 * Auth Store for Crema Admin Panel
 * 
 * Security: This store does NOT persist authentication tokens.
 * Authentication is handled entirely by httpOnly cookies set by the backend.
 * This store only maintains UI state (user profile, loading states, error messages).
 * 
 * On page load, we check if the user is authenticated by verifying the cookies.
 */

import { create } from 'zustand';

import { authApi, UserSchema, type User } from '../lib/api';
import logger from '../lib/logger';

// Error message mapping for user-friendly messages
const ERROR_MESSAGES: Record<number, string> = {
  400: 'Datos inválidos',
  401: 'Credenciales incorrectas',
  403: 'Acceso denegado',
  408: 'Tiempo de espera agotado',
  429: 'Demasiados intentos. Esperá unos segundos',
  500: 'Error del servidor. Intentá más tarde',
  503: 'Servicio no disponible',
};

function getUserFriendlyError(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    return ERROR_MESSAGES[status] ?? 'Error inesperado';
  }
  if (error instanceof Error) {
    // Only return message if it's a known safe message
    const msg = error.message;
    const safeMessages = [
      'Network request failed',
      'Failed to fetch',
      'Network Error',
      'timeout',
      'ECONNREFUSED',
      'ERR_CONNECTION_REFUSED',
    ];
    // Check if it's a known safe network error
    if (safeMessages.some(safe => msg.toLowerCase().includes(safe.toLowerCase()))) {
      return 'Error de conexión';
    }
    // For any other message, be conservative and don't expose it
    // Check for suspicious patterns that might leak internal info
    if (msg.length > 50 || msg.includes('\\') || msg.includes('/') || msg.includes('\n') || msg.includes(':')) {
      return 'Error de conexión';
    }
    return msg;
  }
  return 'Error de conexión';
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requires2FA: boolean;
  loginError: string | null;
  initialized: boolean;
  
  // Actions
  initialize: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  verify2FA: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set, _get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  requires2FA: false,
  loginError: null,
  initialized: false,

  initialize: async () => {
    if (_get().initialized) return;
    
    set({ isLoading: true });
    
    try {
      // Try to get current user from backend
      // This will succeed only if valid cookie exists
      const response = await authApi.checkAuth();
      
      if (response.success && response.data) {
        const validatedUser = UserSchema.parse(response.data);
        set({ 
          user: validatedUser, 
          isAuthenticated: true,
          initialized: true,
          isLoading: false 
        });
      } else {
        set({ initialized: true, isLoading: false });
      }
    } catch (err) {
      // Log the error for debugging but don't expose details to user
      const errorType = err instanceof Error ? err.constructor.name : 'unknown';
      logger.debug('AuthStore', `Initialize failed: ${errorType}`);
      
      // Not authenticated or cookie expired
      set({ 
        user: null, 
        isAuthenticated: false,
        initialized: true,
        isLoading: false 
      });
    }
  },

  login: async (username: string, password: string) => {
    set({ isLoading: true, loginError: null });
    try {
      const response = await authApi.login({ username, password });
      
      if (response.requires2FA) {
        set({ requires2FA: true, isLoading: false });
      } else if (response.success && response.user) {
        const validatedUser = UserSchema.parse(response.user);
        set({ 
          user: validatedUser, 
          isAuthenticated: true, 
          requires2FA: false,
          isLoading: false 
        });
      }
    } catch (error: unknown) {
      // ALWAYS use getUserFriendlyError to sanitize ALL error messages
      const message = getUserFriendlyError(error);
      set({ loginError: message, isLoading: false });
    }
  },

  verify2FA: async (code: string) => {
    set({ isLoading: true, loginError: null });
    try {
      const response = await authApi.verify2FA(code);
      if (response.success && response.user) {
        const validatedUser = UserSchema.parse(response.user);
        set({ 
          user: validatedUser, 
          isAuthenticated: true, 
          requires2FA: false,
          isLoading: false 
        });
      }
    } catch (error: unknown) {
      // ALWAYS use getUserFriendlyError to sanitize ALL error messages
      const message = getUserFriendlyError(error);
      set({ loginError: message, isLoading: false });
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors - cookies will be cleared regardless
    } finally {
      // Clear local state - cookies are cleared by backend
      set({ 
        user: null, 
        isAuthenticated: false, 
        requires2FA: false,
        loginError: null 
      });
    }
  },

  clearError: () => set({ loginError: null }),
}));