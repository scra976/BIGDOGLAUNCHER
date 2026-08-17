import { contextBridge, ipcRenderer } from "electron";
import type { AppSnapshot, BigDogApi, GameEntry } from "../shared/types";

const api: BigDogApi = {
  getSnapshot: () => ipcRenderer.invoke("state:get"),
  refreshCatalog: () => ipcRenderer.invoke("catalog:refresh"),
  install: (id) => ipcRenderer.invoke("game:install", id),
  update: (id) => ipcRenderer.invoke("game:update", id),
  uninstall: (id) => ipcRenderer.invoke("game:uninstall", id),
  play: (id) => ipcRenderer.invoke("game:play", id),
  cancel: (gameId) => ipcRenderer.invoke("download:cancel", gameId),
  importLocal: (gameId) => ipcRenderer.invoke("game:importLocal", gameId),
  openFolder: (id) => ipcRenderer.invoke("game:openFolder", id),
  saveSettings: (patch) => ipcRenderer.invoke("settings:save", patch),
  pickLibraryPath: () => ipcRenderer.invoke("settings:pickLibrary"),
  pickFolder: (title) => ipcRenderer.invoke("settings:pickFolder", title),
  pickImage: () => ipcRenderer.invoke("settings:pickImage"),
  packGame: (id) => ipcRenderer.invoke("studio:pack", id),
  publishGame: (id, notes) => ipcRenderer.invoke("studio:publish", id, notes),
  publishGameUpdate: (opts) => ipcRenderer.invoke("studio:publishUpdate", opts),
  addGame: (game: GameEntry) => ipcRenderer.invoke("studio:addGame", game),
  saveGame: (game: GameEntry) => ipcRenderer.invoke("studio:saveGame", game),
  setGameArt: (id, kind, filePath) => ipcRenderer.invoke("studio:setArt", id, kind, filePath),
  pushCatalog: (message) => ipcRenderer.invoke("studio:pushCatalog", message),
  publishLauncher: (opts) => ipcRenderer.invoke("studio:publishLauncher", opts),
  updateAll: () => ipcRenderer.invoke("game:updateAll"),
  installLauncherUpdate: () => ipcRenderer.invoke("launcher:installUpdate"),
  openReleasePage: (id) => ipcRenderer.invoke("studio:openRelease", id),
  checkLauncherUpdate: () => ipcRenderer.invoke("launcher:checkUpdate"),
  openExternal: (url) => ipcRenderer.invoke("shell:open", url),
  openDataFolder: () => ipcRenderer.invoke("shell:dataFolder"),
  windowMin: () => ipcRenderer.send("win:min"),
  windowMax: () => ipcRenderer.send("win:max"),
  windowClose: () => ipcRenderer.send("win:close"),
  onSnapshot: (cb) => {
    const fn = (_event: unknown, snap: AppSnapshot) => cb(snap);
    ipcRenderer.on("state:changed", fn);
    return () => ipcRenderer.removeListener("state:changed", fn);
  },
  onToast: (cb) => {
    const fn = (_event: unknown, toast: { kind: "info" | "ok" | "err"; text: string }) => cb(toast);
    ipcRenderer.on("toast", fn);
    return () => ipcRenderer.removeListener("toast", fn);
  },
};

contextBridge.exposeInMainWorld("bigdog", api);
