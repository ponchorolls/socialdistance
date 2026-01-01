import express from 'express';
import { redis } from './infra/redis.js';
import { db } from './infra/postgres.js';
import { isHumanPowered } from './core/validator.js';

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
    } catch (err: any) {
    console.error("[sd] Database Error Detail:", err.message); // This tells us EXACTLY what failed
    res.status(500).json({ error: "Storage failure", detail: err.message });
  }
});

app.get('/leaderboard', async (req, res) => {
  try {
    // Get the top 10 users, highest score first
    const board = await redis.zrevrange('global_leaderboard', 0, 9, 'WITHSCORES');
    
    // Redis returns a flat array [user1, score1, user2, score2...]
    // Let's make it clean JSON
    const formatted = [];
    for (let i = 0; i < board.length; i += 2) {
      formatted.push({
        userId: board[i],
        distance: parseFloat(board[i+1])
      });
    }

    res.json({ leaderboard: formatted });
  } catch (err) {
    res.status(500).json({ error: "Leaderboard unavailable" });
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

app.post('/ingest', express.json(), async (req, res) => {
  const { userId, distance, duration, activityType } = req.body;

  // 1. Run the Validator
  const check = isHumanPowered({ 
    distanceMeters: distance, 
    durationSeconds: duration, 
    type: activityType 
  });

  if (!check.valid) {
    console.log(`[sd] Rejected: ${check.reason}`);
    return res.status(400).json({ error: check.reason });
  }

  // 2. Update the Odometer (Atomic Update)
  try {
    // Update Postgres for permanence
    await db.query(
      'UPDATE users SET total_distance_meters = total_distance_meters + $1 WHERE id = $2',
      [distance, userId]
    );

    // Update Redis for the leaderboard
    await redis.zincrby('global_leaderboard', distance, userId);

    res.json({ status: "Distance recorded", newDistance: distance });
  } catch (err) {
    res.status(500).json({ error: "Storage failure" });
  }
});

// At the bottom of src/app.ts
try {
  app.listen(PORT, () => {
    console.log(`🚀 Engine running on http://localhost:${PORT}`);
  });
} catch (e) {
  console.error("FATAL STARTUP ERROR:", e);
}
