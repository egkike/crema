import { ConnectionOptions } from 'bullmq';

import { config } from './index';

export const redisConnection: ConnectionOptions = {
  host: config.redis.host,
  port: config.redis.port,
  ...(config.redis.password && { password: config.redis.password }),
  // Optimización para BullMQ
  maxRetriesPerRequest: null,
};
