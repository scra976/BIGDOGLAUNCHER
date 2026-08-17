import type { AppSnapshot, PageId } from "../../shared/types";

const items: { id: PageId; label: string }[] = [
  { id: "store", label: "Store" },
  { id: "library", label: "Library" },
  { id: "downloads", label: "Downloads" },
  { id: "settings", label: "Settings" },
];

export function Sidebar(props: {
  page: PageId;
  onPage: (p: PageId) => void;
  snap: AppSnapshot;
}) {
  const q = props.snap.downloads.filter((d) => ["queued", "downloading", "extracting"].includes(d.status)).length;
  return (
    <aside className="sidebar">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`nav-btn ${props.page === item.id ? "active" : ""}`}
          onClick={() => props.onPage(item.id)}
        >
          <span>{item.label}</span>
          {item.id === "downloads" && q > 0 ? <span style={{ marginLeft: "auto", color: "var(--gold)" }}>{q}</span> : null}
        </button>
      ))}
      <div className="side-foot">
        <strong>{props.snap.catalog.publisher.tagline || "BIG DOG GAMES LLC"}</strong>
        <div>v{props.snap.appVersion}</div>
        {props.snap.launcherUpdate ? <div>Launcher {props.snap.launcherUpdate.version} is out.</div> : null}
      </div>
    </aside>
  );
}
