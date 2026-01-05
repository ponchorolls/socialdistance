import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './src/app.js'; 
import { getLeaderboardData, redis } from './src/leaderboard.js';

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    // We list every possible variation of your local address
    origin: [
      "http://localhost:3002", 
      "http://127.0.0.1:3002", 
      "http://0.0.0.0:3002"
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  }
});
// ADD THIS: Verify the connection in the terminal
io.on('connection', (socket) => {
  console.log(`🔌 New Client Connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log('❌ Client Disconnected');
  });
});

export async function broadcastUpdate(stravaId: string, name: string, meters: number) {
  const km = meters / 1000;
  await redis.hset('player_names', stravaId, name);
  await redis.incrbyfloat('global_total', km);
  await redis.zincrby('leaderboard', km, stravaId);

  const data = await getLeaderboardData();
  
  // Debug log to confirm emission
  console.log(`📡 Emitting to ${io.sockets.sockets.size} clients...`);
  io.emit('leaderboardUpdate', data);
}

// Inject broadcaster
app.use((req: any, _res, next) => {
  req.broadcastUpdate = broadcastUpdate;
  next();
});

const GHOSTS = [
  { id: "ghost_1", name: "Apex Predator" },
  { id: "ghost_2", name: "Midnight Runner" },
  { id: "ghost_3", name: "Neon Sprinter" },
  { id: "ghost_4", name: "Slow Burner" },
  { id: "ghost_5", name: "Mountain Goat" },
  { id: "ghost_6", name: "Happy Feet" },
  { id: "ghost_7", name: "Lonely Island" },
  { id: "ghost_8", name: "White Grapes" },
  { id: "ghost_9", name: "Silly Sardines" },
  { id: "ghost_10", name: "Fake Loops" },
  { id: "ghost_11", name: "Nice Tie" }
];

setInterval(() => {
  const ghost = GHOSTS[Math.floor(Math.random() * GHOSTS.length)]!;
  const nudge = Math.floor(Math.random() * 250) + 50;
  broadcastUpdate(ghost.id, ghost.name, nudge);
  
  console.log(`👻 Simulation: ${ghost.name} moved ${nudge}m`);
}, 1000); // 3 seconds for a faster-paced demo
httpServer.listen(3001, () => console.log("🚀 Server on 3001"));