// src/core/validator.ts

// Speed limits in meters per second (m/s)
const LIMITS = {
  MAX_RUNNING: 12,    // ~27 mph (Usain Bolt sprint)
  MAX_CYCLING: 25,    // ~56 mph (World-class downhill)
  MIN_EFFORT: 0.1     // Filter out GPS "jitter" while standing still
};

export interface ActivityPacket {
  distanceMeters: number;
  durationSeconds: number;
  type: 'run' | 'cycle' | 'walk';
}

export function isHumanPowered(packet: ActivityPacket): { valid: boolean; reason?: string } {
  const { distanceMeters, durationSeconds, type } = packet;
  
  // 1. Minimum Threshold Filter (The Jitter Filter)
  // If the movement is less than 10 meters, ignore it.
  if (distanceMeters < 10) {
    return { valid: false, reason: "Movement below threshold (Jitter)" };
  }

  // 2. Minimum Pace Filter
  // Humans moving intentionally usually move faster than 0.3 m/s (~1 km/h)
  const avgSpeed = distanceMeters / durationSeconds;
  if (avgSpeed < 0.3) {
    return { valid: false, reason: "Pace too slow to be intentional movement" };
  }

  // 3. Maximum Ceilings (Previously added)
  if (type === 'run' && avgSpeed > 12) return { valid: false, reason: "Speed exceeds human running limits" };
  if (type === 'cycle' && avgSpeed > 25) return { valid: false, reason: "Speed exceeds human cycling limits" };

  return { valid: true };
}

export function normalizeActivity(raw: any, source: 'strava' | 'garmin') {
  if (source === 'strava') {
    return {
      distanceMeters: raw.distance, // Strava is usually meters
      durationSeconds: raw.moving_time,
      type: raw.type.toLowerCase() === 'run' ? 'run' : 'cycle'
    };
  }
  // Garmin usually sends a different payload structure
  return {
    distanceMeters: raw.distanceInMeters,
    durationSeconds: raw.durationInSeconds,
    type: raw.activityType.toLowerCase()
  };
}