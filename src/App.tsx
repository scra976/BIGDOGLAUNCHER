import { useEffect, useMemo, useState } from "react";
import type { AppSnapshot, GameEntry, PageId } from "../shared/types";
import { DownloadsPage } from "./components/Downloads";
import { GameDetail } from "./components/GameDetail";
import { LibraryPage } from "./components/Library";
import { SettingsPage } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { StorePage } from "./components/Store";
import { TitleBar } from "./components/TitleBar";
import { UpdateGate } from "./components/UpdateGate";
import { allGames, downloadLabel, gameAction, pct } from "./lib/format";
import { StudioApp } from "./studio/StudioApp";

const empty: AppSnapshot = {
  role: "player",
  bootstrapped: false,
  settings: {
    catalogUrl: "",
    libraryPath: "",
    githubTokenSet: false,
    checkUpdates: true,
    workspacePath: "",
  },
  catalog: { schemaVersion: 1, publisher: { id: "bigdog", name: "BIG DOG" }, games: [] },
  catalogSource: "bundled",
  installed: {},
  lastPlayed: {},
  downloads: [],
  remoteVersions: {},
  pendingGameIds: [],
  appVersion: "1.0.0",
  sideloaded: [],
};

export function App() {
  const [snap, setSnap] = useState<AppSnapshot>(empty);
  const [page, setPage] = useState<PageId>("store");
  const [selected, setSelected] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; kind: string; text: string }[]>([]);

  useEffect(() => {
    let alive = true;
    window.bigdog.getSnapshot().then((s) => {
      if (alive) setSnap(s);
    });
    const offState = window.bigdog.onSnapshot(setSnap);
    const offToast = window.bigdog.onToast((t) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-4), { id, ...t }]);
      window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.kind === "info" ? 10000 : 5200);
    });
    return () => {
      alive = false;
      offState();
      offToast();
    };
  }, []);

  const games = useMemo(() => allGames(snap), [snap]);
  const selectedGame = games.find((g) => g.id === selected) || null;
  const activeJob = snap.downloads.find((d) => ["queued", "downloading", "extracting"].includes(d.status));

  function pushErr(text?: string) {
    if (!text) return;
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind: "err", text }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6200);
  }

  function openGame(game: GameEntry) {
    setSelected(game.id);
  }

  async function runPrimary(game: GameEntry) {
    const action = gameAction(game, snap);
    if (action === "play") {
      const r = await window.bigdog.play(game.id);
      if (!r.ok) pushErr(r.error);
    } else if (action === "update") {
      const r = await window.bigdog.update(game.id);
      if (!r.ok) pushErr(r.error);
    } else if (action === "install") {
      const r = await window.bigdog.install(game.id);
      if (!r.ok) pushErr(r.error);
    }
  }

  if (snap.role === "studio") {
    return (
      <>
        <StudioApp snap={snap} onError={pushErr} />
        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>
              {t.text}
            </div>
          ))}
        </div>
      </>
    );
  }

  const needsGate =
    snap.bootstrapped &&
    Boolean(snap.launcherUpdate || snap.pendingGameIds.length);

  return (
    <div className="app">
      <TitleBar />
      <div className="shell">
        <Sidebar
          page={page}
          onPage={(p) => {
            setPage(p);
            setSelected(null);
          }}
          snap={snap}
        />
        <main className="main">
          {needsGate ? (
            <UpdateGate snap={snap} onError={pushErr} />
          ) : selectedGame ? (
            <GameDetail
              game={selectedGame}
              snap={snap}
              onBack={() => setSelected(null)}
              onPrimary={() => runPrimary(selectedGame)}
              onError={pushErr}
            />
          ) : page === "library" ? (
            <LibraryPage snap={snap} games={games} onOpen={openGame} onPrimary={runPrimary} />
          ) : page === "downloads" ? (
            <DownloadsPage snap={snap} />
          ) : page === "settings" ? (
            <SettingsPage snap={snap} onError={pushErr} />
          ) : (
            <StorePage snap={snap} games={games} onOpen={openGame} onPrimary={runPrimary} />
          )}
        </main>
      </div>
      {activeJob ? (
        <div className="dock">
          <b>{activeJob.title}</b>
          <span>{downloadLabel(activeJob)}</span>
          <div className="bar">
            <i style={{ width: `${pct(activeJob)}%` }} />
          </div>
          <span>{pct(activeJob)}%</span>
        </div>
      ) : (
        <div className="dock">
          <span>
            {snap.catalog.publisher.name}
            {snap.bootstrapped ? "" : " · checking updates…"}
          </span>
        </div>
      )}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
