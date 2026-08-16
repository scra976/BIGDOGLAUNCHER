import { net } from "electron";
import { releaseTagFor } from "../shared/version";
import type { GameEntry, RemoteVersion } from "../shared/types";

export interface GitHubRelease {
  tag_name: string;
  name?: string;
  body?: string;
  html_url?: string;
  upload_url?: string;
  assets?: GitHubAsset[];
}

export interface GitHubAsset {
  id: number;
  name: string;
  size: number;
  url: string;
  browser_download_url: string;
}

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function headers(token?: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "BIG-DOG-Launcher",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export async function githubJson<T>(url: string, token?: string, init?: RequestInit): Promise<T> {
  const res = await net.fetch(url, {
    ...init,
    headers: {
      ...headers(token, init?.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new GitHubError(res.status, `GitHub ${res.status}: ${text.slice(0, 240)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function latestRelease(owner: string, repo: string, token?: string): Promise<GitHubRelease> {
  return githubJson<GitHubRelease>(
    `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    token,
  );
}

export async function releaseByTag(
  owner: string,
  repo: string,
  tag: string,
  token?: string,
): Promise<GitHubRelease> {
  return githubJson<GitHubRelease>(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
    token,
  );
}

export async function listReleases(owner: string, repo: string, token?: string): Promise<GitHubRelease[]> {
  return githubJson<GitHubRelease[]>(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`,
    token,
  );
}

export function findAsset(release: GitHubRelease, name?: string): GitHubAsset | undefined {
  const assets = release.assets || [];
  if (!assets.length) return undefined;
  if (name) {
    const exact = assets.find((a) => a.name === name);
    if (exact) return exact;
    const lower = name.toLowerCase();
    const fuzzy = assets.find((a) => a.name.toLowerCase() === lower);
    if (fuzzy) return fuzzy;
    const contains = assets.find((a) => a.name.toLowerCase().includes(lower.replace(/\.zip$/i, "")));
    if (contains) return contains;
  }
  return assets.find((a) => /\.zip$/i.test(a.name)) || assets[0];
}

export function findGameRelease(releases: GitHubRelease[], game: GameEntry): GitHubRelease | undefined {
  const prefix = `${game.id}-`;
  const tagged = releases.find((r) => r.tag_name.toLowerCase().startsWith(prefix.toLowerCase()));
  if (tagged) return tagged;
  if (game.github?.tag) {
    return releases.find((r) => r.tag_name === game.github?.tag);
  }
  return undefined;
}

export function downloadSpec(
  asset: GitHubAsset,
  token?: string,
): { url: string; headers: Record<string, string> } {
  if (token) {
    return {
      url: asset.url,
      headers: {
        Accept: "application/octet-stream",
        Authorization: `Bearer ${token}`,
        "User-Agent": "BIG-DOG-Launcher",
      },
    };
  }
  return {
    url: asset.browser_download_url,
    headers: { "User-Agent": "BIG-DOG-Launcher" },
  };
}

export function publicDownloadUrl(owner: string, repo: string, tag: string, asset: string): string {
  return `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(asset)}`;
}

export async function resolveRemoteVersion(game: GameEntry, token?: string): Promise<RemoteVersion | null> {
  if (game.bundled) {
    return { version: game.version };
  }
  if (game.downloadUrl) {
    return { version: game.version, downloadUrl: game.downloadUrl };
  }
  const gh = game.github;
  if (!gh) return { version: game.version };

  try {
    if (gh.useLatestRelease !== false) {
      const releases = await listReleases(gh.owner, gh.repo, token);
      const mine = findGameRelease(releases, game) || (releases[0] && !releases[0].tag_name.includes("-") ? releases[0] : undefined);
      if (mine) {
        const asset = findAsset(mine, gh.asset);
        const spec = asset ? downloadSpec(asset, token) : undefined;
        return {
          version: mine.tag_name,
          downloadUrl: spec?.url || (gh.asset ? publicDownloadUrl(gh.owner, gh.repo, mine.tag_name, gh.asset) : undefined),
          notes: mine.body,
          assetName: asset?.name,
        };
      }
    }
    const tag = gh.tag || releaseTagFor(game.id, game.version);
    return {
      version: tag,
      downloadUrl: gh.asset ? publicDownloadUrl(gh.owner, gh.repo, tag, gh.asset) : undefined,
    };
  } catch (err) {
    const tag = gh.tag || releaseTagFor(game.id, game.version);
    return {
      version: game.version,
      downloadUrl: gh.asset ? publicDownloadUrl(gh.owner, gh.repo, tag, gh.asset) : undefined,
      notes: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function createRelease(opts: {
  owner: string;
  repo: string;
  tag: string;
  name: string;
  body: string;
  token: string;
}): Promise<GitHubRelease> {
  return githubJson<GitHubRelease>(
    `https://api.github.com/repos/${opts.owner}/${opts.repo}/releases`,
    opts.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: opts.tag,
        name: opts.name,
        body: opts.body,
        draft: false,
        prerelease: false,
      }),
    },
  );
}

export async function uploadReleaseAsset(opts: {
  uploadUrl: string;
  fileName: string;
  bytes: Buffer;
  token: string;
}): Promise<GitHubAsset> {
  const url = opts.uploadUrl.replace("{?name,label}", "") + `?name=${encodeURIComponent(opts.fileName)}`;
  const res = await net.fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/zip",
      "User-Agent": "BIG-DOG-Launcher",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: opts.bytes,
  });
  const text = await res.text();
  if (!res.ok) throw new GitHubError(res.status, `Upload failed ${res.status}: ${text.slice(0, 240)}`);
  return JSON.parse(text) as GitHubAsset;
}
