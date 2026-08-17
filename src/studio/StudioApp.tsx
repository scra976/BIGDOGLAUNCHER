import { useMemo, useState } from "react";
import type { AppSnapshot, GameEntry, PageId } from "../../shared/types";
import { TitleBar } from "../components/TitleBar";
import { pct } from "../lib/format";

const nav: { id: PageId; label: string }[] = [
  { id: "games", label: "Games" },
  { id: "newgame", label: "New game" },
  { id: "art", label: "Art" },
  { id: "launcher", label: "Launcher" },
  { id: "settings", label: "Settings" },
];

export function StudioApp(props: {
  snap: AppSnapshot;
  onError: (text?: string) => void;
}) {
  const [page, setPage] = useState<PageId>("games");
  const [toasts] = useState(0);
  void toasts;
  const activeJob = props.snap.downloads.find((d) => ["queued", "downloading", "extracting"].includes(d.status));
  return (
    <div className="app">
      <TitleBar studio />
      <div className="shell">
        <aside className="sidebar">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-btn ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
          <div className="side-foot">
            <strong>STUDIO</strong>
            <div>Push builds to every player.</div>
            <div>Workspace: {props.snap.settings.workspacePath ? "set" : "missing"}</div>
          </div>
        </aside>
        <main className="main">
          {props.snap.catalogError ? (
            <p className="help" style={{ marginTop: 0 }}>
              Catalog warning: {props.snap.catalogError}
            </p>
          ) : null}
          {page === "games" ? <GamesTab snap={props.snap} onError={props.onError} /> : null}
          {page === "newgame" ? <NewGameTab snap={props.snap} onError={props.onError} /> : null}
          {page === "art" ? <ArtTab snap={props.snap} onError={props.onError} /> : null}
          {page === "launcher" ? <LauncherTab snap={props.snap} onError={props.onError} /> : null}
          {page === "settings" ? <StudioSettings snap={props.snap} onError={props.onError} /> : null}
        </main>
      </div>
      <div className="dock">
        {activeJob ? (
          <>
            <b>{activeJob.title}</b>
            <span>{activeJob.message}</span>
            <div className="bar">
              <i style={{ width: `${pct(activeJob)}%` }} />
            </div>
          </>
        ) : (
          <span>BIG DOG Studio · {props.snap.settings.githubTokenSet ? "token saved" : "no token"}</span>
        )}
      </div>
    </div>
  );
}

function GamesTab(props: { snap: AppSnapshot; onError: (t?: string) => void }) {
  const games = props.snap.catalog.games.filter((g) => !g.bundled);
  const [version, setVersion] = useState("1.0.1");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function publish(game: GameEntry) {
    setBusy(game.id);
    const folder = game.devSource && game.devSource.length
      ? game.devSource
      : (await window.bigdog.pickFolder(`Build folder for ${game.title}`)).data;
    if (!folder) {
      setBusy(null);
      return;
    }
    const r = await window.bigdog.publishGameUpdate({
      id: game.id,
      version,
      folder,
      notes,
    });
    setBusy(null);
    if (!r.ok) props.onError(r.error);
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Game updates</h1>
          <p>Pack the Windows build and create a new GitHub release. Players are forced to update on next launch.</p>
        </div>
      </div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="field">
          <label>New version number</label>
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.1" />
        </div>
        <div className="field">
          <label>Release notes</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="panel">
        {games.map((g) => (
          <div key={g.id} className="job">
            <div>
              <b>{g.title}</b>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                catalog {g.version} · live {props.snap.remoteVersions[g.id]?.version || "—"} ·{" "}
                {g.devSource || "no build folder"}
              </div>
            </div>
            <button type="button" className="btn gold" disabled={busy === g.id} onClick={() => publish(g)}>
              {busy === g.id ? "Uploading…" : "Publish update"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function NewGameTab(props: { snap: AppSnapshot; onError: (t?: string) => void }) {
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("Action");
  const [version, setVersion] = useState("1.0.0");
  const [folder, setFolder] = useState("");
  const [exe, setExe] = useState("Game.exe");
  const [kind, setKind] = useState<"exe" | "html">("exe");

  async function create() {
    const slug = id.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (!slug || !title.trim()) {
      props.onError("Id and title are required.");
      return;
    }
    const game: GameEntry = {
      id: slug,
      title: title.trim(),
      tagline,
      description,
      version,
      genre,
      cover: "",
      hero: "",
      devSource: folder || undefined,
      github: {
        owner: "scra976",
        repo: "bigdog-games",
        asset: `${slug}-windows.zip`,
        useLatestRelease: true,
      },
      launch: { kind, executable: exe },
      preserve: ["save", "saves"],
    };
    const added = await window.bigdog.addGame(game);
    if (!added.ok) {
      props.onError(added.error);
      return;
    }
    if (folder) {
      const pub = await window.bigdog.publishGameUpdate({ id: slug, version, folder, notes: "First release" });
      if (!pub.ok) props.onError(pub.error);
    }
    const pushed = await window.bigdog.pushCatalog(`Add ${title}`);
    if (!pushed.ok) props.onError(pushed.error);
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Upload a new game</h1>
          <p>Adds it to the catalog, uploads the zip, and pushes so player launchers list it.</p>
        </div>
      </div>
      <div className="detail">
        <div className="panel">
          <div className="field">
            <label>Id (no spaces)</label>
            <input value={id} onChange={(e) => setId(e.target.value)} placeholder="ghostclub" />
          </div>
          <div className="field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Tagline</label>
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="panel">
          <div className="field">
            <label>Genre</label>
            <input value={genre} onChange={(e) => setGenre(e.target.value)} />
          </div>
          <div className="field">
            <label>Version</label>
            <input value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div className="field">
            <label>Launch file</label>
            <input value={exe} onChange={(e) => setExe(e.target.value)} />
          </div>
          <div className="field">
            <label>Kind</label>
            <input value={kind} onChange={(e) => setKind(e.target.value === "html" ? "html" : "exe")} />
          </div>
          <div className="field">
            <label>Build folder</label>
            <input value={folder} onChange={(e) => setFolder(e.target.value)} />
            <button
              type="button"
              className="btn ghost"
              onClick={async () => {
                const r = await window.bigdog.pickFolder("Game build folder");
                if (r.ok && r.data) setFolder(r.data);
              }}
            >
              Browse
            </button>
          </div>
          <button type="button" className="btn gold" onClick={create}>
            Add and publish
          </button>
        </div>
      </div>
    </section>
  );
}

function ArtTab(props: { snap: AppSnapshot; onError: (t?: string) => void }) {
  const games = useMemo(() => props.snap.catalog.games, [props.snap.catalog.games]);

  async function setArt(id: string, kind: "cover" | "hero") {
    const r = await window.bigdog.pickImage();
    if (!r.ok || !r.data) return;
    const set = await window.bigdog.setGameArt(id, kind, r.data);
    if (!set.ok) props.onError(set.error);
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Game art</h1>
          <p>Replace cover or hero art, then push the catalog so every launcher picks it up.</p>
        </div>
        <button type="button" className="btn gold" onClick={() => window.bigdog.pushCatalog("Update game art")}>
          Push catalog
        </button>
      </div>
      <div className="grid">
        {games.map((g) => (
          <div key={g.id} className="panel">
            <div className="card-art" style={{ marginBottom: 10 }}>
              {g.cover ? <img src={g.cover} alt="" /> : null}
            </div>
            <h3>{g.title}</h3>
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn ghost" onClick={() => setArt(g.id, "cover")}>
                Cover
              </button>
              <button type="button" className="btn ghost" onClick={() => setArt(g.id, "hero")}>
                Hero
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function nextPatch(current: string): string {
  const clean = String(current || "1.1.0").replace(/^v/i, "");
  const parts = clean.split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.join(".");
}

function LauncherTab(props: { snap: AppSnapshot; onError: (t?: string) => void }) {
  const live = props.snap.launcherUpdate?.version || props.snap.appVersion || "1.1.0";
  const [version, setVersion] = useState(() => nextPatch(live));
  const [notes, setNotes] = useState("");
  const [setup, setSetup] = useState("");

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Launcher update</h1>
          <p>
            Players already have v{props.snap.appVersion}. Publish a <b>higher</b> number (this box is filled with{" "}
            {nextPatch(live)}). If GitHub already has that tag, Studio replaces the Setup.exe instead of failing.
          </p>
        </div>
      </div>
      <div className="panel">
        <div className="field">
          <label>New launcher version</label>
          <input value={version} onChange={(e) => setVersion(e.target.value)} />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="field">
          <label>Setup.exe (optional — leave blank to use release\BigDogLauncher-Setup-VERSION.exe)</label>
          <input value={setup} onChange={(e) => setSetup(e.target.value)} />
        </div>
        <button
          type="button"
          className="btn gold"
          onClick={async () => {
            const r = await window.bigdog.publishLauncher({
              version,
              notes,
              setupPath: setup || undefined,
            });
            if (!r.ok) props.onError(r.error);
          }}
        >
          Publish launcher
        </button>
      </div>
    </section>
  );
}

function StudioSettings(props: { snap: AppSnapshot; onError: (t?: string) => void }) {
  const [token, setToken] = useState("");
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Studio settings</h1>
          <p>Token and the local BIGDOGLAUNCHER folder used for catalog art.</p>
        </div>
      </div>
      <div className="panel">
        <div className="kv">
          <div>
            <span>Workspace</span>
            <b style={{ textAlign: "right", maxWidth: 280 }}>{props.snap.settings.workspacePath}</b>
          </div>
          <div>
            <span>Token</span>
            <b>{props.snap.settings.githubTokenSet ? "Saved" : "Missing"}</b>
          </div>
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <label>GitHub token (repo scope)</label>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} />
        </div>
        <div className="row">
          <button
            type="button"
            className="btn gold"
            onClick={async () => {
              const r = await window.bigdog.saveSettings({ githubToken: token.trim() || undefined });
              if (!r.ok) props.onError(r.error);
              setToken("");
            }}
          >
            Save token
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={async () => {
              const r = await window.bigdog.pickFolder("BIGDOGLAUNCHER project folder");
              if (r.ok && r.data) await window.bigdog.saveSettings({ workspacePath: r.data });
            }}
          >
            Change workspace
          </button>
        </div>
      </div>
    </section>
  );
}
