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

    // 1. Validación Zod
    let validatedData: z.infer<typeof createProductSchema>;
    try {
      validatedData = createProductSchema.parse(req.body);
    } catch (err: any) {
      const errorMsg = err.errors?.[0]?.message || 'Datos inválidos para crear producto';
      throw new AppError(errorMsg, 400);
    }

    // 2. Construcción dinámica para cumplir con exactOptionalPropertyTypes
    // Primero las obligatorias
    const productInput: ProductInput = {
      creatorId: user.id,
      title: validatedData.title,
      type: validatedData.type,
      price: validatedData.price,
    };

    // Solo agregamos las opcionales si no son undefined
    if (validatedData.description !== undefined)
      productInput.description = validatedData.description;
    if (validatedData.contentUrl !== undefined) productInput.contentUrl = validatedData.contentUrl;
    if (validatedData.commissionPercent !== undefined)
      productInput.commissionPercent = validatedData.commissionPercent;
    if (validatedData.status !== undefined) productInput.status = validatedData.status;

    // 3. Crear el producto
    const product = await productRepository.createProduct(productInput);

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

    // El repositorio devuelve Product[] directamente
    const products = await productRepository.getProductsByCreator(user.id);

    res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    next(error);
  }
};
