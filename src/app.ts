import 'dotenv/config';

const STRAVA_VERIFY_TOKEN = process.env.STRAVA_VERIFY_TOKEN;
// ... rest of your code
//


import express from 'express';
import { redis } from './infra/redis.js';
import { pool } from './infra/postgres.js';
import { isHumanPowered } from './core/validator.js';
import { generateAnonName } from './core/naming.js';

import 'dotenv/config';


// Redis Connection (The Real-time Leaderboard)
// const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Test connections on startup
// pool.on('connect', () => console.log('🐘 Postgres Connected'));
console.log('🐘 Postgres Pool Initialized');
redis.on('connect', () => console.log('🚀 Redis Connected'));

// Add this near the top of app.ts
process.on('SIGINT', () => {
  console.log("\nShutting down sd-engine...");
  process.exit(0);
});

const app = express();
app.use(express.json());
const PORT = 3000;

app.get('/pulse', async (req, res) => {
  try {
    // 1. Check Postgres: Can we talk to the DB?
    const dbCheck = await pool.query('SELECT NOW()');
    
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
    const totalRes = await pool.query('SELECT SUM(total_distance_meters) as total FROM users');

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
    const userRes = await pool.query(
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
    await pool.query('UPDATE users SET total_distance_meters = total_distance_meters + $1 WHERE id = $2', [distance, userId]);
    
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
    const result = await pool.query(
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
    const result = await pool.query('SELECT SUM(total_distance_meters) as total FROM users');
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
  // Strava sends these as query parameters
  const challenge = req.query['hub.challenge'];
  const verifyToken = req.query['hub.verify_token'];
  const mode = req.query['hub.mode'];

  console.log(`[sd] Received webhook verification request: ${mode}`);

  // Check if the token matches what you put in your .env and the curl command
  if (mode === 'subscribe' && verifyToken === process.env.STRAVA_VERIFY_TOKEN) {
    console.log('[sd] Webhook verified successfully.');
    // You MUST return the challenge in this exact JSON format
    return res.status(200).json({ "hub.challenge": challenge });
  }

  console.error('[sd] Webhook verification failed. Token mismatch.');
  res.status(403).json({ error: "Verification failed" });
});

app.post('/webhooks/strava', async (req, res) => {
  const { aspect_type, object_id, owner_id } = req.body;

  // 1. Acknowledge receipt immediately (Strava needs this < 2s)
  res.status(200).send('EVENT_RECEIVED');

  // 2. Process in background
  if (aspect_type === 'create' && req.body.object_type === 'activity') {
    try {
      // Look up the user by their Strava ID
      const userResult = await pool.query(
        'SELECT strava_refresh_token FROM users WHERE strava_id = $1',
        [owner_id.toString()]
      );

      if (userResult.rows.length > 0) {
        const refreshToken = userResult.rows[0].strava_refresh_token;

        // Exchange refresh token for a fresh access token
        const tokenResponse = await fetch('https://www.strava.com/api/v3/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
          })
        });
        const tokens = await tokenResponse.json();

        // Fetch the actual activity details
        const activityRes = await fetch(`https://www.strava.com/api/v3/activities/${object_id}`, {
          headers: { 'Authorization': `Bearer ${tokens.access_token}` }
        });
        const activity = await activityRes.json();

        console.log(`🏃 New Activity: ${activity.name} - ${activity.distance}m`);

        // 3. Record the distance in our system
        // This will update the Postgres total and the Redis leaderboard
        await ingestDistance(owner_id.toString(), activity.distance);
      }
    } catch (err) {
      console.error("❌ Webhook Processing Error:", err);
    }
  }
});

// 1. The "Login" - Redirects you to Strava
app.get('/login', (req, res) => {
  const scope = 'activity:read_all';
  const redirectUri = 'https://social-distance.com/auth/callback';
  const url = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${redirectUri}&approval_prompt=force&scope=${scope}`;
  res.redirect(url);
});

// 2. The "Callback" - Receives the code and swaps it for a permanent Refresh Token
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;

  const response = await fetch('https://www.strava.com/api/v3/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code'
    })
  });

  const data = await response.json();

  // Safety Check: If athlete is missing, we use a generic ID or skip the name log
  const stravaId = data.athlete?.id?.toString() || data.id?.toString();
  const username = data.athlete?.username || `user_${stravaId}`;

  console.log(`🔑 Tokens received for Strava ID: ${stravaId}`);

  if (!stravaId || !data.refresh_token) {
    return res.status(400).send("Auth failed: No tokens received.");
  }

  // Update or Create the user
  // Using COALESCE ensures we don't overwrite an existing display_name with a generic one
  
  try {
    await pool.query(
      `INSERT INTO users (display_name, strava_id, strava_refresh_token) 
       VALUES ($1, $2, $3)
       ON CONFLICT (strava_id) 
       DO UPDATE SET strava_refresh_token = $3`,
      [username, stravaId, data.refresh_token]
    );
    res.send("Sync Complete.");
  } catch (dbError) {
    console.error("❌ Database Error:", dbError);
    res.status(500).send("Database sync failed. Check your terminal.");
  }   
});

async function ingestDistance(stravaId: string, distanceMeters: number) {
  // 1. Validation Logic
  if (distanceMeters < 10) {
    console.log(`[sd] Ignoring tiny movement: ${distanceMeters}m`);
    return;
  }

  // 2. Update Postgres (The permanent record)
  const pgResult = await pool.query(
    `UPDATE users 
     SET total_distance = total_distance + $1 
     WHERE strava_id = $2 
     RETURNING display_name, total_distance`,
    [distanceMeters, stravaId]
  );

  if (pgResult.rows.length > 0) {
    const { display_name, total_distance } = pgResult.rows[0];

    // 3. Update Redis (The real-time leaderboard)
    // Redis uses 'ZADD' for Sorted Sets
    await redis.zadd('leaderboard', total_distance, display_name);
    
    console.log(`✅ Success: ${display_name} reached ${total_distance / 1000}km`);
  } else {
    console.error(`❌ User with Strava ID ${stravaId} not found in pool.`);
  }
}