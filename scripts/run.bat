@echo off
echo Starting Vaani...

REM Start backend
start "Vaani Backend" cmd /k "call backend\.venv\Scripts\activate.bat && cd backend && python main.py"

REM Give backend a few seconds to start
timeout /t 4 /nobreak >nul

REM Start frontend
start "Vaani Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Backend : http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Open http://localhost:5173 in Chrome or Edge.
echo Close both terminal windows to stop.
