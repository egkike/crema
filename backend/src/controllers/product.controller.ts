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

    // 1. Validar Espacio en Disco
    const finalSizeBytes = file ? file.size : validatedData.sizeBytes || 0;
    const currentUsage = await subscriptionRepository.getUserStorageUsage(user.id);
    const subscription = await subscriptionRepository.getActiveSubscription(user.id);
    const storageLimitBytes = (subscription?.features?.storage_mb || 0) * 1024 * 1024;

    if (currentUsage + finalSizeBytes > storageLimitBytes) {
      // Si falla, borramos el archivo de temp inmediatamente
      if (file) fs.unlinkSync(file.path);
      throw new AppError('Espacio insuficiente en tu plan.', 403);
    }

    // 2. Preparar Datos Base
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
      contentUrl: validatedData.contentUrl, // Temporalmente el del body si existe
      commissionPercent: requestedComm,
      status: validatedData.status ?? 'published',
      sizeBytes: finalSizeBytes,
      guaranteeDays: validatedData.guaranteeDays ?? undefined,
    };

    // 3. Crear en DB para obtener el ID
    const product = await productRepository.createProduct(productInput);

    // 4. Mover archivo de TEMP a carpeta ORGANIZADA
    if (file) {
      const relativeFolder = path.join('uploads', user.id, product.id);
      const absoluteFolder = path.join(process.cwd(), relativeFolder);

      if (!fs.existsSync(absoluteFolder)) {
        fs.mkdirSync(absoluteFolder, { recursive: true });
      }

      const finalPath = path.join(absoluteFolder, file.filename);
      fs.renameSync(file.path, finalPath);

      // Normalizamos la ruta para que siempre use "/" (evita errores en Windows)
      const dbRelativeUrl = `/${relativeFolder}/${file.filename}`.replace(/\\/g, '/');
      await productRepository.updateProduct(product.id, { contentUrl: dbRelativeUrl });
      product.content_url = dbRelativeUrl;
    }

    res.status(201).json({ success: true, data: product });
  } catch (error: any) {
    // LIMPIEZA: Si algo falló (DB, validación), borramos el archivo de la carpeta temp
    if ((req as any).file && fs.existsSync((req as any).file.path)) {
      fs.unlinkSync((req as any).file.path);
    }
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
      if (file) fs.unlinkSync(file.path); // Limpiar temp si excede
      throw new AppError('La actualización excede el espacio de almacenamiento de tu plan.', 403);
    }

    // 4. Gestión de archivo nuevo y limpieza del viejo
    let finalContentUrl = existingProduct.content_url;
    if (file) {
      const relativeFolder = path.join('uploads', user.id, productId);
      const absoluteFolder = path.join(process.cwd(), relativeFolder);
      if (!fs.existsSync(absoluteFolder)) fs.mkdirSync(absoluteFolder, { recursive: true });

      const finalPath = path.join(absoluteFolder, file.filename);
      fs.renameSync(file.path, finalPath);

      // Borrar archivo físico anterior si existía
      if (existingProduct.content_url && existingProduct.content_url.startsWith('/uploads/')) {
        const oldAbsolutePath = path.join(process.cwd(), existingProduct.content_url.substring(1));
        if (fs.existsSync(oldAbsolutePath)) fs.unlinkSync(oldAbsolutePath);
      }

      finalContentUrl = `/${relativeFolder}/${file.filename}`.replace(/\\/g, '/');
    }

    const productInput: Partial<ProductInput> = {
      ...req.body,
      sizeBytes: newFileSize,
      contentUrl: finalContentUrl,
    };

    // Validar comisión si se intenta cambiar
    if (req.body.commissionPercent !== undefined) {
      await ProductService.validateCommissionLimits(user.id, Number(req.body.commissionPercent));
    }

    const updated = await productRepository.updateProduct(productId, productInput);

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    if ((req as any).file && fs.existsSync((req as any).file.path)) {
      fs.unlinkSync((req as any).file.path);
    }
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

    // Borrar CARPETA del producto completa (más limpio)
    const productDir = path.join(process.cwd(), 'uploads', product.creator_id, product.id);
    if (fs.existsSync(productDir)) {
      fs.rmSync(productDir, { recursive: true, force: true });
    }

    logger.info({ productId, userId: user.id }, 'Producto eliminado correctamente');
    res.status(200).json({ success: true, message: 'Producto eliminado y espacio liberado.' });
  } catch (error) {
    next(error);
  }
};

/**
 * Permite que un usuario (Nivel 2+) se afilie a un producto
 */
export const joinProductProgram = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const { user } = req;

    if (!user) throw new AppError('Usuario no autenticado', 401);
    if (typeof productId !== 'string') throw new AppError('ID de producto no válido', 400);

    // Llamamos al servicio que ya tiene la lógica de validación de moneda
    await ProductService.joinAffiliateProgram(user.id, productId);

    res.status(200).json({
      success: true,
      message: 'Te has afiliado correctamente al producto.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Marketplace Filtrado: Solo muestra productos compatibles con las monedas del usuario
 */
export const getMyAvailableMarketplace = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { user } = req;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    // Usamos el nuevo método del repositorio que filtra por moneda
    const products = await productRepository.getAvailableForAffiliate(user.id);

    const affIdentifier = user.affiliate_slug || user.id;

    const data = products.map(p => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      prices: p.prices, // Para que el usuario vea en qué moneda se vende
      commission: p.affiliate_commission_percent,
      link: `${config.frontendUrl}/p/${p.slug || p.id}?aff=${affIdentifier}`,
    }));

    res.status(200).json({ success: true, data });
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
  joinProductProgram,
  getMyAvailableMarketplace,
};
