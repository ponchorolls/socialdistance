import 'dotenv/config';
import cors from 'cors';
import path from 'path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { redis } from './infra/redis.js';
import { pool } from './infra/postgres.js';
import { isHumanPowered } from './core/validator.js';
import { generateAnonName } from './core/naming.js';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { getLeaderboardData } from './leaderboard.js'; 

interface Player {
  stravaId: string;
  name: string;
  distance: string;
}

// Test connections on startup
console.log('🐘 Postgres Pool Initialized');
redis.on('connect', () => console.log('🚀 Redis Connected'));

process.on('SIGINT', () => {
  console.log("\nShutting down sd-engine...");
  process.exit(0);
});

const STRAVA_VERIFY_TOKEN = process.env.STRAVA_VERIFY_TOKEN;
const app = express();
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'https://social-distance.com'],
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());
const PORT = 3000;
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'https://social-distance.com'],
    methods: ["GET", "POST"]
  }
});

// This runs when you refresh the page
app.get('/api/leaderboard', async (_req, res) => {
  try {
    const data = await getLeaderboardData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch" });
  }
});

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

// DEDICATED TEST ROUTE - Safely separate from real Strava logic
app.post('/api/test-user', async (req, res) => {
  const { name, distanceMeters, stravaId } = req.body;

  try {
    console.log(`[test] Creating mock data for ${name}...`);

    // 1. Ensure user exists in Postgres
    await pool.query(
      `INSERT INTO users (strava_id, display_name, total_distance) 
       VALUES ($1, $2, 0) 
       ON CONFLICT (strava_id) DO UPDATE SET display_name = $2`,
      [stravaId.toString(), name]
    );

    // 2. Trigger your existing ingest logic
    // This handles the Postgres update, Redis update, and WebSocket emit
    await ingestDistance(stravaId.toString(), Number(distanceMeters));

    res.status(200).json({ message: `Successfully injected ${name}` });
  } catch (err) {
    console.error("Test Route Error:", err);
    res.status(500).json({ error: "Failed to inject test data" });
  }
});

app.get('/leaderboard', async (req, res) => {
  try {
    // Get the top 10 users, highest score first
    const board = await redis.zrevrange('global_leaderboard', 0, 9, 'WITHSCORES');
    const totalRes = await pool.query('SELECT SUM(total_distance_meters) as total FROM users');

    const formatted = [];
    for (let i = 0; i < board.length; i += 2) {
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


app.post('/ingest', express.json(), async (req, res) => {
  const { userId, distance, duration, activityType, source } = req.body;

  try {
    const userRes = await pool.query(
      `INSERT INTO users (id, preferred_source, display_name) 
       VALUES ($1, 'garmin', $2) 
       ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id 
       RETURNING preferred_source, display_name`, 
      [userId, generateAnonName()]
    );

    const user = userRes.rows[0];

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

        // Record the distance in our system
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

  // 1. Check if we already have this user
  const existingUser = await pool.query(
    'SELECT display_name FROM users WHERE strava_id = $1',
    [stravaId]
  );

  let displayName;

  if (existingUser.rows.length > 0) {
    // Use their existing anonymous name
    displayName = existingUser.rows[0].display_name;
  } else {
    // Generate a brand new one for a new user
    const adjectives = ["Misty", "Silent", "Swift", "Golden", "Vivid"];
    const animals = ["Otter", "Falcon", "Fox", "Panda", "Deer"];
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
    const randomNumber = Math.floor(1000 + Math.random() * 9000);
  
    displayName = `${randomAdjective}-${randomAnimal}-${randomNumber}`;
  }

  console.log(`🔑 Tokens received for Strava ID: ${stravaId}`);

  if (!stravaId || !data.refresh_token) {
    return res.status(400).send("Auth failed: No tokens received.");
  }

  try {
    await pool.query(
    `INSERT INTO users (display_name, strava_id, strava_refresh_token) 
     VALUES ($1, $2, $3)
     ON CONFLICT (strava_id) 
     DO UPDATE SET strava_refresh_token = $3`,
    [displayName, stravaId, data.refresh_token]
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

  try {
    // 2. Update Postgres & Get New Total
    const pgResult = await pool.query(
      `UPDATE users 
       SET total_distance = total_distance + $1 
       WHERE strava_id = $2 
       RETURNING display_name, total_distance`,
      [distanceMeters, stravaId]
    );

    if (pgResult.rows.length > 0) {
      const { display_name, total_distance } = pgResult.rows[0];

      // 3. Update Redis Global Total
      await redis.incrbyfloat('global_total', distanceMeters);

      // 4. Update Redis Leaderboard (Using ID:Name composite for frontend highlighting)
      // Note: This overwrites the old score for this specific ID:Name key
      await redis.zadd('leaderboard', total_distance, `${stravaId}:${display_name}`);
      
      console.log(`✅ Success: ${display_name} moved ${distanceMeters}m. Total: ${total_distance / 1000}km`);
    } else {
      console.error(`❌ User with Strava ID ${stravaId} not found in database.`);
      return; 
    }

    // 5. Fetch updated stats from Redis for the broadcast
    const totalMeters = await redis.get('global_total') || '0';
    const rawLeaderboard = await redis.zrevrange('leaderboard', 0, 19, 'WITHSCORES');

    const players: Player[] = [];

    // 6. The Loop: Parse the composite Redis keys into the Player interface
    for (let i = 0; i < rawLeaderboard.length; i += 2) {
      const composite = rawLeaderboard[i]; // "12345:Name"
      const score = rawLeaderboard[i + 1];  // "50000"

      if (typeof composite === 'string' && typeof score === 'string') {
        const parts = composite.split(':');
        const id = parts[0];
        const name = parts.slice(1).join(':');

        players.push({
          stravaId: id as string,
          name: name || 'Unknown',
          distance: (parseFloat(score) / 1000).toFixed(2),
        });
      }
    }

    // 7. Construct and Broadcast Payload
    const payload = {
      globalTotalKm: (parseFloat(totalMeters) / 1000).toFixed(2),
      players: players
    };

    io.emit('leaderboardUpdate', payload);
    console.log(`📡 Broadcast: Updated leaderboard sent to all clients.`);

  } catch (err) {
    console.error("❌ Critical Ingest Error:", err);
  }
}

app.get('/api/leaderboard', async (req, res) => {
  try {
    // 1. Get the global total
    const totalMeters = await redis.get('global_total') || '0';
    
    // 2. Get the top 20 users with their scores
    const rawLeaderboard = await redis.zrevrange('leaderboard', 0, 19, 'WITHSCORES');
    
    // 3. Format the data into a clean JSON array
    const leaderboard = [];
    for (let i = 0; i < rawLeaderboard.length; i += 2) {
      const name = rawLeaderboard[i];
      const score = rawLeaderboard[i + 1];

      // Only push if both name and score exist
      if (name !== undefined && score !== undefined) {
        leaderboard.push({
          name: name,
          distance: (parseFloat(score) / 1000).toFixed(2),
        });
      }
    }

    res.json({
      globalTotalKm: (parseFloat(totalMeters) / 1000).toFixed(2),
      players: leaderboard
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// DELETE THIS -- FOR DEV ONLY
app.post('/api/admin/reset-all', async (req, res) => {
  try {
    // 1. Clear Postgres distances
    await pool.query('UPDATE users SET total_distance = 0');

    // 2. Wipe Redis
    await redis.del('global_total');
    await redis.del('leaderboard');

    // 3. Tell the frontend everyone is at zero
    io.emit('leaderboardUpdate', {
      globalTotalKm: "0.00",
      players: []
    });

    res.json({ message: "Challenge reset successfully" });
  } catch (err) {
    res.status(500).json({ error: "Reset failed" });
  }
});

// Serve the static files from the React build
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, 'frontend/dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

app.post('/api/strava-webhook', async (req: any, res: Response) => {
  const { stravaId, name, meters } = req.body;

  // We check if the broadcaster was attached by server.ts
  if (req.broadcastUpdate) {
    await req.broadcastUpdate(stravaId, name, meters);
  }

  res.sendStatus(200);
});

export default app;