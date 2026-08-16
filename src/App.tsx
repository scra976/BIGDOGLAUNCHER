import { useEffect, useMemo, useState } from "react";
import type { AppSnapshot, GameEntry, PageId } from "../shared/types";
import { DownloadsPage } from "./components/Downloads";
import { GameDetail } from "./components/GameDetail";
import { LibraryPage } from "./components/Library";
import { SettingsPage } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { StorePage } from "./components/Store";
import { StudioPage } from "./components/Studio";
import { TitleBar } from "./components/TitleBar";
import { allGames, gameAction, pct } from "./lib/format";

const empty: AppSnapshot = {
  settings: {
    catalogUrl: "",
    libraryPath: "",
    githubTokenSet: false,
    checkUpdates: true,
  },
  catalog: { schemaVersion: 1, publisher: { id: "bigdog", name: "BIG DOG" }, games: [] },
  catalogSource: "bundled",
  installed: {},
  lastPlayed: {},
  downloads: [],
  remoteVersions: {},
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
      window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5200);
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

  function pushErr(text?: string) {
    if (!text) return;
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind: "err", text }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6200);
  }

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
          {selectedGame ? (
            <GameDetail
              game={selectedGame}
              snap={snap}
              onBack={() => setSelected(null)}
              onPrimary={() => runPrimary(selectedGame)}
              onError={pushErr}
            />
          ) : page === "library" ? (
            <LibraryPage snap={snap} games={games} onOpen={openGame} onPrimary={runPrimary} />
          ) : page === "store" ? (
            <StorePage snap={snap} games={games} onOpen={openGame} onPrimary={runPrimary} />
          ) : page === "downloads" ? (
            <DownloadsPage snap={snap} />
          ) : page === "studio" ? (
            <StudioPage snap={snap} games={games} onError={pushErr} />
          ) : (
            <SettingsPage snap={snap} onError={pushErr} />
          )}
        </main>
      </div>
      {activeJob ? (
        <div className="dock">
          <b>{activeJob.title}</b>
          <span>{activeJob.message || activeJob.status}</span>
          <div className="bar">
            <i style={{ width: `${pct(activeJob)}%` }} />
          </div>
          <span>{pct(activeJob)}%</span>
        </div>
      ) : (
        <div className="dock">
          <span>
            {snap.catalog.publisher.name} · catalog {snap.catalogSource}
            {snap.catalogError ? " · offline fallback" : ""}
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
