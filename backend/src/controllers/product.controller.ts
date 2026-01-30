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
    if (error instanceof z.ZodError) {
      const message = error.issues.map(issue => issue.message).join(', ');
      return next(new AppError(`Error de validación: ${message}`, 400));
    }
    next(error);
  }
};

/**
 * Agregamos esta función que faltaba en tu router
 */
export const getMyProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;

    // CAMBIA ESTA LÍNEA: de getProductsByCreatorId a getProductsByCreator
    const products = await productRepository.getProductsByCreator(user.id);

    res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    next(error);
  }
};

// --- ESTO ES LO QUE ARREGLA EL ERROR EN PRODUCT.ROUTES.TS ---
export const productController = {
  createProduct,
  getMyProducts,
};
