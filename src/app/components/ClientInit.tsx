'use client';

import { useEffect } from 'react';

export default function ClientInit() {
  useEffect(() => {
    // ── DOM refs ──────────────────────────────────────────────────────────────
    const listEl = document.getElementById('track-list') as HTMLElement;
    const detailEl = document.getElementById('detail') as HTMLElement;
    const searchEl = document.getElementById('search') as HTMLInputElement;
    const bpmMinEl = document.getElementById('bpm-min') as HTMLInputElement;
    const bpmMaxEl = document.getElementById('bpm-max') as HTMLInputElement;
    const keyFilterEl = document.getElementById('key-filter') as HTMLInputElement;
    const showOnlyNoBpmEl = document.getElementById('show-only-no-bpm') as HTMLInputElement;
    const hiddenCountBadge = document.getElementById('hidden-count-badge') as HTMLElement;
    const sortsEl = document.getElementById('sorts') as HTMLElement;
    const coverModal = document.getElementById('cover-modal') as HTMLElement;
    const coverImage = document.getElementById('cover-image') as HTMLImageElement;
    const coverTitle = document.getElementById('cover-title') as HTMLElement;
    const closeCover = document.getElementById('close-cover') as HTMLButtonElement;
    const warningBanner = document.getElementById('warning-banner') as HTMLElement;
    const statusbar = document.getElementById('statusbar') as HTMLElement;
    const panelTrack = document.getElementById('panel-track') as HTMLElement;
    const panelSets = document.getElementById('panel-sets') as HTMLElement;
    const setsPanel = document.getElementById('sets-panel') as HTMLElement;
    const globalPlayBtn = document.getElementById('global-play-btn') as HTMLButtonElement;

    // ── State ─────────────────────────────────────────────────────────────────
    const activeTrackKey = 'dj-assist-active-track-id';
    let activeTrackId: number | null = null;
    let tracks: Record<string, unknown>[] = [];
    let sortMode = 'bpm-asc';
    let sets: Record<string, unknown>[] = [];
    let activeSetId: number | null = null;
    const trackMultipliers: Record<number, number> = {};

    // ── Utilities ─────────────────────────────────────────────────────────────
    function esc(value: unknown): string {
      return String(value ?? '').replace(
        /[&<>"']/g,
        (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s] ?? s),
      );
    }

    function formatDuration(seconds: unknown): string {
      if (!seconds) return '--:--';
      const s = Number(seconds);
      const minutes = Math.floor(s / 60);
      const remainder = Math.floor(s % 60);
      return `${minutes}:${String(remainder).padStart(2, '0')}`;
    }

    // ── BPM display helpers ───────────────────────────────────────────────────
    function getMult(trackId: number): number {
      return trackMultipliers[trackId] ?? 1;
    }

    function displayBpm(raw: unknown, trackId: number): string {
      if (!raw) return '--';
      const mult = getMult(trackId);
      const val = Number(raw) * mult;
      return mult === 1 ? val.toFixed(1) : String(Math.round(val));
    }

    function cycleMult(trackId: number) {
      const c = getMult(trackId);
      trackMultipliers[trackId] = c === 1 ? 2 : c === 2 ? 0.5 : 1;
    }

    // Apply a new multiplier for a track without re-rendering the full detail
    function applyMultToDetail(trackId: number) {
      const mult = getMult(trackId);
      const bpmDisplay = document.getElementById(`bpm-display-${trackId}`);
      if (bpmDisplay) bpmDisplay.textContent = displayBpm(bpmDisplay.dataset.bpm, trackId);
      document.getElementById(`bpm-mult-${trackId}`)?.querySelectorAll('button[data-mult]').forEach((b) => {
        (b as HTMLButtonElement).classList.toggle('active', parseFloat((b as HTMLButtonElement).dataset.mult!) === mult);
      });
      detailEl.querySelectorAll('.suggestion [data-raw-bpm]').forEach((el) => {
        const tid = parseInt((el as HTMLElement).dataset.trackId ?? '0', 10);
        (el as HTMLElement).textContent = displayBpm((el as HTMLElement).dataset.rawBpm, tid) + ' BPM';
      });
    }

    // ── Panel switching ───────────────────────────────────────────────────────
    document.querySelectorAll('.panel-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const panel = (btn as HTMLElement).dataset.panel;
        document.querySelectorAll('.panel-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        panelTrack.style.display = panel === 'track' ? '' : 'none';
        panelSets.style.display = panel === 'sets' ? '' : 'none';
        if (panel === 'sets') renderSetsPanel();
      });
    });

    // ── Sorting ───────────────────────────────────────────────────────────────
    function compareTracks(a: Record<string, unknown>, b: Record<string, unknown>): number {
      if (sortMode === 'name') {
        return String(a.title ?? '').localeCompare(String(b.title ?? '')) ||
          String(a.artist ?? '').localeCompare(String(b.artist ?? ''));
      }
      if (sortMode === 'artist-asc' || sortMode === 'artist-desc') {
        const av = String(a.artist ?? ''), bv = String(b.artist ?? '');
        if (av !== bv) return sortMode === 'artist-asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        return String(a.title ?? '').localeCompare(String(b.title ?? ''));
      }
      if (sortMode === 'bpm-asc' || sortMode === 'bpm-desc') {
        const av = Number(a.effective_bpm ?? 0) * getMult(a.id as number);
        const bv = Number(b.effective_bpm ?? 0) * getMult(b.id as number);
        if (av !== bv) return sortMode === 'bpm-asc' ? av - bv : bv - av;
        return String(a.artist ?? '').localeCompare(String(b.artist ?? ''));
      }
      if (sortMode === 'key-asc' || sortMode === 'key-desc') {
        const ak = String(a.effective_key ?? ''), bk = String(b.effective_key ?? '');
        if (ak !== bk) return sortMode === 'key-asc' ? ak.localeCompare(bk) : bk.localeCompare(ak);
        const av = Number(a.effective_bpm ?? 0), bv = Number(b.effective_bpm ?? 0);
        if (av !== bv) return av - bv;
        return String(a.artist ?? '').localeCompare(String(b.artist ?? ''));
      }
      if (sortMode === 'duration-asc' || sortMode === 'duration-desc') {
        const av = Number(a.duration ?? 0), bv = Number(b.duration ?? 0);
        if (av !== bv) return sortMode === 'duration-asc' ? av - bv : bv - av;
        return String(a.artist ?? '').localeCompare(String(b.artist ?? ''));
      }
      return String(a.artist ?? '').localeCompare(String(b.artist ?? ''));
    }

    const sortToggleLabels: Record<string, [string, string]> = {
      'sort-artist': ['Artist ▲', 'Artist ▼'],
      'sort-bpm':    ['BPM ▲',    'BPM ▼'],
      'sort-key':    ['Key ▲',    'Key ▼'],
      'sort-dur':    ['Dur ▲',    'Dur ▼'],
    };

    function setActiveSortButton(mode: string) {
      sortsEl.querySelectorAll('button[data-sort]').forEach((item) => {
        const btn = item as HTMLButtonElement;
        const sort = btn.dataset.sort ?? '';
        const isToggle = sort.endsWith('-asc');
        const base = sort.replace(/-asc$/, '');
        const isActive = isToggle
          ? (mode === `${base}-asc` || mode === `${base}-desc`)
          : sort === mode;
        btn.classList.toggle('active', isActive);
      });
    }
    setActiveSortButton(sortMode);

    // ── Track list ────────────────────────────────────────────────────────────
    function hasBpm(track: Record<string, unknown>): boolean {
      return Number(track.effective_bpm ?? 0) > 0;
    }

    function renderList(items: Record<string, unknown>[]) {
      const sorted = [...items].filter((t) => showOnlyNoBpmEl.checked ? !hasBpm(t) : hasBpm(t)).sort(compareTracks);
      hiddenCountBadge.textContent = `Hidden: ${Math.max(0, items.length - sorted.length)}`;
      statusbar.innerHTML = `Tracks: <strong>${tracks.length}</strong> | Showing: <strong>${sorted.length}</strong>`;
      listEl.innerHTML = sorted.map((track) => `
        <div class="row ${track.id === activeTrackId ? 'active' : ''}" data-id="${track.id}">
          ${track.album_art_url ? `<img class="thumb" src="${esc(track.album_art_url)}" alt="" />` : '<div class="thumb placeholder">♪</div>'}
          <div>
            <strong>${esc(track.artist ?? 'Unknown Artist')} - ${esc(track.title ?? 'Untitled')}</strong>
            <span>${esc(track.path)}</span>
          </div>
          <div class="bpm-cell" data-track-id="${track.id}" title="Click to cycle BPM multiplier">
            <strong>${displayBpm(track.effective_bpm, track.id as number)}</strong>
            <span>BPM${getMult(track.id as number) !== 1 ? `<em class="mult-badge">${getMult(track.id as number) === 2 ? '×2' : '½×'}</em>` : ''}</span>
          </div>
          <div><strong>${esc(track.effective_key ?? '--')}</strong><span>Key</span></div>
        </div>
      `).join('');
      listEl.querySelectorAll('.row').forEach((row) => {
        row.addEventListener('click', () => selectTrack((row as HTMLElement).dataset.id!, true));
      });
      listEl.querySelectorAll('.bpm-cell[data-track-id]').forEach((cell) => {
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          const tid = parseInt((cell as HTMLElement).dataset.trackId!, 10);
          cycleMult(tid);
          renderList(tracks);
          if (activeTrackId === tid) {
            applyMultToDetail(tid);
          } else {
            // Update any suggestion in the current detail that shows this track
            detailEl.querySelectorAll(`[data-raw-bpm][data-track-id="${tid}"]`).forEach((el) => {
              (el as HTMLElement).textContent = displayBpm((el as HTMLElement).dataset.rawBpm, tid) + ' BPM';
            });
          }
        });
      });
    }

    // ── BPM editing ───────────────────────────────────────────────────────────
    async function saveBpm(trackId: number, newBpm: number) {
      const res = await fetch(`/api/tracks/${trackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bpm: newBpm }),
      });
      if (!res.ok) return;
      // Update local tracks array
      const idx = tracks.findIndex((t) => t.id === trackId);
      if (idx !== -1) {
        tracks[idx] = { ...tracks[idx], bpm: newBpm, effective_bpm: newBpm };
        renderList(tracks);
      }
    }

    function attachBpmEdit(trackId: number) {
      const display = document.getElementById(`bpm-display-${trackId}`);
      if (!display) return;
      display.addEventListener('click', () => {
        const current = display.dataset.bpm ?? '';
        display.outerHTML = `<input class="bpm-input-inline" id="bpm-input-${trackId}" value="${esc(current)}" />`;
        const input = document.getElementById(`bpm-input-${trackId}`) as HTMLInputElement;
        input.focus();
        input.select();
        const commit = async () => {
          const val = parseFloat(input.value);
          if (!isNaN(val) && val > 0) await saveBpm(trackId, val);
          // Re-render detail to restore display
          const res = await fetch(`/api/tracks/${trackId}`);
          if (res.ok) renderDetail(await res.json());
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
          if (e.key === 'Escape') {
            input.removeEventListener('blur', commit);
            fetch(`/api/tracks/${trackId}`).then((r) => r.json()).then(renderDetail);
          }
        });
      });
    }

    // ── Track detail ──────────────────────────────────────────────────────────
    function renderDetail(payload: Record<string, unknown>) {
      const track = payload.track as Record<string, unknown>;
      const coverUrl = (track.album_art_url as string) || '';
      const coverLabel = (track.album ?? track.title ?? 'Unknown') as string;
      const scrubId = `scrub-${track.id}`;
      const trackId = track.id as number;
      const mult = getMult(trackId);
      const bpmDisplay = track.effective_bpm
        ? `<span class="bpm-val" id="bpm-display-${trackId}" data-bpm="${track.effective_bpm}" title="Click to edit">${displayBpm(track.effective_bpm, trackId)}</span>`
        : `<span class="bpm-val" id="bpm-display-${trackId}" data-bpm="" title="Click to set BPM">--</span>`;
      const multButtons = `<span class="track-bpm-mult" id="bpm-mult-${trackId}">
        <button data-mult="0.5" class="${mult === 0.5 ? 'active' : ''}">½×</button>
        <button data-mult="1" class="${mult === 1 ? 'active' : ''}">1×</button>
        <button data-mult="2" class="${mult === 2 ? 'active' : ''}">2×</button>
      </span>`;

      const setOptions = sets.map((s) =>
        `<option value="${s.id}">${esc(s.name)}</option>`
      ).join('');

      detailEl.innerHTML = `
        <div class="hero">
          <div class="hero-art" style="${coverUrl ? `background-image:url('${esc(coverUrl)}')` : ''}"></div>
          <div class="hero-cover ${coverUrl ? '' : 'no-art'}">
            ${coverUrl ? `<img src="${esc(coverUrl)}" alt="Album cover" />` : `<div class="cover-placeholder"><div class="icon">♪</div><div>No cover</div><small>${esc(coverLabel)}</small></div>`}
          </div>
          <div class="hero-copy">
            <h2>${esc(track.artist ?? 'Unknown Artist')} - ${esc(track.title ?? 'Untitled')}</h2>
            <div class="meta">
              <span>ID ${track.id}</span>
              <span>${bpmDisplay} BPM ${multButtons}</span>
              <span>${esc(track.effective_key ?? '--')}</span>
              <span>${formatDuration(track.duration)}</span>
            </div>
            <div class="chips">
              ${track.album ? `<span class="chip">${esc(track.album)}</span>` : ''}
              ${track.decode_failed === 'true' ? '<span class="chip warn">Unreadable audio</span>' : ''}
            </div>
          </div>
        </div>
        <div class="detail-inner">
          <div class="buttons">
            <button class="btn" id="play-btn" type="button"><span class="btn-icon">▶</span> Play</button>
            ${track.youtube_url ? `<a class="btn" href="${esc(track.youtube_url)}" target="_blank" rel="noreferrer">YouTube</a>` : ''}
            ${sets.length > 0 ? `
              <div style="display:inline-flex;gap:6px;align-items:center;">
                <select id="set-select" style="background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:13px;">
                  ${setOptions}
                </select>
                <button class="btn" id="add-to-set-btn" type="button">+ Add to playlist</button>
              </div>
            ` : `<button class="btn" id="open-sets-btn" type="button">+ Add to playlist</button>`}
          </div>
          <div class="local-player">
            <audio id="local-audio" controls preload="metadata" src="${esc(`/api/tracks/${track.id}/stream`)}"></audio>
            <div class="scrub-wrap">
              <div class="scrub-row"><span id="${scrubId}-current">0:00</span><span class="scrub-separator">/</span><span id="${scrubId}-duration">0:00</span></div>
              <input id="${scrubId}" type="range" min="0" max="0" value="0" step="0.01" />
            </div>
          </div>
          <h3>Can play next</h3>
          <div class="suggestions">
            ${((payload.next_tracks ?? []) as Record<string, unknown>[]).map((item) => `
              <div class="suggestion" data-track-id="${item.id}">
                <strong>${esc(item.artist ?? 'Unknown Artist')} - ${esc(item.title ?? 'Untitled')}</strong><br>
                <small><span data-raw-bpm="${item.effective_bpm ?? ''}" data-track-id="${item.id}">${displayBpm(item.effective_bpm, item.id as number)} BPM</span> · ${esc(item.effective_key ?? '--')} · ${esc(item.reason ?? '')}</small>
              </div>
            `).join('') || '<div class="empty">No compatible tracks found.</div>'}
          </div>
          ${track.analysis_debug ? `
            <details class="debug"><summary>Debug info</summary>
            <pre class="debug-text">${esc(track.analysis_debug)}</pre></details>
          ` : ''}
        </div>
      `;

      attachBpmEdit(trackId);

      document.getElementById(`bpm-mult-${trackId}`)?.querySelectorAll('button[data-mult]').forEach((btn) => {
        btn.addEventListener('click', () => {
          trackMultipliers[trackId] = parseFloat((btn as HTMLButtonElement).dataset.mult!);
          applyMultToDetail(trackId);
          renderList(tracks);
        });
      });

      // "Add to playlist" button
      const addToSetBtn = document.getElementById('add-to-set-btn');
      const setSelect = document.getElementById('set-select') as HTMLSelectElement | null;
      if (addToSetBtn && setSelect) {
        addToSetBtn.addEventListener('click', async () => {
          const setId = parseInt(setSelect.value, 10);
          if (!setId) return;
          await fetch(`/api/sets/${setId}/tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track_id: track.id }),
          });
          addToSetBtn.textContent = '✓ Added';
          setTimeout(() => { addToSetBtn.textContent = '+ Add to playlist'; }, 1500);
        });
      }

      // Switch to sets panel if "Add to playlist" clicked with no sets
      const openSetsBtn = document.getElementById('open-sets-btn');
      if (openSetsBtn) {
        openSetsBtn.addEventListener('click', () => {
          document.querySelector('[data-panel="sets"]')?.dispatchEvent(new MouseEvent('click'));
        });
      }

      // Suggestion clicks
      detailEl.querySelectorAll('.suggestion[data-track-id]').forEach((card) => {
        card.addEventListener('click', () => selectTrack((card as HTMLElement).dataset.trackId!, true));
      });

      // Audio player
      const playBtn = document.getElementById('play-btn') as HTMLButtonElement | null;
      const localAudio = document.getElementById('local-audio') as HTMLAudioElement | null;
      const scrubRange = document.getElementById(scrubId) as HTMLInputElement | null;
      const currentTimeEl = document.getElementById(`${scrubId}-current`);
      const durationTimeEl = document.getElementById(`${scrubId}-duration`);
      const resumeKey = `dj-assist-resume-${track.id}`;

      const loadResumeState = () => {
        try { return JSON.parse(sessionStorage.getItem(resumeKey) || 'null') || {}; } catch { return {}; }
      };
      const saveResumeState = () => {
        if (!localAudio) return;
        try { sessionStorage.setItem(resumeKey, JSON.stringify({ time: localAudio.currentTime, paused: localAudio.paused })); } catch { /* ignore */ }
      };

      const formatTime = (s: number) => {
        if (!Number.isFinite(s) || s < 0) return '0:00';
        return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      };

      if (playBtn && localAudio) {
        const resumeState = loadResumeState();
        let resumeApplied = false;
        localAudio.addEventListener('loadedmetadata', () => {
          if (!resumeApplied && resumeState.time > 0) {
            localAudio.currentTime = Math.min(resumeState.time, (localAudio.duration || 0) - 0.25);
            resumeApplied = true;
            if (!resumeState.paused) localAudio.play().catch(() => {});
          }
          if (scrubRange) scrubRange.max = String(localAudio.duration || 0);
          if (durationTimeEl) durationTimeEl.textContent = formatTime(localAudio.duration || 0);
        });
        localAudio.addEventListener('timeupdate', () => {
          if (scrubRange) scrubRange.value = String(localAudio.currentTime);
          if (currentTimeEl) currentTimeEl.textContent = formatTime(localAudio.currentTime);
          saveResumeState();
        });
        scrubRange?.addEventListener('input', () => { localAudio.currentTime = Number(scrubRange.value); saveResumeState(); });
        playBtn.addEventListener('click', async () => {
          if (localAudio.paused) { await localAudio.play(); } else { localAudio.pause(); }
        });
        const setPlaying = (playing: boolean) => {
          playBtn.classList.toggle('playing', playing);
          playBtn.innerHTML = playing ? '<span class="btn-icon">❚❚</span> Pause' : '<span class="btn-icon">▶</span> Play';
          if (globalPlayBtn) {
            globalPlayBtn.classList.toggle('playing', playing);
            globalPlayBtn.textContent = playing ? '❚❚' : '▶';
          }
        };
        localAudio.addEventListener('play', () => { setPlaying(true); saveResumeState(); });
        localAudio.addEventListener('pause', () => { setPlaying(false); saveResumeState(); });
        localAudio.addEventListener('ended', () => {
          setPlaying(false);
          try { sessionStorage.removeItem(resumeKey); } catch { /* ignore */ }
        });
        // Sync global button to current state (e.g. resumed track)
        setPlaying(!localAudio.paused);
      }
    }

    // ── Sets panel ────────────────────────────────────────────────────────────
    async function loadSets() {
      const res = await fetch('/api/sets');
      const data = await res.json();
      sets = data.sets ?? [];
    }

    async function renderSetsPanel() {
      await loadSets();

      const newSetForm = `
        <div class="new-set-form">
          <input id="new-set-name" placeholder="New playlist name…" />
          <button class="btn" id="create-set-btn" type="button">Create</button>
        </div>
      `;

      if (!sets.length) {
        setsPanel.innerHTML = newSetForm + '<div class="empty">No playlists yet.</div>';
        attachNewSetForm();
        return;
      }

      setsPanel.innerHTML = newSetForm + sets.map((s) => `
        <div class="set-item" data-set-id="${s.id}">
          <div class="set-item-head" data-set-id="${s.id}" style="cursor:pointer;">
            <div>
              <strong>${esc(s.name)}</strong>
              <div class="set-item-meta">${s.track_count} tracks · ${formatDuration(s.total_duration)}</div>
            </div>
            <div class="set-item-actions">
              <button class="icon-btn danger delete-set-btn" data-set-id="${s.id}" title="Delete">✕</button>
            </div>
          </div>
          <div class="set-tracks-list" id="set-tracks-${s.id}" style="display:none;"></div>
        </div>
      `).join('');

      attachNewSetForm();

      setsPanel.querySelectorAll('.set-item-head[data-set-id]').forEach((head) => {
        head.addEventListener('click', async (e) => {
          if ((e.target as HTMLElement).closest('.delete-set-btn')) return;
          const setId = parseInt((head as HTMLElement).dataset.setId!, 10);
          const tracksDiv = document.getElementById(`set-tracks-${setId}`)!;
          if (tracksDiv.style.display !== 'none') { tracksDiv.style.display = 'none'; return; }
          const res = await fetch(`/api/sets/${setId}`);
          const { set } = await res.json();
          activeSetId = setId;
          tracksDiv.style.display = '';
          if (!set.tracks?.length) {
            tracksDiv.innerHTML = '<div class="empty" style="padding:8px 0;">Empty playlist.</div>';
            return;
          }
          tracksDiv.innerHTML = set.tracks.map((t: Record<string, unknown>) => `
            <div class="set-track-row" data-set-id="${setId}" data-position="${t.position}">
              <div>
                <strong>${esc(t.artist ?? 'Unknown')} - ${esc(t.title ?? 'Untitled')}</strong>
                <span>${t.bpm ? displayBpm(t.bpm, t.id as number) + ' BPM' : '--'} · ${esc(t.key ?? '--')}</span>
              </div>
              <button class="icon-btn danger remove-track-btn" data-set-id="${setId}" data-position="${t.position}" title="Remove">✕</button>
            </div>
          `).join('');
          tracksDiv.querySelectorAll('.remove-track-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const sid = parseInt((btn as HTMLElement).dataset.setId!, 10);
              const pos = parseInt((btn as HTMLElement).dataset.position!, 10);
              await fetch(`/api/sets/${sid}/tracks/${pos}`, { method: 'DELETE' });
              renderSetsPanel();
            });
          });
        });
      });

      setsPanel.querySelectorAll('.delete-set-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const setId = (btn as HTMLElement).dataset.setId!;
          if (!confirm('Delete this playlist?')) return;
          await fetch(`/api/sets/${setId}`, { method: 'DELETE' });
          renderSetsPanel();
        });
      });
    }

    function attachNewSetForm() {
      const input = document.getElementById('new-set-name') as HTMLInputElement;
      const btn = document.getElementById('create-set-btn') as HTMLButtonElement;
      if (!btn || !input) return;
      const create = async () => {
        const name = input.value.trim();
        if (!name) return;
        await fetch('/api/sets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        input.value = '';
        renderSetsPanel();
      };
      btn.addEventListener('click', create);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
    }

    // ── Track loading ─────────────────────────────────────────────────────────
    async function loadTracks(query = '') {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (bpmMinEl.value) params.set('bpm_min', bpmMinEl.value);
      if (bpmMaxEl.value) params.set('bpm_max', bpmMaxEl.value);
      if (keyFilterEl.value) params.set('key', keyFilterEl.value);
      const res = await fetch(`/api/tracks?${params.toString()}`);
      const response = await res.json();
      tracks = response.tracks ?? [];
      const debug = response.debug ?? {};
      const missingEnv: string[] = debug.spotify_missing ?? [];
      if (missingEnv.length) {
        warningBanner.style.display = 'block';
        warningBanner.innerHTML = `<strong>Missing env:</strong> ${missingEnv.join(', ')}`;
      } else {
        warningBanner.style.display = 'none';
      }
      renderList(tracks);
      if (tracks.length && !activeTrackId) {
        let storedId: number | null = null;
        try { storedId = Number(sessionStorage.getItem(activeTrackKey) || 0) || null; } catch { /* ignore */ }
        const preferred = storedId ? tracks.find((t) => t.id === storedId) ?? null : null;
        selectTrack(String((preferred ?? tracks[0]).id), Boolean(preferred));
      }
    }

    async function selectTrack(id: string, autoPlay = false) {
      activeTrackId = Number(id);
      try { sessionStorage.setItem(activeTrackKey, String(activeTrackId)); } catch { /* ignore */ }
      renderList(tracks);
      await loadSets(); // refresh sets so "add to playlist" dropdown is current
      const res = await fetch(`/api/tracks/${id}`);
      const payload = await res.json();
      renderDetail(payload);
      if (autoPlay) {
        const localAudio = document.getElementById('local-audio') as HTMLAudioElement | null;
        localAudio?.play().catch(() => {});
      }
    }

    // ── Global play/pause ─────────────────────────────────────────────────────
    globalPlayBtn?.addEventListener('click', () => {
      const audio = document.getElementById('local-audio') as HTMLAudioElement | null;
      if (!audio) return;
      if (audio.paused) audio.play().catch(() => {}); else audio.pause();
    });

    // ── Cover modal ───────────────────────────────────────────────────────────
    closeCover.addEventListener('click', () => { coverModal.classList.remove('open'); coverModal.setAttribute('aria-hidden', 'true'); });
    coverModal.addEventListener('click', (e) => {
      if (e.target === coverModal) { coverModal.classList.remove('open'); coverModal.setAttribute('aria-hidden', 'true'); }
    });

    // ── Search / sort / filter ────────────────────────────────────────────────
    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    searchEl.addEventListener('input', () => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadTracks(searchEl.value.trim()), 200);
    });
    [bpmMinEl, bpmMaxEl, keyFilterEl].forEach((el) => el.addEventListener('input', () => loadTracks(searchEl.value.trim())));
    showOnlyNoBpmEl.addEventListener('change', () => loadTracks(searchEl.value.trim()));
    sortsEl.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button[data-sort]') as HTMLButtonElement | null;
      if (!button) return;
      const clicked = button.dataset.sort ?? '';
      if (clicked.endsWith('-asc')) {
        const base = clicked.slice(0, -4);
        sortMode = sortMode === `${base}-asc` ? `${base}-desc` : `${base}-asc`;
        const labels = sortToggleLabels[button.id];
        if (labels) button.textContent = sortMode.endsWith('-desc') ? labels[1] : labels[0];
      } else {
        sortMode = clicked;
      }
      setActiveSortButton(sortMode);
      renderList(tracks);
    });

    // ── Boot ──────────────────────────────────────────────────────────────────
    loadSets().then(() => loadTracks());
  }, []);

  return null;
}
