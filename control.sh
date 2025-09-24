#!/bin/bash

# Remote Audio Control Script
# Use: ./control.sh [mute|unmute|status]

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoib3BlcmF0b3IiLCJpYXQiOjE3NTg3MDE5NzEsImV4cCI6MTc1ODcwNTU3MX0.EdaiQ2Rd-t9YC-oghKPposG3_aCp8gCKR5bhL3V0agQ"
VEHICLE="vehicle-63c1here"

if [ -z "$1" ]; then
  echo "Usage: ./control.sh [mute|unmute|status]"
  exit 1
fi

CMD=$1

RESPONSE=$(curl -s -X POST http://localhost:4000/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"vehicle\":\"$VEHICLE\",\"command\":\"$CMD\"}")

echo "Sent command: $CMD"
echo "Response: $RESPONSE"
