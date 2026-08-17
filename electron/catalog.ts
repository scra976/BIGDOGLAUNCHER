import { net } from "electron";
import fs from "node:fs";
import type { Catalog, GameEntry } from "../shared/types";
import type { CatalogSource } from "../shared/types";
import { bundledCatalogFile, userData } from "./paths";

const EMPTY: Catalog = {
  schemaVersion: 1,
  publisher: { id: "bigdog", name: "BIG DOG" },
  games: [],
};

function cacheFile(): string {
  return userData("catalog-cache.json");
}

export function readJsonFile(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadBundledCatalog(): Catalog {
  try {
    return normalizeCatalog(readJsonFile(bundledCatalogFile()));
  } catch {
    return EMPTY;
  }
}

export function loadCachedCatalog(): Catalog | null {
  try {
    return normalizeCatalog(readJsonFile(cacheFile()));
  } catch {
    return null;
  }
}

export function writeCachedCatalog(catalog: Catalog): void {
  fs.writeFileSync(cacheFile(), JSON.stringify(catalog, null, 2), "utf8");
}

export function normalizeCatalog(raw: unknown): Catalog {
  const data = (raw && typeof raw === "object" ? raw : {}) as Partial<Catalog>;
  const removed = new Set(["kennel", "spire", "cryptotable"]);
  const games = Array.isArray(data.games)
    ? data.games.filter((g) => g && g.id && g.title && !removed.has(g.id))
    : [];
  return {
    schemaVersion: Number(data.schemaVersion || 1),
    publisher: {
      id: data.publisher?.id || "bigdog",
      name: data.publisher?.name || "BIG DOG",
      tagline: data.publisher?.tagline,
      github: data.publisher?.github,
    },
    launcher: data.launcher,
    games,
  };
}

export function resolveCatalogMedia(
  catalog: Catalog,
  catalogUrl: string,
  source: CatalogSource = "bundled",
): Catalog {
  void catalogUrl;
  void source;
  const rewrite = (value?: string) => {
    if (!value) return value;
    if (/^data:/i.test(value) || /^bigdog:/i.test(value)) return value;
    const name = value.split(/[/\\]/).pop() || "";
    if (name.toLowerCase() === "hero.jpg") return "./hero.jpg";
    if (/\.(jpg|jpeg|png|webp|gif)$/i.test(name)) return `./covers/${name}`;
    return value;
  };
  return {
    ...catalog,
    games: catalog.games.map((g) => ({
      ...g,
      cover: rewrite(g.cover),
      hero: rewrite(g.hero),
    })),
  };
}

export async function fetchRemoteCatalog(url: string, token?: string): Promise<Catalog> {
  const headers: Record<string, string> = {
    "User-Agent": "BIG-DOG-Launcher",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await net.fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Catalog fetch failed ${res.status} ${res.statusText}`);
  }
  return normalizeCatalog(await res.json());
}

export function mergeSideloaded(catalog: Catalog, extras: GameEntry[]): Catalog {
  const ids = new Set(catalog.games.map((g) => g.id));
  const extra = extras.filter((g) => g && g.id && !ids.has(g.id));
  return { ...catalog, games: [...catalog.games, ...extra] };
}
