export type LaunchKind = "exe" | "html" | "url";
export type CatalogSource = "remote" | "cache" | "bundled";
export type InstallSource = "github" | "bundled" | "local" | "url";
export type DownloadStatus =
  | "queued"
  | "downloading"
  | "extracting"
  | "done"
  | "error"
  | "cancelled";
export type AppRole = "player" | "studio";
export type PageId = "library" | "store" | "downloads" | "studio" | "settings" | "games" | "newgame" | "art" | "launcher";

export interface GitHubRef {
  owner: string;
  repo: string;
  tag?: string;
  asset?: string;
  useLatestRelease?: boolean;
}

export interface GameLaunch {
  kind: LaunchKind;
  executable?: string;
  args?: string[];
  url?: string;
}

export interface GameEntry {
  id: string;
  title: string;
  tagline?: string;
  description?: string;
  version: string;
  released?: string;
  genre?: string;
  tags?: string[];
  cover?: string;
  hero?: string;
  featured?: boolean;
  comingSoon?: boolean;
  bundled?: boolean;
  bundledPath?: string;
  downloadUrl?: string;
  github?: GitHubRef;
  launch: GameLaunch;
  preserve?: string[];
  visible?: boolean;
  devSource?: string;
}

export interface Catalog {
  schemaVersion: number;
  publisher: {
    id: string;
    name: string;
    tagline?: string;
    github?: { owner: string; repo: string };
  };
  launcher?: {
    version: string;
    github?: { owner: string; repo: string };
  };
  games: GameEntry[];
}

export interface InstalledGame {
  id: string;
  version: string;
  path: string;
  installedAt: string;
  source: InstallSource;
  executable?: string;
}

export interface DownloadJob {
  id: string;
  gameId: string;
  title: string;
  status: DownloadStatus;
  received: number;
  total: number;
  message?: string;
  startedAt?: number;
  bytesPerSec?: number;
  etaSeconds?: number;
}

export interface RemoteVersion {
  version: string;
  downloadUrl?: string;
  notes?: string;
  assetName?: string;
}

export interface PublicSettings {
  catalogUrl: string;
  libraryPath: string;
  githubTokenSet: boolean;
  checkUpdates: boolean;
  workspacePath: string;
}

export interface LauncherUpdate {
  version: string;
  url: string;
  notes?: string;
  setupUrl?: string;
  setupName?: string;
}

export interface AppSnapshot {
  role: AppRole;
  bootstrapped: boolean;
  settings: PublicSettings;
  catalog: Catalog;
  catalogSource: CatalogSource;
  catalogFetchedAt?: string;
  catalogError?: string;
  installed: Record<string, InstalledGame>;
  lastPlayed: Record<string, string>;
  downloads: DownloadJob[];
  remoteVersions: Record<string, RemoteVersion>;
  pendingGameIds: string[];
  launcherUpdate?: LauncherUpdate;
  appVersion: string;
  sideloaded: GameEntry[];
}

export interface InvokeResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface PackResult {
  zipPath: string;
  assetName: string;
  tag: string;
}

export interface PublishResult {
  releaseUrl: string;
  tag: string;
}

export interface BigDogApi {
  getSnapshot: () => Promise<AppSnapshot>;
  refreshCatalog: () => Promise<InvokeResult>;
  install: (id: string) => Promise<InvokeResult>;
  update: (id: string) => Promise<InvokeResult>;
  uninstall: (id: string) => Promise<InvokeResult>;
  play: (id: string) => Promise<InvokeResult>;
  cancel: (gameId: string) => Promise<InvokeResult>;
  importLocal: (gameId?: string) => Promise<InvokeResult<InstalledGame>>;
  openFolder: (id: string) => Promise<InvokeResult>;
  saveSettings: (patch: {
    catalogUrl?: string;
    libraryPath?: string;
    workspacePath?: string;
    githubToken?: string;
    checkUpdates?: boolean;
    clearToken?: boolean;
  }) => Promise<InvokeResult>;
  pickLibraryPath: () => Promise<InvokeResult<string>>;
  pickFolder: (title?: string) => Promise<InvokeResult<string>>;
  pickImage: () => Promise<InvokeResult<string>>;
  packGame: (id: string) => Promise<InvokeResult<PackResult>>;
  publishGame: (id: string, notes?: string) => Promise<InvokeResult<PublishResult>>;
  publishGameUpdate: (opts: {
    id: string;
    version: string;
    folder?: string;
    notes?: string;
  }) => Promise<InvokeResult<PublishResult>>;
  addGame: (game: GameEntry) => Promise<InvokeResult>;
  saveGame: (game: GameEntry) => Promise<InvokeResult>;
  setGameArt: (id: string, kind: "cover" | "hero", filePath: string) => Promise<InvokeResult>;
  pushCatalog: (message?: string) => Promise<InvokeResult>;
  publishLauncher: (opts: { version: string; notes?: string; setupPath?: string }) => Promise<InvokeResult<PublishResult>>;
  updateAll: () => Promise<InvokeResult>;
  installLauncherUpdate: () => Promise<InvokeResult>;
  openReleasePage: (id: string) => Promise<InvokeResult>;
  checkLauncherUpdate: () => Promise<InvokeResult<LauncherUpdate | null>>;
  openExternal: (url: string) => Promise<InvokeResult>;
  openDataFolder: () => Promise<InvokeResult>;
  windowMin: () => void;
  windowMax: () => void;
  windowClose: () => void;
  onSnapshot: (cb: (snap: AppSnapshot) => void) => () => void;
  onToast: (cb: (toast: { kind: "info" | "ok" | "err"; text: string }) => void) => () => void;
}

declare global {
  interface Window {
    bigdog: BigDogApi;
  }
}
