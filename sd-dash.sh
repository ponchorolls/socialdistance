#!/usr/bin/env bash
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Fetch data
DATA=$(curl -s http://localhost:3000/leaderboard)

clear
echo -e "${YELLOW}🌍 GLOBAL MOVEMENT:${NC} $(echo $DATA | jq -r '.global_total / 1000 | tonumber | round') km"
echo -e "${CYAN}-----------------------------------------${NC}"
echo -e "RANK  |  USER                 |  DISTANCE"
echo -e "-----------------------------------------"

# We use (str + "          ")[:10] to simulate rpad(10)
echo $DATA | jq -r '
  .leaderboard | 
  to_entries[] | 
  "\( .key + 1 )     |  \( (.value.userId + "          ")[:20] ) |  \( (.value.distance / 1000) | tonumber ) km"
'