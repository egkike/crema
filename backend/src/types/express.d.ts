// Este archivo permite que TypeScript "entienda" que puedes agregar propiedades personalizadas a req
// (como req.user después de validar el JWT).
// Después de crear este archivo, TypeScript ya no se quejará cuando escribas req.user?.id en tus middlewares o controladores.

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
    }
  }
}

// Definimos el objeto por separado para poder reutilizarlo si fuera necesario
interface UserPayload extends Partial<JwtPayload> {
  id: string;
  username: string;
  email: string;
  fullname?: string;
  level: number;
  active: number;
  affiliate_slug?: string;
  // --- Agregamos esto para la lógica de seguridad ---
  partial?: boolean;
}

export {};
