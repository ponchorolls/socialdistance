export interface DistancePacket {
  userId: string;
  distanceMeters: number;
  provider: 'garmin' | 'strava' | 'apple';
  activityType: string;
  timestamp: Date;
}