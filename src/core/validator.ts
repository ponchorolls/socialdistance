// Define the limit for human-powered speed (e.g., world-class downhill cycling)
// 18 meters/second is roughly 40mph.
const GLOBAL_SPEED_CAP_MPS = 18.0;

const ALLOWED_ACTIVITIES = [
  'running', 'walking', 'cycling', 'hiking', 
  'swimming', 'rowing', 'nordic_ski'
];

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  sanitizedDistance: number;
}

/**
 * Validates if a movement was body-powered and not motorized.
 */
export function validateHumanMovement(
  distanceMeters: number, 
  durationSeconds: number, 
  activityType: string
): ValidationResult {
  
  // 1. Activity Whitelist Check
  if (!ALLOWED_ACTIVITIES.includes(activityType.toLowerCase())) {
    return { isValid: false, reason: 'Activity type not in scope', sanitizedDistance: 0 };
  }

  // 2. The Speed Check (Distance / Time)
  const avgSpeed = distanceMeters / durationSeconds;
  
  if (avgSpeed > GLOBAL_SPEED_CAP_MPS) {
    return { isValid: false, reason: 'Speed exceeds human limits (Motorized?)', sanitizedDistance: 0 };
  }

  // 3. Minimum Threshold (Filter out GPS "jitter")
  if (distanceMeters < 1.0) {
    return { isValid: false, reason: 'Distance negligible', sanitizedDistance: 0 };
  }

  return {
    isValid: true,
    sanitizedDistance: distanceMeters
  };
}