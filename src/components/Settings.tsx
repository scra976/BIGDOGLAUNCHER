import type { AppSnapshot } from "../../shared/types";

export function SettingsPage(props: { snap: AppSnapshot; onError: (text?: string) => void }) {
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Where your games live on this PC.</p>
        </div>
      </div>
      <div className="panel">
        <div className="kv settings-kv">
          <div>
            <span>Games folder</span>
            <b>{props.snap.settings.libraryPath || "Not set"}</b>
          </div>
          <div>
            <span>Launcher</span>
            <b>v{props.snap.appVersion}</b>
          </div>
          <div>
            <span>Status</span>
            <b>
              {props.snap.launcherUpdate
                ? `Launcher ${props.snap.launcherUpdate.version} available`
                : props.snap.pendingGameIds.length
                  ? `${props.snap.pendingGameIds.length} game update${props.snap.pendingGameIds.length === 1 ? "" : "s"}`
                  : "Up to date"}
            </b>
          </div>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn ghost"
            onClick={async () => {
              const r = await window.bigdog.pickLibraryPath();
              if (!r.ok) props.onError(r.error);
            }}
          >
            Change games folder
          </button>
        </div>
      </div>
    </section>
  );
}
