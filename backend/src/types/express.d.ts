// Este archivo permite que TypeScript "entienda" que puedes agregar propiedades personalizadas a req
// (como req.user después de validar el JWT).
// Después de crear este archivo, TypeScript ya no se quejará cuando escribas req.user?.id en tus middlewares o controladores.

import { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        email: string;
        fullname?: string;
        level: number;
        active: number;
        // Agregamos el campo para el marketplace de afiliados
        affiliate_slug?: string;
        // Agregamos la fecha de registro o campos de sesión si los necesitas
        iat?: number;
      } & Partial<JwtPayload>;
      rateLimit?: {
        key: string;
        limit: number;
        current: number;
        remaining: number;
        resetTime: Date;
      };
    }
  }
}

export {};
