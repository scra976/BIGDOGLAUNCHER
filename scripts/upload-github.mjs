/**
 * Create scra976/BIGDOGLAUNCHER + scra976/bigdog-games,
 * push this folder, upload Setup.exe as release v1.0.0
 *
 *   set GITHUB_TOKEN=ghp_xxx
 *   node scripts/upload-github.mjs
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OWNER = "scra976";
const LAUNCHER = "BIGDOGLAUNCHER";
const GAMES = "bigdog-games";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = (process.env.GITHUB_TOKEN || process.argv[2] || "").trim();

if (!TOKEN) {
  console.error("Missing token.");
  console.error("Create one at: https://github.com/settings/tokens");
  console.error("Use Generate new token (classic) and check the repo box.");
  console.error("Then run:  node scripts/upload-github.mjs ghp_YOURTOKEN");
  process.exit(1);
}

const api = "https://api.github.com";
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "BIG-DOG-Launcher",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function req(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { res, json, text };
}

function git(args, extra = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    stdio: "inherit",
    windowsHide: true,
    ...extra,
  });
}

function gitOut(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

console.log("1/6  Checking token…");
const me = await req(`${api}/user`);
if (!me.res.ok) {
  console.error("Token was rejected:", me.res.status, me.text.slice(0, 300));
  console.error("Make a new classic token with the repo checkbox: https://github.com/settings/tokens");
  process.exit(1);
}
console.log("    Signed in as", me.json.login);

if (String(me.json.login).toLowerCase() !== OWNER.toLowerCase()) {
  console.log("    Note: token user is", me.json.login, "— repos will be created on that account.");
}
const owner = me.json.login;

async function ensureRepo(name, description, autoInit) {
  const existing = await req(`${api}/repos/${owner}/${name}`);
  if (existing.res.ok) {
    console.log("    Already exists https://github.com/" + owner + "/" + name);
    return;
  }
  const created = await req(`${api}/user/repos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      description,
      private: false,
      auto_init: Boolean(autoInit),
    }),
  });
  if (!created.res.ok) {
    throw new Error(`Could not create ${name}: ${created.res.status} ${created.text.slice(0, 400)}`);
  }
  console.log("    Created https://github.com/" + owner + "/" + name);
}

console.log("2/6  Creating GitHub repos…");
await ensureRepo(LAUNCHER, "BIG DOG game launcher", false);
await ensureRepo(GAMES, "BIG DOG game zip downloads", true);

async function seedIfEmpty(name, readme) {
  const existingFile = await req(`${api}/repos/${owner}/${name}/contents/README.md`);
  if (existingFile.res.ok) {
    console.log("    README already present in", name);
    return;
  }
  const commits = await req(`${api}/repos/${owner}/${name}/commits?per_page=1`);
  if (commits.res.ok && Array.isArray(commits.json) && commits.json.length) return;
  console.log("    Seeding empty repo", name);
  const seed = await req(`${api}/repos/${owner}/${name}/contents/README.md`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Initial commit",
      content: Buffer.from(readme).toString("base64"),
    }),
  });
  if (!seed.res.ok && !(seed.res.status === 422 && /sha/i.test(seed.text))) {
    console.log("    Seed skipped:", seed.text.slice(0, 200));
  }
}
await seedIfEmpty(GAMES, "# bigdog-games\n\nWindows game zips for the BIG DOG launcher.\n");

console.log("3/6  Preparing git…");
if (!fs.existsSync(path.join(ROOT, ".git"))) {
  git(["init"]);
  git(["checkout", "-b", "main"]);
}
try {
  gitOut(["config", "user.name"]);
} catch {
  git(["config", "user.name", "Scrap76"]);
  git(["config", "user.email", "Scrapdoge@gmail.com"]);
}

console.log("4/6  Committing files…");
git(["add", "-A"]);
const dirty = gitOut(["status", "--porcelain"]);
if (dirty) {
  git(["commit", "-m", "BIG DOG Launcher 1.0.0"]);
} else {
  console.log("    Nothing new to commit.");
}

console.log("5/6  Pushing to GitHub…");
const pushUrl = `https://x-access-token:${TOKEN}@github.com/${owner}/${LAUNCHER}.git`;
try {
  git(["remote", "remove", "origin"]);
} catch {
  /* no origin yet */
}
git(["remote", "add", "origin", `https://github.com/${owner}/${LAUNCHER}.git`]);
execFileSync("git", ["push", "-u", pushUrl, "main"], {
  cwd: ROOT,
  stdio: "inherit",
  windowsHide: true,
});
git(["remote", "set-url", "origin", `https://github.com/${owner}/${LAUNCHER}.git`]);
console.log("    Pushed https://github.com/" + owner + "/" + LAUNCHER);

console.log("6/6  Uploading Setup.exe as release v1.0.0…");
const setup = path.join(ROOT, "release", "BigDogLauncher-Setup-1.0.0.exe");
const yml = path.join(ROOT, "release", "latest.yml");

async function ensureRelease(tag, title, notes) {
  const got = await req(`${api}/repos/${owner}/${LAUNCHER}/releases/tags/${tag}`);
  if (got.res.ok) return got.json;
  const created = await req(`${api}/repos/${owner}/${LAUNCHER}/releases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag_name: tag, name: title, body: notes, draft: false }),
  });
  if (!created.res.ok) {
    throw new Error(`Could not create release: ${created.res.status} ${created.text.slice(0, 400)}`);
  }
  return created.json;
}

async function uploadAsset(release, filePath) {
  if (!fs.existsSync(filePath)) {
    console.log("    Skip, missing", path.basename(filePath));
    return;
  }
  const name = path.basename(filePath);
  const already = (release.assets || []).find((a) => a.name === name);
  if (already) {
    console.log("    Already uploaded", name);
    return;
  }
  const uploadUrl = String(release.upload_url).replace("{?name,label}", "") + `?name=${encodeURIComponent(name)}`;
  const bytes = fs.readFileSync(filePath);
  console.log("    Uploading", name, `(${(bytes.length / 1024 / 1024).toFixed(1)} MB)…`);
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "BIG-DOG-Launcher",
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  });
  if (!res.ok) {
    throw new Error(`Upload ${name} failed: ${res.status} ${(await res.text()).slice(0, 400)}`);
  }
  console.log("    Uploaded", name);
}

if (fs.existsSync(setup)) {
  const release = await ensureRelease(
    "v1.0.0",
    "BIG DOG Launcher 1.0.0",
    "Run BigDogLauncher-Setup-1.0.0.exe — the install wizard.",
  );
  await uploadAsset(release, setup);
  await uploadAsset(release, yml);
} else {
  console.log("    Setup.exe not found. Run npm.cmd run pack first if you want the installer on GitHub.");
}

console.log("");
console.log("SUCCESS");
console.log("Launcher:  https://github.com/" + owner + "/" + LAUNCHER);
console.log("Games:     https://github.com/" + owner + "/" + GAMES);
console.log("Installer: https://github.com/" + owner + "/" + LAUNCHER + "/releases/tag/v1.0.0");
console.log("Catalog:   https://raw.githubusercontent.com/" + owner + "/" + LAUNCHER + "/main/catalog/catalog.json");
void execSync;
