# BIG DOG — pack a game folder and upload it to scra976/bigdog-games
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\upload-game.ps1 -Id ghostclub -Src "C:\Users\Wesle\Desktop\GhostClub"
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\upload-game.ps1 -Id spire -Src "C:\path\to\windows-export"
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\upload-game.ps1 -Id cryptotable -Src "C:\Users\Wesle\Desktop\Development\Crypto Casino\dist"

param(
  [Parameter(Mandatory = $true)][string]$Id,
  [Parameter(Mandatory = $true)][string]$Src,
  [string]$Notes = ""
)

$ErrorActionPreference = "Stop"
$Owner = "scra976"
$GamesRepo = "bigdog-games"
$Root = "C:\Users\Wesle\Desktop\Development\BIGDOGLAUNCHER"
$Catalog = Get-Content "$Root\catalog\catalog.json" -Raw | ConvertFrom-Json
$Game = $Catalog.games | Where-Object { $_.id -eq $Id }
if (-not $Game) { throw "Unknown id '$Id'. Valid: $($Catalog.games.id -join ', ')" }
if (-not $Game.github) { throw "$Id is bundled / has no GitHub target." }
if (-not (Test-Path $Src)) { throw "Folder not found: $Src" }

if (-not $env:GITHUB_TOKEN) {
  $secure = Read-Host "Paste your GitHub token (repo scope)" -AsSecureString
  $env:GITHUB_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  )
}
$Token = $env:GITHUB_TOKEN.Trim()
$Headers = @{
  Authorization = "Bearer $Token"
  Accept = "application/vnd.github+json"
  "User-Agent" = "BIG-DOG-Launcher"
  "X-GitHub-Api-Version" = "2022-11-28"
}

$Packs = Join-Path $env:USERPROFILE "Desktop\BigDogPacks"
New-Item -ItemType Directory -Force -Path $Packs | Out-Null
$Asset = $Game.github.asset
if (-not $Asset) { $Asset = "$Id-windows.zip" }
$Zip = Join-Path $Packs $Asset
if (Test-Path $Zip) { Remove-Item $Zip -Force }
tar.exe -a -c -f $Zip -C $Src .
if (-not (Test-Path $Zip)) { throw "Zip failed." }
Write-Host "Packed $Zip  ($([math]::Round((Get-Item $Zip).Length/1MB,1)) MB)"

$Tag = $Game.github.tag
if (-not $Tag) { $Tag = "$Id-v$($Game.version)" }
$Body = if ($Notes) { $Notes } else { "BIG DOG release of $($Game.title) ($Tag)" }

$existing = Invoke-WebRequest -Uri "https://api.github.com/repos/$Owner/$GamesRepo/releases/tags/$Tag" -Headers $Headers -SkipHttpErrorCheck
if ($existing.StatusCode -eq 200) {
  $release = $existing.Content | ConvertFrom-Json
  Write-Host "Release $Tag already exists — uploading another asset."
} else {
  $payload = @{ tag_name = $Tag; name = "$($Game.title) $Tag"; body = $Body; draft = $false } | ConvertTo-Json
  $release = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$Owner/$GamesRepo/releases" -Headers $Headers -Body $payload -ContentType "application/json"
  Write-Host "Created $Tag"
}

$uploadUrl = ($release.upload_url -replace "\{\?name,label\}", "") + "?name=$([uri]::EscapeDataString($Asset))"
$bytes = [IO.File]::ReadAllBytes($Zip)
Invoke-RestMethod -Method Post -Uri $uploadUrl -Headers (@{
  Authorization = "Bearer $Token"
  Accept = "application/vnd.github+json"
  "User-Agent" = "BIG-DOG-Launcher"
  "Content-Type" = "application/zip"
}) -Body $bytes

Write-Host "Published https://github.com/$Owner/$GamesRepo/releases/tag/$Tag"
Write-Host "Players hit Refresh / Update in BIG DOG."
