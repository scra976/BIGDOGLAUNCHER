@echo off
title BIG DOG — upload Ghost Club
cd /d "%~dp0"
echo.
echo This packs C:\Users\Wesle\Desktop\GhostClub and uploads it.
echo Paste the same GitHub token you used for the launcher.
echo (Right-click to paste. Letters will not show. That is normal.)
echo.
set /p GITHUB_TOKEN=Token: 
if "%GITHUB_TOKEN%"=="" (
  echo No token pasted.
  pause
  exit /b 1
)
if not exist "C:\Users\Wesle\Desktop\GhostClub\Casino.exe" (
  echo.
  echo Could not find C:\Users\Wesle\Desktop\GhostClub\Casino.exe
  echo Put the Godot export there first.
  pause
  exit /b 1
)
node scripts\upload-game.mjs ghostclub "C:\Users\Wesle\Desktop\GhostClub"
echo.
pause
