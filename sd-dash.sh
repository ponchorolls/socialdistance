#!/usr/bin/env bash

# Fetch data from Redis
TOTAL_METERS=$(docker exec sd-redis redis-cli GET global_total || echo 0)
# Get top 10 from Sorted Set 'leaderboard' with scores
RAW_LEADERBOARD=$(docker exec sd-redis redis-cli ZREVRANGE leaderboard 0 9 WITHSCORES)

# Convert meters to KM (using bc for floating point math)
TOTAL_KM=$(echo "scale=2; $TOTAL_METERS / 1000" | bc)

clear
echo "🌍 GLOBAL MOVEMENT: $TOTAL_KM km"
echo "-----------------------------------------"
echo "RANK  |  USER                  |  DISTANCE"
echo "-----------------------------------------"

# Loop through the Redis output (Name followed by Score)
rank=1
echo "$RAW_LEADERBOARD" | xargs -n2 | while read -r name score; do
    if [ -n "$name" ]; then
        km=$(echo "scale=2; $score / 1000" | bc)
        printf "%-5s |  %-21s |  %s km\n" "$rank" "$name" "$km"
        ((rank++))
    fi
done

if [ $rank -eq 1 ]; then
    echo "       (Waiting for first movement...)"
fi
echo "-----------------------------------------"