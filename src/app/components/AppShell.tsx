import type { ReactNode } from 'react';

export default function AppShell({
  clientInit,
}: {
  clientInit: ReactNode;
}) {
  return (
    <>
      <header data-platform="electron">
        <div className="header-main">
          <div className="header-brand">
            <h1><span className="title-dj">DJ</span><span className="title-assist">ASSIST</span></h1>
            <span className="badge desktop-badge" id="desktop-status-badge">Desktop app</span>
          </div>
          <input id="search" placeholder="Search collection, artist, album..." />
          <div className="filters">
            <input id="bpm-min" type="number" step="0.1" placeholder="BPM min" />
            <input id="bpm-max" type="number" step="0.1" placeholder="BPM max" />
            <input id="key-filter" placeholder="Key" />
            <label>
              <input id="show-only-no-bpm" type="checkbox" /> Only missing BPM
            </label>
            <span className="badge" id="hidden-count-badge">Hidden: 0</span>
          </div>
        </div>
        <div className="browse-scope" id="browse-scope">
          <span className="browse-scope-empty">Viewing full collection</span>
        </div>
      </header>

      <div className="banner" id="warning-banner" style={{ display: 'none' }} />
      <div className="statusbar" id="statusbar" />

      <main>
        <section className="pane">
          <div className="bulk-toolbar" id="bulk-toolbar">
            <div className="bulk-toolbar-empty">No tracks selected.</div>
          </div>
          <div className="sorts" id="sorts">
            <button type="button" data-sort="name" className="active">Name</button>
            <button type="button" data-sort="artist-asc" id="sort-artist">Artist ▲</button>
            <button type="button" data-sort="bpm-asc" id="sort-bpm">BPM ▲</button>
            <button type="button" data-sort="key-asc" id="sort-key">Key ▲</button>
            <button type="button" data-sort="duration-asc" id="sort-dur">Dur ▲</button>
          </div>
          <div className="list" id="track-list" />
        </section>

        <section className="pane">
          <div className="panel-tabs">
            <button type="button" className="panel-tab active" id="tab-track" data-panel="track">Track</button>
            <button type="button" className="panel-tab" id="tab-sets" data-panel="sets">Playlists</button>
            <button type="button" className="panel-tab" id="tab-library" data-panel="library">Collection</button>
          </div>
          <div id="panel-track">
            <div className="detail" id="detail">
              <div className="empty">Select a track to inspect playback, analysis, and transitions.</div>
            </div>
          </div>
          <div id="panel-sets" style={{ display: 'none' }}>
            <div className="sets-panel" id="sets-panel">
              <div className="empty">Loading playlists…</div>
            </div>
          </div>
          <div id="panel-library" style={{ display: 'none' }}>
            <div className="library-panel" id="library-panel">
              <div className="empty">Loading collection tools…</div>
            </div>
          </div>
        </section>
      </main>

      <div className="scan-dock">
        <div className="scan-bar">
          <input id="scan-directory" placeholder="Music folder…" />
          <button type="button" className="btn" id="scan-pick-directory-btn">Choose Folder</button>
          <select id="scan-recent-directories" defaultValue="">
            <option value="">Recent folders…</option>
          </select>
          <button type="button" className="btn" id="scan-use-last-btn">Use Last</button>
          <button type="button" className="btn" id="scan-btn">Start Scan</button>
          <button type="button" className="btn" id="scan-cancel-btn">Stop Scan</button>
          <select id="scan-rescan-mode" defaultValue="smart">
            <option value="smart">Smart</option>
            <option value="missing-metadata">Missing metadata</option>
            <option value="missing-analysis">Missing BPM/key</option>
            <option value="missing-art">Missing album art</option>
            <option value="full">Full rescan</option>
          </select>
          <label className="scan-option">
            <input id="scan-fetch-art" type="checkbox" defaultChecked /> Fetch cover art
          </label>
          <label className="scan-option">
            <input id="scan-verbose" type="checkbox" /> Verbose diagnostics
          </label>
          <div className="scan-progress" id="scan-progress">
            <div className="scan-progress-head">
              <span className="scan-status" id="scan-status">Idle</span>
              <span className="scan-progress-meta" id="scan-progress-meta">0 / 0</span>
            </div>
            <div className="scan-progress-track">
              <div className="scan-progress-bar" id="scan-progress-bar" />
            </div>
            <div className="scan-progress-file" id="scan-progress-file">No scan in progress</div>
          </div>
        </div>

        <div className="scan-log-panel">
          <div className="scan-log-head">
            <strong>Scan Log</strong>
            <div className="scan-panel-actions">
              <button type="button" className="icon-btn" id="scan-log-clear-btn">Clear</button>
              <button type="button" className="icon-btn" id="scan-log-toggle-btn" aria-expanded="true" aria-controls="scan-log-body">Collapse</button>
            </div>
          </div>
          <div className="scan-panel-body" id="scan-log-body">
            <div className="scan-log" id="scan-log">
              <div className="scan-log-entry info">No scan activity.</div>
            </div>
          </div>
        </div>

        <div className="scan-meta-grid">
          <div className="scan-summary-panel">
            <div className="scan-log-head">
              <strong>Scan Summary</strong>
              <button type="button" className="icon-btn" id="scan-summary-toggle-btn" aria-expanded="true" aria-controls="scan-summary-body">Collapse</button>
            </div>
            <div className="scan-panel-body" id="scan-summary-body">
              <div className="scan-summary" id="scan-summary">
                <div className="scan-summary-item"><span>Last run</span><strong>None</strong></div>
                <div className="scan-summary-item"><span>BPM</span><strong>0</strong></div>
                <div className="scan-summary-item"><span>Key</span><strong>0</strong></div>
                <div className="scan-summary-item"><span>Spotify</span><strong>0</strong></div>
                <div className="scan-summary-item"><span>Album art</span><strong>0</strong></div>
                <div className="scan-summary-item"><span>Decode failures</span><strong>0</strong></div>
              </div>
              <div className="scan-preflight" id="scan-preflight">Choose a music folder to check.</div>
            </div>
          </div>
          <div className="scan-history-panel">
            <div className="scan-log-head">
              <strong>Scan History</strong>
              <button type="button" className="icon-btn" id="scan-history-toggle-btn" aria-expanded="true" aria-controls="scan-history-body">Collapse</button>
            </div>
            <div className="scan-panel-body" id="scan-history-body">
              <div className="scan-history" id="scan-history">
                <div className="scan-log-entry info">No scan runs yet.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="modal" id="cover-modal" aria-hidden="true">
        <div className="modal-card">
          <div className="modal-head">
            <h3 id="cover-title">Album cover</h3>
            <button className="close" id="close-cover" type="button">&times;</button>
          </div>
          <img id="cover-image" alt="Album cover" />
        </div>
      </div>

      {clientInit}
    </>
  );
}
