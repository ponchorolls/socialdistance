#!/usr/bin/env bash

# Example Usage: ./ingest.sh 5000 run
curl -X POST http://localhost:3000/ingest \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$USER\", \"distance\": $1, \"duration\": 1800, \"activityType\": \"$2\", \"source\": \"garmin\"}"