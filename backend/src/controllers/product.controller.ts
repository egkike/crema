import { Request, Response, NextFunction } from 'express';
import { z } from 'zod'; // <--- Aquí se declara

import { productRepository } from '../repositories/product.repository';
import { AppError } from '../errors/AppError';
import { createProductSchema } from '../schemas/products';
import { ProductInput } from '../repositories/product.repository';

export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    // 1. Aquí se lee "z" indirectamente a través del schema,
    // pero para que el compilador esté 100% seguro de que lo usas:
    const validatedData = createProductSchema.parse(req.body);

    const productInput: ProductInput = {
      creatorId: user.id,
      title: validatedData.title,
      type: validatedData.type,
      price: validatedData.price,
      currency: validatedData.currency || 'ARS',
    };

    if (validatedData.description !== undefined)
      productInput.description = validatedData.description;
    if (validatedData.contentUrl !== undefined) productInput.contentUrl = validatedData.contentUrl;
    if (validatedData.commissionPercent !== undefined)
      productInput.commissionPercent = validatedData.commissionPercent;
    if (validatedData.status !== undefined) productInput.status = validatedData.status;

    const product = await productRepository.createProduct(productInput);

    res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error: any) {
    // Verificamos si es un error de Zod
    if (error instanceof z.ZodError) {
      // ✅ Usamos .issues en lugar de .errors
      const message = error.issues.map(issue => issue.message).join(', ');
      return next(new AppError(`Error de validación: ${message}`, 400));
    }

    next(error);
  }
};
