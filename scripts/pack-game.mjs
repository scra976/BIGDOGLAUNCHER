#!/usr/bin/env node
/**
 * Pack a game folder into Desktop/BigDogPacks using catalog.json asset names.
 *
 *   node scripts/pack-game.mjs --id ghostclub --src "C:\Users\Wesle\Desktop\GhostClub"
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog", "catalog.json"), "utf8"));

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const id = get("--id");
const src = get("--src");
if (!id || !src) {
  console.error("Usage: node scripts/pack-game.mjs --id <gameId> --src <folder>");
  process.exit(1);
}

const game = catalog.games.find((g) => g.id === id);
if (!game) {
  console.error("Unknown game id. Valid:", catalog.games.map((g) => g.id).join(", "));
  process.exit(1);
}

const destDir = path.join(os.homedir(), "Desktop", "BigDogPacks");
fs.mkdirSync(destDir, { recursive: true });
const asset = game.github?.asset || `${game.id}-windows.zip`;
const dest = path.join(destDir, asset);
if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });

await execFileAsync("tar.exe", ["-a", "-c", "-f", dest, "-C", src, "."]);
console.log("Wrote", dest);
console.log("Next: create a GitHub release tagged", `${id}-v${String(game.version).replace(/^v/i, "")}`);
console.log("and attach that zip, or run node scripts/publish-game.mjs --id", id);
