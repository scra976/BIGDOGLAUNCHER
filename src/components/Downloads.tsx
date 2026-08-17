import type { AppSnapshot } from "../../shared/types";
import { downloadLabel, pct } from "../lib/format";

export function DownloadsPage(props: { snap: AppSnapshot }) {
  const jobs = [...props.snap.downloads].reverse();
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Downloads</h1>
          <p>Install and update jobs from GitHub.</p>
        </div>
      </div>
      {jobs.length === 0 ? (
        <div className="empty">
          <h2>Queue is empty</h2>
          <p>When you install or update a game, progress shows up here.</p>
        </div>
      ) : (
        <div className="panel">
          {jobs.map((job) => (
            <div key={job.id + job.status} className="job">
              <div>
                <b>{job.title}</b>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  {downloadLabel(job)}
                </div>
              </div>
              <div>
                {["queued", "downloading"].includes(job.status) ? (
                  <button type="button" className="btn ghost" onClick={() => window.bigdog.cancel(job.gameId)}>
                    Cancel
                  </button>
                ) : (
                  <span>{job.status === "done" ? "Done" : ""}</span>
                )}
              </div>
              <div className="bar">
                <i style={{ width: `${pct(job)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
