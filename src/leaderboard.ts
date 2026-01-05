import { Redis } from 'ioredis';

export const redis = new Redis();

export async function getLeaderboardData() {
  const totalRaw = await redis.get('global_total');
  const globalTotalKm = (Number(totalRaw) || 0).toFixed(2);

  const topRaw = await redis.zrevrange('leaderboard', 0, 9, 'WITHSCORES');
  const players = [];

  for (let i = 0; i < topRaw.length; i += 2) {
    const id = topRaw[i]!;
    const score = topRaw[i + 1]!;
    const name = await redis.hget('player_names', id) || 'Anonymous';
    players.push({
      stravaId: id,
      name: name,
      distance: Number(score).toFixed(2)
    });
  }

  return { globalTotalKm, players };
}