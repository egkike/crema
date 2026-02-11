import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { productRepository, ProductInput } from '../repositories/product.repository';
import { ProductService } from '../services/product.service';
import { AppError } from '../errors/AppError';
import { createProductSchema } from '../schemas/products.schema';
import logger from '../utils/logger';

export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    const validatedData = createProductSchema.parse(req.body);

    // --- VALIDACIONES FINANCIERAS PREVENTIVAS ---
    // Extraer y definir 'requestedComm' para que esté disponible en este bloque
    const requestedComm = validatedData.commissionPercent ?? 0;

    // Llamada al servicio refactorizado usando la variable recién definida
    await ProductService.validateCommissionLimits(requestedComm);

    // Spread condicional para evitar el error de 'undefined' con exactOptionalPropertyTypes
    const productInput: ProductInput = {
      creatorId: user.id,
      title: validatedData.title,
      type: validatedData.type,
      prices: validatedData.prices,
      commissionPercent: validatedData.commissionPercent ?? 0,
      status: validatedData.status ?? 'published',
      sizeBytes: validatedData.sizeBytes ?? 0,
      ...(validatedData.description && { description: validatedData.description }),
      ...(validatedData.contentUrl && { contentUrl: validatedData.contentUrl }),
    };

    logger.info({ creatorId: user.id, title: validatedData.title }, 'Creando nuevo producto');
    const product = await productRepository.createProduct(productInput);

    res.status(201).json({ success: true, data: product });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map(issue => issue.message).join('. ');
      return next(new AppError(`Error de validación: ${message}`, 400));
    }
    next(error);
  }
};

export const getProductById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Extraemos y aseguramos que sea un string simple
    const productId = req.params.productId as string;

    if (!productId || typeof productId !== 'string') {
      throw new AppError('El ID del producto es inválido', 400);
    }

    const user = (req as any).user;

    const product = await productRepository.getProductById(productId);
    if (!product) throw new AppError('Producto no encontrado', 404);

    const isOwner = user && product.creator_id === user.id;
    const isAdmin = user && user.level >= 10; // Usamos el nivel de admin que definimos

    const productData = {
      id: product.id,
      title: product.title,
      description: product.description,
      prices: product.prices,
      type: product.type,
      status: product.status,
      // Solo incluimos la URL si tiene permiso
      ...((isOwner || isAdmin) && { contentUrl: product.content_url }),
    };

    res.status(200).json({ success: true, data: productData });
  } catch (error) {
    next(error);
  }
};

export const getMyProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    const products = await productRepository.getProductsByCreator(user.id);
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
};

// Exportamos los métodos
export const productController = {
  createProduct,
  getMyProducts,
  getProductById,
};
