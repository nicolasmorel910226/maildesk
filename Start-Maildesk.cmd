@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js LTS version 22.13 or newer, then run this file again.
  pause
  exit /b 1
)
node scripts\launch.mjs
pause
