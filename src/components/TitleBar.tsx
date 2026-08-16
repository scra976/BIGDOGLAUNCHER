export function TitleBar() {
  return (
    <header className="titlebar">
      <div className="wordmark">
        <img src="./logo.jpg" alt="" />
        BIG DOG
      </div>
      <div className="win-btns">
        <button type="button" onClick={() => window.bigdog.windowMin()} aria-label="Minimize">
          –
        </button>
        <button type="button" onClick={() => window.bigdog.windowMax()} aria-label="Maximize">
          □
        </button>
        <button type="button" className="close" onClick={() => window.bigdog.windowClose()} aria-label="Close">
          ×
        </button>
      </div>
    </header>
  );
}
