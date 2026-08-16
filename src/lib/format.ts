import type { AppSnapshot, DownloadJob, GameEntry } from "../../shared/types";
import { isNewer } from "../../shared/version";

export function bytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function pct(job: DownloadJob): number {
  if (!job.total) return job.status === "extracting" || job.status === "done" ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((job.received / job.total) * 100)));
}

export function timeAgo(iso?: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function displayVersion(v?: string): string {
  if (!v) return "—";
  return v.replace(/^v/i, "");
}

export type GameAction = "play" | "update" | "install" | "coming" | "busy";

export function gameAction(game: GameEntry, snap: AppSnapshot): GameAction {
  const job = snap.downloads.find((d) => d.gameId === game.id);
  if (job && ["queued", "downloading", "extracting"].includes(job.status)) return "busy";
  if (game.comingSoon) return "coming";
  const installed = snap.installed[game.id];
  const remote = snap.remoteVersions[game.id]?.version || game.version;
  if (installed && installed.source !== "local" && isNewer(remote, installed.version)) return "update";
  if (installed) return "play";
  return "install";
}

export function actionLabel(action: GameAction): string {
  switch (action) {
    case "play":
      return "Play";
    case "update":
      return "Update";
    case "install":
      return "Install";
    case "coming":
      return "Soon";
    case "busy":
      return "Working";
  }
}

export function allGames(snap: AppSnapshot): GameEntry[] {
  const seen = new Set<string>();
  const list: GameEntry[] = [];
  for (const g of [...snap.catalog.games, ...snap.sideloaded]) {
    if (!g || seen.has(g.id) || g.visible === false) continue;
    seen.add(g.id);
    list.push(g);
  }
  return list;
}
