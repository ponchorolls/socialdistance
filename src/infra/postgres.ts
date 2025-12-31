import { Pool } from 'pg';

export const db = new Pool({
  user: 'sd_admin',
  host: 'localhost',
  database: 'social_distance',
  password: 'sd_password',
  port: 5432,
});