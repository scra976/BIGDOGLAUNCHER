import type { AppSnapshot, GameEntry } from "../../shared/types";
import { actionLabel, displayVersion, downloadLabel, gameAction, pct, timeAgo } from "../lib/format";

export function GameDetail(props: {
  game: GameEntry;
  snap: AppSnapshot;
  onBack: () => void;
  onPrimary: () => void;
  onError: (text?: string) => void;
}) {
  const { game, snap } = props;
  const installed = snap.installed[game.id];
  const remote = snap.remoteVersions[game.id];
  const job = snap.downloads.find((d) => d.gameId === game.id);
  const action = gameAction(game, snap);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    const r = await fn();
    if (!r.ok) props.onError(r.error);
  }

  return (
    <section>
      <button type="button" className="back" onClick={props.onBack}>
        ← Back
      </button>
      <div className="hero">
        <img src={game.hero || game.cover || ""} alt="" />
        <div className="hero-shade" />
        <div className="hero-copy">
          <div className="kicker">{game.genre || "Game"}</div>
          <h2>{game.title}</h2>
          <p>{game.tagline}</p>
          <div className="row">
            <button type="button" className="btn gold" onClick={props.onPrimary} disabled={action === "coming" || action === "busy"}>
              {actionLabel(action)}
            </button>
            {installed && action !== "update" ? (
              <button type="button" className="btn danger" onClick={() => run(() => window.bigdog.uninstall(game.id))}>
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {job && ["queued", "downloading", "extracting"].includes(job.status) ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{downloadLabel(job)}</strong>
            <button type="button" className="btn ghost" onClick={() => window.bigdog.cancel(game.id)}>
              Cancel
            </button>
          </div>
          <div className="bar" style={{ marginTop: 10 }}>
            <i style={{ width: `${pct(job)}%` }} />
          </div>
        </div>
      ) : null}
      <div className="detail">
        <div className="panel">
          <h3>About</h3>
          <p>{game.description}</p>
          {remote?.notes && !remote.notes.startsWith("GitHub") ? (
            <>
              <h3 style={{ marginTop: 18 }}>Latest notes</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{remote.notes.slice(0, 1200)}</p>
            </>
          ) : null}
        </div>
        <div className="panel">
          <h3>Build</h3>
          <div className="kv">
            <div>
              <span>Installed</span>
              <b>{installed ? displayVersion(installed.version) : "No"}</b>
            </div>
            <div>
              <span>Available</span>
              <b>{displayVersion(remote?.version || game.version)}</b>
            </div>
            <div>
              <span>Last played</span>
              <b>{timeAgo(snap.lastPlayed[game.id]) || "—"}</b>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
