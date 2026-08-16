@echo off
title BIG DOG — upload launcher to GitHub
cd /d "%~dp0"
echo.
echo ============================================
echo   BIG DOG — upload launcher to GitHub
echo ============================================
echo.
echo You need a GitHub token first.
echo.
echo  1. A GitHub page will open
echo  2. If asked, log in
echo  3. Note is already BIG DOG
echo  4. Make sure repo is CHECKED
echo  5. Scroll to the bottom
echo  6. Click green: Generate token
echo  7. Click the copy icon next to the token
echo.
pause
start "" "https://github.com/settings/tokens/new?scopes=repo&description=BIG%%20DOG"
echo.
echo After you copy the token, paste it below.
echo (Right-click in this window to paste. Letters will not show. That is normal.)
echo.
set /p GITHUB_TOKEN=Token: 
if "%GITHUB_TOKEN%"=="" (
  echo No token pasted.
  pause
  exit /b 1
)
echo.
echo Uploading. Leave this window open...
echo.
node scripts\upload-github.mjs
echo.
pause
