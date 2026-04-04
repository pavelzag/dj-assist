import ClientInit from './components/ClientInit';

export default function Page() {
  return (
    <>
      <header>
        <h1><span className="title-dj">DJ</span><span className="title-assist">ASSIST</span></h1>
        <button type="button" id="global-play-btn" className="global-play-btn">▶</button>
        <input id="search" placeholder="Search tracks, artist, album..." />
        <div className="filters">
          <input id="bpm-min" type="number" step="0.1" placeholder="BPM min" />
          <input id="bpm-max" type="number" step="0.1" placeholder="BPM max" />
          <input id="key-filter" placeholder="Key" />
          <label>
            <input id="show-only-no-bpm" type="checkbox" /> Show only no BPM
          </label>
          <span className="badge" id="hidden-count-badge">Hidden: 0</span>
        </div>
      </header>

      <div className="banner" id="warning-banner" style={{ display: 'none' }} />
      <div className="statusbar" id="statusbar" />

      <main>
        <section className="pane">
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
          </div>
          <div id="panel-track">
            <div className="detail" id="detail">
              <div className="empty">Select a track to see details and what can follow it.</div>
            </div>
          </div>
          <div id="panel-sets" style={{ display: 'none' }}>
            <div className="sets-panel" id="sets-panel">
              <div className="empty">Loading playlists…</div>
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

      <ClientInit />
    </>
  );
}
