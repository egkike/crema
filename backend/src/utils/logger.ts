import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: isProduction ? 'info' : 'debug',
  redact: {
    paths: ['password', '*.password', 'cbu', 'address', 'token', 'secret'],
    censor: '[CONFIDENCIAL]',
  },
  transport: {
    targets: [
      // 1. CONSOLA: Se adapta al entorno
      {
        target: isProduction ? 'pino/file' : 'pino-pretty', // JSON en prod, Pretty en dev
        level: isProduction ? 'info' : 'debug',
        options: isProduction
          ? { destination: 1 } // Escribe a stdout (consola estándar)
          : {
              colorize: true,
              translateTime: 'yyyy-mm-dd HH:MM:ss',
              ignore: 'pid,hostname',
            },
      },
      // 2. ARCHIVO: Siempre JSON para auditoría (Solo en Prod)
      ...(isProduction
        ? [
            {
              target: 'pino-roll',
              level: 'info',
              options: {
                file: './logs/crema-audit.log',
                frequency: 'daily',
                size: '20m',
                mkdir: true,
              },
            },
          ]
        : []),
    ],
  },
});

export default logger;
