import { useState } from "react";
import type { AppSnapshot, GameEntry } from "../../shared/types";

export function StudioPage(props: {
  snap: AppSnapshot;
  games: GameEntry[];
  onError: (text?: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const publishable = props.games.filter((g) => !g.bundled);

  async function pack(id: string) {
    const r = await window.bigdog.packGame(id);
    if (!r.ok) props.onError(r.error);
  }
  async function publish(id: string) {
    const r = await window.bigdog.publishGame(id, notes);
    if (!r.ok) props.onError(r.error);
    else if (r.data?.releaseUrl) void window.bigdog.openExternal(r.data.releaseUrl);
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Studio</h1>
          <p>Pack a Windows build and push it to GitHub so the launcher can download updates.</p>
        </div>
      </div>
      <div className="detail">
        <div className="panel">
          <h3>How updates work</h3>
          <ol className="steps">
            <li>Export your game (Godot .exe + .pck, RPG Maker deploy, Vite dist, etc.).</li>
            <li>Click Pack on that title. The zip lands in Desktop\BigDogPacks with the catalog asset name.</li>
            <li>
              Click Publish (needs a GitHub token in Settings) or Open release page and attach the zip by hand.
            </li>
            <li>
              Players open BIG DOG and hit Update. The launcher pulls the newest GitHub release and keeps save folders listed in catalog.json.
            </li>
          </ol>
          <p className="help">
            Default binary repo is <code>scra976/bigdog-games</code>. Create that empty repo on GitHub once. The catalog
            lives in this launcher repo at <code>catalog/catalog.json</code>.
          </p>
        </div>
        <div className="panel">
          <h3>Release notes</h3>
          <div className="field">
            <label>Notes for the next publish</label>
            <textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed?" />
          </div>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => window.bigdog.importLocal()}>
              Import any folder
            </button>
          </div>
          <p className="help">
            Token is {props.snap.settings.githubTokenSet ? "set" : "not set"}. Private repos and publish need a
            classic token with repo scope.
          </p>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Titles</h3>
        {publishable.map((g) => (
          <div key={g.id} className="job">
            <div>
              <b>{g.title}</b>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                {g.github ? `${g.github.owner}/${g.github.repo} · ${g.github.asset || "zip"}` : "No GitHub target"}
              </div>
            </div>
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => pack(g.id)}>
                Pack
              </button>
              <button type="button" className="btn ghost" onClick={() => window.bigdog.openReleasePage(g.id)}>
                Open release
              </button>
              <button type="button" className="btn gold" onClick={() => publish(g.id)} disabled={!g.github}>
                Publish
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
