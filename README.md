# BIG DOG Launcher

A Windows game launcher for titles you build. Players run one installer wizard. The app lists your games, downloads them from GitHub Releases, and updates them when you publish a new zip.

## What you get

- **Single Setup.exe wizard** — NSIS installer (`oneClick: false`) so players pick a folder, get a desktop shortcut, and launch BIG DOG.
- **Store + library** — catalog-driven game list with install / play / update / uninstall.
- **GitHub updates** — each game points at a repo + zip asset. New release tag → Update button.
- **Saves kept** — folders listed in `preserve` survive updates.
- **Studio** — pack a build folder to `Desktop\BigDogPacks` and publish the zip to GitHub from the app.
- **Kennel** — a bundled house game so the launcher is playable before any GitHub upload.

## Player flow

1. Run `release\BigDogLauncher-Setup-1.0.0.exe`.
2. Walk the wizard, finish, launch.
3. Open a game → **Install** (or **Play** on Kennel).
4. When you ship a new GitHub release, they click **Update**.

## You ship a game

Create an empty public repo once: [github.com/scra976/bigdog-games](https://github.com/scra976/bigdog-games).

1. Export the Windows build (Godot: `.exe` + `.pck` in one folder, RPG Maker deploy, Vite `dist`, etc.).
2. Open the launcher → **Studio** → **Pack** on that title (or point it at a local folder with **Use local build** on the game page).
3. Add a GitHub token in **Settings** (classic PAT, `repo` scope) → **Publish**,  
   **or** **Open release** and attach `Desktop\BigDogPacks\<asset>.zip` yourself.
4. Tag format: `ghostclub-v1.0.1`. Bump `version` in `catalog/catalog.json` when you want the store copy to match, then push this repo.

Command line:

```bat
node scripts/pack-game.mjs --id ghostclub --src "C:\Users\Wesle\Desktop\GhostClub"
set GITHUB_TOKEN=ghp_yourtoken
node scripts/publish-game.mjs --id ghostclub --notes "Betting UI pass"
```

Ghost Club on your desktop is ready to pack. Spire of Darkness is the RPG Maker project under `Development\RPG MAKER\TOWER SCALING GAME` — deploy a Windows package first, then pack that output folder.

## Two apps

**Players** get BIG DOG Launcher (`npm.cmd run pack` → `release\BigDogLauncher-Setup-*.exe`). No Studio, no tokens. On open it checks GitHub and **requires** a launcher or game update before they play.

**You** run BIG DOG Studio (`START-STUDIO.bat` or `npm.cmd run dev:studio`). That is where you:

- publish game updates (Ghost Club folder is `Development\GhostClub`)
- upload a new game
- change cover / hero art
- publish a new launcher Setup.exe

Pack a Studio installer with `npm.cmd run pack:studio`.

## Dev

Needs Node 20+. PowerShell script execution can stay Restricted; call `npm.cmd`.

If `npm install` says install scripts were blocked (npm 12+), run:

```bat
npm.cmd install-scripts approve electron
npm.cmd install-scripts approve esbuild
npm.cmd install-scripts approve electron-winstaller
node scripts/ensure-electron.mjs
```

```bat
cd C:\Users\Wesle\Desktop\Development\BIGDOGLAUNCHER
npm.cmd install
npm.cmd run dev
```

Build the installer wizard:

```bat
npm.cmd run pack
```

The wizard exe lands in `release\BigDogLauncher-Setup-1.0.0.exe`. Upload that file (and the generated `latest.yml`) to a GitHub release on this repo so the launcher can offer self-updates.

## Settings that matter

| Setting | Default |
|---|---|
| Catalog URL | `https://raw.githubusercontent.com/scra976/BIGDOGLAUNCHER/main/catalog/catalog.json` |
| Library folder | `%LOCALAPPDATA%\BigDogLauncher\games` |
| GitHub token | optional; needed for private repos, higher rate limits, and one-click Publish |

If the catalog URL is unreachable, the app uses the last cache or the bundled `catalog/catalog.json`.

## Catalog

See [catalog/README.md](catalog/README.md). Covers and copy live next to `catalog.json` so a git push updates every installed launcher.
