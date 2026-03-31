import fs from 'fs';
import path from 'path';

import { Request, Response, NextFunction } from 'express';
import type { Multer } from 'multer';
import { z } from 'zod';

import { productRepository } from '../repositories/product.repository';
import { couponRepository } from '../repositories/coupon.repository';
import { ProductService } from '../services/product.service';
import { AppError } from '../errors/AppError';
import { createProductSchema } from '../schemas/products.schema';
import pool from '../db/postgres';
import { config } from '../config/index';

const upsertQuizSchema = z.object({
  lessonId: z.string().uuid('ID de lección inválido'),
  questions: z.array(
    z.object({
      id: z.number(),
      question: z.string().min(1, 'La pregunta no puede estar vacía'),
      options: z.array(z.string()).min(2, 'Debe haber al menos 2 opciones'),
      correct: z.number().int('Debe indicar el índice de la respuesta correcta'),
    })
  ),
  passingScore: z.number().min(0).max(100).default(80),
  maxAttempts: z.number().nullable().optional(),
});

/**
 * CREAR PRODUCTO: Delegación total al Service
 */
export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    const file = (req as Request & { file?: Multer.File }).file;

    if (!user) throw new AppError('Usuario no autenticado', 401);

    // 1. Validar body
    const validatedData = createProductSchema.parse(req.body);

    // 2. Preparar datos para el Service (incluyendo el tamaño real del archivo)
    const serviceData = {
      ...validatedData,
      sizeBytes: file ? file.size : 0,
    };

    // 3. Crear mediante Service (valida monedas, comisiones, genera slug e inserta)
    const product = await ProductService.create(user.id, serviceData);

    // 4. Mover archivo de TEMP a destino FINAL
    if (file) {
      const relativeFolder = path.join('uploads', user.id, product.id);
      const absoluteFolder = path.join(process.cwd(), relativeFolder);

      if (!fs.existsSync(absoluteFolder)) {
        fs.mkdirSync(absoluteFolder, { recursive: true });
      }

      const finalPath = path.join(absoluteFolder, file.filename);
      fs.renameSync(file.path, finalPath);

      const dbRelativeUrl = `/${relativeFolder}/${file.filename}`.replace(/\\/g, '/');
      await productRepository.updateProduct(product.id, { contentUrl: dbRelativeUrl });
      product.content_url = dbRelativeUrl;
    }

    res.status(201).json({ success: true, data: product });
  } catch (error: unknown) {
    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    next(error);
  }
};

/**
 * ACTUALIZAR PRODUCTO: Con validaciones de negocio completas
 */
export const updateProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    const file = (req as Request & { file?: Multer.File }).file;

    if (!user) throw new AppError('Usuario no autenticado', 401);

    // 1. Obtener producto actual para referencia
    const existingProduct = await productRepository.getProductById(productId);
    if (!existingProduct) throw new AppError('Producto no encontrado', 404);
    if (existingProduct.creator_id !== user.id) {
      throw new AppError('No tienes permiso para editar este producto', 403);
    }

    // 2. VALIDACIÓN DE PRECIOS (Si se envían nuevos precios)
    const newPrices = req.body.prices;
    if (newPrices && Array.isArray(newPrices)) {
      for (const p of newPrices) {
        // Invocamos el método estático del Service para validar el factor x10
        await ProductService.validateMinimumPrice(p.currency, Number(p.amount));
      }
    }

    // 3. VALIDACIÓN DE COMISIÓN
    if (req.body.commissionPercent !== undefined) {
      // Determinamos la moneda de referencia (la del body o la que ya tenía el producto)
      const refCurrency = newPrices ? newPrices[0].currency : existingProduct.prices[0].currency;

      await ProductService.validateCommissionLimits(
        user.id,
        Number(req.body.commissionPercent),
        refCurrency
      );
    }

    // 4. Lógica de archivos (Mantenemos tu lógica actual...)
    let finalContentUrl = existingProduct.content_url;
    let newSizeBytes = existingProduct.size_bytes;

    if (file) {
      const relativeFolder = path.join('uploads', user.id, productId);
      const absoluteFolder = path.join(process.cwd(), relativeFolder);
      if (!fs.existsSync(absoluteFolder)) fs.mkdirSync(absoluteFolder, { recursive: true });

      const finalPath = path.join(absoluteFolder, file.filename);
      fs.renameSync(file.path, finalPath);

      if (existingProduct.content_url?.startsWith('/uploads/')) {
        const oldAbsolutePath = path.join(process.cwd(), existingProduct.content_url.substring(1));
        if (fs.existsSync(oldAbsolutePath)) fs.unlinkSync(oldAbsolutePath);
      }

      finalContentUrl = `/${relativeFolder}/${file.filename}`.replace(/\\/g, '/');
      newSizeBytes = file.size;
    }

    const productInput = {
      ...req.body,
      sizeBytes: newSizeBytes,
      contentUrl: finalContentUrl,
    };

    const updated = await productRepository.updateProduct(productId, productInput);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    next(error);
  }
};

/**
 * ELIMINAR PRODUCTO
 */
export const deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = req.params.productId as string;
    const { user } = req;

    if (!user) throw new AppError('Usuario no autenticado', 401);

    const product = await productRepository.getProductById(productId);
    if (!product) throw new AppError('Producto no encontrado', 404);

    if (product.creator_id !== user.id && user.level < 10) {
      throw new AppError('No tienes permisos para borrar este producto', 403);
    }

    await productRepository.deleteProduct(productId);

    const productDir = path.join(process.cwd(), 'uploads', product.creator_id, product.id);
    if (fs.existsSync(productDir)) {
      fs.rmSync(productDir, { recursive: true, force: true });
    }

    res.status(200).json({ success: true, message: 'Producto eliminado.' });
  } catch (error) {
    next(error);
  }
};

/**
 * OBTENER POR ID / SLUG
 */
export const getProductById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = req.params.productId as string;
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
    const { user } = req;
    if (!user) throw new AppError('Usuario no autenticado', 401);
    const products = await productRepository.getProductsByCreator(user.id);
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
};

export const getAffiliateMarketplace = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    const products = await productRepository.getPublicProducts();
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

export const joinProductProgram = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = req.params.productId as string;
    const { user } = req;

    if (!user) throw new AppError('Usuario no autenticado', 401);
    await ProductService.joinAffiliateProgram(user.id, productId);

    res.status(200).json({ success: true, message: 'Afiliación exitosa.' });
  } catch (error) {
    next(error);
  }
};

export const getMyAvailableMarketplace = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { user } = req;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    const products = await productRepository.getAvailableForAffiliate(user.id);
    const affIdentifier = user.affiliate_slug || user.id;

    const data = products.map(p => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      prices: p.prices,
      commission: p.affiliate_commission_percent,
      link: `${config.frontendUrl}/p/${p.slug || p.id}?aff=${affIdentifier}`,
    }));

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const upsertQuiz = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    const validatedData = upsertQuizSchema.parse(req.body);

    const schema = config.db?.schema || 'public';
    const { rows } = await pool.query(
      `SELECT p.creator_id FROM "${schema}".product_lessons l
       JOIN "${schema}".product_modules m ON l.module_id = m.id
       JOIN "${schema}".products p ON m.product_id = p.id
       WHERE l.id = $1`,
      [validatedData.lessonId]
    );

    if (rows.length === 0) throw new AppError('Lección no encontrada', 404);
    if (rows[0].creator_id !== user.id) throw new AppError('Sin permisos', 403);

    const query = `
      INSERT INTO "${schema}".product_lesson_quizzes (lesson_id, questions, passing_score, max_attempts)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (lesson_id) 
      DO UPDATE SET questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score, max_attempts = EXCLUDED.max_attempts
      RETURNING *;
    `;

    const result = await pool.query(query, [
      validatedData.lessonId,
      JSON.stringify(validatedData.questions),
      validatedData.passingScore,
      validatedData.maxAttempts ?? null,
    ]);

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * GESTIÓN DE CUPONES: Crear nuevo cupón con validación de rentabilidad 360°
 */
export const createCoupon = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = req.params.productId as string;
    const { user } = req;
    const { code, discountPercent, maxUses, expiresAt } = req.body;

    if (!user) throw new AppError('Usuario no autenticado', 401);

    // 1. Validar que el producto existe y pertenece al usuario
    // Incluimos las monedas para validar el suelo de precio inmediatamente
    const product = await productRepository.getProductById(productId);

    if (!product) throw new AppError('Producto no encontrado', 404);
    if (product.creator_id !== user.id) {
      throw new AppError('No tienes permiso para crear cupones en este producto', 403);
    }

    /**
     * 2. VALIDACIÓN DE RENTABILIDAD (Price Floor)
     * Verificamos que el descuento no rompa el mínimo en NINGUNA de las monedas
     * que tiene configuradas el producto.
     */
    for (const price of product.prices) {
      // REGLA 1: Solo productos >= price_threshold ($25.000)
      const isAboveThreshold = await couponRepository.checkThreshold(productId, price.currency);

      if (!isAboveThreshold) {
        throw new AppError(
          `No se pueden crear cupones para este producto. El precio en ${price.currency} debe ser igual o mayor al límite de la plataforma.`,
          400
        );
      }

      // REGLA 2: El precio final no puede romper el piso absoluto ($4.500)
      const floorCheck = await couponRepository.validatePriceFloor(
        productId,
        price.currency,
        discountPercent
      );

      if (!floorCheck || !floorCheck.isValid) {
        throw new AppError(
          `El descuento dejaría el precio de ${price.currency} por debajo del mínimo de seguridad.`,
          400
        );
      }
    }

    // 3. Persistencia si todas las monedas pasaron la prueba
    const coupon = await couponRepository.create({
      productId,
      creatorId: user.id,
      code,
      discountPercent,
      maxUses,
      expiresAt,
    });

    res.status(201).json({
      success: true,
      message: 'Cupón creado exitosamente y validado para todas las monedas.',
      data: coupon,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * LISTAR CUPONES POR PRODUCTO (Vista Creador)
 */
export const getProductCoupons = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = req.params.productId as string;
    const { user } = req;

    if (!user) throw new AppError('Usuario no autenticado', 401);

    // Verificamos que sea el dueño
    const product = await productRepository.getProductById(productId);
    if (!product || product.creator_id !== user.id) {
      throw new AppError('No autorizado', 403);
    }

    const coupons = await couponRepository.findByProductId(productId);
    res.status(200).json({ success: true, data: coupons });
  } catch (error) {
    next(error);
  }
};

/**
 * VALIDAR CUPÓN (Público - Para el Checkout)
 */
export const validateCouponForCheckout = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { productId, code, currency } = req.body;

    // 1. Buscar cupón válido (activo, no expirado, con usos disponibles)
    const coupon = await couponRepository.findValidCoupon(productId, code);
    if (!coupon) {
      throw new AppError('El cupón no es válido, expiró o alcanzó su límite de usos', 400);
    }

    // 2. Validar Price Floor (Suelo de rentabilidad x10)
    const floorCheck = await couponRepository.validatePriceFloor(
      productId,
      currency,
      coupon.discount_percent
    );

    if (!floorCheck || !floorCheck.isValid) {
      throw new AppError(
        'Este cupón no puede aplicarse debido a restricciones de precio mínimo',
        400
      );
    }

    res.status(200).json({
      success: true,
      data: {
        code: coupon.code,
        discountPercent: coupon.discount_percent,
        originalPrice: floorCheck.originalPrice,
        finalPrice: floorCheck.finalPrice,
        savings: floorCheck.originalPrice - floorCheck.finalPrice,
      },
    });
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
  upsertQuiz,
  createCoupon,
  getProductCoupons,
  validateCouponForCheckout,
};
