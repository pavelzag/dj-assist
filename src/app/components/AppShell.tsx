import type { ReactNode } from 'react';
import packageJson from '../../../package.json';

export default function AppShell({
  clientInit,
}: {
  clientInit: ReactNode;
}) {
  const appVersion = packageJson.version;
  return (
    <>
      <header data-platform="electron">
        <div className="header-main">
          <div className="header-brand">
            <h1><span className="title-dj">DJ</span><span className="title-assist">ASSIST</span></h1>
            <span className="app-version-badge" title="Application version">{`v${appVersion}`}</span>
          </div>
          <div className="quick-actions">
            <button type="button" className="icon-btn" id="open-command-palette-btn" title="Command palette">Cmd/K</button>
            <button type="button" className="btn" id="quick-choose-folder-btn">Choose Folder</button>
            <span className="scan-status" id="scan-status">Idle</span>
            <button type="button" className="btn" id="quick-start-scan-btn">Start Scan</button>
            <span className="scan-progress-meta compact" id="scan-progress-meta">0 / 0</span>
            <div className="scan-progress compact" id="scan-progress">
              <div className="scan-progress-track">
                <div className="scan-progress-bar" id="scan-progress-bar" />
              </div>
            </div>
          </div>
          <div className="search-shortcut-hint">Use <strong>F</strong> or <strong>/</strong> to search</div>
          <input id="search" className="header-search-input-hidden" placeholder="Search collection, artist, album..." aria-label="Search collection" />
          <div className="filters">
            <input id="bpm-min" type="number" step="0.1" placeholder="BPM min" />
            <input id="bpm-max" type="number" step="0.1" placeholder="BPM max" />
            <input id="key-filter" placeholder="Key" />
            <label>
              <input id="hide-unknown-artists" type="checkbox" /> Hide unknown artists
            </label>
            <div className="quick-filter-bar" id="quick-filter-bar">
              <button type="button" className="quick-filter-btn" data-filter="high-bitrate">High bitrate</button>
            </div>
            <span className="badge" id="hidden-count-badge">Shown: 0</span>
          </div>
          <div className="header-global-actions">
            <button type="button" className="google-auth-main-btn" id="google-auth-main-btn" title="Connect Google">
              <span className="google-mark" aria-hidden="true">G</span>
              <span id="google-auth-main-label">Google</span>
            </button>
            <button type="button" className="icon-btn" id="mute-btn" aria-pressed="false" title="Mute">Mute</button>
          </div>
        </div>
        <input id="scan-directory" type="hidden" />
        <div className="scan-preflight" id="scan-preflight">Choose a music folder to check.</div>
        <div className="browse-scope" id="browse-scope">
          <span className="browse-scope-empty">Viewing full collection</span>
        </div>
      </header>

      <div className="banner" id="warning-banner" style={{ display: 'none' }} />
      <div className="statusbar" id="statusbar" />
      <div className="now-playing-bar" id="now-playing-bar" data-state="idle" hidden />

      <main>
        <section className="pane songs-pane">
          <div className="bulk-toolbar" id="bulk-toolbar" />
          <div className="sorts" id="sorts">
            <button type="button" data-sort="name" className="active">Name</button>
            <button type="button" data-sort="artist-asc" id="sort-artist">Artist ▲</button>
            <button type="button" data-sort="bpm-asc" id="sort-bpm">BPM ▲</button>
            <button type="button" data-sort="key-asc" id="sort-key">Key ▲</button>
            <button type="button" data-sort="duration-asc" id="sort-dur">Dur ▲</button>
          </div>
          <div className="list" id="track-list" />
        </section>

        <section className="pane details-pane">
          <div className="panel-tabs">
            <button type="button" className="panel-tab active" id="tab-track" data-panel="track">Track</button>
            <button type="button" className="panel-tab" id="tab-sets" data-panel="sets">Playlists</button>
            <button type="button" className="panel-tab" id="tab-library" data-panel="library">Collection</button>
            <button type="button" className="panel-tab" id="tab-activity" data-panel="activity">Activity</button>
          </div>
          <div id="panel-track">
            <div className="detail" id="detail">
              <div className="empty empty-state">
                <strong>Your collection is ready for a first scan.</strong>
                <span>Choose a music folder, confirm diagnostics, and bring tracks into the app.</span>
                <div className="empty-actions">
                  <button type="button" className="btn" id="empty-choose-folder-btn">Choose Folder</button>
                  <button type="button" className="btn" id="empty-start-scan-btn">Start First Scan</button>
                </div>
              </div>
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
          <div id="panel-activity" style={{ display: 'none' }}>
            <div className="library-panel" id="activity-panel">
              <div className="empty">Loading activity…</div>
            </div>
          </div>
        </section>
      </main>

      <div className="modal" id="cover-modal" aria-hidden="true">
        <div className="modal-card">
          <div className="modal-head">
            <h3 id="cover-title">Album cover</h3>
            <button className="close" id="close-cover" type="button">&times;</button>
          </div>
          <img id="cover-image" alt="Album cover" />
        </div>
      </div>

      <div className="toast-stack" id="toast-stack" aria-live="polite" />

      <div className="modal" id="command-palette-modal" aria-hidden="true">
        <div className="modal-card command-palette-card">
          <div className="modal-head">
            <h3>Command Palette</h3>
            <button className="close" id="close-command-palette" type="button">&times;</button>
          </div>
          <input id="command-palette-input" placeholder="Search commands, artists, albums, or BPM like 140 or bpm:138-142..." />
          <div className="command-palette-list" id="command-palette-list" />
        </div>
      </div>

      <div className="modal" id="shortcuts-modal" aria-hidden="true">
        <div className="modal-card shortcuts-card">
          <div className="modal-head">
            <h3>Keyboard Shortcuts</h3>
            <button className="close" id="close-shortcuts" type="button">&times;</button>
          </div>
          <div className="shortcuts-list">
            <div><strong>Cmd/Ctrl + K</strong><span>Open command palette</span></div>
            <div><strong>Palette BPM</strong><span>Type `140` or `bpm:138-142` to find tracks by BPM</span></div>
            <div><strong>Space</strong><span>Play or pause</span></div>
            <div><strong>Arrow Left / Right</strong><span>Scrub current track by 5s</span></div>
            <div><strong>Arrow Up / Down</strong><span>Select previous or next track</span></div>
            <div><strong>Ctrl + N / Ctrl + P</strong><span>Select next or previous track</span></div>
            <div><strong>Enter</strong><span>Play selected track</span></div>
            <div><strong>C</strong><span>Copy selected track path</span></div>
            <div><strong>S</strong><span>Select or unselect the highlighted track</span></div>
            <div><strong>I</strong><span>Add or remove the highlighted track from the delete selection</span></div>
            <div><strong>B</strong><span>Open tap BPM counter</span></div>
            <div><strong>D</strong><span>Delete selected tracks, or double-tap quickly to also delete the files from disk</span></div>
            <div><strong>E</strong><span>Edit selected track metadata</span></div>
            <div><strong>M</strong><span>Mute or unmute playback</span></div>
            <div><strong>A</strong><span>Browse current artist</span></div>
            <div><strong>L</strong><span>Browse current album</span></div>
            <div><strong>F</strong><span>Focus search</span></div>
            <div><strong>?</strong><span>Open this shortcuts sheet</span></div>
          </div>
        </div>
      </div>

      <div className="modal" id="edit-metadata-modal" aria-hidden="true">
        <div className="modal-card edit-metadata-modal-card">
          <div className="modal-head">
            <h3>Edit Metadata</h3>
            <button className="close" id="close-edit-metadata" type="button">&times;</button>
          </div>
          <div className="metadata-editor">
            <div className="metadata-grid">
              <label><span>Artist</span><input id="edit-meta-artist" list="artist-suggestions" /></label>
              <label><span>Title</span><input id="edit-meta-title" /></label>
              <label><span>Album</span><input id="edit-meta-album" list="album-suggestions" /></label>
              <label><span>Key</span><input id="edit-meta-key" /></label>
              <label className="metadata-wide"><span>Tags</span><input id="edit-meta-tags" placeholder="warmup, vocal, peak-time" /></label>
            </div>
            <div className="scan-preflight" id="edit-metadata-status">Press Enter or Save Metadata to apply changes.</div>
            <div className="buttons">
              <button className="btn" id="save-edit-metadata-btn" type="button">Save Metadata</button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal" id="delete-track-modal" aria-hidden="true">
        <div className="modal-card">
          <div className="modal-head">
            <h3 id="delete-track-title">Delete Track</h3>
            <button className="close" id="close-delete-track" type="button">&times;</button>
          </div>
          <div className="metadata-editor">
            <div className="scan-preflight" id="delete-track-message">Delete this track from DJ Assist?</div>
            <label className="metadata-toggle">
              <input id="delete-track-remove-file" type="checkbox" />
              <span>Delete file from computer</span>
            </label>
            <div className="buttons">
              <button className="btn danger" id="confirm-delete-track-btn" type="button">Delete</button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal" id="quit-app-modal" aria-hidden="true">
        <div className="modal-card">
          <div className="modal-head">
            <h3>Quit DJ Assist</h3>
            <button className="close" id="close-quit-app" type="button">&times;</button>
          </div>
          <div className="metadata-editor">
            <div className="scan-preflight" id="quit-app-message">Are you sure you want to close DJ Assist? Any active scan or playback will stop when the app quits.</div>
            <div className="buttons">
              <button className="btn" id="cancel-quit-app-btn" type="button">Cancel</button>
              <button className="btn danger" id="confirm-quit-app-btn" type="button">Quit</button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal" id="tap-bpm-modal" aria-hidden="true">
        <div className="modal-card">
          <div className="modal-head">
            <h3>Tap BPM</h3>
            <button className="close" id="close-tap-bpm" type="button">&times;</button>
          </div>
          <div className="metadata-editor">
            <div className="scan-preflight" id="tap-bpm-track-label">Select a track first.</div>
            <div className="scan-summary">
              <div className="scan-summary-item"><span>Detected BPM</span><strong id="tap-bpm-value">--</strong></div>
              <div className="scan-summary-item"><span>Taps</span><strong id="tap-bpm-count">0</strong></div>
              <div className="scan-summary-item"><span>Confidence</span><strong id="tap-bpm-confidence">Low</strong></div>
            </div>
            <label className="metadata-wide">
              <span>Manual BPM</span>
              <input id="tap-bpm-manual-input" type="number" step="0.1" min="1" placeholder="Type BPM manually" />
            </label>
            <div className="scan-preflight" id="tap-bpm-status">Press Space repeatedly to tap the beat.</div>
            <div className="buttons">
              <button className="btn" id="tap-bpm-half-btn" type="button">/2</button>
              <button className="btn" id="tap-bpm-double-btn" type="button">x2</button>
              <button className="btn" id="tap-bpm-reset-btn" type="button">Reset</button>
              <button className="btn" id="tap-bpm-save-btn" type="button">Save BPM</button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal" id="google-auth-upsell-modal" aria-hidden="true">
        <div className="modal-card google-auth-upsell-card">
          <div className="modal-head">
            <h3>Connect Google</h3>
            <button className="close" id="close-google-auth-upsell" type="button">&times;</button>
          </div>
          <div className="metadata-editor">
            <div className="scan-preflight">
              Sign in with Google to let DJ Assist check the backend for exact file matches before local analysis.
            </div>
            <div className="shortcuts-list google-auth-upsell-points">
              <div><strong>Signed in</strong><span>Exact file-hash matches can be fetched from the server instead of re-analyzed locally.</span></div>
              <div><strong>Not signed in</strong><span>Scans still run locally and results are still uploaded for other users.</span></div>
            </div>
            <div className="scan-preflight" id="google-auth-upsell-status">
              You can continue without signing in, but backend-powered quick scan will stay unavailable.
            </div>
            <div className="buttons">
              <button className="google-sign-in-primary" id="google-auth-upsell-sign-in-btn" type="button">
                <span className="google-mark" aria-hidden="true">G</span>
                <span id="google-auth-upsell-sign-in-label">Sign in with Google</span>
              </button>
              <button className="btn secondary" id="google-auth-upsell-decline-btn" type="button">Continue Without Sign-In</button>
            </div>
          </div>
        </div>
      </div>

      <datalist id="artist-suggestions" />
      <datalist id="album-suggestions" />

      {clientInit}
    </>
  );
}
