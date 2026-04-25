// Este archivo permite que TypeScript "entienda" que puedes agregar propiedades personalizadas a req
// (como req.user después de validar el JWT).
// Después de crear este archivo, TypeScript ya no se quejará cuando escribas req.user?.id en tus middlewares o controladores.

import type { Request } from 'express';
import type { Logger } from 'pino';
import { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
      rateLimit?: {
        key: string;
        limit: number;
        current: number;
        remaining: number;
        resetTime: Date;
      };
      /** Request ID for distributed tracing, set by requestIdMiddleware */
      id: string;
      /** Child logger instance with requestId attached, set by requestIdMiddleware */
      log: Logger;
      /** Generic validated Zod output */
      [key: string]: unknown;
      /** Validated request body from Zod schema */
      validatedBody?: Record<string, unknown>;
      /** Validated path parameters from Zod schema */
      validatedParams?: Record<string, unknown>;
    }
  }
}

/**
 * User payload extracted from JWT token.
 * This interface is used to type the `req.user` property after JWT validation.
 */
export interface UserPayload extends Partial<JwtPayload> {
  id: string;
  username: string;
  email: string;
  fullname?: string;
  level: number;
  active: number;
  affiliate_slug?: string;
  // Used for partial authentication flows
  partial?: boolean;
}

/**
 * Express Request with authenticated user.
 * Use this type instead of Request when you need to access req.user.
 * Note: user is optional to match Express's Request interface behavior
 */
export interface AuthenticatedRequest extends Request {
  user: UserPayload;
  rateLimit?: {
    key: string;
    limit: number;
    current: number;
    remaining: number;
    resetTime: Date;
  };
  /** Validated request body from Zod schema */
  validatedBody?: Record<string, unknown>;
  /** Validated path parameters from Zod schema */
  validatedParams?: Record<string, unknown>;
}
