@echo off
REM Eagle — launch the local dev stack (zero-infra: SQLite + local file storage).
REM Prereqs (run once): npm install  &&  npm run db:generate  &&  npm run db:push  &&  npm run db:seed

echo Launching Eagle API, Dashboard, and Marketing site...
start "eagle-api"       cmd /k "npm run dev:api"
start "eagle-dashboard" cmd /k "npm run dev:dashboard"
start "eagle-web"       cmd /k "npm run dev:web"

echo.
echo   API        http://localhost:4000/api   (SQLite, no Docker)
echo   Dashboard  http://localhost:5173        login: owner@eagle.test / eagle1234
echo   Marketing  http://localhost:5174
echo.
echo To run a monitoring agent on THIS machine, generate an install token in
echo the dashboard (Employees -> Get install token), then run:
echo   npm run agent -- --server http://localhost:4000 --token ^<TOKEN^>
echo.
pause
