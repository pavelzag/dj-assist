'use client';

import { useEffect } from 'react';

export default function ClientInit() {
  useEffect(() => {
    type ScanSummary = {
      scanned: number;
      analyzed: number;
      skipped: number;
      errors: number;
    };

    // ── DOM refs ──────────────────────────────────────────────────────────────
    const listEl = document.getElementById('track-list') as HTMLElement;
    const detailEl = document.getElementById('detail') as HTMLElement;
    const searchEl = document.getElementById('search') as HTMLInputElement;
    const bpmMinEl = document.getElementById('bpm-min') as HTMLInputElement;
    const bpmMaxEl = document.getElementById('bpm-max') as HTMLInputElement;
    const keyFilterEl = document.getElementById('key-filter') as HTMLInputElement;
    const showOnlyNoBpmEl = document.getElementById('show-only-no-bpm') as HTMLInputElement;
    const hiddenCountBadge = document.getElementById('hidden-count-badge') as HTMLElement;
    const browseScopeEl = document.getElementById('browse-scope') as HTMLElement;
    const bulkToolbarEl = document.getElementById('bulk-toolbar') as HTMLElement;
    const sortsEl = document.getElementById('sorts') as HTMLElement;
    const scanDirectoryEl = document.getElementById('scan-directory') as HTMLInputElement;
    const scanRecentDirectoriesEl = document.getElementById('scan-recent-directories') as HTMLSelectElement;
    const scanUseLastBtn = document.getElementById('scan-use-last-btn') as HTMLButtonElement;
    const scanBtn = document.getElementById('scan-btn') as HTMLButtonElement;
    const scanCancelBtn = document.getElementById('scan-cancel-btn') as HTMLButtonElement;
    const scanRescanModeEl = document.getElementById('scan-rescan-mode') as HTMLSelectElement;
    const scanFetchArtEl = document.getElementById('scan-fetch-art') as HTMLInputElement;
    const scanVerboseEl = document.getElementById('scan-verbose') as HTMLInputElement;
    const scanStatusEl = document.getElementById('scan-status') as HTMLElement;
    const scanProgressMetaEl = document.getElementById('scan-progress-meta') as HTMLElement;
    const scanProgressBarEl = document.getElementById('scan-progress-bar') as HTMLElement;
    const scanProgressFileEl = document.getElementById('scan-progress-file') as HTMLElement;
    const scanLogEl = document.getElementById('scan-log') as HTMLElement;
    const scanLogClearBtn = document.getElementById('scan-log-clear-btn') as HTMLButtonElement;
    const scanLogToggleBtn = document.getElementById('scan-log-toggle-btn') as HTMLButtonElement;
    const scanLogBodyEl = document.getElementById('scan-log-body') as HTMLElement;
    const scanSummaryEl = document.getElementById('scan-summary') as HTMLElement;
    const scanSummaryToggleBtn = document.getElementById('scan-summary-toggle-btn') as HTMLButtonElement;
    const scanSummaryBodyEl = document.getElementById('scan-summary-body') as HTMLElement;
    const scanPreflightEl = document.getElementById('scan-preflight') as HTMLElement;
    const scanHistoryEl = document.getElementById('scan-history') as HTMLElement;
    const scanHistoryToggleBtn = document.getElementById('scan-history-toggle-btn') as HTMLButtonElement;
    const scanHistoryBodyEl = document.getElementById('scan-history-body') as HTMLElement;
    const coverModal = document.getElementById('cover-modal') as HTMLElement;
    const coverImage = document.getElementById('cover-image') as HTMLImageElement;
    const coverTitle = document.getElementById('cover-title') as HTMLElement;
    const closeCover = document.getElementById('close-cover') as HTMLButtonElement;
    const warningBanner = document.getElementById('warning-banner') as HTMLElement;
    const statusbar = document.getElementById('statusbar') as HTMLElement;
    const panelTrack = document.getElementById('panel-track') as HTMLElement;
    const panelSets = document.getElementById('panel-sets') as HTMLElement;
    const panelLibrary = document.getElementById('panel-library') as HTMLElement;
    const setsPanel = document.getElementById('sets-panel') as HTMLElement;
    const libraryPanel = document.getElementById('library-panel') as HTMLElement;
    const globalPlayBtn = document.getElementById('global-play-btn') as HTMLButtonElement;

    // ── State ─────────────────────────────────────────────────────────────────
    const activeTrackKey = 'dj-assist-active-track-id';
    const scanDirectoryKey = 'dj-assist-scan-directory';
    const scanRecentDirectoriesKey = 'dj-assist-scan-recent-directories';
    const scanVerboseKey = 'dj-assist-scan-verbose';
    const scanRescanModeKey = 'dj-assist-scan-rescan-mode';
    const scanPanelStateKey = 'dj-assist-scan-panel-state';
    let activeTrackId: number | null = null;
    let activeScanJobId: string | null = null;
    let activeScanUnsubscribe: (() => void) | null = null;
    let tracks: Record<string, unknown>[] = [];
    let sortMode = 'bpm-asc';
    let activeArtistScope = '';
    let activeAlbumScope = '';
    let sets: Record<string, unknown>[] = [];
    let scanHistory: Record<string, unknown>[] = [];
    let libraryOverview: Record<string, unknown> | null = null;
    let watchFolders: Record<string, unknown>[] = [];
    let runtimeHealth: Record<string, unknown> | null = null;
    let activeSetId: number | null = null;
    const trackMultipliers: Record<number, number> = {};
    const nextTracksPageByTrackId: Record<number, number> = {};
    const detailSectionCollapsed: Record<string, boolean> = {};
    const selectedTrackIds = new Set<number>();

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

    function normalizeText(value: unknown): string {
      return String(value ?? '').trim().toLocaleLowerCase();
    }

    function albumNameFor(track: Record<string, unknown>): string {
      return String(track.album ?? track.spotify_album_name ?? '').trim();
    }

    function matchesBrowseScope(track: Record<string, unknown>): boolean {
      const artistMatches = !activeArtistScope || normalizeText(track.artist) === normalizeText(activeArtistScope);
      const albumMatches = !activeAlbumScope || normalizeText(albumNameFor(track)) === normalizeText(activeAlbumScope);
      return artistMatches && albumMatches;
    }

    function artistAlbums(artist: string): string[] {
      if (!artist) return [];
      const normalizedArtist = normalizeText(artist);
      const albums = new Set<string>();
      for (const track of tracks) {
        if (normalizeText(track.artist) !== normalizedArtist) continue;
        const album = albumNameFor(track);
        if (album) albums.add(album);
      }
      return [...albums].sort((a, b) => a.localeCompare(b));
    }

    function relatedArtistTracks(track: Record<string, unknown>): Record<string, unknown>[] {
      const artist = normalizeText(track.artist);
      if (!artist) return [];
      return tracks
        .filter((item) => item.id !== track.id && normalizeText(item.artist) === artist)
        .sort(compareTracks)
        .slice(0, 12);
    }

    function renderBrowseScope() {
      if (!activeArtistScope && !activeAlbumScope) {
        browseScopeEl.innerHTML = '<span class="browse-scope-empty">Browsing entire library</span>';
        return;
      }
      const parts = [];
      if (activeArtistScope) {
        parts.push(`<button type="button" class="scope-pill" data-nav-kind="artist" data-nav-value="${esc(activeArtistScope)}">Artist: ${esc(activeArtistScope)}</button>`);
      }
      if (activeAlbumScope) {
        parts.push(`<button type="button" class="scope-pill" data-nav-kind="album" data-nav-value="${esc(activeAlbumScope)}">Album: ${esc(activeAlbumScope)}</button>`);
      }
      browseScopeEl.innerHTML = `
        <span class="browse-scope-label">Browsing</span>
        ${parts.join('')}
        <button type="button" class="scope-clear-btn" id="browse-scope-clear">Clear</button>
      `;
      document.getElementById('browse-scope-clear')?.addEventListener('click', () => {
        activeArtistScope = '';
        activeAlbumScope = '';
        renderBrowseScope();
        renderList(tracks);
      });
    }

    function navigateLibrary(kind: 'artist' | 'album', value: string, artistForAlbum = '') {
      if (kind === 'artist') {
        activeArtistScope = value.trim();
        activeAlbumScope = '';
      } else {
        activeAlbumScope = value.trim();
        if (artistForAlbum.trim()) activeArtistScope = artistForAlbum.trim();
      }
      renderBrowseScope();
      renderList(tracks);
    }

    function bindLibraryNavLinks(root: ParentNode) {
      root.querySelectorAll('[data-nav-kind][data-nav-value]').forEach((node) => {
        node.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const target = event.currentTarget as HTMLElement;
          const kind = target.dataset.navKind === 'album' ? 'album' : 'artist';
          const value = target.dataset.navValue ?? '';
          const artist = target.dataset.navArtist ?? '';
          navigateLibrary(kind, value, artist);
        });
      });
    }

    function visibleTracks(items: Record<string, unknown>[]) {
      return [...items]
        .filter((track) => matchesBrowseScope(track))
        .filter((track) => showOnlyNoBpmEl.checked ? !hasBpm(track) : hasBpm(track))
        .sort(compareTracks);
    }

    function selectedTracks(): Record<string, unknown>[] {
      return tracks.filter((track) => selectedTrackIds.has(Number(track.id)));
    }

    function setScanStatus(message: string, state: 'idle' | 'running' | 'success' | 'error' = 'idle') {
      scanStatusEl.textContent = message;
      scanStatusEl.dataset.state = state;
    }

    function setScanProgress(current: number, total: number, file = 'No scan running') {
      const safeCurrent = Math.max(0, current);
      const safeTotal = Math.max(0, total);
      const percent = safeTotal > 0 ? Math.min(100, (safeCurrent / safeTotal) * 100) : 0;
      scanProgressMetaEl.textContent = `${safeCurrent} / ${safeTotal}`;
      scanProgressBarEl.style.width = `${percent}%`;
      scanProgressFileEl.textContent = file;
    }

    function appendScanLog(message: string, level: 'info' | 'warning' | 'error' | 'success' = 'info') {
      const entry = document.createElement('div');
      entry.className = `scan-log-entry ${level}`;
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      entry.textContent = `${timestamp}  ${message}`;
      if (scanLogEl.children.length === 1 && scanLogEl.textContent?.includes('No scan activity yet.')) {
        scanLogEl.innerHTML = '';
      }
      scanLogEl.prepend(entry);
      while (scanLogEl.children.length > 80) {
        scanLogEl.removeChild(scanLogEl.lastElementChild!);
      }
    }

    function resetScanLog() {
      scanLogEl.innerHTML = '<div class="scan-log-entry info">No scan activity yet.</div>';
    }

    function getScanPanelState(): Record<string, boolean> {
      try {
        const parsed = JSON.parse(localStorage.getItem(scanPanelStateKey) || '{}');
        return parsed && typeof parsed === 'object' ? parsed as Record<string, boolean> : {};
      } catch {
        return {};
      }
    }

    function saveScanPanelState(next: Record<string, boolean>) {
      try {
        localStorage.setItem(scanPanelStateKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }

    function applyPanelCollapsedState(
      panelId: string,
      button: HTMLButtonElement,
      body: HTMLElement,
      collapsed: boolean,
    ) {
      body.hidden = collapsed;
      button.textContent = collapsed ? 'Expand' : 'Collapse';
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      button.dataset.collapsed = collapsed ? 'true' : 'false';
      button.closest('.scan-log-panel, .scan-summary-panel, .scan-history-panel')?.classList.toggle('collapsed', collapsed);
    }

    function initCollapsiblePanel(
      panelId: string,
      button: HTMLButtonElement,
      body: HTMLElement,
      defaultCollapsed = false,
    ) {
      const state = getScanPanelState();
      let collapsed = state[panelId] ?? defaultCollapsed;
      applyPanelCollapsedState(panelId, button, body, collapsed);
      button.addEventListener('click', () => {
        collapsed = !collapsed;
        applyPanelCollapsedState(panelId, button, body, collapsed);
        saveScanPanelState({ ...getScanPanelState(), [panelId]: collapsed });
      });
      button.closest('.scan-log-head')?.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        collapsed = !collapsed;
        applyPanelCollapsedState(panelId, button, body, collapsed);
        saveScanPanelState({ ...getScanPanelState(), [panelId]: collapsed });
      });
    }

    function getRecentDirectories(): string[] {
      try {
        const parsed = JSON.parse(localStorage.getItem(scanRecentDirectoriesKey) || '[]');
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];
      } catch {
        return [];
      }
    }

    function saveRecentDirectories(directories: string[]) {
      try {
        localStorage.setItem(scanRecentDirectoriesKey, JSON.stringify(directories.slice(0, 8)));
      } catch {
        /* ignore */
      }
    }

    function pushRecentDirectory(directory: string) {
      const normalized = directory.trim();
      if (!normalized) return;
      const next = [normalized, ...getRecentDirectories().filter((item) => item !== normalized)];
      saveRecentDirectories(next);
      renderRecentDirectories(next);
    }

    function renderRecentDirectories(directories = getRecentDirectories()) {
      scanRecentDirectoriesEl.innerHTML = '<option value="">Recent folders…</option>' +
        directories.map((directory) => `<option value="${esc(directory)}">${esc(directory)}</option>`).join('');
      scanUseLastBtn.disabled = directories.length === 0;
    }

    function setScanSummary(summary?: Record<string, unknown> | null, job?: Record<string, unknown> | null) {
      const safe = summary ?? {};
      const created = String((job?.createdAt ?? job?.created_at ?? 'None') || 'None');
      scanSummaryEl.innerHTML = [
        ['Last run', created === 'None' ? 'None' : new Date(created).toLocaleString()],
        ['BPM', String(safe.with_bpm ?? 0)],
        ['Key', String(safe.with_key ?? 0)],
        ['Spotify', String(safe.with_spotify ?? 0)],
        ['Album art', String(safe.with_album_art ?? 0)],
        ['Decode failures', String(safe.decode_failures ?? 0)],
      ].map(([label, value]) => `<div class="scan-summary-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    }

    function renderScanHistory() {
      if (!scanHistory.length) {
        scanHistoryEl.innerHTML = '<div class="scan-log-entry info">No scan history yet.</div>';
        return;
      }
      scanHistoryEl.innerHTML = scanHistory.map((job) => `
        <div class="scan-history-item ${job.id === activeScanJobId ? 'active' : ''}" data-scan-id="${job.id}">
          <strong>${esc(job.directory ?? 'Unknown directory')}</strong>
          <span>${esc(job.status ?? 'unknown')} · ${esc(((job.options as Record<string, unknown> | undefined)?.rescanMode ?? 'smart'))}</span>
          <span>${esc(job.createdAt ? new Date(String(job.createdAt)).toLocaleString() : 'Unknown time')}</span>
        </div>
      `).join('');
      scanHistoryEl.querySelectorAll('.scan-history-item[data-scan-id]').forEach((item) => {
        item.addEventListener('click', async () => {
          const id = (item as HTMLElement).dataset.scanId!;
          await loadScanJob(id, true);
        });
      });
    }

    function renderBulkToolbar() {
      const selected = selectedTracks();
      if (!selected.length) {
        bulkToolbarEl.innerHTML = '<div class="bulk-toolbar-empty">No tracks selected.</div>';
        return;
      }

      const setOptions = sets.map((set) => `<option value="${set.id}">${esc(set.name)}</option>`).join('');
      bulkToolbarEl.innerHTML = `
        <div class="bulk-toolbar-main">
          <strong>${selected.length} selected</strong>
          <button type="button" class="btn" id="bulk-ignore-btn">Ignore</button>
          <button type="button" class="btn" id="bulk-unignore-btn">Unignore</button>
          <button type="button" class="btn" id="bulk-tags-btn">Add Tags</button>
          <button type="button" class="btn" id="bulk-clear-tags-btn">Clear Tags</button>
          ${sets.length ? `
            <select id="bulk-set-select">
              ${setOptions}
            </select>
            <button type="button" class="btn" id="bulk-add-set-btn">Add To Playlist</button>
          ` : ''}
          <button type="button" class="icon-btn" id="bulk-clear-selection-btn">Clear</button>
        </div>
      `;

      const runBulkAction = async (action: string, extra: Record<string, unknown> = {}) => {
        const res = await fetch('/api/tracks/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [...selectedTrackIds], action, ...extra }),
        });
        if (!res.ok) return;
        await loadTracks(searchEl.value.trim());
        await loadLibraryOverview();
      };

      document.getElementById('bulk-ignore-btn')?.addEventListener('click', () => { void runBulkAction('ignore'); });
      document.getElementById('bulk-unignore-btn')?.addEventListener('click', () => { void runBulkAction('unignore'); });
      document.getElementById('bulk-tags-btn')?.addEventListener('click', () => {
        const input = prompt('Add comma-separated tags to selected tracks');
        if (!input) return;
        void runBulkAction('add_tags', { tags: input.split(',').map((tag) => tag.trim()).filter(Boolean) });
      });
      document.getElementById('bulk-clear-tags-btn')?.addEventListener('click', () => { void runBulkAction('clear_tags'); });
      document.getElementById('bulk-add-set-btn')?.addEventListener('click', () => {
        const select = document.getElementById('bulk-set-select') as HTMLSelectElement | null;
        if (!select?.value) return;
        void runBulkAction('add_to_set', { setId: parseInt(select.value, 10) });
      });
      document.getElementById('bulk-clear-selection-btn')?.addEventListener('click', () => {
        selectedTrackIds.clear();
        renderBulkToolbar();
        renderList(tracks);
      });
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

    async function saveTrackMetadata(trackId: number, patch: Record<string, unknown>) {
      const res = await fetch(`/api/tracks/${trackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return null;
      await loadTracks(searchEl.value.trim());
      await loadLibraryOverview();
      const payload = await res.json();
      renderDetail(payload);
      return payload;
    }

    async function drawWaveform(
      trackId: number,
      src: string,
      cues: Array<{ time: number; label?: string }>,
      audio: HTMLAudioElement | null,
    ) {
      const canvas = document.getElementById(`waveform-${trackId}`) as HTMLCanvasElement | null;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      const width = canvas.clientWidth || 640;
      const height = canvas.clientHeight || 120;
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.fillStyle = 'rgba(255,255,255,0.04)';
      context.fillRect(0, 0, width, height);
      context.strokeStyle = 'rgba(255,108,0,0.9)';
      context.lineWidth = 1;

      try {
        const res = await fetch(src);
        const arrayBuffer = await res.arrayBuffer();
        const audioContext = new AudioContext();
        const buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
        const channel = buffer.getChannelData(0);
        const step = Math.ceil(channel.length / width);
        const amp = height / 2;
        const peaks: Array<{ min: number; max: number }> = [];
        for (let i = 0; i < width; i += 1) {
          let min = 1;
          let max = -1;
          for (let j = 0; j < step; j += 1) {
            const datum = channel[(i * step) + j] ?? 0;
            if (datum < min) min = datum;
            if (datum > max) max = datum;
          }
          peaks.push({ min, max });
        }

        let rafId = 0;
        const renderFrame = (currentTime = audio?.currentTime ?? 0) => {
          context.clearRect(0, 0, width, height);
          context.fillStyle = 'rgba(255,255,255,0.04)';
          context.fillRect(0, 0, width, height);
          const progressRatio = buffer.duration > 0 ? Math.max(0, Math.min(1, currentTime / buffer.duration)) : 0;
          const progressX = progressRatio * width;

          context.strokeStyle = 'rgba(255,255,255,0.18)';
          context.lineWidth = 1;
          context.beginPath();
          peaks.forEach((peak, index) => {
            context.moveTo(index + 0.5, (1 + peak.min) * amp);
            context.lineTo(index + 0.5, Math.max(1, (1 + peak.max) * amp));
          });
          context.stroke();

          context.save();
          context.beginPath();
          context.rect(0, 0, progressX, height);
          context.clip();
          context.strokeStyle = 'rgba(255,108,0,0.95)';
          context.lineWidth = 1.2;
          context.beginPath();
          peaks.forEach((peak, index) => {
            context.moveTo(index + 0.5, (1 + peak.min) * amp);
            context.lineTo(index + 0.5, Math.max(1, (1 + peak.max) * amp));
          });
          context.stroke();
          context.restore();

          context.strokeStyle = 'rgba(255,212,138,0.95)';
          context.lineWidth = 1;
          for (const cue of cues) {
            const x = buffer.duration > 0 ? (cue.time / buffer.duration) * width : 0;
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, height);
            context.stroke();
          }

          context.strokeStyle = 'rgba(255,255,255,0.95)';
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(progressX, 0);
          context.lineTo(progressX, height);
          context.stroke();
        };

        const seekFromPointer = (clientX: number) => {
          if (!audio || !Number.isFinite(buffer.duration) || buffer.duration <= 0) return;
          const rect = canvas.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          audio.currentTime = ratio * buffer.duration;
          renderFrame(audio.currentTime);
        };

        renderFrame();

        if (audio) {
          let scrubbing = false;
          const stopScrub = () => { scrubbing = false; };
          const syncWaveform = () => { renderFrame(audio.currentTime); };
          const tick = () => {
            renderFrame(audio.currentTime);
            if (!audio.paused && !audio.ended) rafId = requestAnimationFrame(tick);
          };

          canvas.addEventListener('pointerdown', (event) => {
            scrubbing = true;
            canvas.setPointerCapture(event.pointerId);
            seekFromPointer(event.clientX);
          });
          canvas.addEventListener('pointermove', (event) => {
            if (!scrubbing) return;
            seekFromPointer(event.clientX);
          });
          canvas.addEventListener('pointerup', stopScrub);
          canvas.addEventListener('pointercancel', stopScrub);
          canvas.addEventListener('click', (event) => {
            if (scrubbing) return;
            seekFromPointer(event.clientX);
          });

          audio.addEventListener('timeupdate', syncWaveform);
          audio.addEventListener('seeked', syncWaveform);
          audio.addEventListener('loadedmetadata', syncWaveform);
          audio.addEventListener('pause', () => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
            syncWaveform();
          });
          audio.addEventListener('play', () => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(tick);
          });
        }

        await audioContext.close();
      } catch {
        context.fillStyle = 'rgba(255,209,209,0.9)';
        context.font = '12px sans-serif';
        context.fillText('Waveform preview unavailable', 12, 20);
      }
    }

    // ── Panel switching ───────────────────────────────────────────────────────
    document.querySelectorAll('.panel-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const panel = (btn as HTMLElement).dataset.panel;
        document.querySelectorAll('.panel-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        panelTrack.style.display = panel === 'track' ? '' : 'none';
        panelSets.style.display = panel === 'sets' ? '' : 'none';
        panelLibrary.style.display = panel === 'library' ? '' : 'none';
        if (panel === 'sets') renderSetsPanel();
        if (panel === 'library') renderLibraryPanel();
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
      const sorted = visibleTracks(items);
      hiddenCountBadge.textContent = `Hidden: ${Math.max(0, items.length - sorted.length)}`;
      statusbar.innerHTML = `Tracks: <strong>${tracks.length}</strong> | Showing: <strong>${sorted.length}</strong>${activeArtistScope ? ` | Artist: <strong>${esc(activeArtistScope)}</strong>` : ''}${activeAlbumScope ? ` | Album: <strong>${esc(activeAlbumScope)}</strong>` : ''}`;
      listEl.innerHTML = sorted.map((track) => `
        <div class="row ${track.id === activeTrackId ? 'active' : ''}" data-id="${track.id}">
          <label class="row-check">
            <input type="checkbox" class="track-select" data-track-id="${track.id}" ${selectedTrackIds.has(Number(track.id)) ? 'checked' : ''} />
          </label>
          ${track.album_art_url ? `<img class="thumb" src="${esc(track.album_art_url)}" alt="" />` : '<div class="thumb placeholder">♪</div>'}
          <div>
            <strong><button type="button" class="nav-link inline" data-nav-kind="artist" data-nav-value="${esc(track.artist ?? 'Unknown Artist')}">${esc(track.artist ?? 'Unknown Artist')}</button> - ${esc(track.title ?? 'Untitled')}</strong>
            <span>${albumNameFor(track) ? `<button type="button" class="nav-link inline subtle" data-nav-kind="album" data-nav-value="${esc(albumNameFor(track))}" data-nav-artist="${esc(track.artist ?? '')}">${esc(albumNameFor(track))}</button> · ` : ''}${Array.isArray(track.custom_tags) && track.custom_tags.length ? `${esc((track.custom_tags as string[]).join(', '))} · ` : ''}${esc(track.path)}</span>
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
      listEl.querySelectorAll('.track-select[data-track-id]').forEach((checkbox) => {
        checkbox.addEventListener('click', (event) => {
          event.stopPropagation();
        });
        checkbox.addEventListener('change', () => {
          const trackId = parseInt((checkbox as HTMLInputElement).dataset.trackId!, 10);
          if ((checkbox as HTMLInputElement).checked) selectedTrackIds.add(trackId);
          else selectedTrackIds.delete(trackId);
          renderBulkToolbar();
        });
      });
      bindLibraryNavLinks(listEl);
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
      renderBulkToolbar();
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

    function sectionStateKey(trackId: number, section: string): string {
      return `${trackId}:${section}`;
    }

    function isDetailSectionCollapsed(trackId: number, section: string): boolean {
      return Boolean(detailSectionCollapsed[sectionStateKey(trackId, section)]);
    }

    function setDetailSectionCollapsed(trackId: number, section: string, collapsed: boolean) {
      detailSectionCollapsed[sectionStateKey(trackId, section)] = collapsed;
    }

    // ── Track detail ──────────────────────────────────────────────────────────
    function renderDetail(payload: Record<string, unknown>) {
      const track = payload.track as Record<string, unknown>;
      const otherTracks = relatedArtistTracks(track);
      const albums = artistAlbums(String(track.artist ?? ''));
      const nextTracks = (payload.next_tracks ?? []) as Record<string, unknown>[];
      const coverUrl = (track.album_art_url as string) || '';
      const coverLabel = (track.album ?? track.title ?? 'Unknown') as string;
      const scrubId = `scrub-${track.id}`;
      const trackId = track.id as number;
      const mult = getMult(trackId);
      const trackTags = Array.isArray(track.custom_tags) ? track.custom_tags as string[] : [];
      const cues = Array.isArray(track.manual_cues) ? track.manual_cues as Array<{ time: number; label?: string }> : [];
      const nextPageSize = 10;
      const nextPageCount = Math.max(1, Math.ceil(nextTracks.length / nextPageSize));
      const currentNextPage = Math.min(nextTracksPageByTrackId[trackId] ?? 0, nextPageCount - 1);
      nextTracksPageByTrackId[trackId] = currentNextPage;
      const pagedNextTracks = nextTracks.slice(currentNextPage * nextPageSize, (currentNextPage + 1) * nextPageSize);
      const nextCollapsed = isDetailSectionCollapsed(trackId, 'next-tracks');
      const artistCollapsed = isDetailSectionCollapsed(trackId, 'artist-tracks');
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
            <h2><button type="button" class="nav-link hero-link" data-nav-kind="artist" data-nav-value="${esc(track.artist ?? 'Unknown Artist')}">${esc(track.artist ?? 'Unknown Artist')}</button> - ${esc(track.title ?? 'Untitled')}</h2>
            <div class="meta">
              <span>ID ${track.id}</span>
              <span>${bpmDisplay} BPM ${multButtons}</span>
              <span>${esc(track.effective_key ?? '--')}</span>
              <span>${formatDuration(track.duration)}</span>
            </div>
            <div class="chips">
              ${albumNameFor(track) ? `<button type="button" class="chip nav-chip" data-nav-kind="album" data-nav-value="${esc(albumNameFor(track))}" data-nav-artist="${esc(track.artist ?? '')}">${esc(albumNameFor(track))}</button>` : ''}
              ${track.album_art_url ? '<span class="chip success">Album art</span>' : '<span class="chip subtle">No album art</span>'}
              ${track.analysis_status ? `<span class="chip subtle">${esc(track.analysis_status)}</span>` : ''}
              ${track.bpm_source ? `<span class="chip subtle">BPM ${esc(track.bpm_source)}</span>` : ''}
              ${track.decode_failed === 'true' ? '<span class="chip warn">Unreadable audio</span>' : ''}
            </div>
          </div>
        </div>
        <div class="detail-inner">
          <div class="buttons">
            <button class="btn" id="play-btn" type="button"><span class="btn-icon">▶</span> Play</button>
            ${track.album_art_url ? '<button class="btn" id="cover-btn" type="button">Album Cover</button>' : ''}
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
          <div class="waveform-panel">
            <div class="scan-log-head">
              <strong>Waveform And Cues</strong>
              <div class="scan-panel-actions">
                <button class="icon-btn" id="add-cue-btn" type="button">Add Cue</button>
                <button class="icon-btn" id="clear-cues-btn" type="button">Clear Cues</button>
              </div>
            </div>
            <canvas class="waveform-canvas" id="waveform-${track.id}"></canvas>
            <div class="cue-list" id="cue-list-${track.id}">
              ${cues.length ? cues.map((cue, index) => `<button type="button" class="chip nav-chip cue-chip" data-cue-index="${index}" data-cue-time="${cue.time}">${esc(cue.label ?? `Cue ${index + 1}`)} · ${formatDuration(cue.time)}</button>`).join('') : '<span class="chip subtle">No cue points yet</span>'}
            </div>
          </div>
          <div class="chips" style="margin-bottom:14px;">
            ${track.analysis_stage ? `<span class="chip subtle">Stage ${esc(track.analysis_stage)}</span>` : ''}
            ${track.spotify_id ? `<span class="chip success">Spotify matched</span>` : `<span class="chip subtle">No Spotify match</span>`}
            ${track.analysis_error ? `<span class="chip warn">${esc(track.analysis_error)}</span>` : ''}
          </div>
          <section class="detail-section ${nextCollapsed ? 'collapsed' : ''}" id="next-tracks-section" data-section="next-tracks">
            <div class="detail-section-head" id="next-tracks-head">
              <h3>Can play next</h3>
              <div class="detail-section-actions">
                <span class="detail-page-indicator" id="next-page-indicator">Page ${currentNextPage + 1} / ${nextPageCount}</span>
                <button type="button" class="icon-btn detail-page-btn" id="next-first-btn" ${currentNextPage === 0 ? 'disabled' : ''}>First</button>
                <button type="button" class="icon-btn detail-page-btn" id="next-prev-btn" ${currentNextPage === 0 ? 'disabled' : ''}>Previous</button>
                <button type="button" class="icon-btn detail-page-btn" id="next-next-btn" ${currentNextPage >= nextPageCount - 1 ? 'disabled' : ''}>Next</button>
                <button type="button" class="icon-btn detail-toggle-btn" id="next-tracks-toggle-btn">${nextCollapsed ? 'Expand' : 'Collapse'}</button>
              </div>
            </div>
            <div class="detail-section-body" id="next-tracks-body" ${nextCollapsed ? 'hidden' : ''}>
              <div class="suggestions">
                ${pagedNextTracks.map((item) => `
                  <div class="suggestion" data-track-id="${item.id}">
                    <strong><button type="button" class="nav-link inline" data-nav-kind="artist" data-nav-value="${esc(item.artist ?? 'Unknown Artist')}">${esc(item.artist ?? 'Unknown Artist')}</button> - ${esc(item.title ?? 'Untitled')}</strong><br>
                    <small>${albumNameFor(item) ? `<button type="button" class="nav-link inline subtle" data-nav-kind="album" data-nav-value="${esc(albumNameFor(item))}" data-nav-artist="${esc(item.artist ?? '')}">${esc(albumNameFor(item))}</button> · ` : ''}<span data-raw-bpm="${item.effective_bpm ?? ''}" data-track-id="${item.id}">${displayBpm(item.effective_bpm, item.id as number)} BPM</span> · ${esc(item.effective_key ?? '--')} · ${esc(item.reason ?? '')}</small>
                  </div>
                `).join('') || '<div class="empty">No compatible tracks found.</div>'}
              </div>
            </div>
          </section>
          <div class="artist-nav-panel">
            <div class="artist-nav-block">
              <h3>Artist Catalog</h3>
              <div class="chips">
                <button type="button" class="chip nav-chip" data-nav-kind="artist" data-nav-value="${esc(track.artist ?? 'Unknown Artist')}">All songs by ${esc(track.artist ?? 'Unknown Artist')}</button>
                ${albums.map((album) => `<button type="button" class="chip nav-chip subtle" data-nav-kind="album" data-nav-value="${esc(album)}" data-nav-artist="${esc(track.artist ?? '')}">${esc(album)}</button>`).join('') || '<span class="chip subtle">No album metadata</span>'}
              </div>
            </div>
            <section class="artist-nav-block detail-section ${artistCollapsed ? 'collapsed' : ''}" id="artist-tracks-section" data-section="artist-tracks">
              <div class="detail-section-head" id="artist-tracks-head">
                <h3>Other Songs By Artist</h3>
                <div class="detail-section-actions">
                  <button type="button" class="icon-btn detail-toggle-btn" id="artist-tracks-toggle-btn">${artistCollapsed ? 'Expand' : 'Collapse'}</button>
                </div>
              </div>
              <div class="detail-section-body" id="artist-tracks-body" ${artistCollapsed ? 'hidden' : ''}>
                <div class="suggestions compact">
                  ${otherTracks.map((item) => `
                    <div class="suggestion" data-track-id="${item.id}">
                      <strong>${esc(item.title ?? 'Untitled')}</strong><br>
                      <small>${albumNameFor(item) ? `<button type="button" class="nav-link inline subtle" data-nav-kind="album" data-nav-value="${esc(albumNameFor(item))}" data-nav-artist="${esc(item.artist ?? '')}">${esc(albumNameFor(item))}</button> · ` : ''}<span data-raw-bpm="${item.effective_bpm ?? ''}" data-track-id="${item.id}">${displayBpm(item.effective_bpm, item.id as number)} BPM</span> · ${esc(item.effective_key ?? '--')}</small>
                    </div>
                  `).join('') || '<div class="empty">No other songs by this artist in the library.</div>'}
                </div>
              </div>
            </section>
          </div>
          ${track.analysis_debug ? `
            <details class="debug"><summary>Debug info</summary>
            <pre class="debug-text">${esc(track.analysis_debug)}</pre></details>
          ` : ''}
          <div class="metadata-editor">
            <h3>Edit Metadata</h3>
            <div class="metadata-grid">
              <label><span>Artist</span><input id="meta-artist" value="${esc(track.artist ?? '')}" /></label>
              <label><span>Title</span><input id="meta-title" value="${esc(track.title ?? '')}" /></label>
              <label><span>Album</span><input id="meta-album" value="${esc(track.album ?? '')}" /></label>
              <label><span>Key</span><input id="meta-key" value="${esc(track.key ?? track.effective_key ?? '')}" /></label>
              <label class="metadata-wide"><span>Tags</span><input id="meta-tags" value="${esc(trackTags.join(', '))}" placeholder="warmup, vocal, peak-time" /></label>
              <label class="metadata-toggle"><input id="meta-ignored" type="checkbox" ${track.ignored ? 'checked' : ''} /><span>Ignored</span></label>
            </div>
            <div class="buttons">
              <button class="btn" id="save-metadata-btn" type="button">Save Metadata</button>
            </div>
          </div>
        </div>
      `;

      attachBpmEdit(trackId);
      bindLibraryNavLinks(detailEl);

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
      const bindSectionSuggestions = (root: ParentNode) => {
        root.querySelectorAll('.suggestion[data-track-id]').forEach((card) => {
          card.addEventListener('click', () => selectTrack((card as HTMLElement).dataset.trackId!, true));
        });
        bindLibraryNavLinks(root);
      };
      const renderNextTracksPage = () => {
        const nextSection = document.getElementById('next-tracks-section');
        const nextBody = document.getElementById('next-tracks-body');
        const nextToggleBtn = document.getElementById('next-tracks-toggle-btn') as HTMLButtonElement | null;
        const nextIndicator = document.getElementById('next-page-indicator');
        const nextFirstBtn = document.getElementById('next-first-btn') as HTMLButtonElement | null;
        const nextPrevBtn = document.getElementById('next-prev-btn') as HTMLButtonElement | null;
        const nextNextBtn = document.getElementById('next-next-btn') as HTMLButtonElement | null;
        if (!nextSection || !nextBody || !nextToggleBtn || !nextIndicator || !nextFirstBtn || !nextPrevBtn || !nextNextBtn) return;
        const page = Math.min(nextPageCount - 1, Math.max(0, nextTracksPageByTrackId[trackId] ?? 0));
        nextTracksPageByTrackId[trackId] = page;
        const collapsed = isDetailSectionCollapsed(trackId, 'next-tracks');
        const items = nextTracks.slice(page * nextPageSize, (page + 1) * nextPageSize);
        nextSection.classList.toggle('collapsed', collapsed);
        nextBody.hidden = collapsed;
        nextToggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
        nextIndicator.textContent = `Page ${page + 1} / ${nextPageCount}`;
        nextFirstBtn.disabled = page === 0;
        nextPrevBtn.disabled = page === 0;
        nextNextBtn.disabled = page >= nextPageCount - 1;
        nextBody.innerHTML = `
          <div class="suggestions">
            ${items.map((item) => `
              <div class="suggestion" data-track-id="${item.id}">
                <strong><button type="button" class="nav-link inline" data-nav-kind="artist" data-nav-value="${esc(item.artist ?? 'Unknown Artist')}">${esc(item.artist ?? 'Unknown Artist')}</button> - ${esc(item.title ?? 'Untitled')}</strong><br>
                <small>${albumNameFor(item) ? `<button type="button" class="nav-link inline subtle" data-nav-kind="album" data-nav-value="${esc(albumNameFor(item))}" data-nav-artist="${esc(item.artist ?? '')}">${esc(albumNameFor(item))}</button> · ` : ''}<span data-raw-bpm="${item.effective_bpm ?? ''}" data-track-id="${item.id}">${displayBpm(item.effective_bpm, item.id as number)} BPM</span> · ${esc(item.effective_key ?? '--')} · ${esc(item.reason ?? '')}</small>
              </div>
            `).join('') || '<div class="empty">No compatible tracks found.</div>'}
          </div>
        `;
        bindSectionSuggestions(nextBody);
      };
      const applyArtistTracksState = () => {
        const section = document.getElementById('artist-tracks-section');
        const body = document.getElementById('artist-tracks-body');
        const toggleBtn = document.getElementById('artist-tracks-toggle-btn') as HTMLButtonElement | null;
        if (!section || !body || !toggleBtn) return;
        const collapsed = isDetailSectionCollapsed(trackId, 'artist-tracks');
        section.classList.toggle('collapsed', collapsed);
        body.hidden = collapsed;
        toggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
      };
      const toggleDetailSection = (section: 'next-tracks' | 'artist-tracks') => {
        setDetailSectionCollapsed(trackId, section, !isDetailSectionCollapsed(trackId, section));
        if (section === 'next-tracks') renderNextTracksPage();
        else applyArtistTracksState();
      };
      document.getElementById('next-first-btn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        nextTracksPageByTrackId[trackId] = 0;
        renderNextTracksPage();
      });
      document.getElementById('next-prev-btn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        nextTracksPageByTrackId[trackId] = Math.max(0, (nextTracksPageByTrackId[trackId] ?? 0) - 1);
        renderNextTracksPage();
      });
      document.getElementById('next-next-btn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        nextTracksPageByTrackId[trackId] = Math.min(nextPageCount - 1, (nextTracksPageByTrackId[trackId] ?? 0) + 1);
        renderNextTracksPage();
      });
      document.getElementById('next-tracks-toggle-btn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleDetailSection('next-tracks');
      });
      document.getElementById('artist-tracks-toggle-btn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleDetailSection('artist-tracks');
      });
      document.getElementById('next-tracks-head')?.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('.detail-page-btn')) return;
        toggleDetailSection('next-tracks');
      });
      document.getElementById('artist-tracks-head')?.addEventListener('click', () => {
        toggleDetailSection('artist-tracks');
      });
      renderNextTracksPage();
      applyArtistTracksState();

      // Audio player
      const playBtn = document.getElementById('play-btn') as HTMLButtonElement | null;
      const coverBtn = document.getElementById('cover-btn') as HTMLButtonElement | null;
      const localAudio = document.getElementById('local-audio') as HTMLAudioElement | null;
      const scrubRange = document.getElementById(scrubId) as HTMLInputElement | null;
      const addCueBtn = document.getElementById('add-cue-btn') as HTMLButtonElement | null;
      const clearCuesBtn = document.getElementById('clear-cues-btn') as HTMLButtonElement | null;
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

      void drawWaveform(trackId, `/api/tracks/${track.id}/stream`, cues, localAudio);
      detailEl.querySelectorAll(`.cue-chip[data-cue-time]`).forEach((chip) => {
        chip.addEventListener('click', () => {
          if (!localAudio) return;
          localAudio.currentTime = Number((chip as HTMLElement).dataset.cueTime ?? 0);
          localAudio.play().catch(() => {});
        });
      });
      addCueBtn?.addEventListener('click', async () => {
        if (!localAudio) return;
        const nextCues = [...cues, { time: Number(localAudio.currentTime.toFixed(2)), label: `Cue ${cues.length + 1}` }];
        await saveTrackMetadata(trackId, { manual_cues: nextCues });
      });
      clearCuesBtn?.addEventListener('click', async () => {
        await saveTrackMetadata(trackId, { manual_cues: [] });
      });

      document.getElementById('save-metadata-btn')?.addEventListener('click', async () => {
        const artistInput = document.getElementById('meta-artist') as HTMLInputElement;
        const titleInput = document.getElementById('meta-title') as HTMLInputElement;
        const albumInput = document.getElementById('meta-album') as HTMLInputElement;
        const keyInput = document.getElementById('meta-key') as HTMLInputElement;
        const tagsInput = document.getElementById('meta-tags') as HTMLInputElement;
        const ignoredInput = document.getElementById('meta-ignored') as HTMLInputElement;
        await saveTrackMetadata(trackId, {
          artist: artistInput.value.trim(),
          title: titleInput.value.trim(),
          album: albumInput.value.trim(),
          key: keyInput.value.trim(),
          custom_tags: tagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean),
          ignored: ignoredInput.checked,
        });
      });

      if (coverBtn && track.album_art_url) {
        coverBtn.addEventListener('click', () => {
          coverImage.src = String(track.album_art_url);
          coverTitle.textContent = String(track.spotify_album_name ?? track.album ?? 'Album cover');
          coverModal.classList.add('open');
          coverModal.setAttribute('aria-hidden', 'false');
        });
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
                <strong><button type="button" class="nav-link inline" data-nav-kind="artist" data-nav-value="${esc(t.artist ?? 'Unknown')}">${esc(t.artist ?? 'Unknown')}</button> - ${esc(t.title ?? 'Untitled')}</strong>
                <span>${albumNameFor(t) ? `<button type="button" class="nav-link inline subtle" data-nav-kind="album" data-nav-value="${esc(albumNameFor(t))}" data-nav-artist="${esc(t.artist ?? '')}">${esc(albumNameFor(t))}</button> · ` : ''}${t.bpm ? displayBpm(t.bpm, t.id as number) + ' BPM' : '--'} · ${esc(t.key ?? '--')}</span>
              </div>
              <button class="icon-btn danger remove-track-btn" data-set-id="${setId}" data-position="${t.position}" title="Remove">✕</button>
            </div>
          `).join('') + `<div class="set-suggestions" id="set-suggestions-${setId}"><div class="scan-log-entry info">Loading intelligent suggestions…</div></div>`;
          bindLibraryNavLinks(tracksDiv);
          tracksDiv.querySelectorAll('.remove-track-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const sid = parseInt((btn as HTMLElement).dataset.setId!, 10);
              const pos = parseInt((btn as HTMLElement).dataset.position!, 10);
              await fetch(`/api/sets/${sid}/tracks/${pos}`, { method: 'DELETE' });
              renderSetsPanel();
            });
          });
          const lastTrack = set.tracks[set.tracks.length - 1];
          if (lastTrack?.id) {
            const nextRes = await fetch(`/api/tracks/${lastTrack.id}`);
            const nextPayload = await nextRes.json();
            const suggestions = (nextPayload.next_tracks ?? []) as Record<string, unknown>[];
            const container = document.getElementById(`set-suggestions-${setId}`);
            if (container) {
              container.innerHTML = `
                <h4>Playlist Intelligence</h4>
                <div class="suggestions compact">
                  ${suggestions.slice(0, 6).map((item) => `
                    <div class="suggestion" data-track-id="${item.id}">
                      <strong>${esc(item.artist ?? 'Unknown')} - ${esc(item.title ?? 'Untitled')}</strong><br>
                      <small>${esc(item.reason ?? 'Suggested')} · ${displayBpm(item.effective_bpm, item.id as number)} BPM · ${esc(item.effective_key ?? '--')}</small>
                    </div>
                  `).join('') || '<div class="empty">No recommendations available.</div>'}
                </div>
              `;
              container.querySelectorAll('.suggestion[data-track-id]').forEach((card) => {
                card.addEventListener('click', () => {
                  document.querySelector('[data-panel="track"]')?.dispatchEvent(new MouseEvent('click'));
                  void selectTrack((card as HTMLElement).dataset.trackId!, false);
                });
              });
            }
          }
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

    async function loadLibraryOverview() {
      const res = await fetch('/api/library');
      if (!res.ok) return;
      libraryOverview = await res.json();
      renderLibraryPanel();
    }

    async function loadRuntimeHealth() {
      const res = await fetch('/api/health');
      if (!res.ok) return;
      runtimeHealth = (await res.json()).runtime ?? null;
      renderLibraryPanel();
    }

    async function loadWatchFolders() {
      const res = await fetch('/api/watch');
      if (!res.ok) return;
      watchFolders = (await res.json()).watches ?? [];
      renderLibraryPanel();
    }

    function applySmartCrate(query: string) {
      if (query === 'bpm:missing') {
        showOnlyNoBpmEl.checked = true;
        loadTracks(searchEl.value.trim());
        return;
      }
      if (query === 'ignored:true') {
        searchEl.value = '';
        renderList(tracks.filter((track) => Boolean(track.ignored)));
        return;
      }
      if (query === 'art:missing') {
        searchEl.value = '';
        renderList(tracks.filter((track) => !track.album_art_url));
        return;
      }
      if (query === 'spotify:missing') {
        renderList(tracks.filter((track) => !track.spotify_id));
        return;
      }
      if (query === 'decode:failed') {
        renderList(tracks.filter((track) => String(track.decode_failed ?? '') === 'true'));
        return;
      }
      if (query === 'key:missing') {
        renderList(tracks.filter((track) => !track.effective_key));
      }
    }

    function renderLibraryPanel() {
      if (!libraryOverview) {
        libraryPanel.innerHTML = '<div class="empty">Loading library tools…</div>';
        return;
      }

      const health = (libraryOverview.health as Record<string, unknown>) ?? {};
      const smartCrates = (libraryOverview.smart_crates as Record<string, unknown>[]) ?? [];
      const duplicates = (libraryOverview.duplicates as Record<string, unknown>[]) ?? [];
      const artists = (libraryOverview.artists as Record<string, unknown>[]) ?? [];
      const albums = (libraryOverview.albums as Record<string, unknown>[]) ?? [];
      const tags = (libraryOverview.tags as Record<string, unknown>[]) ?? [];

      libraryPanel.innerHTML = `
        <div class="library-grid">
          <section class="library-card">
            <div class="scan-log-head"><strong>Collection Health</strong></div>
            <div class="scan-summary">
              ${Object.entries(health).map(([label, value]) => `<div class="scan-summary-item"><span>${esc(label.replace(/_/g, ' '))}</span><strong>${esc(value)}</strong></div>`).join('')}
            </div>
          </section>
          <section class="library-card">
            <div class="scan-log-head"><strong>Runtime Health</strong></div>
            <div class="runtime-list">
              <div><strong>Node</strong><span>${esc(runtimeHealth?.node ?? 'unknown')}</span></div>
              <div><strong>Python</strong><span>${esc(runtimeHealth?.python ?? runtimeHealth?.python_error ?? 'unknown')}</span></div>
              <div><strong>Database</strong><span>${runtimeHealth?.database_url_set ? 'configured' : 'missing DATABASE_URL'}</span></div>
              <div><strong>Spotify</strong><span>${Array.isArray(runtimeHealth?.spotify_missing) && runtimeHealth?.spotify_missing.length ? esc((runtimeHealth?.spotify_missing as string[]).join(', ')) : 'configured'}</span></div>
            </div>
          </section>
          <section class="library-card">
            <div class="scan-log-head"><strong>Smart Crates</strong></div>
            <div class="chips">
              ${smartCrates.map((crate) => `<button type="button" class="chip nav-chip smart-crate-btn" data-query="${esc(crate.query)}">${esc(crate.label)} · ${esc(crate.count)}</button>`).join('')}
            </div>
            <div class="chips">
              ${tags.slice(0, 12).map((tag) => `<button type="button" class="chip nav-chip tag-filter-btn" data-tag="${esc(tag.tag)}">${esc(tag.tag)} · ${esc(tag.count)}</button>`).join('') || '<span class="chip subtle">No tags yet</span>'}
            </div>
          </section>
          <section class="library-card">
            <div class="scan-log-head"><strong>Watch Folders</strong></div>
            <div class="watch-form">
              <input id="watch-directory-input" placeholder="Folder to watch…" value="${esc(scanDirectoryEl.value)}" />
              <button type="button" class="btn" id="add-watch-btn">Add Watch</button>
            </div>
            <div class="scan-history">
              ${watchFolders.map((watch) => `
                <div class="scan-history-item">
                  <strong>${esc(watch.directory ?? '')}</strong>
                  <span>${esc(watch.status ?? 'watching')} ${watch.lastChangedPath ? `· ${esc(watch.lastChangedPath)}` : ''}</span>
                  <button type="button" class="icon-btn danger remove-watch-btn" data-directory="${esc(watch.directory ?? '')}">Remove</button>
                </div>
              `).join('') || '<div class="scan-log-entry info">No folders watched yet.</div>'}
            </div>
          </section>
          <section class="library-card library-span">
            <div class="scan-log-head"><strong>Duplicate Detection</strong></div>
            <div class="duplicate-list">
              ${duplicates.map((group) => `
                <details class="duplicate-group">
                  <summary>${esc(group.type)} · ${esc((group.tracks as Record<string, unknown>[]).length)} tracks</summary>
                  <div class="suggestions compact">
                    ${((group.tracks as Record<string, unknown>[])).map((track) => `
                      <div class="suggestion" data-track-id="${track.id}">
                        <strong>${esc(track.artist ?? 'Unknown')} - ${esc(track.title ?? 'Untitled')}</strong><br>
                        <small>${esc(track.path ?? '')}</small>
                      </div>
                    `).join('')}
                  </div>
                </details>
              `).join('') || '<div class="scan-log-entry info">No duplicates detected.</div>'}
            </div>
          </section>
          <section class="library-card">
            <div class="scan-log-head"><strong>Artist Browser</strong></div>
            <div class="scan-history">
              ${artists.map((artist) => `
                <div class="scan-history-item">
                  <strong><button type="button" class="nav-link inline artist-browser-btn" data-artist="${esc(artist.name)}">${esc(artist.name)}</button></strong>
                  <span>${esc(artist.track_count)} tracks · ${esc(artist.album_count)} albums</span>
                  <span>${esc((artist.albums as string[]).join(', '))}</span>
                </div>
              `).join('')}
            </div>
          </section>
          <section class="library-card">
            <div class="scan-log-head"><strong>Album Browser</strong></div>
            <div class="scan-history">
              ${albums.map((album) => `
                <div class="scan-history-item">
                  <strong><button type="button" class="nav-link inline album-browser-btn" data-album="${esc(album.name)}" data-artist="${esc(album.artist)}">${esc(album.name)}</button></strong>
                  <span>${esc(album.artist)} · ${esc(album.track_count)} tracks</span>
                </div>
              `).join('')}
            </div>
          </section>
        </div>
      `;

      libraryPanel.querySelectorAll('.smart-crate-btn[data-query]').forEach((button) => {
        button.addEventListener('click', () => {
          document.querySelector('[data-panel="track"]')?.dispatchEvent(new MouseEvent('click'));
          applySmartCrate((button as HTMLElement).dataset.query ?? '');
        });
      });
      libraryPanel.querySelectorAll('.tag-filter-btn[data-tag]').forEach((button) => {
        button.addEventListener('click', () => {
          searchEl.value = String((button as HTMLElement).dataset.tag ?? '');
          void loadTracks(searchEl.value.trim());
          document.querySelector('[data-panel="track"]')?.dispatchEvent(new MouseEvent('click'));
        });
      });
      libraryPanel.querySelectorAll('.artist-browser-btn[data-artist]').forEach((button) => {
        button.addEventListener('click', () => {
          navigateLibrary('artist', (button as HTMLElement).dataset.artist ?? '');
          document.querySelector('[data-panel="track"]')?.dispatchEvent(new MouseEvent('click'));
        });
      });
      libraryPanel.querySelectorAll('.album-browser-btn[data-album]').forEach((button) => {
        button.addEventListener('click', () => {
          navigateLibrary('album', (button as HTMLElement).dataset.album ?? '', (button as HTMLElement).dataset.artist ?? '');
          document.querySelector('[data-panel="track"]')?.dispatchEvent(new MouseEvent('click'));
        });
      });
      libraryPanel.querySelectorAll('.duplicate-group .suggestion[data-track-id]').forEach((card) => {
        card.addEventListener('click', () => {
          document.querySelector('[data-panel="track"]')?.dispatchEvent(new MouseEvent('click'));
          void selectTrack((card as HTMLElement).dataset.trackId!, false);
        });
      });
      document.getElementById('add-watch-btn')?.addEventListener('click', async () => {
        const input = document.getElementById('watch-directory-input') as HTMLInputElement;
        const res = await fetch('/api/watch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ directory: input.value.trim() }),
        });
        if (res.ok) await loadWatchFolders();
      });
      libraryPanel.querySelectorAll('.remove-watch-btn[data-directory]').forEach((button) => {
        button.addEventListener('click', async () => {
          await fetch('/api/watch', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directory: (button as HTMLElement).dataset.directory }),
          });
          await loadWatchFolders();
        });
      });
    }

    async function loadScanHistory() {
      const res = await fetch('/api/scan');
      if (!res.ok) return;
      const payload = await res.json();
      scanHistory = payload.jobs ?? [];
      renderScanHistory();
    }

    function stopStreamingScanJob() {
      if (activeScanUnsubscribe) {
        activeScanUnsubscribe();
        activeScanUnsubscribe = null;
      }
    }

    async function subscribeToScanJob(jobId: string) {
      stopStreamingScanJob();
      let cancelled = false;
      activeScanUnsubscribe = () => { cancelled = true; };

      const res = await fetch(`/api/scan/${jobId}/stream`);
      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handleJobEvent = async (event: Record<string, unknown>) => {
        const type = String(event.event ?? '');
        if (type === 'job_state') {
          const summary = (event.summary as Record<string, unknown> | null) ?? null;
          setScanStatus(String(event.status ?? 'running'), ['failed', 'cancelled'].includes(String(event.status ?? '')) ? 'error' : String(event.status ?? '') === 'completed' ? 'success' : 'running');
          setScanProgress(Number(event.current ?? 0), Number(event.total ?? 0), String(event.current_file ?? event.directory ?? ''));
          setScanSummary(summary, { createdAt: scanHistory.find((job) => job.id === jobId)?.createdAt ?? null });
          if (['completed', 'failed', 'cancelled'].includes(String(event.status ?? ''))) {
            await loadScanHistory();
            if (String(event.status ?? '') === 'completed') {
              await loadTracks(searchEl.value.trim());
              await loadLibraryOverview();
            }
          }
          return;
        }

        if (type === 'log') {
          const rawLevel = String(event.level ?? 'info');
          const level = (rawLevel === 'error' || rawLevel === 'warning' || rawLevel === 'success' ? rawLevel : 'info') as 'info' | 'warning' | 'error' | 'success';
          appendScanLog(String(event.message ?? ''), level);
          return;
        }

        if (type === 'track_start') {
          setScanProgress(Number(event.current ?? 0), Number(event.total ?? 0), String(event.file ?? event.path ?? 'Scanning…'));
          return;
        }

        if (type === 'track_complete') {
          const status = String(event.status ?? '');
          const reason = String(event.reason ?? '');
          const label = String(event.file ?? event.path ?? 'Track');
          setScanProgress(Number(event.current ?? 0), Number(event.total ?? 0), `${label} · ${status}`);
          if (reason) appendScanLog(`${label}: ${status} (${reason})`, status === 'skipped' ? 'warning' : status === 'error' ? 'error' : 'success');
          return;
        }

        if (type === 'scan_failed') {
          setScanStatus('failed', 'error');
          appendScanLog(String(event.error ?? 'Scan failed'), 'error');
          await loadScanHistory();
        }
      };

      while (!cancelled) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            try {
              await handleJobEvent(JSON.parse(line) as Record<string, unknown>);
            } catch {
              // Ignore malformed stream lines.
            }
          }
          newlineIndex = buffer.indexOf('\n');
        }
      }
    }

    async function loadScanJob(jobId: string, reconnect = false) {
      const res = await fetch(`/api/scan/${jobId}`);
      if (!res.ok) return;
      const payload = await res.json();
      const job = payload.job as Record<string, unknown>;
      activeScanJobId = String(job.id);
      if (typeof job.directory === 'string' && job.directory) {
        scanDirectoryEl.value = job.directory;
        pushRecentDirectory(job.directory);
      }
      setScanStatus(String(job.status ?? 'idle'), ['failed', 'cancelled'].includes(String(job.status ?? '')) ? 'error' : String(job.status ?? '') === 'completed' ? 'success' : 'running');
      setScanProgress(Number(job.processedFiles ?? 0), Number(job.totalFiles ?? 0), String(job.currentFile ?? job.directory ?? ''));
      setScanSummary(job.summary as Record<string, unknown>, job);
      scanPreflightEl.textContent = JSON.stringify(job.validation ?? {});
      resetScanLog();
      for (const log of ((job.logs ?? []) as Record<string, unknown>[]).slice().reverse()) {
        const level = String(log.level ?? 'info') as 'info' | 'warning' | 'error' | 'success';
        appendScanLog(String(log.message ?? ''), level);
      }
      renderScanHistory();
      if (reconnect && ['queued', 'running'].includes(String(job.status ?? ''))) {
        await subscribeToScanJob(jobId);
      }
    }

    async function preflightDirectory(directory: string) {
      if (!directory.trim()) {
        scanPreflightEl.textContent = 'No directory validation yet.';
        return;
      }
      const res = await fetch(`/api/scan/validate?directory=${encodeURIComponent(directory)}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        scanPreflightEl.textContent = String(payload.error ?? 'Validation failed');
        return;
      }
      const validation = payload.validation ?? {};
      scanPreflightEl.textContent = `Supported audio files: ${validation.audio_file_count ?? 0}${validation.empty ? ' · directory looks empty' : ''}`;
    }

    // ── Scanning ──────────────────────────────────────────────────────────────
    async function triggerScan() {
      const directory = scanDirectoryEl.value.trim();
      if (!directory) {
        setScanStatus('Enter a music folder path', 'error');
        setScanProgress(0, 0, 'Enter a music folder path');
        scanDirectoryEl.focus();
        return;
      }

      scanBtn.disabled = true;
      setScanStatus('Scanning library…', 'running');
      setScanProgress(0, 0, directory);
      warningBanner.style.display = 'none';
      resetScanLog();
      appendScanLog(`Starting scan for ${directory}`);

      try {
      try { localStorage.setItem(scanDirectoryKey, directory); } catch { /* ignore */ }
      try { localStorage.setItem(scanVerboseKey, String(scanVerboseEl.checked)); } catch { /* ignore */ }
      try { localStorage.setItem(scanRescanModeKey, scanRescanModeEl.value); } catch { /* ignore */ }
      pushRecentDirectory(directory);

        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            directory,
            fetchAlbumArt: scanFetchArtEl.checked,
            autoDoubleBpm: true,
            verbose: scanVerboseEl.checked,
            rescanMode: scanRescanModeEl.value,
          }),
        });

        if (!res.ok) {
          const detail = await res.text();
          setScanStatus('Scan failed', 'error');
          setScanProgress(0, 0, 'Scan request failed');
          appendScanLog(`Scan request failed: ${detail.slice(0, 200)}`, 'error');
          warningBanner.style.display = 'block';
          warningBanner.innerHTML = `<strong>Scan failed:</strong> ${esc(detail.slice(0, 400))}`;
          return;
        }

        const payload = await res.json();
        const job = payload.job as Record<string, unknown>;
        activeScanJobId = String(job.id);
        appendScanLog(`Scan job created: ${activeScanJobId}`, 'info');
        await loadScanHistory();
        await loadScanJob(activeScanJobId, true);
      } catch (error) {
        setScanStatus('Scan failed', 'error');
        setScanProgress(0, 0, 'Scan failed');
        appendScanLog(error instanceof Error ? error.message : String(error), 'error');
        warningBanner.style.display = 'block';
        warningBanner.innerHTML = `<strong>Scan failed:</strong> ${esc(error instanceof Error ? error.message : String(error))}`;
      } finally {
        scanBtn.disabled = false;
      }
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
      for (const id of [...selectedTrackIds]) {
        if (!tracks.some((track) => Number(track.id) === id)) selectedTrackIds.delete(id);
      }
      const debug = response.debug ?? {};
      const missingEnv: string[] = debug.spotify_missing ?? [];
      if (missingEnv.length) {
        warningBanner.style.display = 'block';
        warningBanner.innerHTML = `<strong>Missing env:</strong> ${missingEnv.join(', ')}`;
      } else {
        warningBanner.style.display = 'none';
      }
      renderList(tracks);
      renderBulkToolbar();
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
    try {
      const savedDirectory = localStorage.getItem(scanDirectoryKey);
      if (savedDirectory) scanDirectoryEl.value = savedDirectory;
      scanVerboseEl.checked = localStorage.getItem(scanVerboseKey) === 'true';
      scanRescanModeEl.value = localStorage.getItem(scanRescanModeKey) || 'smart';
    } catch {
      /* ignore */
    }
    scanBtn.addEventListener('click', () => { void triggerScan(); });
    scanCancelBtn.addEventListener('click', async () => {
      if (!activeScanJobId) return;
      await fetch(`/api/scan/${activeScanJobId}`, { method: 'DELETE' });
      appendScanLog('Cancellation requested', 'warning');
    });
    scanRecentDirectoriesEl.addEventListener('change', () => {
      if (!scanRecentDirectoriesEl.value) return;
      scanDirectoryEl.value = scanRecentDirectoriesEl.value;
      void preflightDirectory(scanDirectoryEl.value);
    });
    scanUseLastBtn.addEventListener('click', () => {
      const recent = getRecentDirectories();
      if (!recent.length) return;
      scanDirectoryEl.value = recent[0];
      void preflightDirectory(scanDirectoryEl.value);
    });
    scanLogClearBtn.addEventListener('click', () => { resetScanLog(); });
    initCollapsiblePanel('scan-log', scanLogToggleBtn, scanLogBodyEl, false);
    initCollapsiblePanel('scan-summary', scanSummaryToggleBtn, scanSummaryBodyEl, false);
    initCollapsiblePanel('scan-history', scanHistoryToggleBtn, scanHistoryBodyEl, false);
    scanVerboseEl.addEventListener('change', () => {
      try { localStorage.setItem(scanVerboseKey, String(scanVerboseEl.checked)); } catch { /* ignore */ }
    });
    scanRescanModeEl.addEventListener('change', () => {
      try { localStorage.setItem(scanRescanModeKey, scanRescanModeEl.value); } catch { /* ignore */ }
    });
    scanDirectoryEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void triggerScan();
      }
    });
    scanDirectoryEl.addEventListener('blur', () => { void preflightDirectory(scanDirectoryEl.value); });
    setScanStatus('Idle');
    setScanProgress(0, 0, 'No scan running');
    resetScanLog();
    renderRecentDirectories();
    renderBrowseScope();
    renderBulkToolbar();
    void preflightDirectory(scanDirectoryEl.value);
    loadSets().then(() => {
      renderBulkToolbar();
      return loadTracks();
    });
    void loadLibraryOverview();
    void loadRuntimeHealth();
    void loadWatchFolders();
    void loadScanHistory().then(async () => {
      const running = scanHistory.find((job) => ['queued', 'running'].includes(String(job.status ?? '')));
      if (running?.id) {
        await loadScanJob(String(running.id), true);
      } else if (scanHistory[0]?.id) {
        await loadScanJob(String(scanHistory[0].id), false);
      }
    });
  }, []);

  return null;
}
