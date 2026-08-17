import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Catalog, GameEntry } from "../shared/types";
import { createOrGetRelease, deleteReleaseAsset, uploadReleaseAsset } from "./github";
import { packFolderToZip } from "./library";

function findLauncherSetup(workspace: string, version: string, explicit?: string): string {
  if (explicit && fs.existsSync(explicit)) return explicit;
  const named = path.join(workspace, "release", `BigDogLauncher-Setup-${version}.exe`);
  if (fs.existsSync(named)) return named;
  const dir = path.join(workspace, "release");
  if (fs.existsSync(dir)) {
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^BigDogLauncher-Setup-.*\.exe$/i.test(f))
      .map((f) => path.join(dir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (files[0]) return files[0];
  }
  throw new Error(
    `No installer found. Run npm.cmd run pack first, or pick BigDogLauncher-Setup-*.exe. Looked for ${named}`,
  );
}

async function replaceAsset(
  owner: string,
  repo: string,
  release: { upload_url?: string; assets?: { id: number; name: string }[] },
  fileName: string,
  bytes: Buffer,
  token: string,
): Promise<void> {
  const old = (release.assets || []).find((a) => a.name === fileName);
  if (old) await deleteReleaseAsset(owner, repo, old.id, token);
  await uploadReleaseAsset({
    uploadUrl: release.upload_url || "",
    fileName,
    bytes,
    token,
  });
}

export function workspaceCatalogDir(workspace: string): string {
  return path.join(workspace, "catalog");
}

export function readWorkspaceCatalog(workspace: string): Catalog {
  const file = path.join(workspaceCatalogDir(workspace), "catalog.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as Catalog;
}

export function writeWorkspaceCatalog(workspace: string, catalog: Catalog): void {
  const file = path.join(workspaceCatalogDir(workspace), "catalog.json");
  fs.writeFileSync(file, JSON.stringify(catalog, null, 2) + "\n", "utf8");
}

export function upsertGame(catalog: Catalog, game: GameEntry): Catalog {
  const rest = catalog.games.filter((g) => g.id !== game.id);
  return { ...catalog, games: [...rest, game] };
}

export function copyArt(workspace: string, gameId: string, kind: "cover" | "hero", src: string): string {
  const ext = path.extname(src) || ".jpg";
  const covers = path.join(workspaceCatalogDir(workspace), "covers");
  fs.mkdirSync(covers, { recursive: true });
  const name = kind === "hero" ? `${gameId}-hero${ext}` : `${gameId}${ext}`;
  const dest = kind === "hero" && path.basename(src).toLowerCase() === "hero.jpg"
    ? path.join(workspaceCatalogDir(workspace), "hero.jpg")
    : path.join(covers, name);
  fs.copyFileSync(src, dest);
  const rel = path.relative(workspaceCatalogDir(workspace), dest).replace(/\\/g, "/");
  return rel;
}

export async function publishGameZip(opts: {
  game: GameEntry;
  folder: string;
  version: string;
  notes: string;
  token: string;
}): Promise<{ tag: string; releaseUrl: string }> {
  const gh = opts.game.github;
  if (!gh) throw new Error("Game has no GitHub target.");
  const asset = gh.asset || `${opts.game.id}-windows.zip`;
  const tag = `${opts.game.id}-v${opts.version.replace(/^v/i, "")}`;
  const zipPath = path.join(process.env.USERPROFILE || "", "Desktop", "BigDogPacks", asset);
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
  await packFolderToZip(opts.folder, zipPath);

  const release = await createOrGetRelease({
    owner: gh.owner,
    repo: gh.repo,
    tag,
    name: `${opts.game.title} ${tag}`,
    body: opts.notes || `BIG DOG ${opts.game.title} ${tag}`,
    token: opts.token,
  });
  await replaceAsset(gh.owner, gh.repo, release, asset, fs.readFileSync(zipPath), opts.token);
  return {
    tag,
    releaseUrl: release.html_url || `https://github.com/${gh.owner}/${gh.repo}/releases/tag/${tag}`,
  };
}

export function gitPushCatalog(workspace: string, token: string, message: string): void {
  if (!fs.existsSync(path.join(workspace, ".git"))) {
    throw new Error("That folder is not a git repo. Open the BIGDOGLAUNCHER project folder in Studio settings.");
  }
  execFileSync("git", ["-C", workspace, "add", "catalog"], { windowsHide: true });
  try {
    execFileSync("git", ["-C", workspace, "commit", "-m", message], { windowsHide: true });
  } catch {
    /* nothing to commit is ok */
  }
  const remote = execFileSync("git", ["-C", workspace, "remote", "get-url", "origin"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  const pushed = remote.replace(/^https:\/\//, `https://x-access-token:${token}@`);
  execFileSync("git", ["-C", workspace, "push", pushed, "HEAD"], { windowsHide: true, stdio: "pipe" });
}

export async function publishLauncherSetup(opts: {
  workspace: string;
  version: string;
  notes: string;
  token: string;
  setupPath?: string;
  owner: string;
  repo: string;
}): Promise<{ tag: string; releaseUrl: string }> {
  const version = opts.version.replace(/^v/i, "").trim();
  if (!version) throw new Error("Type a launcher version like 1.1.1");
  const tag = `v${version}`;
  const setup = findLauncherSetup(opts.workspace, version, opts.setupPath);
  const release = await createOrGetRelease({
    owner: opts.owner,
    repo: opts.repo,
    tag,
    name: `BIG DOG Launcher ${tag}`,
    body: opts.notes || `BIG DOG Launcher ${tag}`,
    token: opts.token,
  });
  await replaceAsset(opts.owner, opts.repo, release, path.basename(setup), fs.readFileSync(setup), opts.token);
  const yml = path.join(path.dirname(setup), "latest.yml");
  if (fs.existsSync(yml)) {
    try {
      await replaceAsset(opts.owner, opts.repo, release, "latest.yml", fs.readFileSync(yml), opts.token);
    } catch {
      /* optional */
    }
  }
  return {
    tag,
    releaseUrl: release.html_url || `https://github.com/${opts.owner}/${opts.repo}/releases/tag/${tag}`,
  };
}
