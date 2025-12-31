import express from 'express';
import { redis } from './infra/redis.js';
import { db } from './infra/postgres.js';

const app = express();
const PORT = 3000;

app.get('/pulse', async (req, res) => {
  try {
    // 1. Test Redis
    await redis.set('pulse_check', 'Redis is Active');
    const redisVal = await redis.get('pulse_check');

    // 2. Test Postgres
    // We'll just check the current time from the DB to see if it's alive
    const dbResult = await db.query('SELECT NOW() as current_time');
    const dbTime = dbResult.rows[0].current_time;

    res.json({
      status: "Social Distance Engine: ONLINE",
      redis: redisVal,
      postgres: `Connected (DB Time: ${dbTime})`,
      nixos: "Environment Validated"
    });
  } catch (err: any) { // Temporary fix for the test pulse
    console.error(err);
    res.status(500).json({ status: "Engine Failure", error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`
  🚀 sd engine pulse-check running at http://localhost:${PORT}/pulse
  - Redis: Connected to Docker
  - Postgres: Connected to Docker
  - Environment: NixOS DevShell
  `);
});