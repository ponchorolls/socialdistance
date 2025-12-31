import { redis } from '../infra/redis';       // Import the addition
import { db } from '../infra/postgres';       // Import the addition
import { validateHumanMovement } from '../core/validator';

export async function handleIngestion(req: any, res: any) {
  // ... (Normalization and Validation logic)

  const { userId, sanitizedDistance } = validation;

  try {
    // These calls now use the Docker containers you spun up
    await redis.zincrby('global_leaderboard', sanitizedDistance, userId);
    await db.query(
      'UPDATE users SET total_distance_meters = total_distance_meters + $1 WHERE id = $2',
      [sanitizedDistance, userId]
    );

    res.status(200).send("Odometer updated.");
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).send("Internal Error");
  }
}