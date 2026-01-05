import { createServer } from 'http';
import { Server } from 'socket.io';
import { Redis } from 'ioredis';
import app from './src/app.ts'; // server imports app (This is OK)

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
const redis = new Redis();

export async function broadcastUpdate(stravaId: string, name: string, meters: number) {
  const km = meters / 1000;
  await redis.hset('player_names', stravaId, name);
  const newTotalRaw = await redis.incrbyfloat('global_total', km);
  const newTotal = Number(newTotalRaw) || 0;
  await redis.zincrby('leaderboard', km, stravaId);

  const topRaw = await redis.zrevrange('leaderboard', 0, 9, 'WITHSCORES');
  const players = [];
  for (let i = 0; i < topRaw.length; i += 2) {
    const id = topRaw[i]!;
    const scoreRaw = topRaw[i + 1]!;
    const playerName = await redis.hget('player_names', id) || 'Anonymous';
    players.push({ 
      stravaId: id, 
      name: playerName, 
      distance: Number(scoreRaw).toFixed(2) 
    });
  }

  io.emit('leaderboardUpdate', { globalTotalKm: newTotal.toFixed(2), players });
}

// THE INJECTION: This allows app.ts to use the function without importing it
app.use((req: any, _res, next) => {
  req.broadcastUpdate = broadcastUpdate;
  next();
});

// --- GHOST ENGINE ---
if (process.env.NODE_ENV !== 'production') {
  setInterval(() => {
    broadcastUpdate("999", "Apex Predator", Math.floor(Math.random() * 200) + 10);
  }, 4000);
}

httpServer.listen(3001, () => {
  console.log(`🚀 Engine Live at http://localhost:3001`);
});