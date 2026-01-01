import pg from 'pg';
const { Pool } = pg;

export const db = new Pool({
  user: 'sd_admin',
  host: '127.0.0.1', // Use IP instead of 'localhost' to avoid NixOS/IPv6 DNS lag
  database: 'social_distance',
  password: 'sd_password',
  port: 5432,
});

// Force an immediate connection check
db.connect()
  .then(() => console.log('✅ Postgres: Connected'))
  .catch(err => {
    console.error('❌ Postgres Connection Error:');
    console.error(err); // This will finally show the REAL error message
    process.exit(1);
  });
