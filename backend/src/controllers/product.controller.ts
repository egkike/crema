import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { productRepository } from '../repositories/product.repository';
import { AppError } from '../errors/AppError';
import { createProductSchema } from '../schemas/products';
import { ProductInput } from '../repositories/product.repository';
import logger from '../utils/logger';

export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    // El middleware de JWT debería atrapar esto, pero es buena práctica ser defensivos
    if (!user) throw new AppError('Usuario no autenticado', 401);

    // 1. Validamos los datos con Zod
    const validatedData = createProductSchema.parse(req.body);

    // 2. Mapeamos al input del repositorio
    // NOTA: Asegúrate de que ProductInput use camelCase y el repo lo pase a snake_case
    const productInput: ProductInput = {
      creatorId: user.id,
      title: validatedData.title,
      type: validatedData.type,
      prices: validatedData.prices,
      description: validatedData.description,
      contentUrl: validatedData.contentUrl,
      commissionPercent: validatedData.commissionPercent || 0, // Fallback a 0
      status: validatedData.status || 'published',
    };

    logger.info({ creatorId: user.id, title: validatedData.title }, 'Creando nuevo producto');

    // 3. El repo maneja la transacción SQL (Insert product + Insert multiples precios)
    const product = await productRepository.createProduct(productInput);

    res.status(201).json({
      success: true,
      message: 'Producto creado exitosamente con sus precios',
      data: product,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map(issue => issue.message).join('. ');
      return next(new AppError(`Error de validación: ${message}`, 400));
    }
    next(error);
  }
};

export const getMyProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new AppError('Usuario no autenticado', 401);

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
