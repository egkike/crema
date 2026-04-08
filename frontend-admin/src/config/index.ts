/**
 * Environment configuration for Crema Admin Panel
 * 
 * Environment variables (set in .env file):
 * - PUBLIC_API_URL: The base URL for the backend API (e.g., https://api.crema.com)
 * - PUBLIC_APP_NAME: Name of the application (default: "Crema")
 * - PUBLIC_APP_ENV: Environment (development, staging, production)
 * - PUBLIC_COOKIE_DOMAIN: Domain for auth cookies (e.g., ".crema.com")
 * 
 * Security Note for Production:
 * The PUBLIC_API_URL will be exposed in the client bundle. For production,
 * recommended setup is a reverse proxy (Nginx/Caddy) serving both frontend
 * and backend from the same domain, so API calls are same-origin:
 *   - Frontend: https://admin.crema.com
 *   - Backend:  https://api.crema.com (or /api path)
 *   
 * With reverse proxy, set PUBLIC_API_URL to relative path '/api'
 * and all cookies/auth will work seamlessly.
 */

interface AppConfig {
  apiUrl: string;
  appName: string;
  appEnv: 'development' | 'staging' | 'production';
  isDev: boolean;
  isProd: boolean;
  cookieDomain: string;
}

function getEnv(key: string, defaultValue: string): string {
  // @ts-expect-error - import.meta.env is typed in Astro
  return import.meta.env[key] ?? defaultValue;
}

function getApiUrl(): string {
  // @ts-expect-error - import.meta.env is typed in Astro  
  const envUrl = import.meta.env.PUBLIC_API_URL;
  
  if (envUrl && envUrl.trim() !== '') {
    // Validate URL format to prevent injection attacks
    const trimmedUrl = envUrl.trim();
    try {
      const url = new URL(trimmedUrl);
      // Only allow http and https
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }
      // Reconstruct URL to normalize and validate
      return `${url.protocol}//${url.host}${url.port ? `:${url.port}` : ''}${url.pathname.replace(/\/+$/, '')}`;
    } catch {
      throw new Error('PUBLIC_API_URL must be a valid HTTP/HTTPS URL');
    }
  }
  
  // Development fallback
  const appEnv = getEnv('PUBLIC_APP_ENV', 'development');
  if (appEnv === 'development') {
    // In development, default to localhost with Vite proxy support
    // Set VITE_PROXY_TARGET=http://localhost:3000 in vite.config for proxy
    return 'http://localhost:3000/api';
  }
  
  // Production requires explicit configuration
  throw new Error('PUBLIC_API_URL environment variable is required in production');
}

const config: AppConfig = {
  apiUrl: getApiUrl(),
  appName: getEnv('PUBLIC_APP_NAME', 'Crema'),
  appEnv: getEnv('PUBLIC_APP_ENV', 'development') as AppConfig['appEnv'],
  isDev: getEnv('PUBLIC_APP_ENV', 'development') === 'development',
  isProd: getEnv('PUBLIC_APP_ENV', 'development') === 'production',
  cookieDomain: getEnv('PUBLIC_COOKIE_DOMAIN', ''),
};

export default config;
export type { AppConfig };