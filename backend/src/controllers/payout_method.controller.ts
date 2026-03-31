import { Request, Response, NextFunction } from 'express';

import { PayoutMethodService } from '../services/payout_method.service';
import { payoutMethodRepository } from '../repositories/payout_method.repository';
import logger from '../utils/logger';

export const requestPayoutMethodUpdate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const { currency, type, data } = req.body;

    // Iniciamos el flujo de seguridad (envío de email)
    const result = await PayoutMethodService.requestChange(userId, currency, type, data);

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const confirmPayoutMethodUpdate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Token de confirmación requerido' });
    }

    const updatedMethod = await PayoutMethodService.confirmChange(token as string);

    logger.info(
      { userId: updatedMethod.user_id, currency: updatedMethod.currency },
      '✅ Método de pago confirmado y actualizado'
    );

    return res.status(200).json({
      success: true,
      message: 'Tu cuenta de retiro ha sido actualizada correctamente.',
      data: updatedMethod,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const getMyPayoutMethods = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const methods = await payoutMethodRepository.getByUserId(userId);

    return res.status(200).json({
      success: true,
      data: methods,
    });
  } catch (error: unknown) {
    next(error);
  }
};
