import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validate =
  (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      // Forzamos la comprobación de instancia
      if (error instanceof ZodError) {
        // Usamos .issues que es el estándar de Zod para obtener el array
        const errorMessages = error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));

        return res.status(400).json({
          success: false,
          error: 'Error de validación',
          details: errorMessages,
        });
      }

      next(error);
    }
  };
