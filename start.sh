#!/bin/bash
PORT="${1:-8080}"

# Kill any existing server on that port
PID=$(lsof -ti :"$PORT" 2>/dev/null)
if [ -n "$PID" ]; then
  echo "Stopping existing server on port $PORT (PID $PID)..."
  kill "$PID" 2>/dev/null
  sleep 0.5
fi

echo "Starting Commission Tracker on http://localhost:$PORT"
python3 -m http.server "$PORT"
