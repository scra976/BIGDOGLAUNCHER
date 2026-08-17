import { app, BrowserWindow, Notification, dialog, ipcMain, net, protocol, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AppRole,
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
  downloadSpec,
  findSetupAsset,
  latestRelease,
  resolveRemoteVersion,
  uploadReleaseAsset,
} from "./github";
import {
  downloadToFile,
  findLaunchFile,
  inferSideloaded,
  installGame,
  packFolderToZip,
  pickDirectory,
  playGame,
  uninstallGame,
} from "./library";
import {
  copyArt,
  gitPushCatalog,
  publishGameZip,
  publishLauncherSetup,
  readWorkspaceCatalog,
  upsertGame,
  writeWorkspaceCatalog,
} from "./studio-ops";
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

function isStudioMode(): boolean {
  return (
    process.argv.includes("--studio") ||
    process.env.BIGDOG_ROLE === "studio" ||
    app.getName().toLowerCase().includes("studio")
  );
}

function notify(title: string, body: string): void {
  sendToast("info", `${title} — ${body}`);
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, icon: path.join(projectRoot(), "build", "icon.png") });
    n.on("click", () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    });
    n.show();
  } catch {
    /* notifications are best-effort */
  }
}

function announceUpdates(): void {
  if (role() === "studio") return;
  persist.lastNotifiedGames = persist.lastNotifiedGames || {};
  if (launcherUpdate && persist.lastNotifiedLauncher !== launcherUpdate.version) {
    persist.lastNotifiedLauncher = launcherUpdate.version;
    notify("BIG DOG update", `Version ${launcherUpdate.version} is ready. Open the launcher to install it.`);
  }
  for (const id of pendingGameIds()) {
    const game = findGame(id);
    const ver = remoteVersions[id]?.version || game?.version || "";
    if (!game || persist.lastNotifiedGames[id] === ver) continue;
    persist.lastNotifiedGames[id] = ver;
    notify("Game update", `${game.title} ${ver} is ready. Open BIG DOG to update.`);
  }
  persistNow();
}

let mainWindow: BrowserWindow | null = null;
let persist = loadState();
let catalog: Catalog = loadBundledCatalog();
let catalogSource: AppSnapshot["catalogSource"] = "bundled";
let catalogFetchedAt: string | undefined;
let catalogError: string | undefined;
let remoteVersions: Record<string, RemoteVersion> = {};
let launcherUpdate: LauncherUpdate | undefined;
let bootstrapped = false;
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

function role(): AppRole {
  return isStudioMode() ? "studio" : "player";
}

function publicSettings(): PublicSettings {
  return {
    catalogUrl: persist.settings.catalogUrl,
    libraryPath: persist.settings.libraryPath,
    githubTokenSet: Boolean(token()),
    checkUpdates: persist.settings.checkUpdates,
    workspacePath: persist.settings.workspacePath,
  };
}

function pendingGameIds(): string[] {
  return catalog.games
    .filter((g) => {
      const installed = persist.installed[g.id];
      if (!installed || installed.source === "local" || g.bundled) return false;
      const remote = remoteVersions[g.id]?.version || g.version;
      return isNewer(remote, installed.version);
    })
    .map((g) => g.id);
}

function snapshot(): AppSnapshot {
  const merged = mergeSideloaded(catalog, persist.sideloaded);
  const withMedia = resolveCatalogMedia(merged, persist.settings.catalogUrl, catalogSource);
  return {
    role: role(),
    bootstrapped,
    settings: publicSettings(),
    catalog: withMedia,
    catalogSource,
    catalogFetchedAt,
    catalogError,
    installed: persist.installed,
    lastPlayed: persist.lastPlayed,
    downloads: [...jobs.values()],
    remoteVersions,
    pendingGameIds: pendingGameIds(),
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
    startedAt: partial.startedAt ?? current?.startedAt,
    bytesPerSec: partial.bytesPerSec ?? current?.bytesPerSec,
    etaSeconds: partial.etaSeconds ?? current?.etaSeconds,
  };
  jobs.set(partial.gameId, job);
  broadcast();
  return job;
}

async function refreshCatalog(): Promise<void> {
  catalogError = undefined;
  if (isStudioMode()) {
    try {
      catalog = readWorkspaceCatalog(persist.settings.workspacePath);
      catalogSource = "bundled";
      catalogFetchedAt = new Date().toISOString();
      broadcast();
      await refreshRemoteVersions();
      bootstrapped = true;
      broadcast();
      return;
    } catch (err) {
      catalogError = err instanceof Error ? err.message : String(err);
      catalog = loadBundledCatalog();
      catalogSource = "bundled";
      catalogFetchedAt = new Date().toISOString();
      await refreshRemoteVersions();
      bootstrapped = true;
      broadcast();
      return;
    }
  }
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
  await checkLauncherUpdate().catch(() => undefined);
  bootstrapped = true;
  broadcast();
  announceUpdates();
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
      const setup = findSetupAsset(release);
      const spec = setup ? downloadSpec(setup, token() || undefined) : undefined;
      launcherUpdate = {
        version: release.tag_name,
        url: release.html_url || `https://github.com/${owner}/${repo}/releases/latest`,
        notes: release.body,
        setupUrl: spec?.url || setup?.browser_download_url,
        setupName: setup?.name,
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
            if (!j.startedAt) j.startedAt = Date.now();
            const elapsed = (Date.now() - j.startedAt) / 1000;
            j.bytesPerSec = elapsed > 0.2 ? j.received / elapsed : 0;
            j.etaSeconds =
              j.bytesPerSec > 1024 && j.total > j.received ? (j.total - j.received) / j.bytesPerSec : undefined;
            jobs.set(j.gameId, { ...j });
            const last = (j as DownloadJob & { _lastUi?: number })._lastUi || 0;
            if (Date.now() - last < 250 && j.status === "downloading") return;
            (j as DownloadJob & { _lastUi?: number })._lastUi = Date.now();
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
    title: isStudioMode() ? "BIG DOG Studio" : "BIG DOG",
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
    if (role() === "player") {
      const remote = remoteVersions[id]?.version || game.version;
      if (installed.source !== "local" && !game.bundled && isNewer(remote, installed.version)) {
        return fail("An update is required before you can play.");
      }
    }
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
    if (typeof patch.workspacePath === "string" && patch.workspacePath.trim()) {
      persist.settings.workspacePath = patch.workspacePath.trim();
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
  ipcMain.handle("settings:pickFolder", async (_e, title?: string) => {
    const folder = await pickDirectory(mainWindow, title || "Select folder");
    if (!folder) return fail("Cancelled.");
    return ok(folder);
  });
  ipcMain.handle("settings:pickImage", async () => {
    const result = await dialog.showOpenDialog(mainWindow || undefined, {
      title: "Choose art",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (result.canceled || !result.filePaths[0]) return fail("Cancelled.");
    return ok(result.filePaths[0]);
  });
  ipcMain.handle("game:updateAll", () => {
    const ids = pendingGameIds();
    if (!ids.length) return fail("Nothing to update.");
    for (const id of ids) enqueue(id, true);
    return ok();
  });
  ipcMain.handle("launcher:installUpdate", async () => {
    if (!launcherUpdate?.setupUrl) {
      if (launcherUpdate?.url) {
        await shell.openExternal(launcherUpdate.url);
        return ok();
      }
      return fail("No installer on the latest GitHub release.");
    }
    const dest = path.join(app.getPath("temp"), launcherUpdate.setupName || "BigDogLauncher-Setup.exe");
    const headers: Record<string, string> = { "User-Agent": "BIG-DOG-Launcher" };
    const t = token();
    if (t && launcherUpdate.setupUrl.includes("api.github.com")) {
      headers.Authorization = `Bearer ${t}`;
      headers.Accept = "application/octet-stream";
    }
    try {
      await downloadToFile(launcherUpdate.setupUrl, dest, headers, () => undefined, new AbortController().signal);
      await shell.openPath(dest);
      setTimeout(() => app.quit(), 800);
      return ok();
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle("studio:publishUpdate", async (_e, opts: { id: string; version: string; folder?: string; notes?: string }) => {
    if (role() !== "studio") return fail("Studio only.");
    const t = token();
    if (!t) return fail("Add a GitHub token in Studio settings.");
    const game = findGame(opts.id);
    if (!game) return fail("Unknown game.");
    const folder = opts.folder || game.devSource;
    if (!folder || !fs.existsSync(folder)) return fail("Pick the game build folder first.");
    try {
      const published = await publishGameZip({
        game,
        folder,
        version: opts.version,
        notes: opts.notes || "",
        token: t,
      });
      const ws = persist.settings.workspacePath;
      if (fs.existsSync(path.join(ws, "catalog", "catalog.json"))) {
        const local = readWorkspaceCatalog(ws);
        const next = local.games.map((g) => (g.id === game.id ? { ...g, version: opts.version.replace(/^v/i, ""), devSource: folder } : g));
        writeWorkspaceCatalog(ws, { ...local, games: next });
        catalog = { ...catalog, games: catalog.games.map((g) => (g.id === game.id ? { ...g, version: opts.version.replace(/^v/i, ""), devSource: folder } : g)) };
      }
      sendToast("ok", `Published ${game.title} ${published.tag}`);
      await refreshRemoteVersions();
      return ok(published);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle("studio:addGame", async (_e, game: GameEntry) => {
    if (role() !== "studio") return fail("Studio only.");
    const ws = persist.settings.workspacePath;
    try {
      const local = readWorkspaceCatalog(ws);
      if (local.games.some((g) => g.id === game.id)) return fail("That game id already exists.");
      if (!game.github) {
        game.github = {
          owner: "scra976",
          repo: "bigdog-games",
          asset: `${game.id}-windows.zip`,
          useLatestRelease: true,
        };
      }
      writeWorkspaceCatalog(ws, upsertGame(local, game));
      catalog = upsertGame(catalog, game);
      broadcast();
      sendToast("ok", `Added ${game.title} to the catalog.`);
      return ok();
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle("studio:saveGame", async (_e, game: GameEntry) => {
    if (role() !== "studio") return fail("Studio only.");
    const ws = persist.settings.workspacePath;
    try {
      const local = readWorkspaceCatalog(ws);
      writeWorkspaceCatalog(ws, upsertGame(local, game));
      catalog = upsertGame(catalog, game);
      broadcast();
      return ok();
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle("studio:setArt", async (_e, id: string, kind: "cover" | "hero", filePath: string) => {
    if (role() !== "studio") return fail("Studio only.");
    const ws = persist.settings.workspacePath;
    try {
      const rel = copyArt(ws, id, kind, filePath);
      const local = readWorkspaceCatalog(ws);
      const game = local.games.find((g) => g.id === id);
      if (!game) return fail("Unknown game.");
      if (kind === "cover") game.cover = rel;
      else game.hero = rel;
      writeWorkspaceCatalog(ws, upsertGame(local, game));
      catalog = upsertGame(catalog, game);
      broadcast();
      sendToast("ok", `Updated ${kind} art.`);
      return ok();
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle("studio:pushCatalog", async (_e, message?: string) => {
    if (role() !== "studio") return fail("Studio only.");
    const t = token();
    if (!t) return fail("Add a GitHub token in Studio settings.");
    try {
      gitPushCatalog(persist.settings.workspacePath, t, message || "Update BIG DOG catalog");
      sendToast("ok", "Catalog pushed. Players will see it on next launch.");
      return ok();
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle("studio:publishLauncher", async (_e, opts: { version: string; notes?: string; setupPath?: string }) => {
    if (role() !== "studio") return fail("Studio only.");
    const t = token();
    if (!t) return fail("Add a GitHub token in Studio settings.");
    const gh = catalog.launcher?.github || { owner: "scra976", repo: "BIGDOGLAUNCHER" };
    try {
      const published = await publishLauncherSetup({
        workspace: persist.settings.workspacePath,
        version: opts.version,
        notes: opts.notes || "",
        token: t,
        setupPath: opts.setupPath,
        owner: gh.owner,
        repo: gh.repo,
      });
      sendToast("ok", `Launcher ${published.tag} published.`);
      return ok(published);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle("studio:pickWorkspace", async () => {
    const folder = await pickDirectory(mainWindow, "Select the BIGDOGLAUNCHER project folder");
    if (!folder) return fail("Cancelled.");
    persist.settings.workspacePath = folder;
    persistNow();
    broadcast();
    return ok(folder);
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
    const root = path.resolve(
      isStudioMode() ? path.join(persist.settings.workspacePath, "catalog") : catalogAssetDir(),
    );
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

app.setAppUserModelId(isStudioMode() ? "com.bigdog.studio" : "com.bigdog.launcher");

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
