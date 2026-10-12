#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required. Install Node.js, then run this file again."
  read -p "Press Enter to close..."
  exit 1
fi
node server.js &
PID=$!
sleep 1
open "http://localhost:3000"
wait $PID
