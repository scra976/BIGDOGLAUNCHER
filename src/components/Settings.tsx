import { useEffect, useState } from "react";
import type { AppSnapshot } from "../../shared/types";

export function SettingsPage(props: { snap: AppSnapshot; onError: (text?: string) => void }) {
  const [catalogUrl, setCatalogUrl] = useState(props.snap.settings.catalogUrl);
  const [token, setToken] = useState("");
  const [checkUpdates, setCheckUpdates] = useState(props.snap.settings.checkUpdates);

  useEffect(() => {
    setCatalogUrl(props.snap.settings.catalogUrl);
    setCheckUpdates(props.snap.settings.checkUpdates);
  }, [props.snap.settings.catalogUrl, props.snap.settings.checkUpdates]);

  async function save() {
    const r = await window.bigdog.saveSettings({
      catalogUrl,
      checkUpdates,
      githubToken: token.trim() || undefined,
    });
    if (!r.ok) props.onError(r.error);
    setToken("");
    await window.bigdog.refreshCatalog();
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Catalog, library folder, and GitHub access.</p>
        </div>
      </div>
      <div className="detail">
        <div className="panel">
          <h3>Distribution</h3>
          <div className="field">
            <label>Catalog URL</label>
            <input value={catalogUrl} onChange={(e) => setCatalogUrl(e.target.value)} />
          </div>
          <div className="field">
            <label>GitHub token {props.snap.settings.githubTokenSet ? "(saved)" : ""}</label>
            <input
              type="password"
              value={token}
              placeholder={props.snap.settings.githubTokenSet ? "Leave blank to keep" : "ghp_…"}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <label className="help" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <input type="checkbox" checked={checkUpdates} onChange={(e) => setCheckUpdates(e.target.checked)} />
            Check for launcher updates on GitHub
          </label>
          <div className="row">
            <button type="button" className="btn gold" onClick={save}>
              Save
            </button>
            <button type="button" className="btn ghost" onClick={() => window.bigdog.refreshCatalog()}>
              Refresh catalog
            </button>
            {props.snap.settings.githubTokenSet ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => window.bigdog.saveSettings({ clearToken: true })}
              >
                Clear token
              </button>
            ) : null}
          </div>
          <p className="help" style={{ marginTop: 12 }}>
            Source: {props.snap.catalogSource}
            {props.snap.catalogError ? ` — ${props.snap.catalogError}` : ""}
          </p>
        </div>
        <div className="panel">
          <h3>This PC</h3>
          <div className="kv">
            <div>
              <span>Library</span>
              <b style={{ textAlign: "right", maxWidth: 240 }}>{props.snap.settings.libraryPath}</b>
            </div>
            <div>
              <span>Launcher</span>
              <b>v{props.snap.appVersion}</b>
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
              Change library folder
            </button>
            <button type="button" className="btn ghost" onClick={() => window.bigdog.openDataFolder()}>
              Open data folder
            </button>
          </div>
          {props.snap.launcherUpdate ? (
            <p className="help" style={{ marginTop: 16 }}>
              Update {props.snap.launcherUpdate.version} is available.{" "}
              <button
                type="button"
                className="btn gold"
                onClick={() => window.bigdog.openExternal(props.snap.launcherUpdate!.url)}
              >
                Get installer
              </button>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
