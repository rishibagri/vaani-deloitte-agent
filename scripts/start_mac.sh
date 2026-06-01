#!/bin/bash
set -e
cd "$(dirname "$0")/.."

if [ ! -f backend/.venv/bin/activate ]; then
  echo "[ERROR] Virtual environment not found at backend/.venv/"
  echo "        Run: python3 -m venv backend/.venv && source backend/.venv/bin/activate && pip install -r backend/requirements.txt"
  exit 1
fi

source backend/.venv/bin/activate
echo "Starting Vaani (Mac mode — MuseTalk auto-disabled on no CUDA)..."

cd backend
python3 main.py &
BACKEND_PID=$!

cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo ""
echo "Open http://localhost:5173 in Chrome"
echo "Press Ctrl+C to stop both servers"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait $BACKEND_PID $FRONTEND_PID
