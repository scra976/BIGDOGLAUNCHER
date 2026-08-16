export function normalizeVersion(raw: string | undefined | null): string {
  if (!raw) return "0.0.0";
  return String(raw)
    .trim()
    .replace(/^v/i, "")
    .replace(/^[a-z0-9]+-/i, (m) => {
      return /v?\d/.test(m) ? m.replace(/^[a-z0-9]+-/i, "") : m;
    });
}

/** Pull a trailing x.y.z from tags like ghostclub-v1.2.3 */
export function parseVersion(raw: string | undefined | null): number[] {
  const text = String(raw || "").trim();
  const match = text.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return [0, 0, 0];
  return [
    Number(match[1] || 0),
    Number(match[2] || 0),
    Number(match[3] || 0),
    Number(match[4] || 0),
  ];
}

export function compareVersion(a: string | undefined, b: string | undefined): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function isNewer(remote: string | undefined, local: string | undefined): boolean {
  return compareVersion(remote, local) > 0;
}

export function releaseTagFor(gameId: string, version: string): string {
  const v = String(version || "1.0.0").replace(/^v/i, "");
  return `${gameId}-v${v}`;
}
