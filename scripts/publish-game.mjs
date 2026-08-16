#!/usr/bin/env node
/**
 * Create a GitHub release and upload the packed zip.
 * Requires env GITHUB_TOKEN (repo scope).
 *
 *   node scripts/publish-game.mjs --id ghostclub --notes "First public build"
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog", "catalog.json"), "utf8"));
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
  console.error("Set GITHUB_TOKEN first.");
  process.exit(1);
}

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const id = get("--id");
const notes = get("--notes") || "";
if (!id) {
  console.error("Usage: node scripts/publish-game.mjs --id <gameId> [--notes text]");
  process.exit(1);
}

const game = catalog.games.find((g) => g.id === id);
if (!game?.github) {
  console.error("Game missing or has no github block.");
  process.exit(1);
}

const asset = game.github.asset || `${game.id}-windows.zip`;
const zipPath = path.join(os.homedir(), "Desktop", "BigDogPacks", asset);
if (!fs.existsSync(zipPath)) {
  console.error("Missing zip. Pack first:", zipPath);
  process.exit(1);
}

const tag = game.github.tag || `${game.id}-v${String(game.version).replace(/^v/i, "")}`;
const api = "https://api.github.com";
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "BIG-DOG-Launcher",
  "X-GitHub-Api-Version": "2022-11-28",
};

const created = await fetch(`${api}/repos/${game.github.owner}/${game.github.repo}/releases`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({
    tag_name: tag,
    name: `${game.title} ${tag}`,
    body: notes || `BIG DOG release of ${game.title}`,
    draft: false,
  }),
});
if (!created.ok) {
  console.error(await created.text());
  process.exit(1);
}
const release = await created.json();
const uploadUrl = String(release.upload_url).replace("{?name,label}", "") + `?name=${encodeURIComponent(asset)}`;
const uploaded = await fetch(uploadUrl, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/zip" },
  body: fs.readFileSync(zipPath),
});
if (!uploaded.ok) {
  console.error(await uploaded.text());
  process.exit(1);
}
console.log("Published", release.html_url);
