@echo off
title Discord Security Bot Launcher
echo ===================================================
echo 🛡️ Starting Discord Security Bot and Web Dashboard...
echo ===================================================
echo.
cd /d "%~dp0"

echo 🛠️ Building the project...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo ❌ Build failed! Please check the errors above.
    pause
    exit /b %errorlevel%
)

echo.
echo 🚀 Starting the bot and dashboard...
call npm start
echo.
echo ⚠️ Bot process stopped.
pause

