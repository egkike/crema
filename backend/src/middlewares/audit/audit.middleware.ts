import { Request, Response, NextFunction } from 'express';

import logger from '../../utils/logger';

// Tipos de acciones auditables
export type AuditAction = 
  | 'product_create'
  | 'product_update'
  | 'product_delete'
  | 'order_view'
  | 'order_update'
  | 'payout_approve'
  | 'payout_reject'
  | 'refund_approve'
  | 'refund_reject'
  | 'user_ban'
  | 'user_suspend'
  | 'user_unban'
  | 'user_update_level'
  | 'commission_calculate'
  | 'config_update';

// Interfaz para el log de auditoría
export interface AuditLogEntry {
  id?: string;
  admin_id: string;
  action: AuditAction;
  resource_type: string;
  resource_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at?: Date;
}

// Almacenamiento en memoria (en producción sería la tabla de DB)
const auditLogs: AuditLogEntry[] = [];

/**
 * Middleware de auditoría para acciones administrativas
 * Registra: admin_id, acción, recurso, valores old/new, IP, User-Agent
 */
export const auditMiddleware = (action: AuditAction, resourceType: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Ejecutar la ruta primero
    await next();

    // Solo registrar si la respuesta fue exitosa (2xx)
    const statusCode = res.statusCode;
    if (statusCode < 200 || statusCode >= 300) {
      return;
    }

    // Solo registrar si hay un usuario admin autenticado
    const adminId = req.user?.id;
    if (!adminId) {
      return;
    }

    // Extraer valores old y new del body y response
    const oldValue = extractOldValue(req);
    const newValue = extractNewValue(req, res);

    const logEntry: AuditLogEntry = {
      admin_id: adminId,
      action,
      resource_type: resourceType,
      resource_id: extractResourceId(req),
      old_value: oldValue,
      new_value: newValue,
      ip_address: req.ip || req.headers['x-forwarded-for'] as string || null,
      user_agent: req.headers['user-agent'] || null,
    };

    // Guardar en memoria (en producción guardar en DB)
    auditLogs.push(logEntry);

    // Log con Pino
    logger.info(
      {
        adminId: logEntry.admin_id,
        action: logEntry.action,
        resourceType: logEntry.resource_type,
        resourceId: logEntry.resource_id,
      },
      `Audit: ${action} on ${resourceType}`
    );
  };
};

/**
 * Función para registrar auditoría manualmente (para casos especiales)
 */
export const logAudit = async (entry: Omit<AuditLogEntry, 'id' | 'created_at'>): Promise<void> => {
  auditLogs.push(entry);
  
  logger.info(
    {
      adminId: entry.admin_id,
      action: entry.action,
      resourceType: entry.resource_type,
    },
    `Audit: ${entry.action} on ${entry.resource_type}`
  );
};

/**
 * Obtiene los logs de auditoría (para endpoint del panel admin)
 */
export const getAuditLogs = (params: {
  from?: string;
  to?: string;
  action?: string;
  adminId?: string;
  page?: number;
  limit?: number;
}) => {
  let filtered = [...auditLogs];

  // Filtros
  if (params.from) {
    const fromDate = new Date(params.from);
    filtered = filtered.filter(log => log.created_at && log.created_at >= fromDate);
  }

  if (params.to) {
    const toDate = new Date(params.to);
    filtered = filtered.filter(log => log.created_at && log.created_at <= toDate);
  }

  if (params.action) {
    filtered = filtered.filter(log => log.action === params.action);
  }

  if (params.adminId) {
    filtered = filtered.filter(log => log.admin_id === params.adminId);
  }

  // Ordenar por fecha descendente
  filtered.sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return dateB - dateA;
  });

  // Paginación
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;

  const paginated = filtered.slice(offset, offset + limit);

  return {
    logs: paginated,
    total: filtered.length,
    page,
    limit,
    totalPages: Math.ceil(filtered.length / limit),
  };
};

// Funciones helper

function extractOldValue(req: Request): Record<string, unknown> | null {
  // Del body, generalmente viene en _old o se compara con GET previo
  if (req.body._oldValue) {
    return req.body._oldValue as Record<string, unknown>;
  }
  return null;
}

function extractNewValue(req: Request, _res: Response): Record<string, unknown> | null {
  // Del body que se está enviando, excluir campos internos
  const data = { ...req.body };
  delete data._oldValue;
  delete data._meta;
  
  if (Object.keys(data).length > 0) {
    // Filtrar campos sensibles
    const sanitized = filterSensitiveFields(data);
    return sanitized;
  }
  return null;
}

function extractResourceId(req: Request): string | null {
  // De los params de la ruta
  return req.params.id || req.params.orderId || req.params.userId || null;
}

function filterSensitiveFields(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'creditCard', 'cvv'];
  const filtered = { ...data };

  for (const key of Object.keys(filtered)) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      filtered[key] = '[REDACTED]';
    }
  }

  return filtered;
}

// Cleanup para testing (no usar en producción)
export const clearAuditLogs = (): void => {
  auditLogs.length = 0;
};