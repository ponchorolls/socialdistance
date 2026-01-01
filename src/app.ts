import express from 'express';
import { redis } from './infra/redis.js';
import { db } from './infra/postgres.js';
import { isHumanPowered } from './core/validator.js';

// Add this near the top of app.ts
process.on('SIGINT', () => {
  console.log("\nShutting down sd-engine...");
  process.exit(0);
});

const app = express();
const PORT = 3000;

app.get('/pulse', async (req, res) => {
  try {
    // 1. Check Postgres: Can we talk to the DB?
    const dbCheck = await db.query('SELECT NOW()');
    
    // 2. Check Redis: Is the cache responsive?
    const redisCheck = await redis.ping();

    // If both pass, we are truly ONLINE
    res.json({ 
      status: "ONLINE", 
      timestamp: dbCheck.rows[0].now,
      services: {
        database: "CONNECTED",
        cache: redisCheck === "PONG" ? "CONNECTED" : "OFFLINE"
      }
    });
  } catch (err: any) {
    // If any service fails, the engine is DEGRADED
    console.error("[sd] Pulse Check Failed:", err.message);
    res.status(500).json({ 
      status: "DEGRADED", 
      error: "Service dependency unreachable",
      detail: err.message
    });
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
      // Ensure we have a string before passing to parseFloat
      const scoreString = board[i + 1];
      
      if (scoreString !== undefined) {
        formatted.push({
          userId: board[i],
          distance: parseFloat(scoreString)
        });
      }
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
  const { userId, distance, duration, activityType, source } = req.body; // 'source' might be 'strava' or 'garmin'

  try {
    // 1. Fetch user's preferred source
    // Replacement for the "SELECT" block in /ingest
    const userRes = await db.query(
      `INSERT INTO users (id, preferred_source) 
       VALUES ($1, 'garmin') 
       ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
       RETURNING preferred_source`, 
      [userId]
    );
    const user = userRes.rows[0];

    if (!user) return res.status(404).json({ error: "User not found" });

    // 2. Source Lock Check: Only accept data from the chosen source
    if (source !== user.preferred_source) {
      console.log(`[sd] Ignoring ${source} data. User prefers ${user.preferred_source}.`);
      return res.status(200).json({ status: "ignored", reason: "source_mismatch" });
    }

    // 3. Human-Powered Validation
    const check = isHumanPowered({ distanceMeters: distance, durationSeconds: duration, type: activityType });
    if (!check.valid) return res.status(400).json({ error: check.reason });

    // 4. Atomic Updates
    await db.query('UPDATE users SET total_distance_meters = total_distance_meters + $1 WHERE id = $2', [distance, userId]);
    await redis.zincrby('global_leaderboard', distance, userId);

    res.json({ status: "Distance recorded", newDistance: distance });
  } catch (err) {
    res.status(500).json({ error: "Ingestion failure" });
  }
});

app.put('/profile/:userId', express.json(), async (req, res) => {
  const { userId } = req.params;
  const { preferredSource } = req.body; // e.g., 'strava' or 'garmin'

  const validSources = ['garmin', 'strava', 'wahoo'];
  if (!validSources.includes(preferredSource)) {
    return res.status(400).json({ error: "Invalid source provider" });
  }

  try {
    const result = await db.query(
      'UPDATE users SET preferred_source = $1 WHERE id = $2 RETURNING id, preferred_source',
      [preferredSource, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ status: "Profile updated", user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});