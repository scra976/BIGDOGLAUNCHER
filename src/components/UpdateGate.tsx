import { useEffect, useRef } from "react";
import type { AppSnapshot } from "../../shared/types";
import { displayVersion, downloadLabel, pct } from "../lib/format";

export function UpdateGate(props: { snap: AppSnapshot; onError: (text?: string) => void }) {
  const { snap } = props;
  const started = useRef(false);
  const launcher = snap.launcherUpdate;
  const pending = snap.catalog.games.filter((g) => snap.pendingGameIds.includes(g.id));
  const jobs = snap.downloads.filter((d) => snap.pendingGameIds.includes(d.gameId));
  const working = jobs.some((d) => ["queued", "downloading", "extracting"].includes(d.status));
  const failed = jobs.filter((d) => d.status === "error");

  useEffect(() => {
    if (launcher || started.current || !pending.length) return;
    started.current = true;
    void window.bigdog.updateAll().then((r) => {
      if (!r.ok) props.onError(r.error);
    });
  }, [launcher, pending.length, props]);

  if (launcher) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="kicker">REQUIRED</div>
          <h1>Update BIG DOG</h1>
          <p>
            Version {displayVersion(launcher.version)} is on GitHub. Install it to keep playing.
          </p>
          {launcher.notes ? <p className="help">{launcher.notes.slice(0, 400)}</p> : null}
          <div className="row">
            <button
              type="button"
              className="btn gold"
              onClick={async () => {
                const r = await window.bigdog.installLauncherUpdate();
                if (!r.ok) props.onError(r.error);
              }}
            >
              Download and install
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="kicker">UPDATES</div>
        <h1>Updating your games</h1>
        <p>A new GitHub release is ready. BIG DOG applies it before you play.</p>
        <div className="panel" style={{ marginTop: 16 }}>
          {pending.map((g) => {
            const job = jobs.find((d) => d.gameId === g.id);
            return (
              <div key={g.id} className="job">
                <div>
                  <b>{g.title}</b>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>
                    {displayVersion(snap.installed[g.id]?.version)} → {displayVersion(snap.remoteVersions[g.id]?.version)}
                    {job ? ` · ${downloadLabel(job)}` : ""}
                  </div>
                </div>
                <div className="bar">
                  <i style={{ width: `${job ? pct(job) : 8}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        {failed.length ? (
          <div className="row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn gold"
              onClick={() => {
                started.current = false;
                void window.bigdog.updateAll();
              }}
            >
              Retry
            </button>
          </div>
        ) : null}
        {!working && !failed.length ? <p className="help">Finishing…</p> : null}
      </div>
    </div>
  );
}
