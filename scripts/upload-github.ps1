# BIG DOG — create both GitHub repos and push this launcher.
# 1) Create a token: https://github.com/settings/tokens
#    Classic, scopes: repo
# 2) Paste this whole file into PowerShell, OR run:
#    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\upload-github.ps1

$ErrorActionPreference = "Stop"
$Owner = "scra976"
$LauncherRepo = "BIGDOGLAUNCHER"
$GamesRepo = "bigdog-games"
$Root = "C:\Users\Wesle\Desktop\Development\BIGDOGLAUNCHER"

if (-not $env:GITHUB_TOKEN) {
  $secure = Read-Host "Paste your GitHub token (repo scope)" -AsSecureString
  $env:GITHUB_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  )
}
$Token = $env:GITHUB_TOKEN.Trim()
if (-not $Token) { throw "No token." }

$Headers = @{
  Authorization = "Bearer $Token"
  Accept = "application/vnd.github+json"
  "User-Agent" = "BIG-DOG-Launcher"
  "X-GitHub-Api-Version" = "2022-11-28"
}

function Ensure-Repo([string]$Name, [string]$Description, [bool]$HasReadme = $false) {
  $check = Invoke-WebRequest -Uri "https://api.github.com/repos/$Owner/$Name" -Headers $Headers -SkipHttpErrorCheck
  if ($check.StatusCode -eq 200) {
    Write-Host "Repo exists: https://github.com/$Owner/$Name"
    return
  }
  $body = @{
    name = $Name
    description = $Description
    private = $false
    auto_init = $HasReadme
  } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "https://api.github.com/user/repos" -Headers $Headers -Body $body -ContentType "application/json"
  Write-Host "Created https://github.com/$Owner/$Name"
}

function New-GitHubRelease([string]$Repo, [string]$Tag, [string]$Title, [string]$Notes, [string]$ZipPath) {
  $existing = Invoke-WebRequest -Uri "https://api.github.com/repos/$Owner/$Repo/releases/tags/$Tag" -Headers $Headers -SkipHttpErrorCheck
  if ($existing.StatusCode -eq 200) {
    $release = $existing.Content | ConvertFrom-Json
    Write-Host "Release $Tag already exists."
  } else {
    $body = @{
      tag_name = $Tag
      name = $Title
      body = $Notes
      draft = $false
    } | ConvertTo-Json
    $release = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$Owner/$Repo/releases" -Headers $Headers -Body $body -ContentType "application/json"
    Write-Host "Created release $Tag"
  }
  if (-not $ZipPath -or -not (Test-Path $ZipPath)) { return $release }
  $name = [IO.Path]::GetFileName($ZipPath)
  $uploadUrl = ($release.upload_url -replace "\{\?name,label\}", "") + "?name=$([uri]::EscapeDataString($name))"
  $bytes = [IO.File]::ReadAllBytes($ZipPath)
  Invoke-RestMethod -Method Post -Uri $uploadUrl -Headers (@{
    Authorization = "Bearer $Token"
    Accept = "application/vnd.github+json"
    "User-Agent" = "BIG-DOG-Launcher"
    "Content-Type" = "application/octet-stream"
  }) -Body $bytes
  Write-Host "Uploaded $name"
  return $release
}

Set-Location $Root
Ensure-Repo $LauncherRepo "BIG DOG game launcher — store, downloads, updates"
Ensure-Repo $GamesRepo "BIG DOG game zips for the launcher" $true

if (-not (Test-Path "$Root\.git")) {
  git init
  git checkout -b main
  git add .
  git status
  git commit -m "BIG DOG Launcher 1.0.0"
}

git remote remove origin 2>$null
git remote add origin "https://$Owner`:$Token@github.com/$Owner/$LauncherRepo.git"
git push -u origin main
git remote set-url origin "https://github.com/$Owner/$LauncherRepo.git"
Write-Host "Pushed https://github.com/$Owner/$LauncherRepo"

$setup = Join-Path $Root "release\BigDogLauncher-Setup-1.0.0.exe"
$yml = Join-Path $Root "release\latest.yml"
if (Test-Path $setup) {
  New-GitHubRelease $LauncherRepo "v1.0.0" "BIG DOG Launcher 1.0.0" "First installer wizard. Players run this Setup.exe." $setup | Out-Null
  if (Test-Path $yml) {
    New-GitHubRelease $LauncherRepo "v1.0.0" "BIG DOG Launcher 1.0.0" "" $yml | Out-Null
  }
  Write-Host "Installer release: https://github.com/$Owner/$LauncherRepo/releases/tag/v1.0.0"
}

Write-Host ""
Write-Host "Done."
Write-Host "Launcher: https://github.com/$Owner/$LauncherRepo"
Write-Host "Games:    https://github.com/$Owner/$GamesRepo"
Write-Host "Catalog:  https://raw.githubusercontent.com/$Owner/$LauncherRepo/main/catalog/catalog.json"
