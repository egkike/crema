import { Router, Request, Response, NextFunction } from 'express';

import { AdminController } from '../controllers/admin.controller';
import { payoutRepository } from '../repositories/payout.repository';
import { PayoutService } from '../services/payout.service';
import { ExportService } from '../services/export.service';
import { productRepository } from '../repositories/product.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

import { jwtAuthMiddleware } from './../middlewares/auth/jwt.middleware';
import { restrictTo } from './../middlewares/auth/role.middleware';

const router = Router();

// Protección Global: Solo administradores nivel 10
router.use(jwtAuthMiddleware);
router.use(restrictTo('ADMIN'));

/* --- 1. SALUD FINANCIERA Y AUDITORÍA --- */
router.get('/financial-health', AdminController.getFinancialHealth);
router.get('/ledger', AdminController.getPlatformLedger);
router.get('/user-stats/:userId', AdminController.getUserStats);

// Resumen de retenciones (IVA/IIBB) para gráficos en el Dashboard
router.get('/retention-summary', AdminController.getRetentionSummary);

/* --- 1.1 GESTIÓN DE PRODUCTOS --- */

/**
 * Lista todos los productos de la plataforma
 */
router.get('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, type, status, creator_id, page, limit } = req.query;

    const result = await productRepository.getAllProducts({
      search: search as string,
      type: type as string,
      status: status as string,
      creatorId: creator_id as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
    });

    res.status(200).json({
      success: true,
      data: result.products,
      pagination: {
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20,
        total: result.total,
        totalPages: Math.ceil(result.total / (limit ? parseInt(limit as string) : 20)),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Ver detalle de un producto específico
 */
router.get('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const product = await productRepository.getProductByIdForAdmin(id);

    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
});

/**
 * Editar un producto (solo campos específicos)
 */
router.patch('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { title, description, status, affiliate_commission_percent } = req.body;

    // Verificar que el producto existe
    const existingProduct = await productRepository.getProductByIdForAdmin(id);
    if (!existingProduct) {
      throw new AppError('Producto no encontrado', 404);
    }

    // Validar status si se proporciona
    const validStatuses = ['draft', 'published', 'archived'];
    if (status && !validStatuses.includes(status)) {
      throw new AppError(`Status inválido. Debe ser: ${validStatuses.join(', ')}`, 400);
    }

    // Validar affiliate_commission_percent si se proporciona
    if (affiliate_commission_percent !== undefined) {
      if (typeof affiliate_commission_percent !== 'number' || affiliate_commission_percent < 0 || affiliate_commission_percent > 100) {
        throw new AppError('La comisión de afiliado debe ser un número entre 0 y 100', 400);
      }
    }

    // Construir objeto de actualización (solo campos permitidos)
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (affiliate_commission_percent !== undefined) updateData.affiliate_commission_percent = affiliate_commission_percent;

    // Actualizar producto
    const updatedProduct = await productRepository.updateProduct(id, updateData);

    logger.info({ productId: id, adminId: req.user?.id, updates: Object.keys(updateData) }, 'Admin actualizó producto');

    res.status(200).json({ 
      success: true, 
      data: updatedProduct,
      message: 'Producto actualizado correctamente' 
    });
  } catch (error) {
    next(error);
  }
});

/* --- 2. GESTIÓN DE RETIROS (PAYOUTS) --- */
router.get('/payouts/pending', async (_req, res, next) => {
  try {
    const payouts = await payoutRepository.getByStatus('pending');
    res.status(200).json({ success: true, data: payouts });
  } catch (error) {
    next(error);
  }
});

router.patch('/payouts/:id/status', AdminController.processPayout);

/**
 * Registro de retiro de fondos de la plataforma (Empresa)
 */
router.post('/withdraw-platform', async (req: Request & { user?: { id: string } }, res: Response, next: NextFunction) => {
  try {
    const { amount, currency, description, transaction_receipt } = req.body;
    const adminId = req.user?.id;

    if (!amount || !transaction_receipt) {
      throw new AppError('Monto y comprobante son obligatorios', 400);
    }

    if (!adminId) {
      throw new AppError('Admin no autenticado', 401);
    }

    const result = await PayoutService.requestPlatformPayout(
      Number(amount),
      currency,
      description || 'Retiro de ganancias',
      transaction_receipt,
      adminId
    );

    res.status(200).json({
      success: true,
      message: 'Retiro de plataforma registrado correctamente',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/* --- 3. CUMPLIMIENTO LEY ECONOMÍA DEL CONOCIMIENTO (LEC) --- */

/**
 * Proyectos de Innovación: Listado para selectores del panel
 */
router.get('/lec/projects', AdminController.getRDProjects);

/**
 * Registro de Logs de I+D: 
 * Aquí es donde el admin vincula horas de desarrollo con commits para la auditoría nacional.
 */
router.post('/lec/rd-logs', AdminController.logRDActivity);

/**
 * Reporte de Certificación: 
 * El "semáforo" que calcula: (Horas I+D * Valor Hora) / Facturación Bruta.
 * Debe dar >= 3% para cumplir la ley.
 */
router.get('/lec/compliance-status', AdminController.getLECCertificationStatus);

/* --- 4. EXPORTACIONES (REPORTES CSV) --- */

// El reporte clave para el contador de Mendoza (Libro IVA Ventas)
router.get('/export/tax-report', AdminController.downloadTaxReport);

// Reporte de conciliación (Garantías vs Pagados)
router.get('/export/audit', AdminController.downloadFinancialAudit);

// Historial de reembolsos
router.get('/export/refunds', AdminController.downloadRefundsReport);

// Historial de retiros a usuarios
router.get('/export/payouts', async (req, res, next) => {
  try {
    const { currency, status, from, to } = req.query;

    if (!currency || typeof currency !== 'string') {
      throw new AppError('La moneda (currency) es obligatoria para generar el reporte.', 400);
    }

    const statusStr = typeof status === 'string' ? status : undefined;
    const fromStr = typeof from === 'string' ? from : undefined;
    const toStr = typeof to === 'string' ? to : undefined;

    const csv = await ExportService.exportPayoutsToCSV(currency, statusStr, fromStr, toStr);

    const dateStr = new Date().toISOString().split('T')[0];
    res.header('Content-Type', 'text/csv');
    res.attachment(`reporte_retiros_${currency.toUpperCase()}_${dateStr}.csv`);

    return res.send(csv);
  } catch (error) {
    next(error);
  }
});

// LEC(I+D)	Justificación del beneficio fiscal (3% inversión).
router.get('/export/lec-report', async (req, res, next) => {
  try {
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const csv = await ExportService.exportLECAuditCSV(month, year);

    res.header('Content-Type', 'text/csv');
    res.attachment(`cumplimiento_LEC_${month}_${year}.csv`);
    return res.send(csv);
  } catch (error) {
    next(error);
  }
});

export default router;
