#!/bin/bash
# Start backend and frontend for local development.
# Backend runs in the background (port 5001); frontend runs in the foreground (port 3000).
# Press Ctrl+C to stop the frontend; the backend will be stopped automatically.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Check prerequisites
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required. Install it and try again."
    exit 1
fi
if ! command -v yarn &> /dev/null; then
    echo "❌ Yarn is required. Install it with: npm install -g yarn"
    exit 1
fi
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required."
    exit 1
fi

VENV_ACTIVATE="$REPO_ROOT/server/venv/bin/activate"
if [ ! -f "$VENV_ACTIVATE" ]; then
    echo "❌ Virtual environment not found at $REPO_ROOT/server/venv"
    echo "   Create it with: cd server && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

BACKEND_PID=""
FRONTEND_PID=""
cleanup() {
    echo ""
    echo "🛑 Stopping frontend and backend..."
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
    fi
    if command -v lsof &> /dev/null; then
        PIDS=$(lsof -ti:3000 2>/dev/null) || true
        if [ -n "$PIDS" ]; then
            echo "$PIDS" | xargs kill -9 2>/dev/null || true
        fi
    fi
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi
    if command -v lsof &> /dev/null; then
        PIDS=$(lsof -ti:5001 2>/dev/null) || true
        if [ -n "$PIDS" ]; then
            echo "$PIDS" | xargs kill -9 2>/dev/null || true
        fi
    fi
    exit 0
}
trap cleanup EXIT INT TERM

# Free port 5001 if something is still running from a previous session
if command -v lsof &> /dev/null; then
  PIDS=$(lsof -ti:5001 2>/dev/null) || true
  if [ -n "$PIDS" ]; then
    echo "🔄 Killing existing process on port 5001 (PID $PIDS)..."
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
fi

# Start backend in background (uses server/venv)
echo "🐍 Starting backend (port 5001)..."
(
    cd "$REPO_ROOT/server"
    source "$REPO_ROOT/server/venv/bin/activate"
    python app.py
) &
BACKEND_PID=$!

# Give backend a moment to bind
sleep 2
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "❌ Backend failed to start. Check server logs above."
    exit 1
fi

echo "✅ Backend running (PID $BACKEND_PID)"
echo "⚛️  Starting frontend (port 3000, API → http://localhost:5001)..."
echo "   Press Ctrl+C to stop both."
echo ""

# Start frontend in foreground (yarn start:local so it uses local backend).
# Do not use exec: we need the shell to stay alive so the trap runs on Ctrl+C.
cd "$REPO_ROOT/client"
yarn start:local &
FRONTEND_PID=$!
wait $FRONTEND_PID
