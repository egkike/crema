import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { productRepository } from '../repositories/product.repository';
import { AppError } from '../errors/AppError';
import { createProductSchema } from '../schemas/products';
import { ProductInput } from '../repositories/product.repository';

export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    // Validación Zod con parse() - lanza excepción si falla
    let validatedData: z.infer<typeof createProductSchema>;
    try {
      validatedData = createProductSchema.parse(req.body);
    } catch (err: unknown) {
      let errorMsg = 'Datos inválidos para crear producto';
      if (err && typeof err === 'object' && err !== null) {
        const anyErr = err as any;
        if (anyErr.errors && anyErr.errors.length > 0) {
          errorMsg = anyErr.errors[0]?.message || errorMsg; // Tomamos el primer mensaje de Zod
        }
      }
      throw new AppError(errorMsg, 400);
    }

    // Zod ya validó y parseó los valores correctamente
    const { title, description, type, price, contentUrl, commissionPercent, status } =
      validatedData;

    // Construimos el input sin undefined explícito
    const productInput: ProductInput = {
      creatorId: user.id,
      title,
      type,
      price,
    } as ProductInput;

    // Asignamos opcionales solo si vienen (TS feliz)
    if (description !== undefined) productInput.description = description;
    if (contentUrl !== undefined) productInput.contentUrl = contentUrl;
    if (commissionPercent !== undefined) productInput.commissionPercent = commissionPercent;
    if (status !== undefined) productInput.status = status; // ← nuevo: status opcional

    const product = await productRepository.createProduct(productInput);

    if ('error' in product) {
      throw new AppError(product.error, 400);
    }

    res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    const products = await productRepository.getProductsByCreator(user.id);

    if ('error' in products) {
      throw new AppError(products.error, 400);
    }

    res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    next(error);
  }
};
