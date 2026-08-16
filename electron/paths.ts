import { app } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function isPackaged(): boolean {
  return app.isPackaged;
}

export function projectRoot(): string {
  return app.getAppPath();
}

export function resourcePath(...parts: string[]): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...parts);
  }
  return path.join(projectRoot(), ...parts);
}

export function bundledCatalogFile(): string {
  return resourcePath("catalog", "catalog.json");
}

export function catalogAssetDir(): string {
  return resourcePath("catalog");
}

export function bundledGamesDir(): string {
  return resourcePath("bundled-games");
}

export function userData(...parts: string[]): string {
  const roaming = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const base = app.isReady() ? app.getPath("userData") : path.join(roaming, "bigdog-launcher");
  return path.join(base, ...parts);
}

export function defaultLibraryPath(): string {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return path.join(local, "BigDogLauncher", "games");
}

export function tmpDir(): string {
  return userData("tmp");
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function resolveMaybeRelative(baseDir: string, value?: string): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value) || /^file:/i.test(value) || /^data:/i.test(value)) {
    return value;
  }
  const cleaned = value.replace(/^asset:/, "");
  const abs = path.isAbsolute(cleaned) ? cleaned : path.join(baseDir, cleaned);
  if (fs.existsSync(abs)) return pathToFileUrl(abs);
  return value;
}

export function pathToFileUrl(filePath: string): string {
  const resolved = path.resolve(filePath).replace(/\\/g, "/");
  if (/^[A-Za-z]:/.test(resolved)) {
    return "file:///" + resolved;
  }
  return "file://" + resolved;
}

export function joinUrl(base: string, rel: string): string {
  if (/^https?:\/\//i.test(rel) || /^file:/i.test(rel) || /^data:/i.test(rel)) return rel;
  if (base.startsWith("file:")) {
    const dir = path.dirname(fileUrlToPath(base));
    return pathToFileUrl(path.join(dir, rel));
  }
  const trimmed = base.replace(/\/[^/]*$/, "/");
  return trimmed + rel.replace(/^\.\//, "");
}

export function fileUrlToPath(url: string): string {
  if (!url.startsWith("file:")) return url;
  const stripped = url.replace(/^file:\/\//, "");
  return decodeURIComponent(stripped.startsWith("/") && /^\/[A-Za-z]:/.test(stripped) ? stripped.slice(1) : stripped);
}
