import { useMemo, useState } from "react";
import type { AppSnapshot, GameEntry } from "../../shared/types";
import { GameCard } from "./GameCard";

export function LibraryPage(props: {
  snap: AppSnapshot;
  games: GameEntry[];
  onOpen: (g: GameEntry) => void;
  onPrimary: (g: GameEntry) => void;
}) {
  const [q, setQ] = useState("");
  const installed = useMemo(() => {
    return props.games
      .filter((g) => props.snap.installed[g.id])
      .filter((g) => g.title.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => {
        const la = props.snap.lastPlayed[a.id] || "";
        const lb = props.snap.lastPlayed[b.id] || "";
        return lb.localeCompare(la);
      });
  }, [props.games, props.snap, q]);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Library</h1>
          <p>Installed and imported games on this PC.</p>
        </div>
        <input className="search" value={q} placeholder="Search library" onChange={(e) => setQ(e.target.value)} />
      </div>
      {installed.length === 0 ? (
        <div className="empty">
          <h2>Nothing in the kennel yet</h2>
          <p>Install a title from the Store, or import a local build from Studio.</p>
        </div>
      ) : (
        <div className="grid">
          {installed.map((g) => (
            <GameCard key={g.id} game={g} snap={props.snap} onOpen={() => props.onOpen(g)} />
          ))}
        </div>
      )}
    </section>
  );
}
