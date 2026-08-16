# BIG DOG catalog

`catalog.json` is the store. The launcher reads the bundled copy first, then tries:

`https://raw.githubusercontent.com/scra976/BIGDOGLAUNCHER/main/catalog/catalog.json`

## Add a game

1. Drop a `2:3` cover in `covers/`.
2. Append an object to `games`.
3. Push this repo so players refresh the store.
4. Publish a zip to GitHub Releases (Studio in the launcher, or `scripts/publish-game.mjs`).

```json
{
  "id": "mygame",
  "title": "My Game",
  "tagline": "One line.",
  "description": "Store page copy.",
  "version": "1.0.0",
  "genre": "Action",
  "cover": "covers/mygame.jpg",
  "github": {
    "owner": "scra976",
    "repo": "bigdog-games",
    "asset": "MyGame-windows.zip",
    "useLatestRelease": true
  },
  "launch": { "kind": "exe", "executable": "MyGame.exe" },
  "preserve": ["save"]
}
```

Tags for updates should look like `mygame-v1.2.0`. The launcher picks the newest release whose tag starts with `mygame-`.

`launch.kind` can be `exe`, `html`, or `url`.
