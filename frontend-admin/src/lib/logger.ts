/**
 * Simple logger utility for the admin panel
 * In production, this could be connected to a monitoring service (Sentry, etc.)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = import.meta.env.DEV;

const formatMessage = (level: LogLevel, context: string, message: string): string => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] [${context}] ${message}`;
};

export const logger = {
  debug: (context: string, message: string, ...args: unknown[]) => {
    if (isDev) {
      console.debug(formatMessage('debug', context, message), ...args);
    }
  },

  info: (context: string, message: string, ...args: unknown[]) => {
    if (isDev) {
      console.info(formatMessage('info', context, message), ...args);
    }
  },

  warn: (context: string, message: string, ...args: unknown[]) => {
    console.warn(formatMessage('warn', context, message), ...args);
    // In production: send to monitoring service
  },

  error: (context: string, message: string, ...args: unknown[]) => {
    console.error(formatMessage('error', context, message), ...args);
    // In production: send to monitoring service (Sentry, etc.)
  },
};

export default logger;