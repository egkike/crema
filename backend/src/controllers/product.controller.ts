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

    // 1. Validamos los datos (ahora incluye el array 'prices')
    const validatedData = createProductSchema.parse(req.body);

    // 2. Mapeamos al input del repositorio
    const productInput: ProductInput = {
      creatorId: user.id,
      title: validatedData.title,
      type: validatedData.type,
      prices: validatedData.prices, // <--- Enviamos el array completo
      description: validatedData.description,
      contentUrl: validatedData.contentUrl,
      commissionPercent: validatedData.commissionPercent,
      status: validatedData.status,
    };

    // 3. El repo se encarga de la transacción (product + prices)
    const product = await productRepository.createProduct(productInput);

    res.status(201).json({
      success: true,
      message: 'Producto creado exitosamente con sus precios',
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

export const getMyProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;

    // Ahora devuelve los productos con sus arrays de precios gracias al json_agg del repo
    const products = await productRepository.getProductsByCreator(user.id);

    res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    next(error);
  }
};

export const productController = {
  createProduct,
  getMyProducts,
};
