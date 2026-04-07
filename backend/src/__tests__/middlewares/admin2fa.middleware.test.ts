import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { requireAdmin2FA } from '../../middlewares/auth/admin2fa.middleware';

// Mock de las dependencias
vi.mock('../../repositories/user.repository', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../errors/AppError', () => ({
  AppError: class AppError extends Error {
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'AppError';
      this.statusCode = statusCode;
    }
  },
}));

import { userRepository } from '../../repositories/user.repository';
import { AppError } from '../../errors/AppError';

describe('requireAdmin2FA Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      user: { id: 'admin-123' },
    } as Partial<Request>;

    mockRes = {} as Partial<Response>;

    mockNext = vi.fn();
  });

  it('debería permitir acceso si el admin tiene 2FA habilitado', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: 'admin-123',
      level: 10,
      two_factor_enabled: true,
      two_factor_secret: 'secret',
    } as any);

    await requireAdmin2FA(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith();
    expect(userRepository.findById).toHaveBeenCalledWith('admin-123');
  });

  it('debería bloquear acceso si el admin NO tiene 2FA habilitado', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: 'admin-123',
      level: 10,
      two_factor_enabled: false,
      two_factor_secret: null,
    } as any);

    await requireAdmin2FA(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
    const error = mockNext.mock.calls[0][0] as AppError;
    expect(error.message).toContain('2FA es obligatorio');
    expect(error.statusCode).toBe(403);
  });

  it('debería permitir acceso si el usuario NO es admin (level < 10)', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: 'user-123',
      level: 1,
      two_factor_enabled: false,
      two_factor_secret: null,
    } as any);

    await requireAdmin2FA(mockReq as Request, mockRes as Response, mockNext);

    // No debería bloquear a usuarios no-admin
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('debería bloquear si no hay usuario en el request', async () => {
    mockReq.user = undefined;

    await requireAdmin2FA(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
    const error = mockNext.mock.calls[0][0] as AppError;
    expect(error.message).toContain('no autenticado');
  });

  it('debería bloquear si el usuario no existe', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(null);

    await requireAdmin2FA(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
    const error = mockNext.mock.calls[0][0] as AppError;
    expect(error.message).toContain('no encontrado');
  });
});