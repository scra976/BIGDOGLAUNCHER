import { safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { GameEntry, InstalledGame } from "../shared/types";
import { defaultLibraryPath, ensureDir, userData } from "./paths";

export interface PersistedSettings {
  catalogUrl: string;
  libraryPath: string;
  workspacePath: string;
  githubTokenEnc?: string;
  githubTokenPlain?: string;
  checkUpdates: boolean;
}

export interface PersistedState {
  settings: PersistedSettings;
  installed: Record<string, InstalledGame>;
  lastPlayed: Record<string, string>;
  sideloaded: GameEntry[];
  lastNotifiedLauncher?: string;
  lastNotifiedGames?: Record<string, string>;
}

const DEFAULT_CATALOG_URL =
  "https://raw.githubusercontent.com/scra976/BIGDOGLAUNCHER/main/catalog/catalog.json";

function stateFile(): string {
  return userData("state.json");
}

export const DEFAULT_WORKSPACE = "C:\\Users\\Wesle\\Desktop\\Development\\BIGDOGLAUNCHER";

export function defaultSettings(): PersistedSettings {
  return {
    catalogUrl: DEFAULT_CATALOG_URL,
    libraryPath: defaultLibraryPath(),
    workspacePath: DEFAULT_WORKSPACE,
    checkUpdates: true,
  };
}

export function defaultState(): PersistedState {
  return {
    settings: defaultSettings(),
    installed: {},
    lastPlayed: {},
    sideloaded: [],
  };
}

export function loadState(): PersistedState {
  try {
    const raw = fs.readFileSync(stateFile(), "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      settings: { ...defaultSettings(), ...(parsed.settings || {}) },
      installed: parsed.installed || {},
      lastPlayed: parsed.lastPlayed || {},
      sideloaded: parsed.sideloaded || [],
      lastNotifiedLauncher: parsed.lastNotifiedLauncher,
      lastNotifiedGames: parsed.lastNotifiedGames || {},
    };
  } catch {
    return defaultState();
  }
}

export function saveState(state: PersistedState): void {
  ensureDir(path.dirname(stateFile()));
  const tmp = stateFile() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, stateFile());
}

export function encryptSecret(value: string): { githubTokenEnc?: string; githubTokenPlain?: string } {
  if (!value) return {};
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return { githubTokenEnc: safeStorage.encryptString(value).toString("base64") };
    }
  } catch {
    /* fall through */
  }
  return { githubTokenPlain: value };
}

export function decryptSecret(settings: PersistedSettings): string {
  try {
    if (settings.githubTokenEnc && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(settings.githubTokenEnc, "base64"));
    }
  } catch {
    /* fall through */
  }
  return settings.githubTokenPlain || "";
}
