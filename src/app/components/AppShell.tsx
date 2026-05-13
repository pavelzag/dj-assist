import type { ReactNode } from 'react';
import packageJson from '../../../package.json';
import { appFlavor as resolveAppFlavor } from '@/lib/app-flavor';
import { serverRuntimeSummary } from '@/lib/runtime-settings';

export default async function AppShell({
  clientInit,
}: {
  clientInit: ReactNode;
}) {
  const appVersion = packageJson.version;
  const appFlavor = resolveAppFlavor();
  const isDebugFlavor = appFlavor === 'debug';
  const hasProFeatures = appFlavor !== 'free-prod';
  const runtime = await serverRuntimeSummary();
  const googleDriveConnected = hasProFeatures && Boolean(runtime.googleDrive?.connected);
  const googleAuthConfigured = hasProFeatures && Boolean(runtime.googleAuthConfigured);
  const onedriveConnected = hasProFeatures && Boolean(runtime.onedrive?.connected);
  const onedriveConfigured = hasProFeatures && Boolean(runtime.onedriveOauth?.configured);
  const dropboxConnected = hasProFeatures && Boolean(runtime.dropbox?.connected);
  const dropboxConfigured = hasProFeatures && Boolean(runtime.dropboxOauth?.configured);
  return (
    <>
      <header data-platform="electron">
        <div className="header-main">
          <div className="header-brand">
            <h1><span className="title-dj">DJ</span><span className="title-assist">ASSIST</span></h1>
            <span className="app-version-badge" title="Application version">{`v${appVersion}`}</span>
          </div>
          <div className="header-controls">
            <div className="quick-actions">
              <button type="button" className="btn" id="quick-choose-folder-btn">Add Music</button>
              <span className="scan-status" id="scan-status">Idle</span>
              <button type="button" className="btn" id="quick-start-scan-btn">Start Scan</button>
              <button type="button" className="btn secondary" id="quick-analyze-all-artwork-btn">Analyze All Artwork</button>
              <div className="scan-progress compact" id="scan-progress">
                <span className="scan-progress-source" id="scan-progress-source">Local scan</span>
                <div className="scan-progress-track">
                  <div className="scan-progress-bar" id="scan-progress-bar" />
                </div>
                <span className="scan-progress-meta compact" id="scan-progress-meta">0 / 0</span>
              </div>
            </div>
            <div className="search-shortcut-hint">Use <strong>/</strong> to search.</div>
            <input id="search" className="header-search-input-hidden" placeholder="Search collection, artist, album, notes, or filters like bpm:128-132..." aria-label="Search collection" />
            <div className="filters">
              <input id="bpm-min" type="number" step="0.1" placeholder="BPM min" />
              <input id="bpm-max" type="number" step="0.1" placeholder="BPM max" />
              <input id="key-filter" placeholder="Key" />
              {isDebugFlavor ? (
                <label>
                  <input id="show-pending-google-drive-imports" type="checkbox" /> Show unrecognized imports
                </label>
              ) : null}
              {!isDebugFlavor
                ? <input id="hide-unknown-artists" type="checkbox" hidden />
                : (
                  <label>
                    <input id="hide-unknown-artists" type="checkbox" /> Hide unknown artists
                  </label>
                )}
              <div className="quick-filter-bar" id="quick-filter-bar" />
              <button type="button" className="btn secondary sync-folders-btn" id="sync-folders-btn" title="Rescan folders represented in the songs pane">Sync Folders</button>
            </div>
            <div className="header-global-actions">
              {hasProFeatures ? (
                <button type="button" className="google-auth-main-btn" id="google-auth-main-btn" title="Connect Google">
                  <span className="google-mark" aria-hidden="true">G</span>
                  <span id="google-auth-main-label">Google</span>
                </button>
              ) : null}
              <button type="button" className="icon-btn mute-icon-btn" id="mute-btn" aria-pressed="false" title="Mute" aria-label="Mute">
                <span id="mute-btn-icon" aria-hidden="true">🔊</span>
              </button>
            </div>
          </div>
        </div>
        <input id="scan-directory" type="hidden" />
        <div className="selected-source-indicator" id="selected-source-indicator" hidden />
        <div className="scan-preflight" id="scan-preflight">Choose a music source to add tracks.</div>
        <div className="browse-scope" id="browse-scope">
          <span className="browse-scope-empty">Viewing full collection</span>
        </div>
      </header>

      <div className="banner" id="warning-banner" style={{ display: 'none' }} />
      {isDebugFlavor ? <div className="statusbar" id="statusbar" /> : null}
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
            <button type="button" data-sort="album-asc" id="sort-album">Album ▲</button>
          </div>
          <div className="songs-pane-controls">
            <label className="preference-row songs-pane-toggle">
              <input id="hide-duplicate-copies" type="checkbox" />
              <span>Hide duplicate copies</span>
            </label>
          </div>
          <div className="list" id="track-list" />
          <div className="songs-fetch-indicator" id="songs-fetch-indicator" hidden>
            <span className="songs-fetch-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="songs-fetch-text">Fetching more tracks as the scan runs…</span>
          </div>
        </section>

        <section className="pane details-pane">
          <div className="panel-tabs">
            <button type="button" className="panel-tab active" id="tab-track" data-panel="track">Track</button>
            <button type="button" className="panel-tab" id="tab-sets" data-panel="sets">Playlists</button>
            <button type="button" className="panel-tab" id="tab-library" data-panel="library">Collection</button>
            {isDebugFlavor ? <button type="button" className="panel-tab" id="tab-activity" data-panel="activity">Activity</button> : null}
          </div>
          <div id="panel-track">
            <div className="detail" id="detail">
              <div className="empty empty-state">
                <strong>Your collection is ready for a first scan.</strong>
                <span>Choose a music source, confirm diagnostics, and bring tracks into the app.</span>
                <div className="empty-actions">
                  <button type="button" className="btn" id="empty-choose-folder-btn">Add Music</button>
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

      <div className="modal artwork-modal" id="cover-modal" aria-hidden="true">
        <div className="modal-card artwork-modal-card">
          <div className="modal-head">
            <div>
              <h3 id="cover-title">Album cover</h3>
              <div className="artwork-modal-subtitle" id="cover-subtitle" />
            </div>
            <button className="close" id="close-cover" type="button">&times;</button>
          </div>
          <div className="artwork-modal-grid">
            <div className="artwork-modal-image-shell">
              <img id="cover-image" alt="Album cover" />
            </div>
            <div className="artwork-modal-info">
              <div className="artwork-modal-stat-grid" id="cover-tidbits" />
              <div className="artwork-modal-next">
                <div className="scan-log-head"><strong>Play Next</strong></div>
                <div className="artwork-modal-next-list" id="cover-next-tracks" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="modal" id="artwork-candidates-modal" aria-hidden="true">
        <div className="modal-card artwork-candidates-card">
          <div className="modal-head">
            <h3 id="artwork-candidates-title">Choose Album Image</h3>
            <button className="close" id="close-artwork-candidates-modal" type="button">&times;</button>
          </div>
          <div className="scan-preflight" id="artwork-candidates-subtitle">Select the cover that should apply to this album group.</div>
          <div className="artwork-candidates-list" id="artwork-candidates-list" />
        </div>
      </div>

      <div className="toast-stack" id="toast-stack" aria-live="polite" />

      <div className="modal" id="command-palette-modal" aria-hidden="true">
        <div className="modal-card command-palette-card">
          <div className="modal-head">
            <h3>Command Palette</h3>
            <button className="close" id="close-command-palette" type="button">&times;</button>
          </div>
          <input id="command-palette-input" placeholder="Search commands, artists, albums, or filters like bpm:140, key:8A, art:missing, notes:cue..." />
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
            <div><strong>Palette filters</strong><span>Type `bpm:138-142`, `key:8A`, `art:missing`, `notes:cue`, or `duplicate`</span></div>
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
              <label className="metadata-wide"><span>Notes</span><textarea id="edit-meta-notes" rows={4} placeholder="Anything useful for this track..." /></label>
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
        <div className="modal-card quit-app-card">
          <div className="quit-app-body">
            <div className="quit-app-icon" aria-hidden="true">!</div>
            <div className="quit-app-copy">
              <div className="quit-app-title">Close the app now?</div>
              <div className="scan-preflight quit-app-message" id="quit-app-message">Are you sure you want to close DJ Assist? Any active scan or playback will stop when the app quits.</div>
            </div>
            <div className="quit-app-actions">
              <button className="btn secondary" id="cancel-quit-app-btn" type="button">Cancel</button>
              <button className="btn danger" id="confirm-quit-app-btn" type="button">Quit DJ Assist</button>
            </div>
          </div>
        </div>
      </div>

      {hasProFeatures ? (
        <div className="modal" id="vpn-warning-modal" aria-hidden="true">
          <div className="modal-card">
            <div className="modal-head">
              <h3>Sign-In Taking a While?</h3>
              <button className="close" id="close-vpn-warning" type="button">&times;</button>
            </div>
            <div className="metadata-editor">
              <div className="scan-preflight">
                Google sign-in uses a local callback that some VPNs block. If you&apos;re connected to a VPN, try <strong>disabling it</strong> and signing in again.
              </div>
              <div className="buttons">
                <button className="btn" id="vpn-warning-try-again-btn" type="button">Try Again</button>
                <button className="btn secondary" id="vpn-warning-dismiss-btn" type="button">Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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

      {hasProFeatures ? (
        <div className="modal" id="google-auth-upsell-modal" aria-hidden="true">
          <div className="modal-card google-auth-upsell-card">
            <div className="modal-head">
              <h3>Connect Google</h3>
              <button className="close" id="close-google-auth-upsell" type="button">&times;</button>
            </div>
            <div className="metadata-editor">
              <div className="google-auth-sheet">
                <div className="google-auth-sheet-mark" aria-hidden="true">G</div>
                <div className="google-auth-sheet-copy">
                  <strong>Google account</strong>
                  <span id="google-auth-upsell-status">Sign in to connect Google Drive.</span>
                </div>
              </div>
              <div className="buttons">
                <button className="google-sign-in-primary" id="google-auth-upsell-sign-in-btn" type="button">
                  <span className="google-mark" aria-hidden="true">G</span>
                  <span id="google-auth-upsell-sign-in-label">Sign in with Google</span>
                </button>
                <button className="btn secondary" id="google-auth-modal-sign-out-btn" type="button" hidden>Sign out</button>
                {/* <button className="btn secondary" id="google-auth-upsell-decline-btn" type="button" hidden>Continue Without Sign-In</button> */}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {hasProFeatures ? (
        <div className="modal" id="google-drive-folder-modal" aria-hidden="true">
          <div className="modal-card google-drive-folder-card">
            <div className="modal-head">
              <h3>Choose Google Drive Folder</h3>
              <button className="close" id="close-google-drive-folder-modal" type="button">&times;</button>
            </div>
            <div className="google-drive-browser">
              <div className="google-drive-browser-head">
                <div className="scan-preflight" id="google-drive-folder-status">Browse your Google Drive folders. DJ Assist only uses read access.</div>
                <div className="google-drive-folder-breadcrumb" id="google-drive-folder-path">Current folder: My Drive</div>
                <input
                  className="google-drive-folder-search"
                  id="google-drive-folder-search"
                  type="search"
                  placeholder="Search folders or files"
                  aria-label="Search Google Drive folders or files"
                />
              </div>
              <div className="google-drive-browser-shell">
                <aside className="google-drive-sidebar" id="google-drive-folder-sidebar">
                  <div className="empty">Loading locations…</div>
                </aside>
                <section className="google-drive-browser-main">
                  <div className="google-drive-browser-toolbar">
                    <button className="btn secondary" id="google-drive-folder-back-btn" type="button">Back</button>
                    <button className="btn" id="google-drive-folder-use-current-btn" type="button">Use This Folder</button>
                    <button className="btn" id="google-drive-use-selected-btn" type="button" hidden>Use Selected</button>
                  </div>
                  <div className="google-drive-folder-list" id="google-drive-folder-list">
                    <div className="empty">Loading Google Drive folders…</div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {hasProFeatures ? (
        <div className="modal" id="cloud-folder-modal" aria-hidden="true">
          <div className="modal-card google-drive-folder-card">
            <div className="modal-head">
              <h3 id="cloud-folder-modal-title">Choose Cloud Folder</h3>
              <button className="close" id="close-cloud-folder-modal" type="button">&times;</button>
            </div>
            <div className="google-drive-browser">
              <div className="google-drive-browser-head">
                <div className="scan-preflight" id="cloud-folder-status">Browse a connected cloud folder.</div>
                <div className="google-drive-folder-breadcrumb" id="cloud-folder-path">Current folder: Root</div>
                <input
                  className="google-drive-folder-search"
                  id="cloud-folder-search"
                  type="search"
                  placeholder="Search folders or files"
                  aria-label="Search cloud folders or files"
                />
              </div>
              <div className="google-drive-browser-shell">
                <aside className="google-drive-sidebar" id="cloud-folder-sidebar">
                  <div className="empty">Loading locations…</div>
                </aside>
                <section className="google-drive-browser-main">
                  <div className="google-drive-browser-toolbar">
                    <button className="btn secondary" id="cloud-folder-back-btn" type="button">Back</button>
                    <button className="btn" id="cloud-folder-use-current-btn" type="button">Import This Folder</button>
                    <button className="btn secondary" id="cloud-folder-refresh-btn" type="button">Refresh</button>
                  </div>
                  <div className="google-drive-folder-list" id="cloud-folder-list">
                    <div className="empty">Loading cloud folders…</div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="modal" id="add-music-source-modal" aria-hidden="true">
        <div className="modal-card add-music-source-card">
          <div className="modal-head">
            <h3>Add Music</h3>
            <button className="close" id="close-add-music-source-modal" type="button">&times;</button>
          </div>
          <div className="add-music-source-body">
            <div className="add-music-source-hero">
              <div className="add-music-source-icon" aria-hidden="true">♪</div>
              <div className="add-music-source-copy">
                <strong>Choose a music source</strong>
                <span>Pick where DJ Assist should pull tracks from right now.</span>
              </div>
            </div>
            <div className="add-music-source-options">
              <button className="add-music-source-option" id="add-music-source-local-btn" type="button">
                <span className="add-music-source-option-icon" data-source="local" aria-hidden="true"></span>
                <span className="add-music-source-option-copy">
                  <strong>This Mac</strong>
                  <span>Pick a local folder and run the regular desktop scan.</span>
                </span>
              </button>
              {hasProFeatures ? (
                <div className={`add-music-source-option-shell${googleDriveConnected ? ' is-connected' : ' is-locked'}`} data-connected={googleDriveConnected ? 'true' : 'false'}>
                  <button
                    className="add-music-source-option"
                    id="add-music-source-google-drive-btn"
                    type="button"
                    disabled={!googleDriveConnected}
                    aria-disabled={!googleDriveConnected}
                  >
                    <span className="add-music-source-option-icon" data-source="google" aria-hidden="true">◢</span>
                    <span className="add-music-source-option-copy">
                      <strong>Google Drive</strong>
                      <span>Browse and import tracks from your Google Drive.</span>
                    </span>
                  </button>
                  <div className="add-music-source-option-footer">
                    <span className="add-music-source-option-status">{googleDriveConnected ? 'Connected' : 'Not authenticated yet.'}</span>
                    {!googleDriveConnected ? (
                      <button
                        className="add-music-source-auth-link"
                        id="add-music-source-google-auth-btn"
                        type="button"
                        disabled={!googleAuthConfigured}
                      >
                        {googleAuthConfigured ? 'Sign in with Google' : 'Google sign-in unavailable'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {hasProFeatures ? (
                <div className={`add-music-source-option-shell${onedriveConnected ? ' is-connected' : ' is-locked'}`} data-connected={onedriveConnected ? 'true' : 'false'}>
                  <button
                    className="add-music-source-option"
                    id="add-music-source-onedrive-btn"
                    type="button"
                    disabled={!onedriveConnected}
                    aria-disabled={!onedriveConnected}
                  >
                    <span className="add-music-source-option-icon" data-source="onedrive" aria-hidden="true">☁</span>
                    <span className="add-music-source-option-copy">
                      <strong>OneDrive</strong>
                      <span>Sign in and import audio from OneDrive.</span>
                    </span>
                  </button>
                  <div className="add-music-source-option-footer">
                    <span className="add-music-source-option-status">{onedriveConnected ? 'Connected' : 'Not authenticated yet.'}</span>
                    {!onedriveConnected ? (
                      <button
                        className="add-music-source-auth-link"
                        id="add-music-source-onedrive-auth-btn"
                        type="button"
                        disabled={!onedriveConfigured}
                      >
                        {onedriveConfigured ? 'Sign in with OneDrive' : 'OneDrive not configured'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {hasProFeatures ? (
                <div className={`add-music-source-option-shell${dropboxConnected ? ' is-connected' : ' is-locked'}`} data-connected={dropboxConnected ? 'true' : 'false'}>
                  <button
                    className="add-music-source-option"
                    id="add-music-source-dropbox-btn"
                    type="button"
                    disabled={!dropboxConnected}
                    aria-disabled={!dropboxConnected}
                  >
                    <span className="add-music-source-option-icon" data-source="dropbox" aria-hidden="true">◈</span>
                    <span className="add-music-source-option-copy">
                      <strong>Dropbox</strong>
                      <span>Sign in and import audio from Dropbox.</span>
                    </span>
                  </button>
                  <div className="add-music-source-option-footer">
                    <span className="add-music-source-option-status">{dropboxConnected ? 'Connected' : 'Not authenticated yet.'}</span>
                    {!dropboxConnected ? (
                      <button
                        className="add-music-source-auth-link"
                        id="add-music-source-dropbox-auth-btn"
                        type="button"
                        disabled={!dropboxConfigured}
                      >
                        {dropboxConfigured ? 'Sign in with Dropbox' : 'Dropbox not configured'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            {hasProFeatures ? (
              <div className="scan-preflight subtle add-music-source-status">
                <span>{onedriveConfigured ? (onedriveConnected ? 'OneDrive ready' : 'OneDrive ready to sign in') : 'OneDrive not configured'}</span>
                <span>{dropboxConfigured ? (dropboxConnected ? 'Dropbox ready' : 'Dropbox ready to sign in') : 'Dropbox not configured'}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <datalist id="artist-suggestions" />
      <datalist id="album-suggestions" />

      {clientInit}
    </>
  );
}
