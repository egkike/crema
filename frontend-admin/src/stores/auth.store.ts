import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../lib/api';

interface User {
  id: string;
  username: string;
  email: string;
  fullname: string;
  level: number;
  two_factor_enabled: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requires2FA: boolean;
  loginError: string | null;
  
  // Actions
  login: (username: string, password: string) => Promise<void>;
  verify2FA: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      requires2FA: false,
      loginError: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, loginError: null });
        try {
          const response = await authApi.login({ username, password });
          
          if (response.requires2FA) {
            set({ requires2FA: true, isLoading: false });
          } else if (response.success && response.user) {
            set({ 
              user: response.user as User, 
              isAuthenticated: true, 
              requires2FA: false,
              isLoading: false 
            });
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Login failed';
          set({ loginError: message, isLoading: false });
          throw error;
        }
      },

      verify2FA: async (code: string) => {
        set({ isLoading: true, loginError: null });
        try {
          const response = await authApi.verify2FA(code);
          if (response.success && response.user) {
            set({ 
              user: response.user as User, 
              isAuthenticated: true, 
              requires2FA: false,
              isLoading: false 
            });
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : '2FA verification failed';
          set({ loginError: message, isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch {
          // Ignore logout errors
        } finally {
          set({ 
            user: null, 
            isAuthenticated: false, 
            requires2FA: false,
            loginError: null 
          });
        }
      },

      clearError: () => set({ loginError: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        user: state.user, 
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
);