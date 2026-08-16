import type { AppSnapshot, GameEntry } from "../../shared/types";
import { actionLabel, displayVersion, gameAction } from "../lib/format";

export function GameCard(props: {
  game: GameEntry;
  snap: AppSnapshot;
  onOpen: () => void;
}) {
  const action = gameAction(props.game, props.snap);
  const installed = props.snap.installed[props.game.id];
  const badge =
    action === "update" ? "Update" : installed?.source === "local" ? "Local" : installed ? "Ready" : props.game.bundled ? "Included" : null;
  return (
    <button type="button" className="card" onClick={props.onOpen}>
      <div className="card-art">
        {props.game.cover ? <img src={props.game.cover} alt="" /> : null}
        <div className="scrim" />
        {badge ? <div className={`badge ${action === "update" ? "update" : installed?.source === "local" ? "local" : ""}`}>{badge}</div> : null}
      </div>
      <div className="card-meta">
        <h3>{props.game.title}</h3>
        <span>
          {props.game.genre || "Game"} · {actionLabel(action)} · {displayVersion(installed?.version || props.game.version)}
        </span>
      </div>
    </button>
  );
}
