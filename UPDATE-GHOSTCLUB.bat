@echo off
title BIG DOG — push Ghost Club update
cd /d "%~dp0"
echo.
echo ============================================
echo   Push a Ghost Club update to every launcher
echo ============================================
echo.
echo 1. Export a NEW Godot Windows build first.
echo 2. Replace the files in:  C:\Users\Wesle\Desktop\Development\GhostClub
echo    (Casino.exe + Casino.pck)
echo 3. Type a HIGHER version than last time.
echo    Last public release was 1.0.0  so use  1.0.1  or  1.1.0
echo.
if not exist "C:\Users\Wesle\Desktop\Development\GhostClub\Casino.exe" (
  echo Could not find C:\Users\Wesle\Desktop\Development\GhostClub\Casino.exe
  pause
  exit /b 1
)
set /p GAME_VERSION=New version: 
if "%GAME_VERSION%"=="" (
  echo No version typed.
  pause
  exit /b 1
)
echo.
echo Paste a GitHub token with repo access.
echo Right-click to paste. Letters will not show. That is normal.
echo.
set /p GITHUB_TOKEN=Token: 
if "%GITHUB_TOKEN%"=="" (
  echo No token pasted.
  pause
  exit /b 1
)
echo.
echo Packing and uploading Ghost Club v%GAME_VERSION% ...
echo Leave this window open. 400 MB takes a few minutes.
echo.
node scripts\upload-game.mjs ghostclub "C:\Users\Wesle\Desktop\Development\GhostClub" --version %GAME_VERSION%
echo.
echo If you see SUCCESS, every BIG DOG launcher will show Update
echo the next time that player opens the app or hits Refresh catalog.
echo.
pause
