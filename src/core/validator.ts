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
  
  if (durationSeconds <= 0) return { valid: false, reason: "Invalid duration" };

  const avgSpeed = distanceMeters / durationSeconds;

  // Check against activity-specific ceilings
  if (type === 'run' && avgSpeed > LIMITS.MAX_RUNNING) {
    return { valid: false, reason: "Speed exceeds human running limits" };
  }

  if (type === 'cycle' && avgSpeed > LIMITS.MAX_CYCLING) {
    return { valid: false, reason: "Speed exceeds human cycling limits" };
  }

  if (avgSpeed < LIMITS.MIN_EFFORT) {
    return { valid: false, reason: "Insufficient effort detected (Jitter)" };
  }

  return { valid: true };
}
