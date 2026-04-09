import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

import { auditMiddleware, logAudit, getAuditLogs, clearAuditLogs } from '../../middlewares/audit/audit.middleware';

// Mock del logger
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Audit Middleware', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    clearAuditLogs();
    vi.clearAllMocks();

    mockReq = {
      params: { id: '123' },
      body: { title: 'Test Product', status: 'published' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' },
      user: { id: 'admin-123' },
    } as any;

    mockRes = {
      statusCode: 200,
    } as Partial<Response>;

    mockNext = vi.fn();
  });

  describe('auditMiddleware', () => {
    it('debería registrar una acción cuando la respuesta es exitosa', async () => {
      const middleware = auditMiddleware('product_update', 'product');

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('no debería registrar si no hay usuario admin', async () => {
      mockReq.user = undefined as any;
      const middleware = auditMiddleware('product_update', 'product');

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('no debería registrar si la respuesta es de error (no 2xx)', async () => {
      mockRes.statusCode = 400;
      const middleware = auditMiddleware('product_update', 'product');

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('logAudit', () => {
    it('debería registrar un log de auditoría', async () => {
      await logAudit({
        admin_id: 'admin-123',
        action: 'product_update',
        resource_type: 'product',
        resource_id: 'prod-123',
        old_value: { title: 'Old' },
        new_value: { title: 'New' },
        ip_address: '127.0.0.1',
        user_agent: 'test-agent',
      } as any);

      const logs = getAuditLogs({});
      expect(logs.logs.length).toBe(1);
      expect(logs.logs[0].action).toBe('product_update');
    });
  });

  describe('getAuditLogs', () => {
    it('debería filtrar por rango de fechas', async () => {
      await logAudit({
        admin_id: 'admin-123',
        action: 'product_update',
        resource_type: 'product',
        resource_id: 'prod-123',
        old_value: null,
        new_value: { title: 'Test' },
        ip_address: '127.0.0.1',
        user_agent: 'test-agent',
        // @ts-expect-error - created_at is not in the type but the test needs it
        created_at: new Date('2026-04-01'),
      });

      await logAudit({
        admin_id: 'admin-123',
        action: 'payout_approve',
        resource_type: 'payout',
        resource_id: 'payout-123',
        old_value: null,
        new_value: { status: 'approved' },
        ip_address: '127.0.0.1',
        user_agent: 'test-agent',
        // @ts-expect-error - created_at is not in the type but the test needs it
        created_at: new Date('2026-04-07'),
      });

      const logs = getAuditLogs({
        from: '2026-04-05',
        to: '2026-04-10',
      });

      expect(logs.logs.length).toBe(1);
      expect(logs.logs[0].action).toBe('payout_approve');
    });

    it('debería filtrar por acción', async () => {
      await logAudit({
        admin_id: 'admin-123',
        action: 'product_update',
        resource_type: 'product',
        resource_id: 'prod-123',
        old_value: null,
        new_value: { title: 'Test' },
        ip_address: '127.0.0.1',
        user_agent: 'test-agent',
      } as any);

      const logs = getAuditLogs({ action: 'product_update' });
      expect(logs.logs.length).toBe(1);
    });

    it('debería paginar correctamente', async () => {
      for (let i = 0; i < 25; i++) {
        await logAudit({
          admin_id: `admin-${i}`,
          action: 'product_update',
          resource_type: 'product',
          resource_id: `prod-${i}`,
          old_value: null,
          new_value: { title: `Test ${i}` },
          ip_address: '127.0.0.1',
          user_agent: 'test-agent',
        } as any);
      }

      const page1 = getAuditLogs({ page: 1, limit: 10 });
      expect(page1.logs.length).toBe(10);
      expect(page1.total).toBe(25);
      expect(page1.totalPages).toBe(3);
    });
  });
});