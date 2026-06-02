@echo off
echo ===================================================
echo  Vaani - Starting both servers
echo ===================================================
echo.

REM Backend in a named Command Prompt window
start "Vaani Backend" cmd /k "cd /d %~dp0.. && backend\.venv\Scripts\activate && cd backend && python main.py"

REM Short delay so the backend binds its port before the frontend hits it
timeout /t 3 /nobreak >nul

REM Frontend in a separate named Command Prompt window
start "Vaani Frontend" cmd /k "cd /d %~dp0..\frontend && npm run dev"

echo.
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo.
echo  Open http://localhost:5173 in Chrome or Edge.
echo  Close both terminal windows to stop.
echo.
