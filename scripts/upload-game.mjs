/**
 * Pack a folder and upload it to scra976/bigdog-games
 *
 *   node scripts/upload-game.mjs ghostclub "C:\Users\Wesle\Desktop\GhostClub" ghp_YOURTOKEN
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const id = args[0];
const src = args[1];
const bump = (flag("--version") || process.env.GAME_VERSION || "").trim().replace(/^v/i, "");
const TOKEN = (process.env.GITHUB_TOKEN || flag("--token") || args[2] || "").trim();
const notes = flag("--notes") || "";

if (!id || !src || !TOKEN || TOKEN.startsWith("--")) {
  console.error('Usage: node scripts/upload-game.mjs <id> "<folder>" --version 1.0.1');
  console.error("Set GITHUB_TOKEN first. Ids: ghostclub   spire   cryptotable");
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "catalog", "catalog.json"), "utf8"));
const game = catalog.games.find((g) => g.id === id);
if (!game?.github) {
  console.error("Unknown game or no GitHub target:", id);
  process.exit(1);
}
if (!fs.existsSync(src)) {
  console.error("Folder not found:", src);
  process.exit(1);
}

const owner = game.github.owner;
const repo = game.github.repo;
const asset = game.github.asset || `${id}-windows.zip`;
const version = bump || String(game.version || "1.0.0").replace(/^v/i, "");
const tag = `${id}-v${version}`;
if (bump) {
  game.version = version;
  const catalogPath = path.join(ROOT, "catalog", "catalog.json");
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
  console.log("Catalog version set to", version);
}
const packs = path.join(os.homedir(), "Desktop", "BigDogPacks");
fs.mkdirSync(packs, { recursive: true });
const zipPath = path.join(packs, asset);
if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
console.log("Packing", src, "->", zipPath);
execFileSync("tar.exe", ["-a", "-c", "-f", zipPath, "-C", src, "."], { stdio: "inherit", windowsHide: true });
if (!fs.existsSync(zipPath)) {
  console.error("Zip was not created.");
  process.exit(1);
}
console.log("Zip size", (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1), "MB");

const api = "https://api.github.com";
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "BIG-DOG-Launcher",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function req(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { res, json, text };
}

async function ensureRepoHasCommit() {
  const repoInfo = await req(`${api}/repos/${owner}/${repo}`);
  if (repoInfo.res.status === 404) {
    const created = await req(`${api}/user/repos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: repo,
        description: "BIG DOG game zip downloads",
        private: false,
        auto_init: true,
      }),
    });
    if (!created.res.ok) {
      throw new Error(`Could not create ${owner}/${repo}: ${created.text.slice(0, 300)}`);
    }
    console.log("Created repo", `${owner}/${repo}`);
    await new Promise((r) => setTimeout(r, 1500));
  }

  const readme = await req(`${api}/repos/${owner}/${repo}/contents/README.md`);
  if (readme.res.ok) {
    console.log("Repo already has a README — ready for releases.");
    return;
  }

  const commits = await req(`${api}/repos/${owner}/${repo}/commits?per_page=1`);
  if (commits.res.ok && Array.isArray(commits.json) && commits.json.length) {
    console.log("Repo already has commits — ready for releases.");
    return;
  }

  console.log("Adding README so GitHub allows releases…");
  const seed = await req(`${api}/repos/${owner}/${repo}/contents/README.md`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Initial commit",
      content: Buffer.from(`# ${repo}\n\nWindows game zips for the BIG DOG launcher.\n`).toString("base64"),
    }),
  });
  if (seed.res.ok) return;
  if (seed.res.status === 422 && /sha/i.test(seed.text)) {
    console.log("README already exists — continuing.");
    return;
  }
  throw new Error(`Could not seed ${owner}/${repo}: ${seed.text.slice(0, 300)}`);
}

await ensureRepoHasCommit();

const existing = await req(`${api}/repos/${owner}/${repo}/releases/tags/${tag}`);
let release = existing.json;
if (!existing.res.ok) {
  const created = await req(`${api}/repos/${owner}/${repo}/releases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      name: `${game.title} ${tag}`,
      body: notes || `BIG DOG release of ${game.title}`,
      draft: false,
    }),
  });
  if (!created.res.ok) {
    console.error("Could not create release:", created.res.status, created.text.slice(0, 400));
    process.exit(1);
  }
  release = created.json;
}

const already = (release.assets || []).find((a) => a.name === asset);
if (already) {
  console.log("Deleting old asset", asset);
  await req(`${api}/repos/${owner}/${repo}/releases/assets/${already.id}`, { method: "DELETE" });
}

const uploadUrl = String(release.upload_url).replace("{?name,label}", "") + `?name=${encodeURIComponent(asset)}`;
const bytes = fs.readFileSync(zipPath);
console.log("Uploading", asset, "…");
const up = await fetch(uploadUrl, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "BIG-DOG-Launcher",
    "Content-Type": "application/zip",
  },
  body: bytes,
});
if (!up.ok) {
  console.error("Upload failed:", up.status, (await up.text()).slice(0, 400));
  process.exit(1);
}

console.log("SUCCESS");
console.log(`https://github.com/${owner}/${repo}/releases/tag/${tag}`);
