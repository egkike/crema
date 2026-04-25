import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validate =
  <T>(schema: ZodSchema<T>) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.body);
      req.validatedBody = parsed as Record<string, unknown>;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
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

export const validateParams =
  <T>(schema: ZodSchema<T>, paramNames: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsObj: Record<string, string> = {};
      for (const name of paramNames) {
        if (req.params[name]) {
          paramsObj[name] = req.params[name] as string;
        }
      }
      const parsed = schema.parse(paramsObj);
      req.validatedParams = parsed as Record<string, unknown>;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid path parameters',
          details: error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }

      next(error);
    }
  };