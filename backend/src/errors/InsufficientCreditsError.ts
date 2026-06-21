// Custom error class for insufficient AI credits
// Extends AppError so it carries statusCode (402) and isOperational flag
// Used to replace fragile string-based error matching in credits.service.ts

import { AppError } from './AppError';

export class InsufficientCreditsError extends AppError {
  constructor(message = 'Insufficient credits') {
    super(message, 402);
    this.name = 'InsufficientCreditsError';
    Error.captureStackTrace(this, this.constructor);
  }
}
