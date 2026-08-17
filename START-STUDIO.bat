@echo off
title BIG DOG Studio
cd /d "%~dp0"
if exist "release-studio\win-unpacked\BIG DOG Studio.exe" (
  start "" "release-studio\win-unpacked\BIG DOG Studio.exe"
  exit /b 0
)
echo Studio exe not found. Starting in dev mode...
set BIGDOG_ROLE=studio
node scripts\dev-studio.mjs
pause
