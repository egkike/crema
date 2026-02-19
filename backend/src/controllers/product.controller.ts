import fs from 'fs';
import path from 'path';

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import slugify from 'slugify';

import { productRepository, ProductInput } from '../repositories/product.repository';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { ProductService } from '../services/product.service';
import { AppError } from '../errors/AppError';
import { createProductSchema } from '../schemas/products.schema';
import logger from '../utils/logger';
import { config } from '../config/index';

export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    const file = (req as any).file;

    if (!user) throw new AppError('Usuario no autenticado', 401);

    const validatedData = createProductSchema.parse(req.body);

    // DETERMINAR EL TAMAÑO REAL
    // Si hay archivo, usamos su tamaño real. Si no, usamos lo que vino por body (ej: para links externos)
    const finalSizeBytes = file ? file.size : validatedData.sizeBytes || 0;

    // RE-VALIDACIÓN DE SEGURIDAD (Por si el body mentía)
    const currentUsage = await subscriptionRepository.getUserStorageUsage(user.id);
    const subscription = await subscriptionRepository.getActiveSubscription(user.id);
    const storageLimitBytes = (subscription?.features?.storage_mb || 0) * 1024 * 1024;

    if (currentUsage + finalSizeBytes > storageLimitBytes) {
      throw new AppError('El archivo excede el espacio disponible en tu plan.', 403);
    }

    // Lógica de subida a la nube (S3/Cloudinary) aquí...
    // const contentUrl = await CloudService.upload(file.buffer);

    const requestedComm = validatedData.commissionPercent ?? 0;
    await ProductService.validateCommissionLimits(user.id, requestedComm);

    const baseSlug = slugify(validatedData.title, { lower: true, strict: true });
    const uniqueSlug = `${baseSlug}-${Math.floor(100 + Math.random() * 899)}`;

    const productInput: ProductInput = {
      creatorId: user.id,
      title: validatedData.title,
      slug: uniqueSlug,
      type: validatedData.type,
      prices: validatedData.prices,
      description: validatedData.description ?? undefined,
      contentUrl: file ? `/uploads/${file.filename}` : validatedData.contentUrl,
      commissionPercent: validatedData.commissionPercent ?? undefined,
      status: validatedData.status ?? undefined,
      sizeBytes: finalSizeBytes,
      guaranteeDays: validatedData.guaranteeDays ?? undefined,
    };

    logger.info({ creatorId: user.id, slug: uniqueSlug }, 'Creando nuevo producto');
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
    const { productId } = req.params;

    // Type Guard: Si no es string, lanzamos error
    if (typeof productId !== 'string') {
      throw new AppError('ID de producto no válido.', 400);
    }

    const { user } = req;
    const product = await productRepository.getProductByIdOrSlug(productId);
    if (!product) throw new AppError('Producto no encontrado', 404);

    const isOwner = user && product.creator_id === user.id;
    const isAdmin = user && user.level >= 10;

    const productData = {
      id: product.id,
      slug: product.slug,
      title: product.title,
      description: product.description,
      prices: product.prices,
      type: product.type,
      status: product.status,
      ...((isOwner || isAdmin) && { contentUrl: product.content_url }),
    };

    res.status(200).json({ success: true, data: productData });
  } catch (error) {
    next(error);
  }
};

export const getMyProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req; // LIMPIO
    if (!user) throw new AppError('Usuario no autenticado', 401);

    const products = await productRepository.getProductsByCreator(user.id);
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
};

export const getAffiliateMarketplace = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req; // LIMPIO
    const products = await productRepository.getPublicProducts();

    // Ahora TS reconoce affiliate_slug gracias al .d.ts
    const affIdentifier = user?.affiliate_slug || user?.id || 'guest';

    const data = products.map(p => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      commission: p.affiliate_commission_percent,
      link: `${config.frontendUrl}/p/${p.slug || p.id}?aff=${affIdentifier}`,
    }));

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const { user } = req;
    const file = (req as any).file;

    if (!user) throw new AppError('Usuario no autenticado', 401);

    if (typeof productId !== 'string') {
      throw new AppError('El ID del producto debe ser un texto válido.', 400);
    }

    // 1. Validar existencia y propiedad
    const existingProduct = await productRepository.getProductById(productId);
    if (!existingProduct) throw new AppError('Producto no encontrado', 404);
    if (existingProduct.creator_id !== user.id) {
      throw new AppError('No tienes permiso para editar este producto', 403);
    }

    // 2. Calcular compensación de espacio
    const currentUsage = await subscriptionRepository.getUserStorageUsage(user.id);
    const oldFileSize = existingProduct.size_bytes || 0;
    const newFileSize = file
      ? file.size
      : req.body.sizeBytes
        ? Number(req.body.sizeBytes)
        : oldFileSize;

    // 3. Validar contra plan
    const subscription = await subscriptionRepository.getActiveSubscription(user.id);
    const storageLimitBytes = (subscription?.features?.storage_mb || 0) * 1024 * 1024;

    if (currentUsage - oldFileSize + newFileSize > storageLimitBytes) {
      throw new AppError('La actualización excede el espacio de almacenamiento de tu plan.', 403);
    }

    // 4. Procesar actualización
    const productInput: Partial<ProductInput> = {
      ...req.body,
      sizeBytes: newFileSize,
      contentUrl: file ? `/uploads/${file.filename}` : undefined,
    };

    // Validar comisión si se intenta cambiar
    if (req.body.commissionPercent !== undefined) {
      await ProductService.validateCommissionLimits(user.id, Number(req.body.commissionPercent));
    }

    const updated = await productRepository.updateProduct(productId, productInput);

    if (
      file &&
      existingProduct.content_url &&
      existingProduct.content_url.startsWith('/uploads/')
    ) {
      const oldPath = path.join(__dirname, '../../', existingProduct.content_url);
      fs.unlink(oldPath, err => {
        if (err) logger.error({ err, oldPath }, 'No se pudo eliminar el archivo antiguo del disco');
      });
    }

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const { user } = req;

    if (!user) throw new AppError('Usuario no autenticado', 401);
    if (typeof productId !== 'string') throw new AppError('ID no válido', 400);

    // 1. Buscar producto para obtener la URL del archivo antes de borrarlo
    const product = await productRepository.getProductById(productId);
    if (!product) throw new AppError('Producto no encontrado', 404);

    // 2. Solo el dueño o un Admin pueden borrar
    if (product.creator_id !== user.id && user.level < 10) {
      throw new AppError('No tienes permisos para borrar este producto', 403);
    }

    // 3. Borrar de la base de datos
    await productRepository.deleteProduct(productId);

    // 4. Borrar archivo físico si existe
    if (product.content_url && product.content_url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '../../', product.content_url);
      fs.unlink(filePath, err => {
        if (err)
          logger.error({ err, filePath }, 'Error al borrar archivo físico tras eliminar producto');
      });
    }

    logger.info({ productId, userId: user.id }, 'Producto eliminado correctamente');
    res.status(200).json({ success: true, message: 'Producto eliminado y espacio liberado.' });
  } catch (error) {
    next(error);
  }
};

export const productController = {
  createProduct,
  updateProduct,
  deleteProduct,
  getMyProducts,
  getProductById,
  getAffiliateMarketplace,
};
