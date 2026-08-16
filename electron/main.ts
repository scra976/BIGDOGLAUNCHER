import { app, BrowserWindow, ipcMain, net, protocol, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AppSnapshot,
  Catalog,
  DownloadJob,
  GameEntry,
  InvokeResult,
  LauncherUpdate,
  PublicSettings,
  RemoteVersion,
} from "../shared/types";
import { isNewer, releaseTagFor } from "../shared/version";
import {
  fetchRemoteCatalog,
  loadBundledCatalog,
  loadCachedCatalog,
  mergeSideloaded,
  resolveCatalogMedia,
  writeCachedCatalog,
} from "./catalog";
import {
  createRelease,
  latestRelease,
  resolveRemoteVersion,
  uploadReleaseAsset,
} from "./github";
import {
  findLaunchFile,
  inferSideloaded,
  installGame,
  packFolderToZip,
  pickDirectory,
  playGame,
  uninstallGame,
} from "./library";
import {
  decryptSecret,
  encryptSecret,
  loadState,
  saveState,
  type PersistedState,
} from "./persist";
import { catalogAssetDir, ensureDir, isPackaged, projectRoot, userData } from "./paths";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "bigdog",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

let mainWindow: BrowserWindow | null = null;
let persist = loadState();
let catalog: Catalog = loadBundledCatalog();
let catalogSource: AppSnapshot["catalogSource"] = "bundled";
let catalogFetchedAt: string | undefined;
let catalogError: string | undefined;
let remoteVersions: Record<string, RemoteVersion> = {};
let launcherUpdate: LauncherUpdate | undefined;
const jobs = new Map<string, DownloadJob>();
const abortors = new Map<string, AbortController>();
let queue: { gameId: string; update: boolean }[] = [];
let pumping = false;

function token(): string {
  return decryptSecret(persist.settings);
}

function sendToast(kind: "info" | "ok" | "err", text: string): void {
  mainWindow?.webContents.send("toast", { kind, text });
}

function publicSettings(): PublicSettings {
  return {
    catalogUrl: persist.settings.catalogUrl,
    libraryPath: persist.settings.libraryPath,
    githubTokenSet: Boolean(token()),
    checkUpdates: persist.settings.checkUpdates,
  };
}

function snapshot(): AppSnapshot {
  const merged = mergeSideloaded(catalog, persist.sideloaded);
  const withMedia = resolveCatalogMedia(merged, persist.settings.catalogUrl, catalogSource);
  return {
    settings: publicSettings(),
    catalog: withMedia,
    catalogSource,
    catalogFetchedAt,
    catalogError,
    installed: persist.installed,
    lastPlayed: persist.lastPlayed,
    downloads: [...jobs.values()],
    remoteVersions,
    launcherUpdate,
    appVersion: app.getVersion(),
    sideloaded: persist.sideloaded,
  };
}

function broadcast(): void {
  mainWindow?.webContents.send("state:changed", snapshot());
}

function persistNow(): void {
  saveState(persist);
}

function findGame(id: string): GameEntry | undefined {
  return (
    persist.sideloaded.find((g) => g.id === id) ||
    catalog.games.find((g) => g.id === id)
  );
}

function upsertJob(partial: Partial<DownloadJob> & { gameId: string; title: string }): DownloadJob {
  const current = jobs.get(partial.gameId);
  const job: DownloadJob = {
    id: partial.gameId,
    gameId: partial.gameId,
    title: partial.title,
    status: partial.status || current?.status || "queued",
    received: partial.received ?? current?.received ?? 0,
    total: partial.total ?? current?.total ?? 0,
    message: partial.message ?? current?.message,
  };
  jobs.set(partial.gameId, job);
  broadcast();
  return job;
}

async function refreshCatalog(): Promise<void> {
  catalogError = undefined;
  const url = persist.settings.catalogUrl.trim();
  try {
    const remote = await fetchRemoteCatalog(url, token());
    catalog = remote;
    catalogSource = "remote";
    catalogFetchedAt = new Date().toISOString();
    writeCachedCatalog(remote);
  } catch (err) {
    const cached = loadCachedCatalog();
    if (cached) {
      catalog = cached;
      catalogSource = "cache";
    } else {
      catalog = loadBundledCatalog();
      catalogSource = "bundled";
    }
    catalogError = err instanceof Error ? err.message : String(err);
  }
  broadcast();
  await refreshRemoteVersions();
  if (persist.settings.checkUpdates) {
    await checkLauncherUpdate().catch(() => undefined);
  }
}

async function refreshRemoteVersions(): Promise<void> {
  const next: Record<string, RemoteVersion> = {};
  for (const game of catalog.games) {
    if (game.comingSoon || game.bundled) {
      next[game.id] = { version: game.version };
      continue;
    }
    try {
      const remote = await resolveRemoteVersion(game, token());
      if (remote) next[game.id] = remote;
    } catch (err) {
      next[game.id] = {
        version: game.version,
        notes: err instanceof Error ? err.message : String(err),
      };
    }
  }
  remoteVersions = next;
  broadcast();
}

async function checkLauncherUpdate(): Promise<LauncherUpdate | null> {
  const gh = catalog.launcher?.github || persist.settings.catalogUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  const owner = catalog.launcher?.github?.owner || "scra976";
  const repo = catalog.launcher?.github?.repo || "BIGDOGLAUNCHER";
  try {
    const release = await latestRelease(owner, repo, token());
    if (isNewer(release.tag_name, app.getVersion())) {
      launcherUpdate = {
        version: release.tag_name,
        url: release.html_url || `https://github.com/${owner}/${repo}/releases/latest`,
        notes: release.body,
      };
      broadcast();
      return launcherUpdate;
    }
  } catch {
    /* repo may not exist yet */
  }
  void gh;
  launcherUpdate = undefined;
  broadcast();
  return null;
}

async function pumpQueue(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      const game = findGame(item.gameId);
      if (!game) continue;
      const controller = new AbortController();
      abortors.set(game.id, controller);
      const job = upsertJob({
        gameId: game.id,
        title: game.title,
        status: "queued",
        message: item.update ? "Update queued" : "Install queued",
      });
      try {
        const installed = await installGame({
          game,
          libraryPath: persist.settings.libraryPath,
          previous: persist.installed[game.id],
          remote: remoteVersions[game.id],
          token: token() || undefined,
          job,
          onProgress: (j) => {
            jobs.set(j.gameId, { ...j });
            broadcast();
          },
          signal: controller.signal,
        });
        persist.installed[game.id] = installed;
        persistNow();
        upsertJob({
          gameId: game.id,
          title: game.title,
          status: "done",
          received: job.total || job.received,
          total: job.total || job.received,
          message: item.update ? "Updated" : "Installed",
        });
        sendToast("ok", `${game.title} is ready.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const cancelled = controller.signal.aborted || /abort/i.test(msg);
        upsertJob({
          gameId: game.id,
          title: game.title,
          status: cancelled ? "cancelled" : "error",
          message: cancelled ? "Cancelled" : msg,
        });
        if (!cancelled) sendToast("err", `${game.title}: ${msg}`);
      } finally {
        abortors.delete(game.id);
      }
    }
  } finally {
    pumping = false;
  }
}

function enqueue(gameId: string, update: boolean): InvokeResult {
  const game = findGame(gameId);
  if (!game) return { ok: false, error: "Unknown game." };
  if (game.comingSoon) return { ok: false, error: "This title is not out yet." };
  if (jobs.get(gameId) && ["queued", "downloading", "extracting"].includes(jobs.get(gameId)!.status)) {
    return { ok: false, error: "Already in the queue." };
  }
  upsertJob({ gameId, title: game.title, status: "queued", message: "Waiting…" });
  queue.push({ gameId, update });
  void pumpQueue();
  return { ok: true };
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: "#07070c",
    frame: false,
    title: "BIG DOG",
    show: false,
    icon: path.join(projectRoot(), "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (!isPackaged() && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (!isPackaged()) {
    void mainWindow.loadURL("http://localhost:5173");
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function ok<T>(data?: T): InvokeResult<T> {
  return { ok: true, data };
}
function fail(error: string): InvokeResult {
  return { ok: false, error };
}

function registerIpc(): void {
  ipcMain.handle("state:get", () => snapshot());
  ipcMain.handle("catalog:refresh", async () => {
    await refreshCatalog();
    return catalogError ? fail(catalogError) : ok();
  });
  ipcMain.handle("game:install", (_e, id: string) => enqueue(id, false));
  ipcMain.handle("game:update", (_e, id: string) => enqueue(id, true));
  ipcMain.handle("game:uninstall", (_e, id: string) => {
    const installed = persist.installed[id];
    if (!installed) return fail("Not installed.");
    try {
      uninstallGame(installed);
      delete persist.installed[id];
      persistNow();
      broadcast();
      return ok();
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle("game:play", async (_e, id: string) => {
    const game = findGame(id);
    const installed = persist.installed[id];
    if (!game || !installed) return fail("Install the game first.");
    try {
      await playGame(game, installed, mainWindow);
      persist.lastPlayed[id] = new Date().toISOString();
      persistNow();
      broadcast();
      return ok();
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle("download:cancel", (_e, gameId: string) => {
    abortors.get(gameId)?.abort();
    queue = queue.filter((q) => q.gameId !== gameId);
    const job = jobs.get(gameId);
    if (job && (job.status === "queued" || job.status === "downloading")) {
      upsertJob({ ...job, status: "cancelled", message: "Cancelled" });
    }
    return ok();
  });
  ipcMain.handle("game:importLocal", async (_e, gameId?: string) => {
    const folder = await pickDirectory(mainWindow, gameId ? `Select build folder for ${gameId}` : "Select a local game folder");
    if (!folder) return fail("Cancelled.");
    const game = gameId ? findGame(gameId) : undefined;
    if (game) {
      persist.installed[game.id] = {
        id: game.id,
        version: `${game.version}-local`,
        path: folder,
        installedAt: new Date().toISOString(),
        source: "local",
        executable: findLaunchFile(folder, game),
      };
      persistNow();
      broadcast();
      sendToast("ok", `${game.title} is using ${folder}`);
      return ok(persist.installed[game.id]);
    }
    const inferred = inferSideloaded(folder);
    persist.sideloaded = persist.sideloaded.filter((g) => g.id !== inferred.game.id).concat(inferred.game);
    persist.installed[inferred.game.id] = inferred.installed;
    persistNow();
    broadcast();
    sendToast("ok", `Imported ${inferred.game.title}`);
    return ok(inferred.installed);
  });
  ipcMain.handle("game:openFolder", async (_e, id: string) => {
    const installed = persist.installed[id];
    if (!installed) return fail("Not installed.");
    await shell.openPath(installed.path);
    return ok();
  });
  ipcMain.handle("settings:save", (_e, patch: Partial<PersistedState["settings"]> & { githubToken?: string; clearToken?: boolean }) => {
    if (typeof patch.catalogUrl === "string") persist.settings.catalogUrl = patch.catalogUrl.trim();
    if (typeof patch.libraryPath === "string" && patch.libraryPath.trim()) {
      persist.settings.libraryPath = patch.libraryPath.trim();
      ensureDir(persist.settings.libraryPath);
    }
    if (typeof patch.checkUpdates === "boolean") persist.settings.checkUpdates = patch.checkUpdates;
    if (patch.clearToken) {
      delete persist.settings.githubTokenEnc;
      delete persist.settings.githubTokenPlain;
    } else if (typeof patch.githubToken === "string" && patch.githubToken.trim()) {
      const enc = encryptSecret(patch.githubToken.trim());
      persist.settings.githubTokenEnc = enc.githubTokenEnc;
      persist.settings.githubTokenPlain = enc.githubTokenPlain;
    }
    persistNow();
    broadcast();
    return ok();
  });
  ipcMain.handle("settings:pickLibrary", async () => {
    const folder = await pickDirectory(mainWindow, "Choose game library folder");
    if (!folder) return fail("Cancelled.");
    persist.settings.libraryPath = folder;
    persistNow();
    broadcast();
    return ok(folder);
  });
  ipcMain.handle("studio:pack", async (_e, id: string) => {
    const game = findGame(id);
    if (!game) return fail("Unknown game.");
    const folder = persist.installed[id]?.source === "local"
      ? persist.installed[id].path
      : (await pickDirectory(mainWindow, `Folder to pack for ${game.title}`));
    if (!folder) return fail("Cancelled.");
    const packs = path.join(app.getPath("desktop"), "BigDogPacks");
    const asset = game.github?.asset || `${game.id}-windows.zip`;
    const zipPath = path.join(packs, asset);
    try {
      await packFolderToZip(folder, zipPath);
      sendToast("ok", `Packed ${asset} to Desktop\\BigDogPacks`);
      return ok({
        zipPath,
        assetName: asset,
        tag: game.github?.tag || releaseTagFor(game.id, game.version),
      });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle("studio:publish", async (_e, id: string, notes?: string) => {
    const game = findGame(id);
    const t = token();
    if (!game) return fail("Unknown game.");
    if (!game.github) return fail("This game has no github owner/repo in catalog.json.");
    if (!t) return fail("Add a GitHub token in Settings first.");
    const packs = path.join(app.getPath("desktop"), "BigDogPacks");
    const asset = game.github.asset || `${game.id}-windows.zip`;
    const zipPath = path.join(packs, asset);
    if (!fs.existsSync(zipPath)) {
      return fail(`Pack the game first. Missing ${zipPath}`);
    }
    const tag = game.github.tag || releaseTagFor(game.id, game.version);
    try {
      const release = await createRelease({
        owner: game.github.owner,
        repo: game.github.repo,
        tag,
        name: `${game.title} ${tag}`,
        body: notes || `BIG DOG release of ${game.title} (${tag}).`,
        token: t,
      });
      await uploadReleaseAsset({
        uploadUrl: release.upload_url || "",
        fileName: asset,
        bytes: fs.readFileSync(zipPath),
        token: t,
      });
      const releaseUrl = release.html_url || `https://github.com/${game.github.owner}/${game.github.repo}/releases/tag/${tag}`;
      sendToast("ok", `Published ${game.title} ${tag}`);
      return ok({ releaseUrl, tag });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle("studio:openRelease", async (_e, id: string) => {
    const game = findGame(id);
    if (!game?.github) return fail("No GitHub repo set for this game.");
    const tag = game.github.tag || releaseTagFor(game.id, game.version);
    const url = `https://github.com/${game.github.owner}/${game.github.repo}/releases/new?tag=${encodeURIComponent(tag)}`;
    await shell.openExternal(url);
    return ok();
  });
  ipcMain.handle("launcher:checkUpdate", async () => ok(await checkLauncherUpdate()));
  ipcMain.handle("shell:open", async (_e, url: string) => {
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) return fail("Blocked URL.");
    await shell.openExternal(url);
    return ok();
  });
  ipcMain.handle("shell:dataFolder", async () => {
    await shell.openPath(userData());
    return ok();
  });
  ipcMain.on("win:min", () => mainWindow?.minimize());
  ipcMain.on("win:max", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on("win:close", () => mainWindow?.close());
}

function serveCatalogAsset(request: Request): Promise<Response> | Response {
  try {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const root = path.resolve(catalogAssetDir());
    const filePath = path.resolve(root, rel);
    const rootPrefix = root.toLowerCase() + path.sep;
    if (filePath.toLowerCase() !== root.toLowerCase() && !filePath.toLowerCase().startsWith(rootPrefix)) {
      return new Response("blocked", { status: 403 });
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return new Response("not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).href);
  } catch {
    return new Response("not found", { status: 404 });
  }
}

app.whenReady().then(async () => {
  protocol.handle("bigdog", (request) => serveCatalogAsset(request));
  ensureDir(persist.settings.libraryPath);
  ensureDir(userData());
  catalog = loadCachedCatalog() || loadBundledCatalog();
  catalogSource = loadCachedCatalog() ? "cache" : "bundled";
  registerIpc();
  createWindow();
  void refreshCatalog();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
