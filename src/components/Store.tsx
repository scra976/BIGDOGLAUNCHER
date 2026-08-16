import { useMemo, useState } from "react";
import type { AppSnapshot, GameEntry } from "../../shared/types";
import { actionLabel, gameAction } from "../lib/format";
import { GameCard } from "./GameCard";

export function StorePage(props: {
  snap: AppSnapshot;
  games: GameEntry[];
  onOpen: (g: GameEntry) => void;
  onPrimary: (g: GameEntry) => void;
}) {
  const [q, setQ] = useState("");
  const featured =
    props.games.find((g) => g.featured) ||
    props.games.find((g) => !g.bundled) ||
    props.games[0];
  const list = useMemo(
    () =>
      props.games.filter(
        (g) =>
          g.title.toLowerCase().includes(q.toLowerCase()) ||
          (g.genre || "").toLowerCase().includes(q.toLowerCase()),
      ),
    [props.games, q],
  );
  const action = featured ? gameAction(featured, props.snap) : "install";

  return (
    <section>
      {featured ? (
        <div className="hero">
          <img src={featured.hero || featured.cover || "./hero.jpg"} alt="" />
          <div className="hero-shade" />
          <div className="hero-copy">
            <div className="kicker">{props.snap.catalog.publisher.name}</div>
            <h2>{featured.title}</h2>
            <p>{featured.tagline || featured.description}</p>
            <div className="row">
              <button type="button" className="btn gold" onClick={() => props.onPrimary(featured)} disabled={action === "coming" || action === "busy"}>
                {actionLabel(action)}
              </button>
              <button type="button" className="btn ghost" onClick={() => props.onOpen(featured)}>
                Details
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="page-head">
        <div>
          <h1>All games</h1>
          <p>Download from GitHub or play titles bundled with the launcher.</p>
        </div>
        <input className="search" value={q} placeholder="Search games" onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid">
        {list.map((g) => (
          <GameCard key={g.id} game={g} snap={props.snap} onOpen={() => props.onOpen(g)} />
        ))}
      </div>
    </section>
  );
}
