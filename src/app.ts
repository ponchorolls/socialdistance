import express from 'express';
import { redis } from './infra/redis.js';
import { db } from './infra/postgres.js';
import { isHumanPowered } from './core/validator.js';
import { generateAnonName } from './core/naming.js';

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
    const totalRes = await db.query('SELECT SUM(total_distance_meters) as total FROM users');

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

    res.json({
      global_total: parseFloat(totalRes.rows[0].total || "0"),
      leaderboard: formatted });
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
  const { userId, distance, duration, activityType, source } = req.body;

  try {
    // 1. "Get or Create" the user with an anonymous name
    // This replaces the old SELECT check. 
    const userRes = await db.query(
      `INSERT INTO users (id, preferred_source, display_name) 
       VALUES ($1, 'garmin', $2) 
       ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id 
       RETURNING preferred_source, display_name`, 
      [userId, generateAnonName()]
    );

    // This will now always exist
    const user = userRes.rows[0];

    // 2. Source Lock Check (Now uses the returned row)
    // If the user exists, we respect their stored preference.
    // If they are new, they default to 'garmin'.
    if (source !== user.preferred_source) {
      console.log(`[sd] Ignoring ${source} data. ${user.display_name} prefers ${user.preferred_source}.`);
      return res.status(200).json({ status: "ignored", reason: "source_mismatch" });
    }

    // 3. Human-Powered Validation
    const check = isHumanPowered({ distanceMeters: distance, durationSeconds: duration, type: activityType });
    if (!check.valid) return res.status(400).json({ error: check.reason });

    // 4. Persistence
    await db.query('UPDATE users SET total_distance_meters = total_distance_meters + $1 WHERE id = $2', [distance, userId]);
    
    // 5. Leaderboard Update (Use the display_name, not the userId!)
    await redis.zincrby('global_leaderboard', distance, user.display_name);

    res.json({ 
      status: "Distance recorded", 
      identity: user.display_name,
      newDistance: distance 
    });
  } catch (err) {
    console.error(err);
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

app.get('/stats', async (req, res) => {
  try {
    // Sum the distances of all users in Postgres
    const result = await db.query('SELECT SUM(total_distance_meters) as total FROM users');
    const totalMeters = parseFloat(result.rows[0].total || "0");
    
    res.json({
      global_odometer_km: (totalMeters / 1000).toFixed(2),
      active_humans: result.rowCount
    });
  } catch (err) {
    res.status(500).json({ error: "Stats unavailable" });
  }
});

// Strava Handshake & Ingest
app.get('/webhooks/strava', (req, res) => {
  const challenge = req.query['hub.challenge'];
  const verifyToken = req.query['hub.verify_token'];

  // You define this token in the Strava Dashboard
  if (verifyToken === process.env.STRAVA_VERIFY_TOKEN) {
    return res.json({ "hub.challenge": challenge });
  }
  res.status(403).end();
});

app.post('/webhooks/strava', express.json(), async (req, res) => {
  console.log("🏃 Strava Activity Received:", req.body);
  
  // Strava sends an aspect_type (create/update/delete)
  // We only care about new activities
  if (req.body.aspect_type === 'create' && req.body.object_type === 'activity') {
    const activityId = req.body.object_id;
    const ownerId = req.body.owner_id;
    
    // Note: Strava webhooks usually only send the ID. 
    // You then have to fetch the full activity details using their API.
    // For now, we acknowledge receipt.
  }
  res.status(200).send('EVENT_RECEIVED');
});