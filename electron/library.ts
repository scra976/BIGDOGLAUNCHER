import { BrowserWindow, dialog, shell } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { net } from "electron";
import type {
  DownloadJob,
  GameEntry,
  InstalledGame,
  InstallSource,
  RemoteVersion,
} from "../shared/types";
import { releaseTagFor } from "../shared/version";
import { downloadSpec, findAsset, findGameRelease, listReleases, publicDownloadUrl } from "./github";
import { bundledGamesDir, ensureDir, tmpDir } from "./paths";

const execFileAsync = promisify(execFile);

export type ProgressFn = (job: DownloadJob) => void;

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

export function unwrapExtractRoot(extractDir: string): string {
  const items = fs.readdirSync(extractDir).filter((n) => n !== "__MACOSX");
  if (items.length === 1) {
    const only = path.join(extractDir, items[0]);
    if (fs.statSync(only).isDirectory()) return only;
  }
  return extractDir;
}

export function findLaunchFile(root: string, game: GameEntry): string | undefined {
  const preferred = game.launch.executable;
  if (preferred) {
    const direct = path.join(root, preferred);
    if (fs.existsSync(direct)) return direct;
    const matches = walkFiles(root).filter(
      (f) => path.basename(f).toLowerCase() === path.basename(preferred).toLowerCase(),
    );
    if (matches.length) return matches[0];
  }
  if (game.launch.kind === "html") {
    const html = walkFiles(root).find((f) => path.basename(f).toLowerCase() === "index.html");
    return html;
  }
  const exes = walkFiles(root).filter((f) => /\.exe$/i.test(f));
  const playable = exes.filter((f) => !/unins|setup|crash|vcredist|unitycrash/i.test(path.basename(f)));
  return playable[0] || exes[0];
}

export async function downloadToFile(
  url: string,
  dest: string,
  headers: Record<string, string>,
  onBytes: (received: number, total: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await net.fetch(url, { headers, signal });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed ${res.status} ${res.statusText}`.trim());
  }
  const total = Number(res.headers.get("content-length") || 0);
  const reader = res.body.getReader();
  ensureDir(path.dirname(dest));
  const file = fs.createWriteStream(dest);
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      file.write(Buffer.from(value));
      received += value.byteLength;
      onBytes(received, total);
    }
  } finally {
    await new Promise<void>((resolve, reject) => file.end((err: Error | null | undefined) => (err ? reject(err) : resolve())));
  }
  if (received === 0) throw new Error("Download was empty");
}

function copyPreserve(oldRoot: string, newRoot: string, preserve: string[] | undefined): void {
  if (!preserve?.length || !fs.existsSync(oldRoot)) return;
  for (const rel of preserve) {
    const from = path.join(oldRoot, rel);
    const to = path.join(newRoot, rel);
    if (!fs.existsSync(from)) continue;
    ensureDir(path.dirname(to));
    fs.cpSync(from, to, { recursive: true, force: true });
  }
}

export async function copyDir(src: string, dest: string): Promise<void> {
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

export async function resolveDownload(
  game: GameEntry,
  remote: RemoteVersion | undefined,
  token?: string,
): Promise<{ url: string; headers: Record<string, string>; version: string; source: InstallSource }> {
  if (game.downloadUrl) {
    return {
      url: remote?.downloadUrl || game.downloadUrl,
      headers: { "User-Agent": "BIG-DOG-Launcher" },
      version: remote?.version || game.version,
      source: "url",
    };
  }
  const gh = game.github;
  if (!gh) throw new Error("This game has no GitHub release and no download URL yet.");

  if (token || gh.useLatestRelease !== false) {
    try {
      const releases = await listReleases(gh.owner, gh.repo, token);
      const mine = findGameRelease(releases, game);
      if (mine) {
        const asset = findAsset(mine, gh.asset);
        if (!asset) {
          throw new Error(
            `Release ${mine.tag_name} has no zip named ${gh.asset || "*.zip"}. Upload the packed game as a release asset.`,
          );
        }
        const spec = downloadSpec(asset, token);
        return { ...spec, version: mine.tag_name, source: "github" };
      }
    } catch (err) {
      if (token) throw err;
    }
  }

  const tag = gh.tag || releaseTagFor(game.id, game.version);
  if (!gh.asset) throw new Error("catalog.json is missing github.asset for this game.");
  return {
    url: publicDownloadUrl(gh.owner, gh.repo, tag, gh.asset),
    headers: { "User-Agent": "BIG-DOG-Launcher" },
    version: tag,
    source: "github",
  };
}

export async function installGame(opts: {
  game: GameEntry;
  libraryPath: string;
  previous?: InstalledGame;
  remote?: RemoteVersion;
  token?: string;
  job: DownloadJob;
  onProgress: ProgressFn;
  signal: AbortSignal;
}): Promise<InstalledGame> {
  const { game, libraryPath, previous, remote, token, job, onProgress, signal } = opts;
  const target = path.join(libraryPath, game.id);
  ensureDir(libraryPath);
  ensureDir(tmpDir());

  if (game.bundled) {
    job.status = "extracting";
    job.message = "Copying bundled game…";
    onProgress(job);
    const src = path.join(bundledGamesDir(), game.bundledPath || game.id);
    if (!fs.existsSync(src)) throw new Error(`Bundled game missing at ${src}`);
    await copyDir(src, target);
    const executable = findLaunchFile(target, game);
    return {
      id: game.id,
      version: game.version,
      path: target,
      installedAt: new Date().toISOString(),
      source: "bundled",
      executable,
    };
  }

  const spec = await resolveDownload(game, remote, token);
  const zipPath = path.join(tmpDir(), `${game.id}.zip`);
  const extractPath = path.join(tmpDir(), `${game.id}-extract`);
  if (fs.existsSync(extractPath)) fs.rmSync(extractPath, { recursive: true, force: true });
  ensureDir(extractPath);

  job.status = "downloading";
  job.message = "Downloading from GitHub…";
  onProgress(job);
  try {
    await downloadToFile(
      spec.url,
      zipPath,
      spec.headers,
      (received, total) => {
        job.received = received;
        job.total = total;
        onProgress(job);
      },
      signal,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${msg}. Publish a GitHub release on ${game.github?.owner}/${game.github?.repo} tagged ${game.github?.tag || releaseTagFor(game.id, game.version)} with asset ${game.github?.asset || "the game zip"}. Or use Studio → Use local build.`,
    );
  }

  job.status = "extracting";
  job.message = "Installing files…";
  onProgress(job);
  await extractArchive(zipPath, extractPath);
  const root = unwrapExtractRoot(extractPath);
  const staging = path.join(tmpDir(), `${game.id}-staging`);
  if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  fs.cpSync(root, staging, { recursive: true });

  if (previous?.path && fs.existsSync(previous.path)) {
    copyPreserve(previous.path, staging, game.preserve);
    const backup = previous.path + ".old";
    if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
    fs.renameSync(previous.path, backup);
    try {
      fs.renameSync(staging, target);
      fs.rmSync(backup, { recursive: true, force: true });
    } catch (err) {
      if (fs.existsSync(backup) && !fs.existsSync(target)) fs.renameSync(backup, previous.path);
      throw err;
    }
  } else {
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(staging, target);
  }

  try {
    if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
    if (fs.existsSync(extractPath)) fs.rmSync(extractPath, { recursive: true, force: true });
  } catch {
    /* tmp cleanup is best-effort */
  }

  const executable = findLaunchFile(target, game);
  return {
    id: game.id,
    version: spec.version,
    path: target,
    installedAt: new Date().toISOString(),
    source: spec.source,
    executable,
  };
}

export function uninstallGame(installed: InstalledGame): void {
  if (installed.path && fs.existsSync(installed.path)) {
    fs.rmSync(installed.path, { recursive: true, force: true });
  }
}

export async function playGame(
  game: GameEntry,
  installed: InstalledGame,
  mainWindow: BrowserWindow | null,
): Promise<void> {
  const root = installed.path;
  if (!fs.existsSync(root)) throw new Error("Install folder is missing. Install the game again.");

  if (game.launch.kind === "url" && game.launch.url) {
    await shell.openExternal(game.launch.url);
    return;
  }

  const target = installed.executable && fs.existsSync(installed.executable)
    ? installed.executable
    : findLaunchFile(root, game);
  if (!target) throw new Error("Could not find the game executable or index.html.");

  if (game.launch.kind === "html" || /\.html?$/i.test(target)) {
    const child = new BrowserWindow({
      width: 1200,
      height: 760,
      minWidth: 800,
      minHeight: 520,
      title: game.title,
      backgroundColor: "#07070c",
      autoHideMenuBar: true,
      parent: mainWindow || undefined,
    });
    await child.loadFile(target);
    return;
  }

  const child = execFile(
    target,
    game.launch.args || [],
    { cwd: path.dirname(target), windowsHide: false },
    (err) => {
      if (err && (err as NodeJS.ErrnoException).code !== "ABORT_ERR") {
        console.error("game exit", err);
      }
    },
  );
  child.unref();
}

export async function pickDirectory(win: BrowserWindow | null, title: string): Promise<string | null> {
  const result = await dialog.showOpenDialog(win || undefined, {
    title,
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
}

export function inferSideloaded(folder: string, idHint?: string): { game: GameEntry; installed: InstalledGame } {
  const name = path.basename(folder);
  const id = idHint || `local-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const files = walkFiles(folder);
  const exe = files.find((f) => /\.exe$/i.test(f) && !/unins|setup/i.test(path.basename(f)));
  const html = files.find((f) => path.basename(f).toLowerCase() === "index.html");
  const kind = exe ? "exe" : "html";
  const executable = exe || html;
  const game: GameEntry = {
    id,
    title: name,
    tagline: "Imported local build",
    description: `Sideloaded from ${folder}`,
    version: "local",
    genre: "Local",
    tags: ["Sideloaded"],
    launch: {
      kind,
      executable: executable ? path.relative(folder, executable) : undefined,
    },
  };
  const installed: InstalledGame = {
    id,
    version: "local",
    path: folder,
    installedAt: new Date().toISOString(),
    source: "local",
    executable,
  };
  return { game, installed };
}

export async function extractArchive(zipPath: string, dest: string): Promise<void> {
  ensureDir(dest);
  try {
    await execFileAsync("tar.exe", ["-xf", zipPath, "-C", dest], { windowsHide: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not unpack the game zip. ${msg}`);
  }
}

export async function packFolderToZip(srcDir: string, destZip: string): Promise<void> {
  if (!fs.existsSync(srcDir)) throw new Error("Source folder does not exist.");
  ensureDir(path.dirname(destZip));
  if (fs.existsSync(destZip)) fs.rmSync(destZip, { force: true });
  await execFileAsync("tar.exe", ["-a", "-c", "-f", destZip, "-C", srcDir, "."], {
    windowsHide: true,
  });
  if (!fs.existsSync(destZip)) throw new Error("Zip was not created.");
}
