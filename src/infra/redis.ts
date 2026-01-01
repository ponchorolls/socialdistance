import { Redis } from 'ioredis';

export const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  // Add a small timeout so it doesn't hang forever
  connectTimeout: 5000, 
});

redis.on('error', (err) => {
  console.error('❌ Redis Connection Error:');
  console.error(err);
  process.exit(1);
});

redis.on('connect', () => console.log('✅ Redis: Connected'));
