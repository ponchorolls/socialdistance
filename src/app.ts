import express from 'express';
import { handleIngestion } from './api/ingestion';

const app = express();
app.use(express.json());

// The single, clean endpoint for all fitness data
app.post('/sync/:provider', handleIngestion);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[sd] Odometer engine running on port ${PORT}`);
});

// src/infra/redis.ts
import { Redis } from 'ioredis';

// Connect to the Redis container started by docker-compose
export const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

// src/infra/postgres.ts
import { Pool } from 'pg';

export const db = new Pool({
  user: 'sd_admin',
  host: 'localhost',
  database: 'social_distance',
  password: 'sd_password',
  port: 5432,
});