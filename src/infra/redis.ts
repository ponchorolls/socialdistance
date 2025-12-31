import { Redis } from 'ioredis';

// Ensure the variable name is 'redis' and it is exported
export const redis = new Redis({
  host: 'localhost',
  port: 6379,
});