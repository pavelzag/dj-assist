'use client';

import { useEffect } from 'react';
import type { PlatformAdapter } from './platform';

export default function ClientInit({ adapter }: { adapter: PlatformAdapter }) {
  useEffect(() => {
    const appFlavor = process.env.NEXT_PUBLIC_DJ_ASSIST_APP_FLAVOR === 'prod' ? 'prod' : 'debug';
    const isProdFlavor = appFlavor === 'prod';
    type ScanSummary = {
      scanned: number;
      analyzed: number;
      skipped: number;
      errors: number;
    };
    type ScanSourceMode = 'local' | 'google_drive';
    type GoogleDriveImportStage = 'idle' | 'discovering' | 'importing' | 'enriching' | 'syncing' | 'complete' | 'error';

    // ── DOM refs ──────────────────────────────────────────────────────────────
    const listEl = document.getElementById('track-list') as HTMLElement;
    const detailEl = document.getElementById('detail') as HTMLElement;
    const searchEl = document.getElementById('search') as HTMLInputElement;
    const bpmMinEl = document.getElementById('bpm-min') as HTMLInputElement;
    const bpmMaxEl = document.getElementById('bpm-max') as HTMLInputElement;
    const keyFilterEl = document.getElementById('key-filter') as HTMLInputElement;
    const showOnlyNoBpmEl = document.getElementById('show-only-no-bpm') as HTMLInputElement | null;
    const hideUnknownArtistsEl = document.getElementById('hide-unknown-artists') as HTMLInputElement;
    const hiddenCountBadge = document.getElementById('hidden-count-badge') as HTMLElement | null;
    const desktopStatusBadge = document.getElementById('desktop-status-badge') as HTMLElement;
    const browseScopeEl = document.getElementById('browse-scope') as HTMLElement;
    const bulkToolbarEl = document.getElementById('bulk-toolbar') as HTMLElement;
    const sortsEl = document.getElementById('sorts') as HTMLElement;
    const listDensityEl = document.getElementById('list-density') as HTMLSelectElement | null;
    const quickFilterBarEl = document.getElementById('quick-filter-bar') as HTMLElement | null;
    const quickFilterNewBtn = document.getElementById('quick-filter-new') as HTMLButtonElement | null;
    const scanDirectoryEl = document.getElementById('scan-directory') as HTMLInputElement;
    const scanStatusEl = document.getElementById('scan-status') as HTMLElement;
    const scanProgressMetaEl = document.getElementById('scan-progress-meta') as HTMLElement;
    const scanProgressBarEl = document.getElementById('scan-progress-bar') as HTMLElement;
    const scanProgressFileEl = document.getElementById('scan-progress-file') as HTMLElement;
    const scanPreflightEl = document.getElementById('scan-preflight') as HTMLElement;
    const scanLogEl = document.getElementById('activity-log-list') as HTMLElement | null;
    const coverModal = document.getElementById('cover-modal') as HTMLElement;
    const coverImage = document.getElementById('cover-image') as HTMLImageElement;
    const coverTitle = document.getElementById('cover-title') as HTMLElement;
    const closeCover = document.getElementById('close-cover') as HTMLButtonElement;
    const warningBanner = document.getElementById('warning-banner') as HTMLElement;
    const statusbar = document.getElementById('statusbar') as HTMLElement;
    const nowPlayingBarEl = document.getElementById('now-playing-bar') as HTMLElement | null;
    const nowPlayingTitleEl = document.getElementById('now-playing-title') as HTMLElement | null;
    const nowPlayingMetaEl = document.getElementById('now-playing-meta') as HTMLElement | null;
    const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement | null;
    const commandPaletteModal = document.getElementById('command-palette-modal') as HTMLElement | null;
    const commandPaletteInput = document.getElementById('command-palette-input') as HTMLInputElement | null;
    const commandPaletteList = document.getElementById('command-palette-list') as HTMLElement | null;
    const openCommandPaletteBtn = document.getElementById('open-command-palette-btn') as HTMLButtonElement | null;
    const closeCommandPaletteBtn = document.getElementById('close-command-palette') as HTMLButtonElement | null;
    const shortcutsModal = document.getElementById('shortcuts-modal') as HTMLElement | null;
    const closeShortcutsBtn = document.getElementById('close-shortcuts') as HTMLButtonElement | null;
    const editMetadataModal = document.getElementById('edit-metadata-modal') as HTMLElement | null;
    const closeEditMetadataBtn = document.getElementById('close-edit-metadata') as HTMLButtonElement | null;
    const editMetadataStatusEl = document.getElementById('edit-metadata-status') as HTMLElement | null;
    const saveEditMetadataBtn = document.getElementById('save-edit-metadata-btn') as HTMLButtonElement | null;
    const deleteTrackModal = document.getElementById('delete-track-modal') as HTMLElement | null;
    const deleteTrackTitleEl = document.getElementById('delete-track-title') as HTMLElement | null;
    const deleteTrackMessageEl = document.getElementById('delete-track-message') as HTMLElement | null;
    const deleteTrackRemoveFileEl = document.getElementById('delete-track-remove-file') as HTMLInputElement | null;
    const closeDeleteTrackBtn = document.getElementById('close-delete-track') as HTMLButtonElement | null;
    const confirmDeleteTrackBtn = document.getElementById('confirm-delete-track-btn') as HTMLButtonElement | null;
    const quitAppModal = document.getElementById('quit-app-modal') as HTMLElement | null;
    const closeQuitAppBtn = document.getElementById('close-quit-app') as HTMLButtonElement | null;
    const cancelQuitAppBtn = document.getElementById('cancel-quit-app-btn') as HTMLButtonElement | null;
    const confirmQuitAppBtn = document.getElementById('confirm-quit-app-btn') as HTMLButtonElement | null;
    const tapBpmModal = document.getElementById('tap-bpm-modal') as HTMLElement | null;
    const googleAuthUpsellModal = document.getElementById('google-auth-upsell-modal') as HTMLElement | null;
    const googleDriveFolderModal = document.getElementById('google-drive-folder-modal') as HTMLElement | null;
    const addMusicSourceModal = document.getElementById('add-music-source-modal') as HTMLElement | null;
    const googleAuthMainBtn = document.getElementById('google-auth-main-btn') as HTMLButtonElement | null;
    const googleAuthMainLabel = document.getElementById('google-auth-main-label') as HTMLElement | null;
    const closeTapBpmBtn = document.getElementById('close-tap-bpm') as HTMLButtonElement | null;
    const closeGoogleAuthUpsellBtn = document.getElementById('close-google-auth-upsell') as HTMLButtonElement | null;
    const closeGoogleDriveFolderModalBtn = document.getElementById('close-google-drive-folder-modal') as HTMLButtonElement | null;
    const closeAddMusicSourceModalBtn = document.getElementById('close-add-music-source-modal') as HTMLButtonElement | null;
    const tapBpmTrackLabelEl = document.getElementById('tap-bpm-track-label') as HTMLElement | null;
    const tapBpmValueEl = document.getElementById('tap-bpm-value') as HTMLElement | null;
    const tapBpmCountEl = document.getElementById('tap-bpm-count') as HTMLElement | null;
    const tapBpmConfidenceEl = document.getElementById('tap-bpm-confidence') as HTMLElement | null;
    const tapBpmManualInputEl = document.getElementById('tap-bpm-manual-input') as HTMLInputElement | null;
    const tapBpmStatusEl = document.getElementById('tap-bpm-status') as HTMLElement | null;
    const tapBpmHalfBtn = document.getElementById('tap-bpm-half-btn') as HTMLButtonElement | null;
    const tapBpmDoubleBtn = document.getElementById('tap-bpm-double-btn') as HTMLButtonElement | null;
    const tapBpmResetBtn = document.getElementById('tap-bpm-reset-btn') as HTMLButtonElement | null;
    const tapBpmSaveBtn = document.getElementById('tap-bpm-save-btn') as HTMLButtonElement | null;
    const panelTrack = document.getElementById('panel-track') as HTMLElement;
    const panelSets = document.getElementById('panel-sets') as HTMLElement;
    const panelLibrary = document.getElementById('panel-library') as HTMLElement;
    const panelActivity = document.getElementById('panel-activity') as HTMLElement | null;
    const setsPanel = document.getElementById('sets-panel') as HTMLElement;
    const libraryPanel = document.getElementById('library-panel') as HTMLElement;
    const activityPanel = document.getElementById('activity-panel') as HTMLElement | null;
    const toastStack = document.getElementById('toast-stack') as HTMLElement;
    const quickChooseFolderBtn = document.getElementById('quick-choose-folder-btn') as HTMLButtonElement | null;
    const quickStartScanBtn = document.getElementById('quick-start-scan-btn') as HTMLButtonElement | null;

    // ── State ─────────────────────────────────────────────────────────────────
    const activeTrackKey = 'dj-assist-active-track-id';
    const scanDirectoryKey = 'dj-assist-scan-directory';
    const listDensityKey = 'dj-assist-list-density';
    const preferencesKey = 'dj-assist-preferences';
    const recentNewTrackIdsKey = 'dj-assist-recent-new-track-ids';
    const googleAuthUpsellDismissedKey = 'dj-assist-google-auth-upsell-dismissed';
    const activityScanLogCollapsedKey = 'dj-assist-activity-scan-log-collapsed';
    const frontendLogCollapsedKey = 'dj-assist-frontend-log-collapsed';
    type Preferences = {
      autoplayOnSelect: boolean;
      loadLibraryOnStartup: boolean;
      defaultListDensity: 'comfortable' | 'compact';
      collapseScanLog: boolean;
      scanProgressToasts: boolean;
      listShowAlbum: boolean;
      listShowBitrate: boolean;
      listShowTags: boolean;
      listShowBpmSource: boolean;
      listShowKey: boolean;
      listShowLength: boolean;
      listShowRecent: boolean;
    };
    const defaultPreferences: Preferences = {
      autoplayOnSelect: true,
      loadLibraryOnStartup: true,
      defaultListDensity: 'comfortable',
      collapseScanLog: true,
      scanProgressToasts: !isProdFlavor,
      listShowAlbum: true,
      listShowBitrate: true,
      listShowTags: true,
      listShowBpmSource: false,
      listShowKey: true,
      listShowLength: true,
      listShowRecent: true,
    };
    let activeTrackId: number | null = null;
    let activeScanJobId: string | null = null;
    let activeScanStatus = 'idle';
    let activeScanUnsubscribe: (() => void) | null = null;
    let backgroundRefreshTimer: ReturnType<typeof setInterval> | null = null;
    let queuedDbRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshInFlight = false;
    let refreshQueued = false;
    let tracks: Record<string, unknown>[] = [];
    let sortMode = 'bpm-asc';
    let activeArtistScope = '';
    let activeAlbumScope = '';
    let sets: Record<string, unknown>[] = [];
    let scanHistory: Record<string, unknown>[] = [];
    let libraryOverview: Record<string, unknown> | null = null;
    let watchFolders: Record<string, unknown>[] = [];
    let runtimeHealth: Record<string, unknown> | null = null;
    let googleDriveFiles: Record<string, unknown>[] = [];
    let googleDriveFolders: Record<string, unknown>[] = [];
    let googleDriveFolderFiles: Record<string, unknown>[] = [];
    let spotifySettingsBusy = false;
    let googleOauthSettingsBusy = false;
    let googleDriveImportBusy = false;
    let googleDriveFilesBusy = false;
    let googleDriveFilesLoaded = false;
    let googleDriveFoldersBusy = false;
    let googleDriveFolderFilesBusy = false;
    let serverSettingsBusy = false;
    let activeSetId: number | null = null;
    let activeQuickFilter = '';
    let preScanTrackIds = new Set<number>();
    let hasScanBaseline = false;
    let recentNewTrackIds = new Set<number>();
    let nowPlayingTrackId: number | null = null;
    let audioMuted = false;
    let currentPanel: 'track' | 'sets' | 'library' | 'activity' = 'track';
    let tapBpmTrackId: number | null = null;
    let tapBpmTapTimes: number[] = [];
    let tapBpmValue = 0;
    let playbackQueue: number[] = [];
    let scanLogFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let activityLogAutoRefreshTimer: ReturnType<typeof setInterval> | null = null;
    let googleAuthUpsellEvaluated = false;
    let scanSourceMode: ScanSourceMode = 'local';
    let selectedGoogleDriveFolderId = '';
    let selectedGoogleDriveFolderName = '';
    let googleDriveFolderTrail: Array<{ id: string; name: string }> = [];
    let pendingScanLogEntries: Array<{
      message: string;
      level: 'info' | 'warning' | 'error' | 'success';
      timestamp: string;
      timestampLabel: string;
      eventType?: string;
    }> = [];
    let activityLogFilter: 'all' | 'bpm-missing' = 'all';
    let recentServerCallEntries: Array<{
      message: string;
      level: 'info' | 'warning' | 'error' | 'success';
      timestamp: string;
      timestampLabel: string;
      trackLabel: string;
      detail: string;
    }> = [];
    let frontendLogSignature = '';
    let frontendLogPathLabel = '';
    let frontendLogRefreshInFlight = false;
    const recentScanLogSignatures = new Map<string, number>();
    let queuedRefreshMode: 'light' | 'full' | null = null;
    let commandPaletteResults: Array<{ label: string; meta: string; kind: 'command' | 'track' | 'artist'; run: () => void }> = [];
    let commandPaletteActiveIndex = 0;
    let currentRenderedList: Record<string, unknown>[] = [];
    let frozenTrackIdsDuringScan: number[] | null = null;
    let googleDriveImportProgressTimer: number | null = null;
    let googleDriveImportToastSignature = '';
    let googleDriveImportUiSignature = '';
    let googleDriveImportStage: GoogleDriveImportStage = 'idle';
    let googleDriveImportStageLabel = 'Ready to import';
    let googleDriveImportStageDetail = 'Choose a Drive scope and start the import.';
    let googleDriveImportStageCurrent = 0;
    let googleDriveImportStageTotal = 0;
    let googleDriveImportStageMeta = 'No import running';
    let serverAccountSession: Record<string, unknown> | null = null;
    let serverEntitlements = new Set<string>();
    let serverDeviceRegistrationAttempted = false;
    let localScanToastLastAt = 0;
    let localScanToastLastPercentBucket = -1;
    let localScanToastLastLabel = '';
    let listIsVirtualized = false;
    let listScrollRaf = 0;
    let activeKeyboardPane: 'list' | 'detail' = 'list';
    let selectedDetailTrackId: number | null = null;
    let pendingTrackDetailTimer: ReturnType<typeof setTimeout> | null = null;
    let trackDetailRequestToken = 0;
    let nextTracksRefreshToken = 0;
    let trackDetailAbortController: AbortController | null = null;
    let saveEditMetadataInFlight = false;
    let quitAppInFlight = false;
    let pendingDeleteTrackIds: number[] = [];
    let pendingDeleteSource: 'single' | 'bulk' = 'single';
    let lastDeleteShortcutAt = 0;
    const deleteShortcutDoubleTapMs = 500;
    let includeUnknownArtistsInNextTracks = false;
    let nextTracksIntent: 'safe' | 'up' | 'down' | 'same' = 'safe';
    const trackMultipliers: Record<number, number> = {};
    const nextTracksByTrackId: Record<number, Record<string, unknown>[]> = {};
    const nextTracksPageByTrackId: Record<number, number> = {};
    const detailSectionCollapsed: Record<string, boolean> = {};
    const detailModeByTrackId: Record<number, 'overview' | 'match' | 'related'> = {};
    const selectedTrackIds = new Set<number>();
    let preferences: Preferences = { ...defaultPreferences };

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

    function formatBitrate(value: unknown): string {
      const bitrate = Number(value ?? 0);
      if (!Number.isFinite(bitrate) || bitrate <= 0) return '-- kbps';
      return `${Math.round(bitrate)} kbps`;
    }

    function normalizeText(value: unknown): string {
      return String(value ?? '').trim().toLocaleLowerCase();
    }

    function albumNameFor(track: Record<string, unknown>): string {
      return String(track.album ?? track.spotify_album_name ?? '').trim();
    }

    function parsePreferences(value: string | null): Preferences {
      if (!value) return { ...defaultPreferences };
      try {
        const parsed = JSON.parse(value) as Partial<Preferences>;
        return {
          autoplayOnSelect: parsed.autoplayOnSelect !== false,
          loadLibraryOnStartup: parsed.loadLibraryOnStartup !== false,
          defaultListDensity: parsed.defaultListDensity === 'compact' ? 'compact' : 'comfortable',
          collapseScanLog: parsed.collapseScanLog !== false,
          scanProgressToasts: parsed.scanProgressToasts === undefined ? defaultPreferences.scanProgressToasts : parsed.scanProgressToasts !== false,
          listShowAlbum: parsed.listShowAlbum !== false,
          listShowBitrate: parsed.listShowBitrate !== false,
          listShowTags: parsed.listShowTags !== false,
          listShowBpmSource: parsed.listShowBpmSource === true,
          listShowKey: parsed.listShowKey !== false,
          listShowLength: parsed.listShowLength !== false,
          listShowRecent: parsed.listShowRecent !== false,
        };
      } catch {
        return { ...defaultPreferences };
      }
    }

    function savePreferences() {
      try {
        localStorage.setItem(preferencesKey, JSON.stringify(preferences));
      } catch {
        /* ignore */
      }
    }

    function persistRecentNewTrackIds() {
      try {
        localStorage.setItem(recentNewTrackIdsKey, JSON.stringify([...recentNewTrackIds]));
      } catch {
        /* ignore */
      }
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

    function uniqueSortedTrackValues(key: 'artist' | 'album'): string[] {
      const values = new Set<string>();
      for (const track of tracks) {
        const raw = key === 'artist'
          ? String(track.artist ?? '').trim()
          : String(track.album ?? track.spotify_album_name ?? '').trim();
        if (raw) values.add(raw);
      }
      return [...values].sort((a, b) => a.localeCompare(b));
    }

    function refreshMetadataSuggestionLists() {
      const artistList = document.getElementById('artist-suggestions') as HTMLDataListElement | null;
      const albumList = document.getElementById('album-suggestions') as HTMLDataListElement | null;
      if (artistList) {
        artistList.innerHTML = uniqueSortedTrackValues('artist')
          .slice(0, 800)
          .map((value) => `<option value="${esc(value)}"></option>`)
          .join('');
      }
      if (albumList) {
        albumList.innerHTML = uniqueSortedTrackValues('album')
          .slice(0, 800)
          .map((value) => `<option value="${esc(value)}"></option>`)
          .join('');
      }
    }

    function metadataSuggestionKeyForInput(input: HTMLInputElement | null): 'artist' | 'album' | null {
      if (!input) return null;
      if (input.id === 'edit-meta-artist' || input.id === 'meta-artist') return 'artist';
      if (input.id === 'edit-meta-album' || input.id === 'meta-album') return 'album';
      return null;
    }

    function filteredSuggestionValues(key: 'artist' | 'album', query: string): string[] {
      const normalized = normalizeText(query);
      return uniqueSortedTrackValues(key)
        .filter((value) => !normalized || normalizeText(value).includes(normalized))
        .slice(0, 100);
    }

    function syncMetadataSuggestions(input: HTMLInputElement | null, options: { openPicker?: boolean; closeOnExactMatch?: boolean } = {}) {
      if (!input) return;
      const key = metadataSuggestionKeyForInput(input);
      if (!key) return;
      const listId = key === 'artist' ? 'artist-suggestions' : 'album-suggestions';
      const list = document.getElementById(listId) as HTMLDataListElement | null;
      const matches = filteredSuggestionValues(key, input.value);
      const normalizedValue = normalizeText(input.value);
      const exactMatch = Boolean(normalizedValue) && matches.some((value) => normalizeText(value) === normalizedValue);

      if (list) {
        list.innerHTML = matches.map((value) => `<option value="${esc(value)}"></option>`).join('');
      }

      if (!matches.length || exactMatch) {
        input.removeAttribute('list');
        if (exactMatch && options.closeOnExactMatch) input.blur();
        return;
      }

      input.setAttribute('list', listId);
      if (!options.openPicker) return;
      const pickerCapable = input as HTMLInputElement & { showPicker?: () => void };
      if (typeof pickerCapable.showPicker === 'function') {
        try {
          pickerCapable.showPicker();
          return;
        } catch {
          /* fall through */
        }
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function showInputSuggestions(input: HTMLInputElement | null) {
      syncMetadataSuggestions(input, { openPicker: true });
    }

    function relatedArtistTracks(track: Record<string, unknown>): Record<string, unknown>[] {
      const artist = normalizeText(track.artist);
      if (!artist) return [];
      return tracks
        .filter((item) => item.id !== track.id && normalizeText(item.artist) === artist)
        .sort(compareTracks)
        .slice(0, 12);
    }

    function isUnknownArtistName(value: unknown): boolean {
      const normalized = normalizeText(value);
      return !normalized || normalized === 'unknown artist';
    }

    function renderBrowseScope() {
      if (!activeArtistScope && !activeAlbumScope) {
        browseScopeEl.innerHTML = '<span class="browse-scope-empty">Viewing full collection</span>';
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
        <span class="browse-scope-label">Scope</span>
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

    function hasActiveCollectionFilters() {
      return Boolean(
        searchEl.value.trim() ||
        bpmMinEl.value ||
        bpmMaxEl.value ||
        keyFilterEl.value ||
        showOnlyNoBpmEl?.checked ||
        hideUnknownArtistsEl.checked ||
        activeQuickFilter ||
        activeArtistScope ||
        activeAlbumScope,
      );
    }

    function clearCollectionFiltersAndScope() {
      searchEl.value = '';
      bpmMinEl.value = '';
      bpmMaxEl.value = '';
      keyFilterEl.value = '';
      if (showOnlyNoBpmEl) showOnlyNoBpmEl.checked = false;
      hideUnknownArtistsEl.checked = false;
      activeQuickFilter = '';
      activeArtistScope = '';
      activeAlbumScope = '';
      renderQuickFilters();
      renderBrowseScope();
      void loadTracks();
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

    function showToast(
      message: string,
      tone: 'info' | 'success' | 'warning' | 'error' = 'info',
      action?: { label: string; onClick: () => void },
      options: { toastKey?: string; autoHideMs?: number | null } = {},
    ) {
      if (!toastStack) return;
      if (isProdFlavor && tone !== 'warning' && tone !== 'error' && !action && !options.toastKey) return;
      const toastKey = String(options.toastKey ?? '').trim();
      const existing = toastKey
        ? toastStack.querySelector<HTMLElement>(`.toast[data-toast-key="${CSS.escape(toastKey)}"]`)
        : null;
      const toast = existing ?? document.createElement('div');
      toast.className = `toast ${tone}`;
      if (toastKey) toast.dataset.toastKey = toastKey;
      if (action) {
        toast.innerHTML = `<span>${esc(message)}</span><button type="button" class="toast-action">${esc(action.label)}</button>`;
        toast.querySelector('.toast-action')?.addEventListener('click', (event) => {
          event.stopPropagation();
          action.onClick();
          toast.remove();
        });
      } else {
        toast.textContent = message;
      }
      if (!existing) toastStack.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('visible'));
      const remove = () => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 180);
      };
      toast.addEventListener('click', remove);
      const priorTimer = Number(toast.dataset.timerId ?? 0);
      if (priorTimer) window.clearTimeout(priorTimer);
      const autoHideMs = options.autoHideMs === undefined ? 3400 : options.autoHideMs;
      if (autoHideMs != null && autoHideMs > 0) {
        const timerId = window.setTimeout(remove, autoHideMs);
        toast.dataset.timerId = String(timerId);
      } else {
        delete toast.dataset.timerId;
      }
    }

    function removeToastByKey(toastKey: string) {
      if (!toastStack) return;
      const toast = toastStack.querySelector<HTMLElement>(`.toast[data-toast-key="${CSS.escape(toastKey)}"]`);
      if (!toast) return;
      const priorTimer = Number(toast.dataset.timerId ?? 0);
      if (priorTimer) window.clearTimeout(priorTimer);
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 180);
    }

    function syncProgressToastPreference() {
      if (preferences.scanProgressToasts) return;
      removeToastByKey('local-scan-progress');
      removeToastByKey('google-drive-import-progress');
    }

    function showProgressToast(
      toastKey: 'local-scan-progress' | 'google-drive-import-progress',
      message: string,
      tone: 'info' | 'success' | 'warning' | 'error' = 'info',
      done = false,
    ) {
      if (!preferences.scanProgressToasts) {
        removeToastByKey(toastKey);
        return;
      }
      showToast(message, tone, undefined, {
        toastKey,
        autoHideMs: done ? 2600 : null,
      });
    }

    function maybeShowLocalScanProgressToast(current: number, total: number, label: string) {
      if (!preferences.scanProgressToasts) return;
      const now = Date.now();
      const percentBucket = total > 0 ? Math.floor((Math.max(0, current) / Math.max(1, total)) * 20) : -1;
      const normalizedLabel = String(label ?? '').trim();
      const shouldUpdate = (
        now - localScanToastLastAt >= 2500
        || percentBucket !== localScanToastLastPercentBucket
        || normalizedLabel !== localScanToastLastLabel
      );
      if (!shouldUpdate) return;
      localScanToastLastAt = now;
      localScanToastLastPercentBucket = percentBucket;
      localScanToastLastLabel = normalizedLabel;
      const progressLabel = total > 0
        ? `Scanning collection ${current}/${total}${normalizedLabel ? ` · ${normalizedLabel}` : ''}`
        : `Scanning collection${normalizedLabel ? ` · ${normalizedLabel}` : ''}`;
      showProgressToast('local-scan-progress', progressLabel, 'info', false);
    }

    function applyGoogleDriveImportUiProgress(entry: Record<string, unknown>) {
      const message = String(entry.message ?? 'Google Drive import in progress.');
      const level = String(entry.level ?? 'info');
      const context = entry.context && typeof entry.context === 'object'
        ? entry.context as Record<string, unknown>
        : {};
      const event = String(context.event ?? '').trim();
      const tone = level === 'error' ? 'error' : level === 'warning' ? 'error' : level === 'success' ? 'success' : 'saving';
      setGoogleDriveImportStatus(message, tone);

      if (event === 'local_metadata_started' || event === 'local_metadata_completed' || event === 'local_metadata_failed') {
        const current = Number(context.index ?? 0);
        const total = Number(context.total ?? 0);
        const name = String(context.name ?? selectedGoogleDriveFolderLabel()).trim() || selectedGoogleDriveFolderLabel();
        setGoogleDriveImportStageState({
          stage: 'enriching',
          label: 'Reading embedded metadata',
          detail: name,
          current,
          total,
          meta: total > 0 ? `${Math.max(0, total - current)} files remaining` : 'Processing downloaded Drive files',
        });
        setScanProgress(current, total, `Reading metadata · ${name}`);
        return;
      }

      if (event === 'drive_page_loaded') {
        const buffered = Number(context.totalBuffered ?? 0);
        const page = Number(context.page ?? 1);
        const hasNext = Boolean(context.hasNextPage);
        setGoogleDriveImportStageState({
          stage: 'discovering',
          label: 'Loading Google Drive file list',
          detail: `Page ${page}${hasNext ? ' loaded, more remaining' : ' loaded'}`,
          current: buffered,
          total: hasNext ? 0 : buffered,
          meta: `${buffered} audio files discovered so far`,
        });
        setScanProgress(buffered, hasNext ? 0 : buffered, `Loading Google Drive pages · page ${page}`);
        return;
      }

      if (event === 'local_import_completed') {
        const total = Number(context.totalBuffered ?? 0);
        const added = Number(context.localImported ?? 0);
        const updated = Number(context.localUpdated ?? 0);
        setGoogleDriveImportStageState({
          stage: 'importing',
          label: 'Saving Drive entries locally',
          detail: `${added} added, ${updated} updated`,
          current: total,
          total,
          meta: `${total} Drive files prepared in the app database`,
        });
        setScanProgress(total, total, 'Imported file list locally');
        return;
      }

      if (event === 'local_metadata_summary') {
        const total = Number(context.total ?? 0);
        const succeeded = Number(context.succeeded ?? 0);
        const failed = Number(context.failed ?? 0);
        setGoogleDriveImportStageState({
          stage: 'enriching',
          label: 'Embedded metadata complete',
          detail: `${succeeded} succeeded${failed ? `, ${failed} failed` : ''}`,
          current: total,
          total,
          meta: 'Preparing server sync',
        });
        setScanProgress(total, total, 'Local metadata enrichment complete');
        return;
      }

      if (event === 'started') {
        setGoogleDriveImportStageState({
          stage: 'discovering',
          label: 'Starting Google Drive import',
          detail: selectedGoogleDriveFolderLabel(),
          current: 0,
          total: 0,
          meta: 'Connecting to Google Drive and enumerating audio files',
        });
        setScanProgress(0, 0, selectedGoogleDriveFolderLabel());
        return;
      }

      if (event === 'server_import_started') {
        const total = googleDriveImportStageTotal;
        setGoogleDriveImportStageState({
          stage: 'syncing',
          label: 'Syncing import to server',
          detail: selectedGoogleDriveFolderLabel(),
          current: total,
          total,
          meta: 'Uploading prepared Drive metadata',
        });
        return;
      }

      if (event === 'server_import_response') {
        setGoogleDriveImportStageState({
          stage: level === 'success' ? 'complete' : 'error',
          label: level === 'success' ? 'Server sync complete' : 'Server sync needs attention',
          detail: `Server response ${Number(context.status ?? 0) || '--'}`,
          current: googleDriveImportStageTotal,
          total: googleDriveImportStageTotal,
          meta: level === 'success' ? 'Import pipeline finished' : 'Review the server response',
        });
        return;
      }

      if (event === 'failed') {
        setGoogleDriveImportStageState({
          stage: 'error',
          label: 'Import failed',
          detail: String(context.error ?? 'Unknown error'),
          current: 0,
          total: 0,
          meta: 'The import stopped before completion',
        });
      }
    }

    async function pollGoogleDriveImportProgress() {
      if (!googleDriveImportBusy) return;
      try {
        const response = await fetch('/api/logs/client?limit=120');
        if (!response.ok) return;
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        const entries = Array.isArray(payload.entries) ? payload.entries as Record<string, unknown>[] : [];
        const latest = entries.find((entry) => String(entry.category ?? '') === 'google-drive-import');
        if (!latest) return;
        const signature = JSON.stringify([
          String(latest.timestamp ?? ''),
          String(latest.level ?? 'info'),
          String(latest.message ?? ''),
        ]);
        if (signature !== googleDriveImportUiSignature) {
          googleDriveImportUiSignature = signature;
          applyGoogleDriveImportUiProgress(latest);
        }
        if (preferences.scanProgressToasts && signature !== googleDriveImportToastSignature) {
          googleDriveImportToastSignature = signature;
          const level = String(latest.level ?? 'info');
          const tone = level === 'error' ? 'error' : level === 'warning' ? 'warning' : level === 'success' ? 'success' : 'info';
          showProgressToast('google-drive-import-progress', String(latest.message ?? 'Google Drive import in progress.'), tone, tone === 'success');
        }
      } catch {
        // Ignore progress polling failures.
      }
    }

    function stopGoogleDriveImportProgressPolling() {
      if (googleDriveImportProgressTimer) {
        window.clearInterval(googleDriveImportProgressTimer);
        googleDriveImportProgressTimer = null;
      }
      googleDriveImportUiSignature = '';
      googleDriveImportToastSignature = '';
      removeToastByKey('google-drive-import-progress');
    }

    function startGoogleDriveImportProgressPolling() {
      stopGoogleDriveImportProgressPolling();
      if (preferences.scanProgressToasts) {
        showProgressToast('google-drive-import-progress', `Google Drive import started · ${selectedGoogleDriveFolderLabel()}`, 'info', false);
      }
      void pollGoogleDriveImportProgress();
      googleDriveImportProgressTimer = window.setInterval(() => {
        void pollGoogleDriveImportProgress();
      }, 2500);
    }

    function updateTapBpmUi() {
      if (tapBpmValueEl) tapBpmValueEl.textContent = tapBpmValue > 0 ? String(Math.round(tapBpmValue)) : '--';
      if (tapBpmCountEl) tapBpmCountEl.textContent = String(tapBpmTapTimes.length);
      if (tapBpmConfidenceEl) {
        const currentTrack = tapBpmTrackId == null ? null : tracks.find((track) => Number(track.id) === tapBpmTrackId) ?? null;
        const analyzerConfidence = Number(currentTrack?.bpm_confidence ?? 0);
        tapBpmConfidenceEl.textContent = tapBpmTapTimes.length >= 4
          ? tapBpmConfidence()
          : analyzerConfidence > 0 ? analyzerConfidenceLabel(analyzerConfidence) : 'Low';
      }
      if (tapBpmManualInputEl && document.activeElement !== tapBpmManualInputEl) {
        tapBpmManualInputEl.value = tapBpmValue > 0 ? String(Math.round(tapBpmValue)) : '';
      }
      if (tapBpmSaveBtn) tapBpmSaveBtn.disabled = !(tapBpmTrackId != null && tapBpmValue > 0);
    }

    function resetTapBpmState() {
      tapBpmTapTimes = [];
      tapBpmValue = 0;
      if (tapBpmStatusEl) tapBpmStatusEl.textContent = 'Press Space repeatedly to tap the beat.';
      updateTapBpmUi();
    }

    function normalizeTapBpm(value: number) {
      let bpm = value;
      while (bpm < 70) bpm *= 2;
      while (bpm > 175) bpm /= 2;
      return bpm;
    }

    function computeTapBpmFromTimes(times: number[]) {
      if (times.length < 4) return 0;
      const intervals = times
        .slice(1)
        .map((time, index) => time - times[index])
        .filter((delta) => delta >= 240 && delta <= 2000);
      if (intervals.length < 3) return 0;
      const sorted = [...intervals].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const stable = intervals.filter((delta) => Math.abs(delta - median) <= 180);
      const usable = stable.length >= 3 ? stable : intervals;
      const average = usable.reduce((sum, value) => sum + value, 0) / usable.length;
      if (!Number.isFinite(average) || average <= 0) return 0;
      return Math.round(normalizeTapBpm(60000 / average) * 10) / 10;
    }

    function tapBpmConfidence() {
      if (tapBpmTapTimes.length < 4 || tapBpmValue <= 0) return 'Low';
      const intervals = tapBpmTapTimes
        .slice(1)
        .map((time, index) => time - tapBpmTapTimes[index])
        .filter((delta) => delta >= 240 && delta <= 2000);
      if (intervals.length < 3) return 'Low';
      const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
      const variance = intervals.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / intervals.length;
      const spread = Math.sqrt(variance);
      if (intervals.length >= 5 && spread <= 45) return 'Stable';
      if (intervals.length >= 4 && spread <= 90) return 'Settling';
      return 'Low';
    }

    function analyzerConfidenceLabel(value: number) {
      if (value >= 0.75) return 'Stable';
      if (value >= 0.45) return 'Settling';
      return 'Low';
    }

    function registerTapBpmTap() {
      const now = performance.now();
      const lastTap = tapBpmTapTimes[tapBpmTapTimes.length - 1] ?? 0;
      if (lastTap && now - lastTap > 2500) tapBpmTapTimes = [];
      tapBpmTapTimes = [...tapBpmTapTimes, now].slice(-8);
      tapBpmValue = computeTapBpmFromTimes(tapBpmTapTimes);
      if (tapBpmStatusEl) {
        const confidence = tapBpmConfidence();
        tapBpmStatusEl.textContent = tapBpmValue > 0
          ? (confidence === 'Stable'
              ? 'BPM looks stable and ready to save.'
              : confidence === 'Settling'
                ? 'Close. Tap a few more times to stabilize it.'
                : 'Keep tapping until the BPM stabilizes.')
          : 'Keep tapping until the BPM stabilizes.';
      }
      updateTapBpmUi();
    }

    function openTapBpmModal() {
      const track = activeTrack();
      if (!track) return;
      tapBpmTrackId = Number(track.id);
      if (tapBpmTrackLabelEl) {
        tapBpmTrackLabelEl.textContent = `${String(track.artist ?? 'Unknown Artist')} - ${String(track.title ?? 'Untitled')}`;
      }
      resetTapBpmState();
      const existingBpm = Number(track.effective_bpm ?? track.bpm ?? 0);
      const analyzerConfidence = Number(track.bpm_confidence ?? 0);
      if (existingBpm > 0) {
        tapBpmValue = existingBpm;
        if (tapBpmStatusEl) {
          tapBpmStatusEl.textContent = analyzerConfidence > 0
            ? `Current BPM confidence: ${analyzerConfidenceLabel(analyzerConfidence)}. You can tap a new BPM, type one manually, or use /2 or x2.`
            : 'You can tap a new BPM, type one manually, or use /2 or x2.';
        }
        if (tapBpmConfidenceEl && analyzerConfidence > 0) {
          tapBpmConfidenceEl.textContent = analyzerConfidenceLabel(analyzerConfidence);
        }
        updateTapBpmUi();
      }
      openModal(tapBpmModal);
      tapBpmManualInputEl?.focus();
      tapBpmManualInputEl?.select();
    }

    async function saveTapBpmValue() {
      if (tapBpmTrackId == null || tapBpmValue <= 0) return;
      tapBpmValue = Math.round(tapBpmValue);
      if (tapBpmStatusEl) tapBpmStatusEl.textContent = 'Saving tapped BPM…';
      if (tapBpmSaveBtn) {
        tapBpmSaveBtn.disabled = true;
        tapBpmSaveBtn.textContent = 'Saving…';
      }
      try {
        await saveBpm(tapBpmTrackId, tapBpmValue);
        const res = await fetch(`/api/tracks/${tapBpmTrackId}`);
        if (res.ok) renderDetail(await res.json());
        closeModal(tapBpmModal);
        returnToSongsPane();
        showToast(`Saved BPM ${Math.round(tapBpmValue)}.`, 'success');
      } catch {
        if (tapBpmStatusEl) tapBpmStatusEl.textContent = 'Could not save tapped BPM.';
      } finally {
        if (tapBpmSaveBtn) tapBpmSaveBtn.textContent = 'Save BPM';
        updateTapBpmUi();
      }
    }

    function spotifyRuntimeSummary() {
      const spotify = runtimeHealth?.spotify;
      return spotify && typeof spotify === 'object' ? spotify as Record<string, unknown> : null;
    }

    function spotifyRuntimeLabel() {
      const spotify = spotifyRuntimeSummary();
      if (!spotify) return 'Not configured';
      if (spotify.configured) {
        const source = String(spotify.source ?? 'saved');
        const clientId = String(spotify.client_id_masked ?? '').trim();
        return clientId ? `Configured from ${source} (${clientId})` : `Configured from ${source}`;
      }
      const missing = Array.isArray(spotify.missing)
        ? spotify.missing.filter((value): value is string => typeof value === 'string')
        : [];
      return missing.length ? `Missing ${missing.join(', ')}` : 'Not configured';
    }

    function setSpotifyUiStatus(message: string, state: 'idle' | 'saving' | 'success' | 'error' = 'idle') {
      const statusEl = document.getElementById('spotify-credentials-status') as HTMLElement | null;
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.dataset.state = state;
    }

    function googleOauthRuntimeSummary() {
      const googleOauth = runtimeHealth?.google_oauth;
      return googleOauth && typeof googleOauth === 'object' ? googleOauth as Record<string, unknown> : null;
    }

    function googleOauthRuntimeLabel() {
      const googleOauth = googleOauthRuntimeSummary();
      if (!googleOauth) return 'Not configured';
      if (googleOauth.configured) {
        const source = String(googleOauth.source ?? 'saved');
        if (source === 'env') return 'Google sign-in ready.';
        const clientId = String(googleOauth.client_id_masked ?? '').trim();
        return clientId ? `Configured from ${source} (${clientId})` : `Configured from ${source}`;
      }
      const missing = Array.isArray(googleOauth.missing)
        ? googleOauth.missing.filter((value): value is string => typeof value === 'string')
        : [];
      return missing.length ? `Missing ${missing.join(', ')}` : 'Not configured';
    }

    function setGoogleOauthUiStatus(message: string, state: 'idle' | 'saving' | 'success' | 'error' = 'idle') {
      const statusEl = document.getElementById('google-oauth-status') as HTMLElement | null;
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.dataset.state = state;
    }

    function googleDriveRuntimeSummary() {
      const drive = serverRuntimeSummary()?.googleDrive;
      return drive && typeof drive === 'object' ? drive as Record<string, unknown> : null;
    }

    function googleDriveRuntimeLabel() {
      const drive = googleDriveRuntimeSummary();
      const user = googleSignedInUser();
      if (!user) return 'Sign in with Google to import Google Drive audio files.';
      if (!drive?.connected) return 'Google is connected, but Drive file access has not been granted yet.';
      return `Ready to import Drive audio files for ${String(user.email ?? user.name ?? 'Google user')}.`;
    }

    function selectedGoogleDriveFolderLabel() {
      return selectedGoogleDriveFolderId
        ? selectedGoogleDriveFolderName || 'Selected Google Drive folder'
        : 'All audio files in Google Drive';
    }

    function addMusicStartLabel() {
      return scanSourceMode === 'google_drive' ? 'Import from Google Drive' : 'Start Scan';
    }

    function isGoogleDriveTrackPath(path: string) {
      return String(path ?? '').trim().startsWith('gdrive:');
    }

    function syncAddMusicUi() {
      const chooseLabel = 'Add Music';
      if (quickChooseFolderBtn) quickChooseFolderBtn.textContent = chooseLabel;
      if (quickStartScanBtn) quickStartScanBtn.textContent = addMusicStartLabel();
      for (const id of ['empty-choose-folder-btn', 'list-empty-choose-folder-btn']) {
        const button = document.getElementById(id) as HTMLButtonElement | null;
        if (button) button.textContent = chooseLabel;
      }
      for (const id of ['empty-start-scan-btn', 'list-empty-start-scan-btn', 'startup-empty-start-scan-btn']) {
        const button = document.getElementById(id) as HTMLButtonElement | null;
        if (button) button.textContent = addMusicStartLabel();
      }
      const googleDriveBtn = document.getElementById('add-music-source-google-drive-btn') as HTMLButtonElement | null;
      const googleDriveCopy = googleDriveBtn?.querySelector('.add-music-source-option-copy span') as HTMLElement | null;
      if (googleDriveBtn) {
        googleDriveBtn.dataset.locked = canUseGoogleDriveFeature() ? 'false' : 'true';
        googleDriveBtn.title = canUseGoogleDriveFeature() ? 'Browse Google Drive music' : googleDriveFeatureStatusLabel();
      }
      if (googleDriveCopy) {
        googleDriveCopy.textContent = canUseGoogleDriveFeature()
          ? 'Browse a Drive folder and import its audio metadata with read-only access.'
          : googleDriveFeatureStatusLabel();
      }
    }

    function setGoogleDriveImportStatus(message: string, state: 'idle' | 'saving' | 'success' | 'error' = 'idle') {
      const statusEl = document.getElementById('google-drive-import-status') as HTMLElement | null;
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.dataset.state = state;
    }

    function setGoogleDriveImportStageState(input: {
      stage: GoogleDriveImportStage;
      label: string;
      detail: string;
      current?: number;
      total?: number;
      meta?: string;
    }) {
      googleDriveImportStage = input.stage;
      googleDriveImportStageLabel = input.label;
      googleDriveImportStageDetail = input.detail;
      googleDriveImportStageCurrent = Math.max(0, Number(input.current ?? googleDriveImportStageCurrent) || 0);
      googleDriveImportStageTotal = Math.max(0, Number(input.total ?? googleDriveImportStageTotal) || 0);
      googleDriveImportStageMeta = input.meta ?? googleDriveImportStageMeta;
      syncGoogleDriveImportProgressUi();
    }

    function resetGoogleDriveImportStageState() {
      googleDriveImportStage = 'idle';
      googleDriveImportStageLabel = 'Ready to import';
      googleDriveImportStageDetail = 'Choose a Drive scope and start the import.';
      googleDriveImportStageCurrent = 0;
      googleDriveImportStageTotal = 0;
      googleDriveImportStageMeta = 'No import running';
      syncGoogleDriveImportProgressUi();
    }

    function syncGoogleDriveImportProgressUi() {
      const cardEl = document.getElementById('google-drive-import-progress-card') as HTMLElement | null;
      const labelEl = document.getElementById('google-drive-import-stage-label') as HTMLElement | null;
      const detailEl = document.getElementById('google-drive-import-stage-detail') as HTMLElement | null;
      const metaEl = document.getElementById('google-drive-import-stage-meta') as HTMLElement | null;
      const barEl = document.getElementById('google-drive-import-stage-bar') as HTMLElement | null;
      const countEl = document.getElementById('google-drive-import-stage-count') as HTMLElement | null;
      const scopeEl = document.getElementById('google-drive-import-stage-scope') as HTMLElement | null;
      const modeEl = document.getElementById('google-drive-import-stage-mode') as HTMLElement | null;
      if (cardEl) cardEl.dataset.state = googleDriveImportStage;
      if (labelEl) labelEl.textContent = googleDriveImportStageLabel;
      if (detailEl) detailEl.textContent = googleDriveImportStageDetail;
      if (metaEl) metaEl.textContent = googleDriveImportStageMeta;
      if (scopeEl) scopeEl.textContent = selectedGoogleDriveFolderLabel();
      if (modeEl) {
        modeEl.textContent = googleDriveImportStageTotal > 0
          ? 'Measured progress'
          : googleDriveImportBusy
            ? 'Stage progress'
            : 'Waiting';
      }
      const percent = googleDriveImportStageTotal > 0
        ? Math.min(100, (googleDriveImportStageCurrent / Math.max(1, googleDriveImportStageTotal)) * 100)
        : googleDriveImportBusy
          ? 100
          : 0;
      if (barEl) {
        barEl.style.width = `${percent}%`;
        barEl.dataset.indeterminate = googleDriveImportStageTotal > 0 ? 'false' : (googleDriveImportBusy ? 'true' : 'false');
      }
      if (countEl) {
        countEl.textContent = googleDriveImportStageTotal > 0
          ? `${googleDriveImportStageCurrent} / ${googleDriveImportStageTotal}`
          : googleDriveImportBusy
            ? 'Working…'
            : '--';
      }
    }

    function setGoogleDriveFolderStatus(message: string, state: 'idle' | 'saving' | 'success' | 'error' = 'idle') {
      const statusEl = document.getElementById('google-drive-folder-status') as HTMLElement | null;
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.dataset.state = state;
    }

    function serverRuntimeSummary() {
      const server = runtimeHealth?.server;
      return server && typeof server === 'object' ? server as Record<string, unknown> : null;
    }

    function serverRuntimeLabel() {
      const server = serverRuntimeSummary();
      if (!server) return 'Not configured';
      const user = server.user && typeof server.user === 'object' ? server.user as Record<string, unknown> : null;
      const signedIn = user?.type === 'google';
      const url = String(server.activeUrl ?? '').trim();
      const mode = server.localDebug ? 'Local debug' : 'Production';
      return `${mode}${url ? ` · ${url}` : ''} · ${signedIn ? `Google: ${String(user?.email ?? user?.name ?? 'connected')}` : 'Anonymous uploads only'}`;
    }

    function setServerUiStatus(message: string, state: 'idle' | 'saving' | 'success' | 'error' = 'idle') {
      const statusEl = document.getElementById('server-sync-status') as HTMLElement | null;
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.dataset.state = state;
    }

    function hasDismissedGoogleAuthUpsell() {
      try {
        return localStorage.getItem(googleAuthUpsellDismissedKey) === '1';
      } catch {
        return true;
      }
    }

    function dismissGoogleAuthUpsell() {
      try {
        localStorage.setItem(googleAuthUpsellDismissedKey, '1');
      } catch {
        // ignore local storage failures
      }
      closeModal(googleAuthUpsellModal);
    }

    function googleSignedInUser() {
      const server = serverRuntimeSummary();
      const user = server?.user && typeof server.user === 'object' ? server.user as Record<string, unknown> : null;
      return user?.type === 'google' ? user : null;
    }

    function hasServerEntitlement(capability: string) {
      if (!isProdFlavor) return true;
      return serverEntitlements.has(capability);
    }

    function canUseGoogleDriveFeature() {
      return hasServerEntitlement('google_drive');
    }

    function googleDriveFeatureStatusLabel() {
      if (!isProdFlavor) return 'Available in debug build.';
      if (canUseGoogleDriveFeature()) return 'Included in your DJ Assist Sync access.';
      if (googleSignedInUser()) return 'Google Drive import is part of DJ Assist Sync.';
      return 'Sign in and subscribe to DJ Assist Sync to use Google Drive.';
    }

    function formatCapabilityLabel(capability: string) {
      const value = String(capability ?? '').trim();
      if (!value) return 'Unknown';
      const labels: Record<string, string> = {
        google_auth: 'Google Auth',
        playlist_sync: 'Playlist Sync',
        google_drive: 'Google Drive',
        fast_scan_cloud: 'Fast Scan Cloud',
        ios_access: 'iOS Access',
      };
      return labels[value] ?? value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    }

    function accountPlanSummary() {
      const subscription = serverAccountSession?.subscription && typeof serverAccountSession.subscription === 'object'
        ? serverAccountSession.subscription as Record<string, unknown>
        : null;
      if (!subscription) return isProdFlavor ? 'Free' : 'Debug';
      const planKey = String(subscription.plan_key ?? 'free').trim() || 'free';
      const status = String(subscription.status ?? 'inactive').trim() || 'inactive';
      return `${planKey} · ${status}`;
    }

    async function refreshServerAccountAccess(options: { registerDevice?: boolean } = {}) {
      if (!googleSignedInUser()) {
        serverAccountSession = null;
        serverEntitlements = new Set<string>();
        serverDeviceRegistrationAttempted = false;
        return;
      }
      try {
        const [sessionResponse, entitlementsResponse] = await Promise.all([
          fetch('/api/account/session'),
          fetch('/api/account/entitlements'),
        ]);
        const sessionPayload = await sessionResponse.json().catch(() => ({})) as Record<string, unknown>;
        const entitlementsPayload = await entitlementsResponse.json().catch(() => ({})) as Record<string, unknown>;
        serverAccountSession = sessionResponse.ok && sessionPayload.session && typeof sessionPayload.session === 'object'
          ? sessionPayload.session as Record<string, unknown>
          : null;
        const entitlementItems = entitlementsResponse.ok && entitlementsPayload.entitlements && typeof entitlementsPayload.entitlements === 'object'
          ? (entitlementsPayload.entitlements as Record<string, unknown>).entitlements
          : [];
        serverEntitlements = new Set(
          Array.isArray(entitlementItems)
            ? entitlementItems.map((value) => String(value ?? '').trim()).filter(Boolean)
            : [],
        );
        if (options.registerDevice && !serverDeviceRegistrationAttempted) {
          serverDeviceRegistrationAttempted = true;
          void fetch('/api/devices/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: 'electron',
              deviceName: 'DJ Assist Desktop',
            }),
          }).catch(() => {
            serverDeviceRegistrationAttempted = false;
          });
        }
      } catch {
        serverAccountSession = null;
        serverEntitlements = new Set<string>();
      }
    }

    function syncGoogleAuthEntryPoint() {
      const user = googleSignedInUser();
      const googleConfigured = serverRuntimeSummary()?.googleAuthConfigured === true;
      if (googleAuthMainBtn) {
        googleAuthMainBtn.hidden = !googleConfigured;
        googleAuthMainBtn.dataset.connected = user ? 'true' : 'false';
        googleAuthMainBtn.title = user ? `Google connected: ${String(user.email ?? user.name ?? 'signed in')}` : 'Google signed out';
      }
      if (googleAuthMainLabel) {
        googleAuthMainLabel.textContent = user ? 'Connected' : 'Sign In';
      }
    }

    function openGoogleAuthModal() {
      const user = googleSignedInUser();
      const drive = googleDriveRuntimeSummary();
      const subscription = serverAccountSession?.subscription && typeof serverAccountSession.subscription === 'object'
        ? serverAccountSession.subscription as Record<string, unknown>
        : null;
      const planLabel = subscription
        ? `${String(subscription.plan_key ?? 'free')} · ${String(subscription.status ?? 'inactive')}`
        : 'Free plan';
      const statusEl = document.getElementById('google-auth-upsell-status') as HTMLElement | null;
      const signInLabel = document.getElementById('google-auth-upsell-sign-in-label') as HTMLElement | null;
      const signInBtn = document.getElementById('google-auth-upsell-sign-in-btn') as HTMLButtonElement | null;
      const signOutBtn = document.getElementById('google-auth-modal-sign-out-btn') as HTMLButtonElement | null;
      const declineBtn = document.getElementById('google-auth-upsell-decline-btn') as HTMLButtonElement | null;
      if (statusEl) {
        statusEl.textContent = user
          ? `${String(user.email ?? user.name ?? 'Google user')} · ${planLabel}${canUseGoogleDriveFeature() ? (drive?.connected ? ' · Drive access ready' : ' · account connected') : ' · Google Drive locked'}`
          : 'Sign in to connect your DJ Assist account.';
      }
      if (signInLabel) {
        signInLabel.textContent = user ? 'Reconnect Google' : 'Sign in with Google';
      }
      if (signInBtn) signInBtn.hidden = Boolean(user);
      if (signOutBtn) signOutBtn.hidden = !user;
      if (declineBtn) declineBtn.hidden = true;
      openModal(googleAuthUpsellModal);
    }

    function maybeOpenGoogleAuthUpsell() {
      if (googleAuthUpsellEvaluated) return;
      const server = serverRuntimeSummary();
      const user = server?.user && typeof server.user === 'object' ? server.user as Record<string, unknown> : null;
      if (!server || server.googleAuthConfigured !== true) return;
      if (user?.type === 'google') {
        googleAuthUpsellEvaluated = true;
        return;
      }
      if (hasDismissedGoogleAuthUpsell()) {
        googleAuthUpsellEvaluated = true;
        return;
      }
      googleAuthUpsellEvaluated = true;
      openGoogleAuthModal();
    }

    async function submitServerSettings() {
      if (serverSettingsBusy) return;
      serverSettingsBusy = true;
      const saveBtn = document.getElementById('server-settings-save-btn') as HTMLButtonElement | null;
      const enabledInput = document.getElementById('server-sync-enabled') as HTMLInputElement | null;
      const localDebugInput = document.getElementById('server-local-debug') as HTMLInputElement | null;
      const serverUrlInput = document.getElementById('server-url') as HTMLInputElement | null;
      const localServerUrlInput = document.getElementById('server-local-url') as HTMLInputElement | null;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }
      setServerUiStatus('Saving server settings...', 'saving');
      try {
        const response = await fetch('/api/settings/server', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: Boolean(enabledInput?.checked),
            localDebug: Boolean(localDebugInput?.checked),
            serverUrl: serverUrlInput?.value.trim() ?? '',
            localServerUrl: localServerUrlInput?.value.trim() ?? '',
          }),
        });
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (!response.ok) {
          setServerUiStatus(String(payload.error ?? 'Could not save server settings.'), 'error');
          return;
        }
        await loadRuntimeHealth();
        setServerUiStatus(serverRuntimeLabel(), 'success');
        showToast('Server sync settings updated.', 'success');
      } catch (error) {
        setServerUiStatus(error instanceof Error ? error.message : String(error), 'error');
      } finally {
        serverSettingsBusy = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Server Settings';
        }
      }
    }

    async function logoutGoogleAuth() {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        showToast('Could not sign out.', 'error');
        return false;
      }
      googleDriveFiles = [];
      googleDriveFilesLoaded = false;
      await loadRuntimeHealth();
      closeModal(googleAuthUpsellModal);
      renderLibraryPanel();
      showToast('Signed out of Google.', 'success');
      return true;
    }

    async function submitGoogleOauthCredentials() {
      if (googleOauthSettingsBusy) return;
      googleOauthSettingsBusy = true;
      const saveBtn = document.getElementById('google-oauth-save-btn') as HTMLButtonElement | null;
      const clientIdInput = document.getElementById('google-client-id') as HTMLInputElement | null;
      const clientSecretInput = document.getElementById('google-client-secret') as HTMLInputElement | null;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
      }
      setGoogleOauthUiStatus('Saving Google OAuth settings…', 'saving');
      try {
        const response = await fetch('/api/settings/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: clientIdInput?.value.trim() ?? '',
            clientSecret: clientSecretInput?.value.trim() ?? '',
          }),
        });
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (!response.ok) {
          setGoogleOauthUiStatus(String(payload.error ?? 'Could not save Google OAuth settings.'), 'error');
          return;
        }
        await loadRuntimeHealth();
        renderLibraryPanel();
        setGoogleOauthUiStatus(googleOauthRuntimeLabel(), 'success');
        showToast('Google OAuth settings updated.', 'success');
      } catch (error) {
        setGoogleOauthUiStatus(error instanceof Error ? error.message : String(error), 'error');
      } finally {
        googleOauthSettingsBusy = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Google Settings';
        }
      }
    }

    async function signInWithGoogle() {
      try {
        localStorage.setItem(googleAuthUpsellDismissedKey, '1');
      } catch {
        // ignore local storage failures
      }
      const desktopApi = (window as Window & {
        djAssistDesktop?: {
          appUrl?: string | null;
          getAppUrl?: () => Promise<string | null>;
          openExternal?: (url: string) => Promise<boolean>;
        };
      }).djAssistDesktop;
      const dynamicAppUrl = desktopApi?.getAppUrl ? await desktopApi.getAppUrl().catch(() => null) : null;
      const appBaseUrl =
        String(dynamicAppUrl ?? '').trim() ||
        String(desktopApi?.appUrl ?? '').trim() ||
        window.location.origin;
      const targetUrl = new URL('/api/auth/google/start', appBaseUrl).toString();
      if (desktopApi?.openExternal) {
        const result = await desktopApi.openExternal(targetUrl);
        if (result === false) {
          showToast('Could not open the browser for Google sign-in.', 'error');
        }
        return;
      }
      window.location.href = targetUrl;
    }

    async function importGoogleDriveMetadata() {
      if (!canUseGoogleDriveFeature()) {
        setGoogleDriveImportStatus(googleDriveFeatureStatusLabel(), 'error');
        showToast(googleDriveFeatureStatusLabel(), 'warning');
        openGoogleAuthModal();
        return;
      }
      if (googleDriveImportBusy) return;
      googleDriveImportBusy = true;
      setGoogleDriveImportStageState({
        stage: 'discovering',
        label: 'Starting Google Drive import',
        detail: selectedGoogleDriveFolderLabel(),
        current: 0,
        total: 0,
        meta: 'Preparing the import pipeline',
      });
      startGoogleDriveImportProgressPolling();
      const button = document.getElementById('google-drive-import-btn') as HTMLButtonElement | null;
      if (button) {
        button.disabled = true;
        button.textContent = 'Importing…';
      }
      setGoogleDriveImportStatus('Fetching Google Drive metadata and sending it to the server…', 'saving');
      setScanStatus('Importing Google Drive metadata…', 'running');
      setScanProgress(0, 0, selectedGoogleDriveFolderLabel());
      appendScanLog(
        `Google Drive import started: scope=${selectedGoogleDriveFolderLabel()}`,
        'info',
        {
          category: 'google-drive-import',
          folderId: selectedGoogleDriveFolderId || null,
          folderName: selectedGoogleDriveFolderName || null,
        },
        { eventType: 'google_drive_import_started' },
      );
      try {
        const response = await fetch('/api/google-drive/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            maxFiles: 2000,
            folderId: selectedGoogleDriveFolderId || undefined,
            folderName: selectedGoogleDriveFolderName || undefined,
          }),
        });
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        appendScanLog(
          `Google Drive import response: status=${response.status} ok=${response.ok ? 'yes' : 'no'}`,
          response.ok ? 'info' : 'warning',
          {
            category: 'google-drive-import',
            status: response.status,
            ok: response.ok,
            payload,
          },
          { eventType: 'google_drive_import_response' },
        );
        if (!response.ok) {
          setGoogleDriveImportStatus(String(payload.error ?? 'Google Drive import failed.'), 'error');
          setScanStatus('Google Drive import failed', 'error');
          setScanProgress(0, 0, 'Google Drive import failed');
          showProgressToast('google-drive-import-progress', `Google Drive import failed: ${String(payload.error ?? 'Unknown import error.')}`, 'error', true);
          appendScanLog(
            `Google Drive import failed: ${String(payload.error ?? 'Unknown import error.')}`,
            'error',
            {
              category: 'google-drive-import',
              status: response.status,
              payload,
            },
            { eventType: 'google_drive_import_failed' },
          );
          return;
        }
        const imported = Number(payload.tracks_received ?? 0);
        const scanned = Number(payload.drive_files_scanned ?? imported);
        const localImported = Number(payload.local_tracks_imported ?? 0);
        const localUpdated = Number(payload.local_tracks_updated ?? 0);
        const truncated = payload.truncated === true;
        setGoogleDriveImportStageState({
          stage: 'complete',
          label: 'Import complete',
          detail: `${localImported} added, ${localUpdated} updated locally`,
          current: scanned,
          total: scanned,
          meta: `${imported} tracks sent to the server${truncated ? ' · import limit reached' : ''}`,
        });
        setGoogleDriveImportStatus(
          `Imported ${imported} Drive tracks to the server from ${selectedGoogleDriveFolderLabel()}${truncated ? ' (stopped at the import limit).' : '.'}`,
          'success',
        );
        setScanStatus('Google Drive import complete', 'success');
        setScanProgress(scanned, scanned, selectedGoogleDriveFolderLabel());
        showProgressToast('google-drive-import-progress', `Google Drive import complete: ${localImported} added, ${localUpdated} updated locally, ${imported} sent to server.`, 'success', true);
        await Promise.all([
          loadTracks(searchEl.value.trim()),
          loadLibraryOverview(),
        ]);
        appendScanLog(
          `Google Drive import finished: local_added=${localImported} local_updated=${localUpdated} server_received=${imported} scanned=${scanned}${truncated ? ' truncated=yes' : ''}`,
          'success',
          {
            category: 'google-drive-import',
            localImported,
            localUpdated,
            imported,
            scanned,
            truncated,
          },
          { eventType: 'google_drive_import_finished' },
        );
        showToast(
          `Drive import complete: ${localImported} added, ${localUpdated} updated locally, ${imported} sent to server from ${scanned} files in ${selectedGoogleDriveFolderLabel()}.`,
          'success',
        );
      } catch (error) {
        setGoogleDriveImportStageState({
          stage: 'error',
          label: 'Import failed',
          detail: error instanceof Error ? error.message : String(error),
          current: 0,
          total: 0,
          meta: 'Review the error and try again',
        });
        setGoogleDriveImportStatus(error instanceof Error ? error.message : String(error), 'error');
        setScanStatus('Google Drive import failed', 'error');
        setScanProgress(0, 0, 'Google Drive import failed');
        showProgressToast('google-drive-import-progress', `Google Drive import failed: ${error instanceof Error ? error.message : String(error)}`, 'error', true);
        appendScanLog(
          `Google Drive import exception: ${error instanceof Error ? error.message : String(error)}`,
          'error',
          {
            category: 'google-drive-import',
            folderId: selectedGoogleDriveFolderId || null,
            folderName: selectedGoogleDriveFolderName || null,
          },
          { eventType: 'google_drive_import_exception' },
        );
      } finally {
        googleDriveImportBusy = false;
        if (googleDriveImportProgressTimer) {
          window.setTimeout(() => {
            stopGoogleDriveImportProgressPolling();
          }, 3000);
        }
        if (button) {
          button.disabled = false;
          button.textContent = 'Import Google Drive Metadata';
        }
      }
    }

    function googleDriveFolderPathLabel() {
      if (!googleDriveFolderTrail.length) return 'Current folder: My Drive';
      return `Current folder: My Drive / ${googleDriveFolderTrail.map((item) => item.name).join(' / ')}`;
    }

    function currentGoogleDriveFolder() {
      return googleDriveFolderTrail[googleDriveFolderTrail.length - 1] ?? null;
    }

    function formatGoogleDriveFolderItemMeta(file: Record<string, unknown>) {
      const size = formatDriveFileSize(file.size);
      const modified = formatDriveModifiedTime(file.modifiedTime);
      return [size !== '--' ? size : '', modified !== '--' ? modified : ''].filter(Boolean).join(' · ') || 'Audio file';
    }

    function renderGoogleDriveFolderPicker() {
      const listEl = document.getElementById('google-drive-folder-list') as HTMLElement | null;
      const sidebarEl = document.getElementById('google-drive-folder-sidebar') as HTMLElement | null;
      const pathEl = document.getElementById('google-drive-folder-path') as HTMLElement | null;
      const backBtn = document.getElementById('google-drive-folder-back-btn') as HTMLButtonElement | null;
      const useCurrentBtn = document.getElementById('google-drive-folder-use-current-btn') as HTMLButtonElement | null;
      if (pathEl) pathEl.textContent = googleDriveFolderPathLabel();
      if (backBtn) backBtn.disabled = googleDriveFoldersBusy || googleDriveFolderTrail.length === 0;
      if (useCurrentBtn) {
        useCurrentBtn.disabled = googleDriveFoldersBusy || googleDriveFolderTrail.length === 0;
        useCurrentBtn.textContent = googleDriveFolderTrail.length
          ? `Use "${googleDriveFolderTrail[googleDriveFolderTrail.length - 1]?.name ?? 'This Folder'}"`
          : 'Use This Folder';
      }
      if (sidebarEl) {
        const currentFolder = currentGoogleDriveFolder();
        const sidebarItems = [
          `
            <button type="button" class="google-drive-sidebar-item ${googleDriveFolderTrail.length === 0 ? 'active' : ''}" data-drive-root="true">
              <span class="google-drive-sidebar-item-title">My Drive</span>
              <span class="google-drive-sidebar-item-meta">Top-level folders</span>
            </button>
          `,
          selectedGoogleDriveFolderId
            ? `
              <button type="button" class="google-drive-sidebar-item ${currentFolder?.id === selectedGoogleDriveFolderId ? 'active' : ''}" data-drive-jump-id="${esc(selectedGoogleDriveFolderId)}" data-drive-jump-name="${esc(selectedGoogleDriveFolderName || 'Selected folder')}">
                <span class="google-drive-sidebar-item-title">Current selection</span>
                <span class="google-drive-sidebar-item-meta">${esc(selectedGoogleDriveFolderName || 'Selected folder')}</span>
              </button>
            `
            : '',
          googleDriveFolderTrail.map((folder, index) => `
            <button type="button" class="google-drive-sidebar-item ${index === googleDriveFolderTrail.length - 1 ? 'active' : ''}" data-drive-jump-id="${esc(folder.id)}" data-drive-jump-name="${esc(folder.name)}" data-drive-jump-depth="${index}">
              <span class="google-drive-sidebar-item-title">${esc(folder.name)}</span>
              <span class="google-drive-sidebar-item-meta">${index === 0 ? 'Inside My Drive' : `Level ${index + 1}`}</span>
            </button>
          `).join(''),
        ].filter(Boolean).join('');
        sidebarEl.innerHTML = sidebarItems;
        sidebarEl.querySelector('[data-drive-root="true"]')?.addEventListener('click', () => {
          void loadGoogleDriveFolders({
            parentId: '',
            trail: [],
          });
        });
        sidebarEl.querySelectorAll('[data-drive-jump-id]').forEach((button) => {
          button.addEventListener('click', () => {
            const element = button as HTMLElement;
            const folderId = String(element.dataset.driveJumpId ?? '').trim();
            const folderName = String(element.dataset.driveJumpName ?? '').trim() || 'Untitled folder';
            const depth = Number(element.dataset.driveJumpDepth ?? '-1');
            if (!folderId) return;
            const trail = depth >= 0
              ? googleDriveFolderTrail.slice(0, depth + 1)
              : [{ id: folderId, name: folderName }];
            void loadGoogleDriveFolders({
              parentId: folderId,
              trail,
            });
          });
        });
      }
      if (!listEl) return;
      if (googleDriveFoldersBusy || googleDriveFolderFilesBusy) {
        listEl.innerHTML = '<div class="empty">Loading Google Drive folder contents…</div>';
        return;
      }
      const folderMarkup = googleDriveFolders.map((folder) => `
        <button
          type="button"
          class="google-drive-browser-row folder"
          data-drive-folder-id="${esc(String(folder.id ?? ''))}"
          data-drive-folder-name="${esc(String(folder.name ?? 'Untitled folder'))}"
          data-drive-open-folder="true"
        >
          <span class="google-drive-browser-row-icon" aria-hidden="true">📁</span>
          <span class="google-drive-browser-row-copy">
            <strong>${esc(String(folder.name ?? 'Untitled folder'))}</strong>
            <span>${esc(googleDriveFolderTrail.length ? 'Folder' : 'Folder in My Drive')}</span>
          </span>
          <span class="google-drive-browser-row-trailing" aria-hidden="true">›</span>
        </button>
      `).join('');
      const fileMarkup = googleDriveFolderFiles.map((file) => `
        <div class="google-drive-browser-row file">
          <span class="google-drive-browser-row-icon audio" aria-hidden="true">♪</span>
          <span class="google-drive-browser-row-copy">
            <strong>${esc(String(file.name ?? 'Untitled'))}</strong>
            <span>${esc(formatGoogleDriveFolderItemMeta(file))}</span>
          </span>
        </div>
      `).join('');
      listEl.innerHTML = folderMarkup || fileMarkup
        ? `${folderMarkup}${fileMarkup}`
        : '<div class="empty">No folders or audio files found here.</div>';
      listEl.querySelectorAll('[data-drive-open-folder="true"]').forEach((button) => {
        button.addEventListener('click', () => {
          const element = button.closest('[data-drive-folder-id]') as HTMLElement | null;
          if (!element) return;
          const folderId = String(element.dataset.driveFolderId ?? '').trim();
          const folderName = String(element.dataset.driveFolderName ?? 'Untitled folder').trim() || 'Untitled folder';
          if (!folderId) return;
          void loadGoogleDriveFolders({
            parentId: folderId,
            trail: [...googleDriveFolderTrail, { id: folderId, name: folderName }],
          });
        });
      });
    }

    async function loadGoogleDriveFolders(options: {
      parentId?: string;
      trail?: Array<{ id: string; name: string }>;
    } = {}) {
      if (googleDriveFoldersBusy || googleDriveFolderFilesBusy) return;
      googleDriveFoldersBusy = true;
      googleDriveFolderFilesBusy = true;
      googleDriveFolderTrail = options.trail ?? [];
      googleDriveFolderFiles = [];
      renderGoogleDriveFolderPicker();
      setGoogleDriveFolderStatus('Loading Google Drive folders with read-only access…', 'saving');
      appendScanLog(
        `Google Drive folders loading: parent=${String(options.parentId ?? '').trim() || 'root'}`,
        'info',
        {
          category: 'google-drive-folders',
          parentId: String(options.parentId ?? '').trim() || null,
          trail: googleDriveFolderTrail,
        },
        { eventType: 'google_drive_folders_loading' },
      );
      try {
        const parentId = String(options.parentId ?? '').trim();
        const query = new URLSearchParams();
        if (parentId) query.set('parentId', parentId);
        const foldersPromise = fetch(`/api/google-drive/folders${query.toString() ? `?${query.toString()}` : ''}`);
        const filesPromise = parentId
          ? (() => {
            const filesQuery = new URLSearchParams();
            filesQuery.set('folderId', parentId);
            filesQuery.set('limit', '100');
            return fetch(`/api/google-drive/files?${filesQuery.toString()}`);
          })()
          : Promise.resolve(null);
        const [foldersResponse, filesResponse] = await Promise.all([foldersPromise, filesPromise]);
        const foldersPayload = await foldersResponse.json().catch(() => ({})) as Record<string, unknown>;
        const filesPayload = filesResponse
          ? await filesResponse.json().catch(() => ({})) as Record<string, unknown>
          : {};
        if (!foldersResponse.ok) {
          setGoogleDriveFolderStatus(String(foldersPayload.error ?? 'Could not load Google Drive folders.'), 'error');
          googleDriveFolders = [];
          googleDriveFolderFiles = [];
          appendScanLog(
            `Google Drive folders failed: ${String(foldersPayload.error ?? 'Could not load folders.')}`,
            'error',
            {
              category: 'google-drive-folders',
              status: foldersResponse.status,
              payload: foldersPayload,
            },
            { eventType: 'google_drive_folders_failed' },
          );
          return;
        }
        if (filesResponse && !filesResponse.ok) {
          setGoogleDriveFolderStatus(String(filesPayload.error ?? 'Could not load Google Drive files.'), 'error');
          googleDriveFolders = Array.isArray(foldersPayload.folders) ? foldersPayload.folders as Record<string, unknown>[] : [];
          googleDriveFolderFiles = [];
          appendScanLog(
            `Google Drive files failed: ${String(filesPayload.error ?? 'Could not load files.')}`,
            'error',
            {
              category: 'google-drive-files',
              parentId: parentId || null,
              status: filesResponse.status,
              payload: filesPayload,
            },
            { eventType: 'google_drive_files_failed' },
          );
          return;
        }
        googleDriveFolders = Array.isArray(foldersPayload.folders) ? foldersPayload.folders as Record<string, unknown>[] : [];
        googleDriveFolderFiles = filesResponse && Array.isArray(filesPayload.files) ? filesPayload.files as Record<string, unknown>[] : [];
        setGoogleDriveFolderStatus(
          `Showing ${googleDriveFolders.length} folders and ${googleDriveFolderFiles.length} audio files. DJ Assist only uses read access.`,
          'success',
        );
        appendScanLog(
          `Google Drive folders loaded: folders=${googleDriveFolders.length} files=${googleDriveFolderFiles.length} parent=${parentId || 'root'}`,
          'success',
          {
            category: 'google-drive-folders',
            parentId: parentId || null,
            count: googleDriveFolders.length,
            fileCount: googleDriveFolderFiles.length,
          },
          { eventType: 'google_drive_folders_loaded' },
        );
      } catch (error) {
        googleDriveFolders = [];
        googleDriveFolderFiles = [];
        setGoogleDriveFolderStatus(error instanceof Error ? error.message : String(error), 'error');
        appendScanLog(
          `Google Drive folders exception: ${error instanceof Error ? error.message : String(error)}`,
          'error',
          {
            category: 'google-drive-folders',
            parentId: String(options.parentId ?? '').trim() || null,
          },
          { eventType: 'google_drive_folders_exception' },
        );
      } finally {
        googleDriveFoldersBusy = false;
        googleDriveFolderFilesBusy = false;
        renderGoogleDriveFolderPicker();
      }
    }

    function applySelectedGoogleDriveFolder(folderId: string, folderName: string) {
      scanSourceMode = 'google_drive';
      selectedGoogleDriveFolderId = folderId.trim();
      selectedGoogleDriveFolderName = folderName.trim();
      googleDriveFiles = [];
      googleDriveFilesLoaded = false;
      updateScanDirectoryDisplay();
      renderLibraryPanel();
      syncAddMusicUi();
      closeModal(googleDriveFolderModal);
      showToast(
        selectedGoogleDriveFolderId
          ? `Google Drive folder selected: ${selectedGoogleDriveFolderName || 'Selected folder'}.`
          : 'Google Drive scope reset to all audio files.',
        'success',
      );
    }

    async function openGoogleDriveFolderModal() {
      if (!canUseGoogleDriveFeature()) {
        showToast(googleDriveFeatureStatusLabel(), 'warning');
        openGoogleAuthModal();
        return;
      }
      openModal(googleDriveFolderModal);
      await loadGoogleDriveFolders({
        parentId: '',
        trail: [],
      });
    }

    function formatDriveFileSize(value: unknown): string {
      const bytes = Number(value);
      if (!Number.isFinite(bytes) || bytes <= 0) return '--';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let size = bytes;
      let unitIndex = 0;
      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
      }
      return `${size >= 100 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
    }

    function formatDriveModifiedTime(value: unknown): string {
      const raw = String(value ?? '').trim();
      if (!raw) return '--';
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return raw;
      return parsed.toLocaleString();
    }

    async function loadGoogleDriveFiles(options: { limit?: number; quiet?: boolean } = {}) {
      if (!canUseGoogleDriveFeature()) {
        setGoogleDriveImportStatus(googleDriveFeatureStatusLabel(), 'error');
        return;
      }
      if (googleDriveFilesBusy) return;
      googleDriveFilesBusy = true;
      const { limit = 100, quiet = false } = options;
      const button = document.getElementById('google-drive-preview-btn') as HTMLButtonElement | null;
      if (button) {
        button.disabled = true;
        button.textContent = 'Loading…';
      }
      if (!quiet) {
        setGoogleDriveImportStatus(`Loading Google Drive audio files from ${selectedGoogleDriveFolderLabel()}…`, 'saving');
      }
      appendScanLog(
        `Google Drive preview started: scope=${selectedGoogleDriveFolderLabel()} limit=${limit}`,
        'info',
        {
          category: 'google-drive-preview',
          folderId: selectedGoogleDriveFolderId || null,
          folderName: selectedGoogleDriveFolderName || null,
          limit,
        },
        { eventType: 'google_drive_preview_started' },
      );
      try {
        const query = new URLSearchParams({ limit: String(limit) });
        if (selectedGoogleDriveFolderId) query.set('folderId', selectedGoogleDriveFolderId);
        const response = await fetch(`/api/google-drive/files?${query.toString()}`);
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (!response.ok) {
          setGoogleDriveImportStatus(String(payload.error ?? 'Could not load Google Drive files.'), 'error');
          appendScanLog(
            `Google Drive preview failed: ${String(payload.error ?? 'Could not load Drive files.')}`,
            'error',
            {
              category: 'google-drive-preview',
              status: response.status,
              payload,
            },
            { eventType: 'google_drive_preview_failed' },
          );
          return;
        }
        googleDriveFiles = Array.isArray(payload.files) ? payload.files as Record<string, unknown>[] : [];
        googleDriveFilesLoaded = true;
        renderLibraryPanel();
        setGoogleDriveImportStatus(
          googleDriveFiles.length
            ? `Loaded ${googleDriveFiles.length} Google Drive audio files from ${selectedGoogleDriveFolderLabel()}.`
            : `No Google Drive audio files were returned for ${selectedGoogleDriveFolderLabel()}.`,
          'success',
        );
        appendScanLog(
          `Google Drive preview loaded: count=${googleDriveFiles.length} scope=${selectedGoogleDriveFolderLabel()}`,
          'success',
          {
            category: 'google-drive-preview',
            count: googleDriveFiles.length,
            nextPageToken: payload.nextPageToken ?? null,
          },
          { eventType: 'google_drive_preview_loaded' },
        );
      } catch (error) {
        setGoogleDriveImportStatus(error instanceof Error ? error.message : String(error), 'error');
        appendScanLog(
          `Google Drive preview exception: ${error instanceof Error ? error.message : String(error)}`,
          'error',
          {
            category: 'google-drive-preview',
            folderId: selectedGoogleDriveFolderId || null,
            folderName: selectedGoogleDriveFolderName || null,
          },
          { eventType: 'google_drive_preview_exception' },
        );
      } finally {
        googleDriveFilesBusy = false;
        const nextButton = document.getElementById('google-drive-preview-btn') as HTMLButtonElement | null;
        if (nextButton) {
          nextButton.disabled = false;
          nextButton.textContent = googleDriveFilesLoaded ? 'Refresh Drive Files' : 'Preview Drive Files';
        }
      }
    }

    async function submitSpotifyCredentials(mode: 'save' | 'test-current') {
      if (spotifySettingsBusy) return;
      spotifySettingsBusy = true;
      const saveBtn = document.getElementById('spotify-save-test-btn') as HTMLButtonElement | null;
      const testBtn = document.getElementById('spotify-test-saved-btn') as HTMLButtonElement | null;
      const clientIdInput = document.getElementById('spotify-client-id') as HTMLInputElement | null;
      const clientSecretInput = document.getElementById('spotify-client-secret') as HTMLInputElement | null;
      const previousSaveLabel = saveBtn?.textContent ?? 'Save & Test';
      const previousTestLabel = testBtn?.textContent ?? 'Test Saved';
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = mode === 'save' ? 'Saving…' : previousSaveLabel;
      }
      if (testBtn) {
        testBtn.disabled = true;
        testBtn.textContent = mode === 'test-current' ? 'Testing…' : previousTestLabel;
      }
      setSpotifyUiStatus(mode === 'save' ? 'Saving Spotify credentials and testing them…' : 'Testing saved Spotify credentials…', 'saving');
      try {
        const body = mode === 'save'
          ? {
              clientId: clientIdInput?.value.trim() ?? '',
              clientSecret: clientSecretInput?.value.trim() ?? '',
              save: true,
              test: true,
            }
          : { test: true };
        const response = await fetch('/api/settings/spotify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        const spotify = payload.spotify && typeof payload.spotify === 'object' ? payload.spotify as Record<string, unknown> : null;
        if (!response.ok) {
          const testResult = spotify?.test && typeof spotify.test === 'object' ? spotify.test as Record<string, unknown> : null;
          setSpotifyUiStatus(String(testResult?.message ?? payload.error ?? 'Spotify credential test failed.'), 'error');
          return;
        }
        const testResult = spotify?.test && typeof spotify.test === 'object' ? spotify.test as Record<string, unknown> : null;
        if (mode === 'save' && clientSecretInput) clientSecretInput.value = '';
        setSpotifyUiStatus(String(testResult?.message ?? 'Spotify credentials look good.'), 'success');
        showToast('Spotify credentials updated.', 'success');
        await loadRuntimeHealth();
      } catch (error) {
        setSpotifyUiStatus(error instanceof Error ? error.message : String(error), 'error');
      } finally {
        spotifySettingsBusy = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save & Test';
        }
        if (testBtn) {
          testBtn.disabled = false;
          testBtn.textContent = 'Test Saved';
        }
      }
    }

    function updateScanDirectoryDisplay() {
      if (!scanPreflightEl) return;
      if (scanSourceMode === 'google_drive') {
        scanPreflightEl.textContent = `Google Drive source: ${selectedGoogleDriveFolderLabel()}`;
        return;
      }
      const directory = scanDirectoryEl?.value.trim() ?? '';
      if (!directory) {
        scanPreflightEl.textContent = 'Choose a music source to add tracks.';
        return;
      }
      const name = directory.split(/[\\/]/).filter(Boolean).pop() ?? directory;
      scanPreflightEl.textContent = `Music folder: ${name}`;
    }

    function openAddMusicSourceModal() {
      openModal(addMusicSourceModal);
    }

    async function chooseLocalMusicSource() {
      scanSourceMode = 'local';
      closeModal(addMusicSourceModal);
      syncAddMusicUi();
      await pickDirectoryAndPrefill();
    }

    async function chooseGoogleDriveMusicSource() {
      scanSourceMode = 'google_drive';
      closeModal(addMusicSourceModal);
      syncAddMusicUi();
      updateScanDirectoryDisplay();
      await openGoogleDriveFolderModal();
    }

    function setListDensity(density: string) {
      const normalized = density === 'compact' ? 'compact' : 'comfortable';
      document.body.dataset.listDensity = normalized;
      if (listDensityEl) listDensityEl.value = normalized;
      try {
        localStorage.setItem(listDensityKey, normalized);
      } catch {
        /* ignore */
      }
    }

    async function pickDirectoryAndPrefill() {
      if (!adapter.supportsNativeFolderPicker) return;
      const directory = await adapter.pickDirectory();
      if (!directory) return;
      scanSourceMode = 'local';
      scanDirectoryEl.value = directory;
      updateScanDirectoryDisplay();
      syncAddMusicUi();
      pushRecentDirectory(directory);
      await preflightDirectory(directory);
      showToast('Music folder selected.', 'success');
    }

    function openPanel(panel: 'track' | 'sets' | 'library' | 'activity') {
      const nextPanel = isProdFlavor && panel === 'activity' ? 'track' : panel;
      document.querySelector<HTMLElement>(`.panel-tab[data-panel="${nextPanel}"]`)?.click();
    }

    function openModal(modal: HTMLElement | null) {
      if (!modal) return;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }

    function hasOpenModal() {
      return Boolean(document.querySelector('.modal.open'));
    }

    function closeModal(modal: HTMLElement | null) {
      if (!modal) return;
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      if (!hasOpenModal()) ensureActiveTrackSelection();
    }

    function syncCommandPaletteSelection() {
      if (!commandPaletteList) return;
      commandPaletteList.querySelectorAll<HTMLElement>('.command-palette-item[data-command-index]').forEach((button) => {
        const active = Number(button.dataset.commandIndex ?? -1) === commandPaletteActiveIndex;
        button.classList.toggle('active', active);
        if (active) button.scrollIntoView({ block: 'nearest' });
      });
    }

    function renderCommandPalette(query = '') {
      if (!commandPaletteList) return;
      const normalized = normalizeText(query);
      const bpmQuery = (() => {
        const trimmed = String(query ?? '').trim().toLowerCase();
        if (!trimmed) return null;
        const rangeMatch = trimmed.match(/^bpm\s*:\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/)
          || trimmed.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
        if (rangeMatch) {
          const min = Number(rangeMatch[1]);
          const max = Number(rangeMatch[2]);
          if (Number.isFinite(min) && Number.isFinite(max)) {
            return { min: Math.min(min, max), max: Math.max(min, max), exact: false };
          }
        }
        const exactMatch = trimmed.match(/^bpm\s*:\s*(\d+(?:\.\d+)?)$/) || trimmed.match(/^(\d+(?:\.\d+)?)$/);
        if (exactMatch) {
          const value = Number(exactMatch[1]);
          if (Number.isFinite(value)) {
            return { min: value - 0.5, max: value + 0.5, exact: true };
          }
        }
        return null;
      })();
      const commands: Array<{ label: string; meta: string; run: () => void }> = [
        { label: 'Add Music', meta: 'Import', run: () => openAddMusicSourceModal() },
        { label: 'Start Import', meta: 'Import', run: () => void triggerScan() },
        { label: 'View New Tracks', meta: 'Filter', run: () => setActiveQuickFilter('new') },
        { label: 'Needs Attention', meta: 'Review', run: () => startReviewMode('attention') },
        { label: 'Review Missing Art', meta: 'Review', run: () => startReviewMode('art') },
        { label: 'Review Missing Key', meta: 'Review', run: () => startReviewMode('key') },
        { label: 'Review Unreadable Files', meta: 'Review', run: () => startReviewMode('decode') },
        { label: 'Open Collection', meta: 'Panel', run: () => openPanel('library') },
        { label: 'Open Playlists', meta: 'Panel', run: () => openPanel('sets') },
        { label: 'Focus Search', meta: 'Navigation', run: () => searchEl.focus() },
        { label: 'Show Keyboard Shortcuts', meta: 'Help', run: () => openModal(shortcutsModal) },
        { label: 'Clear Filters', meta: 'Filter', run: () => {
          searchEl.value = '';
          bpmMinEl.value = '';
          bpmMaxEl.value = '';
          keyFilterEl.value = '';
          if (showOnlyNoBpmEl) showOnlyNoBpmEl.checked = false;
          activeQuickFilter = '';
          renderQuickFilters();
          void loadTracks();
        } },
      ];
      if (!isProdFlavor) {
        commands.splice(8, 0, { label: 'Open Activity', meta: 'Panel', run: () => openPanel('activity') });
      }
      const trackResults = tracks
        .filter((track) => {
          const matchesText = !normalized || normalizeText(`${track.artist ?? ''} ${track.title ?? ''} ${albumNameFor(track)}`).includes(normalized);
          if (matchesText) return true;
          if (!bpmQuery) return false;
          const bpm = Number(track.effective_bpm ?? track.bpm ?? 0);
          return Number.isFinite(bpm) && bpm >= bpmQuery.min && bpm <= bpmQuery.max;
        })
        .slice(0, 8)
        .map((track) => ({
          label: `${String(track.artist ?? 'Unknown Artist')} - ${String(track.title ?? 'Untitled')}`,
          meta: `${displayBpm(track.effective_bpm, track.id as number)} BPM${albumNameFor(track) ? ` · ${albumNameFor(track)}` : ''}`,
          kind: 'track' as const,
          run: () => {
            openPanel('track');
            setKeyboardPane('list', { focus: true });
            void selectTrack(String(track.id), true, true);
          },
        }));
      const artistResults = [...new Set(
        tracks
          .map((track) => String(track.artist ?? '').trim())
          .filter(Boolean)
          .filter((artist) => !normalized || normalizeText(artist).includes(normalized)),
      )]
        .slice(0, 6)
        .map((artist) => ({
          label: artist,
          meta: `${artistAlbums(artist).length} albums · Artist`,
          kind: 'artist' as const,
          run: () => {
            openPanel('track');
            navigateLibrary('artist', artist);
          },
        }));
      const results = (
        bpmQuery
          ? [...trackResults]
          : [...commands.map((item) => ({ ...item, kind: 'command' as const })), ...artistResults, ...trackResults]
      )
        .filter((item) => !normalized || bpmQuery || normalizeText(`${item.label} ${item.meta}`).includes(normalized))
        .slice(0, 12);
      commandPaletteResults = results;
      commandPaletteActiveIndex = Math.min(commandPaletteActiveIndex, Math.max(0, results.length - 1));
      commandPaletteList.hidden = results.length === 0;
      commandPaletteList.innerHTML = results.map((item, index) => `
        <button type="button" class="command-palette-item ${index === commandPaletteActiveIndex ? 'active' : ''}" data-command-index="${index}">
          <strong>${esc(item.label)}</strong>
          <span>${esc(item.meta)}</span>
        </button>
      `).join('');
      commandPaletteList.querySelectorAll<HTMLElement>('.command-palette-item[data-command-index]').forEach((button) => {
        button.addEventListener('click', () => {
          const item = commandPaletteResults[Number(button.dataset.commandIndex ?? -1)];
          if (!item) return;
          closeModal(commandPaletteModal);
          item.run();
        });
        button.addEventListener('mouseenter', () => {
          commandPaletteActiveIndex = Number(button.dataset.commandIndex ?? 0);
          syncCommandPaletteSelection();
        });
      });
      syncCommandPaletteSelection();
    }

    function trackNeedsAttention(track: Record<string, unknown>): boolean {
      return !track.album_art_url || !track.effective_key || !track.spotify_id || isLowBitrate(track) || String(track.decode_failed ?? '') === 'true';
    }

    function detailMode(trackId: number): 'overview' | 'match' | 'related' {
      return detailModeByTrackId[trackId] ?? 'overview';
    }

    function setDetailMode(trackId: number, mode: 'overview' | 'match' | 'related') {
      detailModeByTrackId[trackId] = mode;
    }

    function trackSubtitleParts(track: Record<string, unknown>): string[] {
      const parts: string[] = [];
      if (preferences.listShowAlbum && albumNameFor(track)) {
        parts.push(`<button type="button" class="nav-link inline subtle" data-nav-kind="album" data-nav-value="${esc(albumNameFor(track))}" data-nav-artist="${esc(track.artist ?? '')}">${esc(albumNameFor(track))}</button>`);
      }
      if (preferences.listShowBitrate) parts.push(formatBitrate(track.bitrate));
      if (preferences.listShowTags && Array.isArray(track.custom_tags) && track.custom_tags.length) parts.push(esc((track.custom_tags as string[]).join(', ')));
      if (preferences.listShowBpmSource && track.bpm_source) parts.push(`BPM ${esc(track.bpm_source)}`);
      parts.push(esc(trackSourceSummary(track)));
      return parts;
    }

    function trackSourceSummary(track: Record<string, unknown>): string {
      const sources = Array.isArray(track.sources) ? track.sources as Record<string, unknown>[] : [];
      if (!sources.length) return String(track.path ?? '');
      const labels = [...new Set(sources.map((source) => String(source.label ?? '').trim()).filter(Boolean))];
      const localPath = sources.find((source) => String(source.kind ?? '') === 'local' && String(source.path ?? '').trim())?.path;
      if (labels.length === 1) {
        return localPath ? `${labels[0]} · ${String(localPath)}` : labels[0];
      }
      return `${labels.join(' + ')} · ${sources.length} sources`;
    }

    function trackSourcesMarkup(track: Record<string, unknown>): string {
      const sources = Array.isArray(track.sources) ? track.sources as Record<string, unknown>[] : [];
      if (!sources.length) return '<span class="chip subtle">Unknown source</span>';
      return sources.map((source) => {
        const kind = String(source.kind ?? '');
        const label = String(source.label ?? kind ?? 'Source');
        const path = String(source.path ?? '').trim();
        const title = path ? `${label}: ${path}` : label;
        const chipClass = kind === 'google_drive' ? 'warn' : 'success';
        return `<span class="chip ${chipClass}" title="${esc(title)}">${esc(label)}</span>`;
      }).join('');
    }

    function trackSourceDetailMarkup(track: Record<string, unknown>): string {
      const sources = Array.isArray(track.sources) ? track.sources as Record<string, unknown>[] : [];
      const sourcePreference = String(track.source_preference ?? '').trim();
      if (!sources.length) {
        return `<div class="scan-preflight">Source path: ${esc(String(track.path ?? ''))}</div>`;
      }
      return `
        <div class="scan-preflight"><strong>Sources</strong></div>
        <div class="chips">
          <button type="button" class="chip nav-chip ${sourcePreference === 'local' ? 'active' : ''}" id="prefer-local-source-btn">Prefer Local</button>
          <button type="button" class="chip nav-chip ${sourcePreference === 'google_drive' ? 'active' : ''}" id="prefer-drive-source-btn">Prefer Google Drive</button>
          <button type="button" class="chip nav-chip ${!sourcePreference ? 'active' : ''}" id="clear-source-preference-btn">Auto</button>
        </div>
        <div class="suggestions compact">
          ${sources.map((source) => `
            <div class="suggestion compact">
              <strong>${esc(String(source.label ?? 'Source'))}</strong><br>
              <small>${esc(String(source.path ?? 'No path available'))}</small>
            </div>
          `).join('')}
        </div>
      `;
    }

    function rowMetricTemplate(track: Record<string, unknown>): string {
      const metrics: string[] = [];
      metrics.push(`
        <div class="bpm-cell row-metric" data-track-id="${track.id}" title="Click to cycle BPM multiplier">
          <strong>${displayBpm(track.effective_bpm, track.id as number)}</strong>
          <span>BPM${getMult(track.id as number) !== 1 ? `<em class="mult-badge">${getMult(track.id as number) === 2 ? '×2' : '½×'}</em>` : ''}</span>
        </div>
      `);
      if (preferences.listShowKey) metrics.push(`<div class="row-metric"><strong>${esc(track.effective_key ?? '--')}</strong><span>Key</span></div>`);
      metrics.push(`<div class="row-metric"><strong>${formatDuration(track.duration)}</strong><span>Length</span></div>`);
      if (preferences.listShowRecent && recentNewTrackIds.has(Number(track.id))) metrics.push(`<div class="row-metric row-metric-accent"><strong>New</strong><span>Added now</span></div>`);
      while (metrics.length < 3) metrics.push('<div class="row-metric row-metric-empty"></div>');
      return metrics.slice(0, 3).join('');
    }

    function isLowBitrate(track: Record<string, unknown>): boolean {
      const bitrate = Number(track.bitrate ?? 0);
      return Number.isFinite(bitrate) && bitrate > 0 && bitrate < 192;
    }

    function isHighBitrate(track: Record<string, unknown>): boolean {
      const bitrate = Number(track.bitrate ?? 0);
      return Number.isFinite(bitrate) && bitrate > 192;
    }

    function matchesQuickFilter(track: Record<string, unknown>): boolean {
      switch (activeQuickFilter) {
        case 'new':
          return recentNewTrackIds.has(Number(track.id));
        case 'missing-art':
          return !track.album_art_url;
        case 'missing-key':
          return !track.effective_key;
        case 'high-bitrate':
          return isHighBitrate(track);
        case 'decode-failed':
          return String(track.decode_failed ?? '') === 'true';
        case 'spotify-missing':
          return !track.spotify_id;
        case 'ignored':
          return Boolean(track.ignored);
        case 'needs-attention':
          return trackNeedsAttention(track);
        default:
          return true;
      }
    }

    function activeQuickFilterLabel(): string {
      switch (activeQuickFilter) {
        case 'new': return 'New tracks';
        case 'missing-art': return 'Missing art';
        case 'missing-key': return 'Missing key';
        case 'high-bitrate': return 'High bitrate';
        case 'decode-failed': return 'Unreadable';
        case 'spotify-missing': return 'No Spotify';
        case 'ignored': return 'Ignored';
        case 'needs-attention': return 'Needs attention';
        default: return '';
      }
    }

    function renderQuickFilters() {
      quickFilterBarEl?.querySelectorAll<HTMLElement>('.quick-filter-btn[data-filter]').forEach((button) => {
        const filter = button.dataset.filter ?? '';
        button.classList.toggle('active', activeQuickFilter === filter);
      });
      if (quickFilterNewBtn) {
        quickFilterNewBtn.textContent = recentNewTrackIds.size ? `New (${recentNewTrackIds.size})` : 'New';
        quickFilterNewBtn.disabled = recentNewTrackIds.size === 0;
      }
    }

    function setActiveQuickFilter(filter: string) {
      activeQuickFilter = activeQuickFilter === filter ? '' : filter;
      renderQuickFilters();
      renderList(tracks);
      if (selectedDetailTrackId != null) {
        void refreshSelectedTrackRecommendations({ resetPage: true });
      }
    }

    function matchesSearchQuery(track: Record<string, unknown>, query: string): boolean {
      const normalizedQuery = normalizeText(query);
      if (!normalizedQuery) return true;
      const haystacks = [
        String(track.title ?? ''),
        String(track.artist ?? ''),
        String(track.album ?? ''),
        String(track.spotify_album_name ?? ''),
        String(track.path ?? ''),
        Array.isArray(track.custom_tags) ? track.custom_tags.join(' ') : String(track.custom_tags ?? ''),
      ];
      return haystacks.some((value) => normalizeText(value).includes(normalizedQuery));
    }

    function matchesMainPaneFilters(track: Record<string, unknown>): boolean {
      if (!matchesSearchQuery(track, searchEl.value.trim())) return false;

      const effectiveBpm = Number(track.effective_bpm ?? 0);
      const bpmMin = bpmMinEl.value ? Number(bpmMinEl.value) : null;
      const bpmMax = bpmMaxEl.value ? Number(bpmMaxEl.value) : null;
      if (bpmMin != null && Number.isFinite(bpmMin) && effectiveBpm < bpmMin) return false;
      if (bpmMax != null && Number.isFinite(bpmMax) && effectiveBpm > bpmMax) return false;

      const normalizedKeyFilter = normalizeText(keyFilterEl.value);
      if (normalizedKeyFilter) {
        const normalizedTrackKey = normalizeText(track.effective_key ?? '');
        if (!normalizedTrackKey.includes(normalizedKeyFilter)) return false;
      }

      if (showOnlyNoBpmEl?.checked && hasBpm(track)) return false;
      if (hideUnknownArtistsEl.checked && isUnknownArtistName(track.artist)) return false;
      return true;
    }

    function visibleTracks(items: Record<string, unknown>[]) {
      const filtered = [...items]
        .filter((track) => matchesMainPaneFilters(track))
        .filter((track) => matchesBrowseScope(track))
        .filter((track) => matchesQuickFilter(track))
        .filter((track) => showOnlyNoBpmEl?.checked ? !hasBpm(track) : true);
      return filtered.sort(compareTracks);
    }

    function visibleTracksOrdered(): Record<string, unknown>[] {
      return visibleTracks(tracks);
    }

    function setKeyboardPane(pane: 'list' | 'detail', options?: { focus?: boolean }) {
      activeKeyboardPane = pane;
      listEl.classList.toggle('keyboard-active', pane === 'list');
      detailEl.classList.toggle('keyboard-active', pane === 'detail');
      if (pane === 'list') syncActiveTrackRowHighlight();
      if (options?.focus) {
        const target = pane === 'list' ? listEl : detailEl;
        target.focus({ preventScroll: pane === 'list' });
      }
    }

    function syncActiveTrackRowHighlight() {
      listEl.querySelectorAll<HTMLElement>('.row[data-id]').forEach((row) => {
        row.classList.toggle('active', Number(row.dataset.id ?? 0) === activeTrackId);
      });
    }

    function ensureActiveTrackSelection() {
      if (hasOpenModal() || !tracks.length) return;
      const currentTrackStillExists = activeTrackId != null && tracks.some((track) => Number(track.id) === activeTrackId);
      if (currentTrackStillExists) {
        setKeyboardPane('list');
        syncActiveTrackRowHighlight();
        return;
      }
      const firstVisibleTrack = visibleTracksOrdered()[0] ?? tracks[0];
      if (!firstVisibleTrack) return;
      setKeyboardPane('list');
      void selectTrack(String(firstVisibleTrack.id), false, true);
    }

    function returnToSongsPane() {
      requestAnimationFrame(() => {
        ensureActiveTrackSelection();
        setKeyboardPane('list', { focus: true });
      });
    }

    function activeTrack(): Record<string, unknown> | null {
      return activeTrackId == null ? null : tracks.find((track) => Number(track.id) === activeTrackId) ?? null;
    }

    function filteredNextTracksFor(trackId: number): Record<string, unknown>[] {
      const source = nextTracksByTrackId[trackId] ?? [];
      return source.filter((item) => {
        if ((hideUnknownArtistsEl.checked || !includeUnknownArtistsInNextTracks) && isUnknownArtistName(item.artist)) {
          return false;
        }
        if (activeQuickFilter === 'high-bitrate' && !isHighBitrate(item)) {
          return false;
        }
        return true;
      });
    }

    function nextTracksEmptyMessage() {
      if (activeQuickFilter === 'high-bitrate') return 'No compatible high-bitrate tracks found.';
      if (hideUnknownArtistsEl.checked || !includeUnknownArtistsInNextTracks) {
        return 'No compatible known-artist tracks found.';
      }
      return 'No compatible tracks found.';
    }

    function bindSuggestionCards(root: ParentNode) {
      root.querySelectorAll('.suggestion[data-track-id]').forEach((card) => {
        card.addEventListener('click', () => selectTrack((card as HTMLElement).dataset.trackId!, true));
      });
      bindLibraryNavLinks(root);
    }

    function renderNextTracksSection(trackId: number) {
      const nextSection = document.getElementById('next-tracks-section');
      const nextBody = document.getElementById('next-tracks-body');
      const nextToggleBtn = document.getElementById('next-tracks-toggle-btn') as HTMLButtonElement | null;
      const nextIndicator = document.getElementById('next-page-indicator');
      const nextFirstBtn = document.getElementById('next-first-btn') as HTMLButtonElement | null;
      const nextPrevBtn = document.getElementById('next-prev-btn') as HTMLButtonElement | null;
      const nextNextBtn = document.getElementById('next-next-btn') as HTMLButtonElement | null;
      if (!nextSection || !nextBody || !nextToggleBtn || !nextIndicator || !nextFirstBtn || !nextPrevBtn || !nextNextBtn) return;
      if (selectedDetailTrackId !== trackId) return;

      const nextPageSize = 10;
      const sourceTracks = filteredNextTracksFor(trackId);
      const safePageCount = Math.max(1, Math.ceil(sourceTracks.length / nextPageSize));
      const page = Math.min(safePageCount - 1, Math.max(0, nextTracksPageByTrackId[trackId] ?? 0));
      const collapsed = isDetailSectionCollapsed(trackId, 'next-tracks');
      nextTracksPageByTrackId[trackId] = page;
      const items = sourceTracks.slice(page * nextPageSize, (page + 1) * nextPageSize);

      nextSection.classList.toggle('collapsed', collapsed);
      nextBody.hidden = collapsed;
      nextToggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
      nextIndicator.textContent = `Page ${page + 1} / ${safePageCount}`;
      nextFirstBtn.disabled = page === 0;
      nextPrevBtn.disabled = page === 0;
      nextNextBtn.disabled = page >= safePageCount - 1;
      nextBody.innerHTML = `
        <div class="suggestions">
          ${items.map((item) => `
            <div class="suggestion" data-track-id="${item.id}">
              <strong><button type="button" class="nav-link inline" data-nav-kind="artist" data-nav-value="${esc(item.artist ?? 'Unknown Artist')}">${esc(item.artist ?? 'Unknown Artist')}</button> - ${esc(item.title ?? 'Untitled')}</strong><br>
              <small>${albumNameFor(item) ? `<button type="button" class="nav-link inline subtle" data-nav-kind="album" data-nav-value="${esc(albumNameFor(item))}" data-nav-artist="${esc(item.artist ?? '')}">${esc(albumNameFor(item))}</button> · ` : ''}<span data-raw-bpm="${item.effective_bpm ?? ''}" data-track-id="${item.id}">${displayBpm(item.effective_bpm, item.id as number)} BPM</span> · ${esc(item.effective_key ?? '--')} · ${formatBitrate(item.bitrate)} · ${esc(item.reason ?? '')}</small>
            </div>
          `).join('') || `<div class="empty">${esc(nextTracksEmptyMessage())}</div>`}
        </div>
      `;
      bindSuggestionCards(nextBody);
    }

    async function refreshSelectedTrackRecommendations(options: { resetPage?: boolean } = {}) {
      const { resetPage = false } = options;
      if (selectedDetailTrackId == null) return;
      const trackId = selectedDetailTrackId;
      if (!document.getElementById('next-tracks-body')) return;
      const requestToken = ++nextTracksRefreshToken;
      try {
        const response = await fetch(`/api/tracks/${trackId}?intent=${encodeURIComponent(nextTracksIntent)}`);
        if (!response.ok) throw new Error(`Could not refresh recommendations (${response.status})`);
        const refreshed = await response.json();
        if (requestToken !== nextTracksRefreshToken || selectedDetailTrackId !== trackId) return;
        nextTracksByTrackId[trackId] = Array.isArray(refreshed.next_tracks) ? refreshed.next_tracks as Record<string, unknown>[] : [];
        if (resetPage) nextTracksPageByTrackId[trackId] = 0;
        renderNextTracksSection(trackId);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Could not refresh recommendations.', 'error');
      }
    }

    function updateRecentNewTrackIdsFromTracks(items: Record<string, unknown>[]) {
      if (!hasScanBaseline) return;
      recentNewTrackIds = new Set(
        items
          .map((track) => Number(track.id))
          .filter((id) => Number.isFinite(id) && !preScanTrackIds.has(id)),
      );
      persistRecentNewTrackIds();
      renderQuickFilters();
    }

    function selectedTracks(): Record<string, unknown>[] {
      return tracks.filter((track) => selectedTrackIds.has(Number(track.id)));
    }

    function selectAllVisibleTracks() {
      const visibleIds = visibleTracksOrdered()
        .map((track) => Number(track.id))
        .filter((id) => Number.isFinite(id));
      for (const id of visibleIds) selectedTrackIds.add(id);
      renderList(tracks);
      renderBulkToolbar();
      showToast(visibleIds.length === 1 ? 'Selected 1 visible track.' : `Selected ${visibleIds.length} visible tracks.`, 'success');
    }

    function selectVisibleGoogleDriveTracksMissingBpm() {
      const visibleIds = visibleTracksOrdered()
        .filter((track) => isGoogleDriveTrackPath(String(track.path ?? '')) && !hasBpm(track))
        .map((track) => Number(track.id))
        .filter((id) => Number.isFinite(id));
      for (const id of visibleIds) selectedTrackIds.add(id);
      renderList(tracks);
      renderBulkToolbar();
      showToast(
        visibleIds.length
          ? (visibleIds.length === 1
            ? 'Selected 1 visible Google Drive track missing BPM.'
            : `Selected ${visibleIds.length} visible Google Drive tracks missing BPM.`)
          : 'No visible Google Drive tracks are missing BPM.',
        visibleIds.length ? 'success' : 'info',
      );
    }

    async function analyzeVisibleGoogleDriveTracksMissingBpm() {
      const visibleIds = visibleTracksOrdered()
        .filter((track) => isGoogleDriveTrackPath(String(track.path ?? '')) && !hasBpm(track))
        .map((track) => Number(track.id))
        .filter((id) => Number.isFinite(id));
      if (!visibleIds.length) {
        showToast('No visible Google Drive tracks are missing BPM.', 'info');
        return;
      }
      for (const id of visibleIds) selectedTrackIds.add(id);
      renderList(tracks);
      renderBulkToolbar();
      await reanalyzeBpmBulk(visibleIds, { label: 'visible Google Drive tracks missing BPM' });
    }

    function toggleTrackSelection(trackId: number) {
      if (selectedTrackIds.has(trackId)) selectedTrackIds.delete(trackId);
      else selectedTrackIds.add(trackId);
      renderList(tracks);
      renderBulkToolbar();
    }

    function setScanStatus(message: string, state: 'idle' | 'running' | 'success' | 'error' = 'idle') {
      scanStatusEl.textContent = message;
      scanStatusEl.dataset.state = state;
      updateDesktopStatusBadge();
    }

    function updateDesktopStatusBadge() {
      if (!desktopStatusBadge) return;
      if (activeScanStatus === 'queued' || activeScanStatus === 'running') {
        desktopStatusBadge.textContent = 'Background scan active';
        desktopStatusBadge.dataset.state = 'running';
        return;
      }
      if (activeScanStatus === 'completed') {
        desktopStatusBadge.textContent = 'Desktop collection ready';
        desktopStatusBadge.dataset.state = 'success';
        return;
      }
      if (activeScanStatus === 'failed') {
        desktopStatusBadge.textContent = 'Background scan failed';
        desktopStatusBadge.dataset.state = 'error';
        return;
      }
      if (activeScanStatus === 'cancelled') {
        desktopStatusBadge.textContent = 'Background scan stopped';
        desktopStatusBadge.dataset.state = 'idle';
        return;
      }
      desktopStatusBadge.textContent = '';
      desktopStatusBadge.dataset.state = 'idle';
    }

    function setScanProgress(current: number, total: number, file = 'No scan in progress') {
      const safeCurrent = Math.max(0, current);
      const safeTotal = Math.max(0, total);
      const percent = safeTotal > 0 ? Math.min(100, (safeCurrent / safeTotal) * 100) : 0;
      if (scanProgressMetaEl) scanProgressMetaEl.textContent = `${safeCurrent} / ${safeTotal}`;
      if (scanProgressBarEl) scanProgressBarEl.style.width = `${percent}%`;
      if (scanProgressFileEl) scanProgressFileEl.textContent = file;
    }

    function updateNowPlayingBar(audio?: HTMLAudioElement | null) {
      const track = nowPlayingTrackId == null
        ? activeTrack()
        : tracks.find((item) => Number(item.id) === nowPlayingTrackId) ?? activeTrack();
      if (!nowPlayingBarEl) return;
      if (!track) {
        nowPlayingBarEl.hidden = true;
        nowPlayingBarEl.dataset.state = 'idle';
        return;
      }
      const currentAudio = audio ?? document.getElementById('local-audio') as HTMLAudioElement | null;
      const isPlaying = Boolean(currentAudio && !currentAudio.paused);
      const stateLabel = currentAudio
        ? (currentAudio.ended ? 'Ended' : currentAudio.muted ? 'Muted' : isPlaying ? 'Playing' : 'Paused')
        : 'Ready';
      nowPlayingBarEl.hidden = false;
      nowPlayingBarEl.dataset.state = isPlaying ? 'playing' : 'paused';
      nowPlayingBarEl.setAttribute('aria-label', `Playback ${stateLabel.toLowerCase()}`);
      syncMuteButton(currentAudio);
    }

    function syncMuteButton(audio?: HTMLAudioElement | null) {
      if (!muteBtn) return;
      const currentAudio = audio ?? document.getElementById('local-audio') as HTMLAudioElement | null;
      const muted = Boolean(currentAudio?.muted ?? audioMuted);
      muteBtn.textContent = muted ? 'Unmute' : 'Mute';
      muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      muteBtn.title = muted ? 'Unmute' : 'Mute';
    }

    function toggleCurrentAudioMute() {
      const audio = document.getElementById('local-audio') as HTMLAudioElement | null;
      if (!audio && nowPlayingTrackId == null) return false;
      audioMuted = audio ? !audio.muted : !audioMuted;
      if (audio) {
        audio.muted = audioMuted;
        updateNowPlayingBar(audio);
      } else {
        syncMuteButton();
      }
      showToast(audioMuted ? 'Playback muted.' : 'Playback unmuted.', 'info');
      return true;
    }

    function updateRenderedTrackDetail(track: Record<string, unknown>) {
      if (selectedDetailTrackId == null || Number(track.id) !== selectedDetailTrackId) return;
      const heading = document.getElementById('detail-track-heading');
      if (heading) {
        heading.innerHTML = `<button type="button" class="nav-link hero-link" data-nav-kind="artist" data-nav-value="${esc(track.artist ?? 'Unknown Artist')}">${esc(track.artist ?? 'Unknown Artist')}</button> - ${esc(track.title ?? 'Untitled')}`;
        bindLibraryNavLinks(heading);
      }
      const pathEl = document.getElementById('detail-track-path');
      if (pathEl) {
        pathEl.textContent = String(track.path ?? '');
        pathEl.setAttribute('title', String(track.path ?? ''));
      }
      const metaArtist = document.getElementById('meta-artist') as HTMLInputElement | null;
      if (metaArtist && document.activeElement !== metaArtist) metaArtist.value = String(track.artist ?? '');
      const metaTitle = document.getElementById('meta-title') as HTMLInputElement | null;
      if (metaTitle && document.activeElement !== metaTitle) metaTitle.value = String(track.title ?? '');
      const metaAlbum = document.getElementById('meta-album') as HTMLInputElement | null;
      if (metaAlbum && document.activeElement !== metaAlbum) metaAlbum.value = String(track.album ?? '');
      const metaKey = document.getElementById('meta-key') as HTMLInputElement | null;
      if (metaKey && document.activeElement !== metaKey) metaKey.value = String(track.key ?? track.effective_key ?? '');
    }

    function seekCurrentAudio(deltaSeconds: number) {
      const audio = document.getElementById('local-audio') as HTMLAudioElement | null;
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return false;
      audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + deltaSeconds));
      updateNowPlayingBar(audio);
      return true;
    }

    function shellEscapePath(rawPath: string): string {
      return `'${rawPath.replace(/'/g, `'\\''`)}'`;
    }

    function slugifyExternalLabel(value: unknown): string {
      return String(value ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
    }

    function tunebatUrlForTrack(track: Record<string, unknown>): string {
      const spotifyId = String(track.spotify_id ?? '').trim();
      if (spotifyId) {
        const titleSlug = slugifyExternalLabel(track.title ?? 'track');
        const artistSlug = slugifyExternalLabel(track.artist ?? 'artist');
        const slug = [titleSlug, artistSlug].filter(Boolean).join('-') || spotifyId;
        return `https://tunebat.com/Info/${slug}/${spotifyId}`;
      }
      const title = String(track.title ?? '').trim();
      const artist = String(track.artist ?? '').trim();
      const searchQuery = [artist, title].filter(Boolean).join(' ').trim();
      if (!searchQuery) return 'https://tunebat.com/';
      return `https://tunebat.com/Search?q=${encodeURIComponent(searchQuery)}`;
    }

    async function copyActiveTrackPath() {
      const track = activeTrack();
      const rawPath = String(track?.path ?? '').trim();
      if (!rawPath) return false;
      try {
        await navigator.clipboard.writeText(shellEscapePath(rawPath));
        showToast('Song path copied.', 'success');
        return true;
      } catch {
        showToast('Could not copy song path.', 'error');
        return false;
      }
    }

    async function copyFrontendLogs() {
      const list = document.getElementById('frontend-log-list');
      if (!list) return false;
      const text = list.innerText.trim();
      if (!text) return false;
      try {
        await navigator.clipboard.writeText(text);
        showToast('Frontend logs copied.', 'success');
        return true;
      } catch {
        showToast('Could not copy frontend logs.', 'error');
        return false;
      }
    }

    async function copyActivityLogs() {
      const list = document.getElementById('activity-log-list');
      if (!list) return false;
      const text = list.innerText.trim();
      if (!text) return false;
      try {
        await navigator.clipboard.writeText(text);
        showToast('Backend logs copied.', 'success');
        return true;
      } catch {
        showToast('Could not copy backend logs.', 'error');
        return false;
      }
    }

    function readCollapsedState(key: string, fallback: boolean): boolean {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        return raw === '1';
      } catch {
        return fallback;
      }
    }

    function writeCollapsedState(key: string, collapsed: boolean) {
      try {
        localStorage.setItem(key, collapsed ? '1' : '0');
      } catch {
        // ignore local storage failures
      }
    }

    function syncCollapsibleLogSection(options: {
      bodyId: string;
      controlId: string;
      storageKey: string;
      fallbackCollapsed?: boolean;
      expandedLabel?: string;
      collapsedLabel?: string;
    }) {
      const bodyEl = document.getElementById(options.bodyId) as HTMLElement | null;
      const controlEl = document.getElementById(options.controlId) as HTMLElement | null;
      if (!bodyEl || !controlEl) return;
      const collapsed = readCollapsedState(options.storageKey, options.fallbackCollapsed === true);
      bodyEl.dataset.collapsed = collapsed ? 'true' : 'false';
      controlEl.dataset.collapsed = collapsed ? 'true' : 'false';
      if (options.expandedLabel && options.collapsedLabel) {
        controlEl.textContent = collapsed ? options.collapsedLabel : options.expandedLabel;
      }
      controlEl.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    function renderFrontendLogEntries(listEl: HTMLElement, entries: Record<string, unknown>[]) {
      if (!entries.length) {
        listEl.innerHTML = '<div class="scan-log-entry info">No frontend logs recorded yet.</div>';
        return;
      }
      listEl.innerHTML = entries.map((entry) => {
        const level = ['warning', 'error', 'success'].includes(String(entry.level ?? '')) ? String(entry.level) : 'info';
        const timestamp = String(entry.timestamp ?? '');
        const timeLabel = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
        const category = String(entry.category ?? '').trim();
        const categoryLabel = category ? `[${category}] ` : '';
        return `<div class="scan-log-entry ${esc(level)}"><time class="scan-log-timestamp" datetime="${esc(timestamp)}">${esc(timeLabel)}</time>${esc(`${categoryLabel}${String(entry.message ?? '')}`)}</div>`;
      }).join('');
    }

    function selectRelativeTrack(offset: -1 | 1) {
      if (offset === 1 && playbackQueue.length) {
        const nextQueued = playbackQueue.shift();
        if (nextQueued != null) {
          updateNowPlayingBar();
          void selectTrack(String(nextQueued), true);
          return;
        }
      }
      const ordered = visibleTracksOrdered();
      if (!ordered.length || activeTrackId == null) return;
      const currentIndex = ordered.findIndex((track) => Number(track.id) === activeTrackId);
      if (currentIndex === -1) return;
      const next = ordered[currentIndex + offset];
      if (!next) return;
      void selectTrack(String(next.id), preferences.autoplayOnSelect);
    }

    function stepSelectionInList(offset: -1 | 1) {
      const ordered = visibleTracksOrdered();
      if (!ordered.length) return;
      if (activeTrackId == null) {
        void selectTrack(String(ordered[0].id), true, true);
        return;
      }
      const currentIndex = ordered.findIndex((track) => Number(track.id) === activeTrackId);
      const nextIndex = currentIndex === -1 ? 0 : Math.max(0, Math.min(ordered.length - 1, currentIndex + offset));
      const next = ordered[nextIndex];
      if (!next) return;
      void selectTrack(String(next.id), true, true);
    }

    function stepSelectionInListPage(direction: -1 | 1) {
      const ordered = visibleTracksOrdered();
      if (!ordered.length) return;
      const pageSize = Math.max(4, Math.floor(listEl.clientHeight / Math.max(1, listRowHeight())) - 1);
      if (activeTrackId == null) {
        setKeyboardPane('list', { focus: true });
        void selectTrack(String(ordered[0].id), true, true);
        return;
      }
      const currentIndex = ordered.findIndex((track) => Number(track.id) === activeTrackId);
      const nextIndex = currentIndex === -1 ? 0 : Math.max(0, Math.min(ordered.length - 1, currentIndex + pageSize * direction));
      const next = ordered[nextIndex];
      if (!next) return;
      setKeyboardPane('list', { focus: true });
      void selectTrack(String(next.id), true, true);
      requestAnimationFrame(() => {
        if (listIsVirtualized) {
          const rowHeight = listRowHeight();
          const centeredTop = Math.max(0, Math.round((nextIndex * rowHeight) - ((listEl.clientHeight - rowHeight) / 2)));
          renderVisibleTrackWindow(ordered, centeredTop);
          listEl.scrollTop = centeredTop;
          requestAnimationFrame(() => {
            listEl.querySelector<HTMLElement>(`.row[data-id="${next.id}"]`)?.classList.add('active');
          });
          return;
        }
        listEl.querySelector<HTMLElement>(`.row[data-id="${next.id}"]`)?.scrollIntoView({ block: 'center' });
      });
    }

    function shouldShowActivityLogEntry(item: {
      message: string;
      eventType?: string;
    }) {
      if (activityLogFilter === 'all') return true;
      return item.eventType === 'bpm_missing' || item.message.includes('missing BPM (');
    }

    function renderActivityLogEntries() {
      const targetLogEl = document.getElementById('activity-log-list') as HTMLElement | null;
      if (!targetLogEl) return;
      const entries = pendingScanLogEntries.filter(shouldShowActivityLogEntry).slice(0, 80);
      if (!entries.length) {
        targetLogEl.innerHTML = `<div class="scan-log-entry info">${
          activityLogFilter === 'bpm-missing'
            ? 'No missing BPM logs yet.'
            : 'No scan activity.'
        }</div>`;
        return;
      }
      const fragment = document.createDocumentFragment();
      for (const item of entries) {
        const entry = document.createElement('div');
        entry.className = `scan-log-entry ${item.level}`;
        const timestamp = document.createElement('time');
        timestamp.className = 'scan-log-timestamp';
        timestamp.dateTime = item.timestamp;
        timestamp.textContent = item.timestampLabel;
        entry.appendChild(timestamp);
        entry.append(document.createTextNode(item.message));
        fragment.appendChild(entry);
      }
      targetLogEl.innerHTML = '';
      targetLogEl.appendChild(fragment);
      scanLogFlushTimer = null;
    }

    function flushPendingScanLogs() {
      if (!pendingScanLogEntries.length) {
        scanLogFlushTimer = null;
        renderActivityLogEntries();
        return;
      }
      pendingScanLogEntries = pendingScanLogEntries
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
        .slice(0, 120);
      renderActivityLogEntries();
    }

    function isServerCallLog(message: string) {
      return message.includes('dj-assist-server') || message.includes('server match ');
    }

    function renderServerCallSummary() {
      const listEl = document.getElementById('activity-server-list') as HTMLElement | null;
      if (!listEl) return;
      if (!recentServerCallEntries.length) {
        listEl.innerHTML = '<div class="scan-log-entry info">No server calls yet.</div>';
        return;
      }
      listEl.innerHTML = recentServerCallEntries.map((entry) => (
        `<div class="scan-history-item scan-server-call-item">`
          + `<strong>${esc(entry.trackLabel)}</strong>`
          + `<span>${esc(entry.detail)}</span>`
          + `<time class="scan-log-timestamp" datetime="${esc(entry.timestamp)}">${esc(entry.timestampLabel)}</time>`
        + `</div>`
      )).join('');
    }

    function updateServerCallSummary(
      message: string,
      level: 'info' | 'warning' | 'error' | 'success',
      timestamp: string,
      timestampLabel: string,
    ) {
      if (!isServerCallLog(message)) return;
      const separator = message.indexOf(': ');
      const trackLabel = separator === -1 ? 'Server activity' : message.slice(0, separator).trim();
      const detail = separator === -1 ? message.trim() : message.slice(separator + 2).trim();
      recentServerCallEntries.unshift({ message, level, timestamp, timestampLabel, trackLabel, detail });
      if (recentServerCallEntries.length > 12) recentServerCallEntries = recentServerCallEntries.slice(0, 12);
      renderServerCallSummary();
    }

    function persistClientDiagnosticLog(
      message: string,
      level: 'info' | 'warning' | 'error' | 'success',
      category = 'scan-log',
      context?: Record<string, unknown>,
    ) {
      void fetch('/api/logs/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          level,
          category,
          context,
        }),
      }).catch(() => {});
    }

    function appendScanLog(
      message: string,
      level: 'info' | 'warning' | 'error' | 'success' = 'info',
      context?: Record<string, unknown>,
      options?: { timestamp?: string; eventType?: string },
    ) {
      const rawTimestamp = String(options?.timestamp ?? '').trim();
      const now = rawTimestamp ? new Date(rawTimestamp) : new Date();
      const nowMs = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
      const signature = `${level}|${message}`;
      const lastSeenMs = recentScanLogSignatures.get(signature) ?? 0;
      if (nowMs - lastSeenMs < 5000) return;
      recentScanLogSignatures.set(signature, nowMs);
      if (recentScanLogSignatures.size > 500) {
        const entries = [...recentScanLogSignatures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300);
        recentScanLogSignatures.clear();
        for (const [key, value] of entries) recentScanLogSignatures.set(key, value);
      }
      pendingScanLogEntries.push({
        message,
        level,
        timestamp: now.toISOString(),
        timestampLabel: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        eventType: String(options?.eventType ?? ''),
      });
      updateServerCallSummary(
        message,
        level,
        now.toISOString(),
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      );
      persistClientDiagnosticLog(message, level, 'scan-log', context);
      if (scanLogFlushTimer) return;
      scanLogFlushTimer = setTimeout(() => {
        flushPendingScanLogs();
      }, 220);
    }

    function pickNestedObject(value: unknown, path: string[]): Record<string, unknown> | null {
      let current: unknown = value;
      for (const key of path) {
        if (!current || typeof current !== 'object') return null;
        current = (current as Record<string, unknown>)[key];
      }
      return current && typeof current === 'object' ? current as Record<string, unknown> : null;
    }

    function extractSpotifyDebugPayload(value: unknown): unknown {
      const candidates = [
        value,
        value && typeof value === 'object' ? (value as Record<string, unknown>).spotify_debug : undefined,
        pickNestedObject(value, ['stdout'])?.spotify_debug,
        pickNestedObject(value, ['stdout', 'debug'])?.spotify_debug,
        pickNestedObject(value, ['art_refresh'])?.spotify_debug,
        pickNestedObject(value, ['stdout', 'art_refresh'])?.spotify_debug,
        pickNestedObject(value, ['stdout', 'debug', 'art_refresh'])?.spotify_debug,
      ];
      return candidates.find((candidate) => {
        if (typeof candidate === 'string') return candidate.trim().length > 0;
        return Boolean(candidate);
      });
    }

    function spotifyDebugEventLevel(event: Record<string, unknown>): 'info' | 'warning' | 'error' {
      const stage = String(event.stage ?? '').toLowerCase();
      const status = Number(event.status ?? 0);
      const responseExcerpt = String(event.response_excerpt ?? '').toLowerCase();
      if (
        status >= 400 ||
        stage.includes('error') ||
        /error|exception|invalid_client|unauthorized|timed out|timeout/.test(responseExcerpt)
      ) {
        return 'error';
      }
      if (status === 429 || stage.includes('retry')) return 'warning';
      return 'info';
    }

    function appendSpotifyStderrLog(
      prefix: string,
      stderrRaw: unknown,
      baseContext?: Record<string, unknown>,
    ) {
      const stderr = String(stderrRaw ?? '').trim();
      if (!stderr) return;
      const lines = stderr.split('\n').map((line) => line.trim()).filter(Boolean);
      let appended = false;
      for (const line of lines) {
        if (!line.startsWith('[spotify-debug] ')) continue;
        const payload = line.slice('[spotify-debug] '.length).trim();
        if (!payload) continue;
        try {
          const parsed = JSON.parse(payload) as Record<string, unknown>;
          const stage = String(parsed.stage ?? '');
          if (!stage) continue;
          const status = parsed.status != null ? ` status=${String(parsed.status)}` : '';
          const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta as Record<string, unknown> : null;
          const kind = meta?.kind ? ` kind=${String(meta.kind)}` : '';
          const query = typeof meta?.query === 'string' && meta.query
            ? ` query="${meta.query}"`
            : '';
          const excerpt = typeof parsed.response_excerpt === 'string' && parsed.response_excerpt
            ? ` resp=${parsed.response_excerpt}`
            : '';
          appendScanLog(`${prefix} Spotify ${stage}:${kind}${status}${query}${excerpt}`, spotifyDebugEventLevel(parsed), {
            ...baseContext,
            category: 'spotify-debug',
            spotifyDebugEvent: parsed,
          });
          appended = true;
        } catch {
          appendScanLog(`${prefix} Spotify stderr: ${payload}`, 'warning', {
            ...baseContext,
            category: 'spotify-debug',
          });
          appended = true;
        }
      }
      if (!appended) {
        appendScanLog(`${prefix} stderr: ${stderr}`, 'warning', {
          ...baseContext,
          category: 'process-stderr',
        });
      }
    }

    function appendSpotifyDebugLog(
      prefix: string,
      spotifyDebugRaw: unknown,
      baseContext?: Record<string, unknown>,
    ) {
      const rawPayload = extractSpotifyDebugPayload(spotifyDebugRaw);
      if (!rawPayload) return;
      try {
        const parsed = typeof rawPayload === 'string'
          ? JSON.parse(rawPayload) as Record<string, unknown>
          : rawPayload as Record<string, unknown>;
        const events = Array.isArray(parsed.events) ? parsed.events as Record<string, unknown>[] : [];
        const querySummaries = Array.isArray(parsed.queries) ? parsed.queries as Record<string, unknown>[] : [];
        const errors = Array.isArray(parsed.errors) ? parsed.errors as Record<string, unknown>[] : [];
        for (const item of querySummaries) {
          const query = String(item.query ?? '').slice(0, 120);
          const items = Number(item.items ?? 0);
          if (!query) continue;
          appendScanLog(`${prefix} Spotify query "${query}" -> ${items} item(s)`, 'info', {
            ...baseContext,
            category: 'spotify-debug',
            spotifyDebug: parsed,
          });
        }
        for (const error of errors) {
          const query = String(error.query ?? '').slice(0, 120);
          const message = String(error.error ?? 'Unknown Spotify error');
          appendScanLog(
            `${prefix} Spotify query error${query ? ` "${query}"` : ''}: ${message}`,
            'error',
            {
              ...baseContext,
              category: 'spotify-debug',
              spotifyDebugError: error,
            },
          );
        }
        for (const event of events) {
          const stage = String(event.stage ?? '');
          if (!stage) continue;
          const status = event.status != null ? ` status=${String(event.status)}` : '';
          const meta = event.meta && typeof event.meta === 'object' ? event.meta as Record<string, unknown> : null;
          const kind = meta?.kind ? ` kind=${String(meta.kind)}` : '';
          const query = typeof meta?.query === 'string' && meta.query
            ? ` query="${meta.query}"`
            : '';
          const excerpt = typeof event.response_excerpt === 'string' && event.response_excerpt
            ? ` resp=${event.response_excerpt}`
            : '';
          appendScanLog(`${prefix} Spotify ${stage}:${kind}${status}${query}${excerpt}`, spotifyDebugEventLevel(event), {
            ...baseContext,
            category: 'spotify-debug',
            spotifyDebugEvent: event,
          });
        }
        if (!querySummaries.length && !events.length && !errors.length) {
          appendScanLog(`${prefix} Spotify debug: ${JSON.stringify(parsed).slice(0, 400)}`, 'info', {
            ...baseContext,
            category: 'spotify-debug',
          });
        }
      } catch {
        appendScanLog(`${prefix} Spotify debug: ${String(rawPayload).slice(0, 400)}`, 'info', {
          ...baseContext,
          category: 'spotify-debug',
        });
      }
    }

    function resetScanLog() {
      pendingScanLogEntries = [];
      recentServerCallEntries = [];
      recentScanLogSignatures.clear();
      if (scanLogFlushTimer) {
        clearTimeout(scanLogFlushTimer);
        scanLogFlushTimer = null;
      }
      renderServerCallSummary();
      const targetLogEl = document.getElementById('activity-log-list') as HTMLElement | null;
      if (targetLogEl) targetLogEl.innerHTML = '<div class="scan-log-entry info">No scan activity.</div>';
    }

    function syncActivityLogFilterUi() {
      const allBtn = document.getElementById('activity-log-filter-all') as HTMLButtonElement | null;
      const bpmBtn = document.getElementById('activity-log-filter-bpm-missing') as HTMLButtonElement | null;
      const allActive = activityLogFilter === 'all';
      allBtn?.setAttribute('aria-pressed', allActive ? 'true' : 'false');
      bpmBtn?.setAttribute('aria-pressed', allActive ? 'false' : 'true');
    }

    function setActivityLogFilter(filter: 'all' | 'bpm-missing') {
      activityLogFilter = filter;
      syncActivityLogFilterUi();
      renderActivityLogEntries();
    }

    function isScanRunning(): boolean {
      return activeScanStatus === 'queued' || activeScanStatus === 'running';
    }

    function currentRefreshIntervalMs(): number {
      return isScanRunning() ? 2500 : 20000;
    }

    async function refreshFromDb(options?: { includeLibrary?: boolean; includeHistory?: boolean; mode?: 'light' | 'full' }) {
      if (refreshInFlight) {
        refreshQueued = true;
        if ((options?.mode ?? 'full') === 'full') queuedRefreshMode = 'full';
        else if (!queuedRefreshMode) queuedRefreshMode = 'light';
        return;
      }
      refreshInFlight = true;
      try {
        await loadTracks(searchEl.value.trim());
        if ((options?.mode ?? 'full') === 'full') {
          if (options?.includeLibrary) await loadLibraryOverview();
          if (options?.includeHistory) await loadScanHistory();
        }
      } finally {
        refreshInFlight = false;
        if (refreshQueued) {
          refreshQueued = false;
          const nextMode = queuedRefreshMode ?? options?.mode ?? 'full';
          queuedRefreshMode = null;
          void refreshFromDb({ ...options, mode: nextMode });
        }
      }
    }

    function ensureBackgroundRefreshLoop() {
      if (backgroundRefreshTimer) {
        clearInterval(backgroundRefreshTimer);
        backgroundRefreshTimer = null;
      }
      backgroundRefreshTimer = setInterval(() => {
        if (document.hidden) return;
        void refreshFromDb({
          includeLibrary: false,
          includeHistory: false,
          mode: 'light',
        });
      }, currentRefreshIntervalMs());
    }

    function queueDbRefresh(delayMs = 4500, mode: 'light' | 'full' = 'light') {
      if (queuedDbRefreshTimer) clearTimeout(queuedDbRefreshTimer);
      queuedRefreshMode = mode === 'full' ? 'full' : queuedRefreshMode ?? 'light';
      queuedDbRefreshTimer = setTimeout(() => {
        queuedDbRefreshTimer = null;
        void refreshFromDb({
          includeLibrary: mode === 'full',
          includeHistory: mode === 'full',
          mode,
        });
      }, delayMs);
    }

    function pushRecentDirectory(directory: string) {
      void directory;
    }

    function setScanSummary(summary?: Record<string, unknown> | null, job?: Record<string, unknown> | null) {
      void summary;
      void job;
    }

    function renderScanHistory() {
      return;
    }

    function clearActiveTrackDetail() {
      activeTrackId = null;
      nowPlayingTrackId = null;
      selectedDetailTrackId = null;
      detailEl.innerHTML = '<div class="empty">Select a track from the library to view details.</div>';
      updateNowPlayingBar();
    }

    function openEditMetadataModal() {
      if (!editMetadataModal) return;
      const track = activeTrack();
      if (!track) return;
      saveEditMetadataInFlight = false;
      if (saveEditMetadataBtn) {
        saveEditMetadataBtn.disabled = false;
        saveEditMetadataBtn.textContent = 'Save Metadata';
      }
      if (editMetadataStatusEl) {
        editMetadataStatusEl.textContent = 'Press Enter or Save Metadata to apply changes.';
        editMetadataStatusEl.dataset.state = 'idle';
      }
      (document.getElementById('edit-meta-artist') as HTMLInputElement | null)!.value = String(track.artist ?? '');
      (document.getElementById('edit-meta-title') as HTMLInputElement | null)!.value = String(track.title ?? '');
      (document.getElementById('edit-meta-album') as HTMLInputElement | null)!.value = String(track.album ?? '');
      (document.getElementById('edit-meta-key') as HTMLInputElement | null)!.value = String(track.key ?? track.effective_key ?? '');
      (document.getElementById('edit-meta-tags') as HTMLInputElement | null)!.value = Array.isArray(track.custom_tags) ? (track.custom_tags as string[]).join(', ') : '';
      openModal(editMetadataModal);
      requestAnimationFrame(() => {
        const input = document.getElementById('edit-meta-artist') as HTMLInputElement | null;
        input?.focus();
        input?.select();
        showInputSuggestions(input);
      });
    }

    async function saveEditMetadataModal() {
      if (activeTrackId == null || saveEditMetadataInFlight) return;
      const savedTrackId = activeTrackId;
      saveEditMetadataInFlight = true;
      const activeElement = document.activeElement as HTMLElement | null;
      activeElement?.blur();
      if (saveEditMetadataBtn) {
        saveEditMetadataBtn.disabled = true;
        saveEditMetadataBtn.textContent = 'Saving…';
      }
      if (editMetadataStatusEl) {
        editMetadataStatusEl.textContent = 'Saving metadata into the file and library…';
        editMetadataStatusEl.dataset.state = 'saving';
      }
      const artistInput = document.getElementById('edit-meta-artist') as HTMLInputElement | null;
      const titleInput = document.getElementById('edit-meta-title') as HTMLInputElement | null;
      const albumInput = document.getElementById('edit-meta-album') as HTMLInputElement | null;
      const keyInput = document.getElementById('edit-meta-key') as HTMLInputElement | null;
      const tagsInput = document.getElementById('edit-meta-tags') as HTMLInputElement | null;
      try {
        const saved = await saveTrackMetadata(activeTrackId, {
          artist: artistInput?.value.trim() ?? '',
          title: titleInput?.value.trim() ?? '',
          album: albumInput?.value.trim() ?? '',
          key: keyInput?.value.trim() ?? '',
          custom_tags: (tagsInput?.value ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
        }, { reloadDetail: false });
        if (!saved) {
          if (editMetadataStatusEl) {
            editMetadataStatusEl.textContent = 'Save failed. Check the file and try again.';
            editMetadataStatusEl.dataset.state = 'error';
          }
          if (saveEditMetadataBtn) {
            saveEditMetadataBtn.disabled = false;
            saveEditMetadataBtn.textContent = 'Save Metadata';
          }
          return;
        }
        if (editMetadataStatusEl) {
          editMetadataStatusEl.textContent = 'Saved.';
          editMetadataStatusEl.dataset.state = 'success';
        }
        editMetadataModal?.querySelectorAll<HTMLInputElement>('input').forEach((input) => input.blur());
        closeModal(editMetadataModal);
        openPanel('track');
        requestAnimationFrame(() => {
          preserveHighlightedTrack(savedTrackId, { ensureVisible: true, focusList: true });
        });
      } finally {
        saveEditMetadataInFlight = false;
      }
    }

    function openDeleteTracksModal(ids: number[], source: 'single' | 'bulk') {
      const uniqueIds = [...new Set(ids.filter((id) => Number.isFinite(id)))];
      if (!uniqueIds.length || !deleteTrackModal) return;
      pendingDeleteTrackIds = uniqueIds;
      pendingDeleteSource = source;
      if (deleteTrackRemoveFileEl) deleteTrackRemoveFileEl.checked = false;
      if (deleteTrackTitleEl) {
        deleteTrackTitleEl.textContent = uniqueIds.length === 1 ? 'Delete Track' : `Delete ${uniqueIds.length} Tracks`;
      }
      if (deleteTrackMessageEl) {
        if (uniqueIds.length === 1) {
          const track = tracks.find((item) => Number(item.id) === uniqueIds[0]) ?? null;
          const artist = String(track?.artist ?? '').trim();
          const title = String(track?.title ?? '').trim() || 'Untitled';
          const label = artist ? `${artist} - ${title}` : title;
          deleteTrackMessageEl.textContent = `Remove "${label}" from DJ Assist. You can also delete the audio file from the computer.`;
        } else {
          deleteTrackMessageEl.textContent = `Remove ${uniqueIds.length} tracks from DJ Assist. You can also delete their audio files from the computer.`;
        }
      }
      openModal(deleteTrackModal);
      requestAnimationFrame(() => {
        deleteTrackRemoveFileEl?.focus();
      });
    }

    function closeDeleteTracksModal() {
      pendingDeleteTrackIds = [];
      pendingDeleteSource = 'single';
      lastDeleteShortcutAt = 0;
      if (deleteTrackRemoveFileEl) deleteTrackRemoveFileEl.checked = false;
      closeModal(deleteTrackModal);
    }

    function openQuitAppModal() {
      if (!quitAppModal || quitAppInFlight) return;
      openModal(quitAppModal);
      requestAnimationFrame(() => {
        cancelQuitAppBtn?.focus();
      });
    }

    async function closeQuitAppModal() {
      closeModal(quitAppModal);
      await adapter.cancelQuit();
    }

    async function confirmQuitApp() {
      if (quitAppInFlight) return;
      quitAppInFlight = true;
      try {
        if (activeScanStatus === 'queued' || activeScanStatus === 'running') {
          try {
            await fetch('/api/scan', { method: 'DELETE' });
            activeScanStatus = 'cancelled';
            stopStreamingScanJob();
            setScanStatus('Scan cancelled', 'error');
            appendScanLog('Scan cancelled because the app is quitting.', 'warning');
          } catch {
            // Best effort: continue quitting even if cancellation fails.
          }
        }
        await adapter.confirmQuit();
      } finally {
        quitAppInFlight = false;
      }
    }

    async function pruneMissingTracks(ids: number[]) {
      const uniqueIds = [...new Set(ids.filter((id) => Number.isFinite(id)))];
      if (!uniqueIds.length) return;

      const orderedBeforeDelete = visibleTracksOrdered();
      const activeDeleted = activeTrackId != null && uniqueIds.includes(activeTrackId);
      let nextTrackId: number | null = null;
      if (activeDeleted) {
        const activeIndex = orderedBeforeDelete.findIndex((track) => Number(track.id) === activeTrackId);
        if (activeIndex >= 0) {
          const nextCandidate = orderedBeforeDelete
            .slice(activeIndex + 1)
            .find((track) => !uniqueIds.includes(Number(track.id)));
          const prevCandidate = orderedBeforeDelete
            .slice(0, activeIndex)
            .reverse()
            .find((track) => !uniqueIds.includes(Number(track.id)));
          nextTrackId = Number(nextCandidate?.id ?? prevCandidate?.id ?? 0) || null;
        }
      }

      await fetch('/api/tracks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: uniqueIds, action: 'delete' }),
      });

      for (const id of uniqueIds) selectedTrackIds.delete(id);
      await loadTracks(searchEl.value.trim());
      await loadLibraryOverview();
      await loadSets();
      if (currentPanel === 'sets') await renderSetsPanel();
      if (nextTrackId != null && tracks.some((track) => Number(track.id) === nextTrackId)) {
        await selectTrack(String(nextTrackId), true, true);
      } else if (activeTrackId != null && uniqueIds.includes(activeTrackId)) {
        clearActiveTrackDetail();
      }
      renderBulkToolbar();
      showToast(uniqueIds.length === 1 ? 'Missing file removed from the library.' : `${uniqueIds.length} missing files removed from the library.`, 'warning');
    }

    async function deleteTracksFromLibrary(ids: number[], source: 'single' | 'bulk', deleteFiles = false) {
      const uniqueIds = [...new Set(ids.filter((id) => Number.isFinite(id)))];
      if (!uniqueIds.length) return;

      const orderedBeforeDelete = visibleTracksOrdered();
      const activeDeleted = activeTrackId != null && uniqueIds.includes(activeTrackId);
      let nextTrackId: number | null = null;
      if (activeDeleted) {
        const activeIndex = orderedBeforeDelete.findIndex((track) => Number(track.id) === activeTrackId);
        if (activeIndex >= 0) {
          const nextCandidate = orderedBeforeDelete
            .slice(activeIndex + 1)
            .find((track) => !uniqueIds.includes(Number(track.id)));
          const prevCandidate = orderedBeforeDelete
            .slice(0, activeIndex)
            .reverse()
            .find((track) => !uniqueIds.includes(Number(track.id)));
          nextTrackId = Number(nextCandidate?.id ?? prevCandidate?.id ?? 0) || null;
        }
      }

      const res = await fetch('/api/tracks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: uniqueIds, action: 'delete', deleteFiles }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        showToast('Delete failed.', 'error');
        warningBanner.style.display = 'block';
        warningBanner.innerHTML = `<strong>Delete failed:</strong> ${esc(body || 'Unable to remove tracks from the library.')}`;
        return;
      }

      for (const id of uniqueIds) selectedTrackIds.delete(id);
      await loadTracks(searchEl.value.trim());
      await loadLibraryOverview();
      await loadSets();
      if (currentPanel === 'sets') await renderSetsPanel();
      if (nextTrackId != null && tracks.some((track) => Number(track.id) === nextTrackId)) {
        await selectTrack(String(nextTrackId), true, true);
      } else if (activeTrackId != null && uniqueIds.includes(activeTrackId)) {
        clearActiveTrackDetail();
      }
      renderBulkToolbar();
      if (deleteFiles) {
        showToast(source === 'single' ? 'Track and file deleted.' : `${uniqueIds.length} tracks and files deleted.`, 'success');
      } else {
        showToast(source === 'single' ? 'Track removed from the library.' : `${uniqueIds.length} tracks removed from the library.`, 'success');
      }
    }

    async function confirmDeleteTracks() {
      const ids = [...pendingDeleteTrackIds];
      const source = pendingDeleteSource;
      const deleteFiles = Boolean(deleteTrackRemoveFileEl?.checked);
      closeDeleteTracksModal();
      await deleteTracksFromLibrary(ids, source, deleteFiles);
    }

    function renderBulkToolbar() {
      const selected = selectedTracks();
      if (!selected.length) {
        bulkToolbarEl.innerHTML = '';
        bulkToolbarEl.classList.add('hidden');
        return;
      }
      bulkToolbarEl.classList.remove('hidden');

      const setOptions = sets.map((set) => `<option value="${set.id}">${esc(set.name)}</option>`).join('');
      bulkToolbarEl.innerHTML = `
        <div class="bulk-toolbar-main">
          <strong>${selected.length} selected</strong>
          <button type="button" class="btn" id="bulk-select-all-visible-btn">Select All Visible</button>
          <button type="button" class="btn" id="bulk-select-drive-missing-bpm-btn">Select Drive Missing BPM</button>
          <button type="button" class="btn" id="bulk-analyze-drive-missing-bpm-btn">Analyze Visible Drive Missing BPM</button>
          <button type="button" class="btn danger" id="bulk-delete-btn">Delete</button>
          <button type="button" class="btn" id="bulk-reanalyze-bpm-btn">Analyze BPM</button>
          <button type="button" class="btn" id="bulk-reanalyze-art-btn">Fill Missing Art</button>
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
        const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (!res.ok) {
          showToast(String(payload.error ?? 'Bulk update failed.'), 'error');
          return;
        }
        await loadTracks(searchEl.value.trim());
        await loadLibraryOverview();
        if (action === 'add_to_set') {
          const updated = Number(payload.updated ?? 0);
          const skipped = Number(payload.skipped ?? 0);
          if (Boolean(payload.missingSet)) {
            showToast('Playlist no longer exists. Reloading playlists.', 'error');
            await loadSets();
            return;
          }
          if (updated > 0 && skipped > 0) {
            showToast(`Added ${updated} tracks to the playlist. Skipped ${skipped} stale selections.`, 'warning');
          } else if (updated > 0) {
            showToast(updated === 1 ? 'Added 1 track to the playlist.' : `Added ${updated} tracks to the playlist.`, 'success');
          } else if (skipped > 0) {
            showToast('Selected tracks are no longer in the library. Reloading the list.', 'warning');
            await loadTracks(searchEl.value.trim());
          }
          await loadSets();
          if (currentPanel === 'sets') await renderSetsPanel();
        }
      };

      document.getElementById('bulk-select-all-visible-btn')?.addEventListener('click', () => {
        selectAllVisibleTracks();
      });
      document.getElementById('bulk-select-drive-missing-bpm-btn')?.addEventListener('click', () => {
        selectVisibleGoogleDriveTracksMissingBpm();
      });
      document.getElementById('bulk-analyze-drive-missing-bpm-btn')?.addEventListener('click', () => {
        void analyzeVisibleGoogleDriveTracksMissingBpm();
      });
      document.getElementById('bulk-ignore-btn')?.addEventListener('click', () => { void runBulkAction('ignore'); });
      document.getElementById('bulk-unignore-btn')?.addEventListener('click', () => { void runBulkAction('unignore'); });
      document.getElementById('bulk-delete-btn')?.addEventListener('click', () => { openDeleteTracksModal([...selectedTrackIds], 'bulk'); });
      document.getElementById('bulk-reanalyze-bpm-btn')?.addEventListener('click', () => {
        void reanalyzeBpmBulk([...selectedTrackIds], { label: 'selected tracks' });
      });
      document.getElementById('bulk-reanalyze-art-btn')?.addEventListener('click', () => {
        void reanalyzeArtBulk([...selectedTrackIds], { label: 'selected tracks' });
      });
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
      return String(Math.round(Number(raw) * mult));
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

    async function saveTrackMetadata(
      trackId: number,
      patch: Record<string, unknown>,
      options: { reloadDetail?: boolean } = {},
    ) {
      const { reloadDetail = true } = options;
      const res = await fetch(`/api/tracks/${trackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return null;
      const payload = await res.json();
      const updatedTrack = payload.track as Record<string, unknown> | undefined;
      if (updatedTrack) {
        const trackIndex = tracks.findIndex((item) => Number(item.id) === trackId);
        if (trackIndex !== -1) tracks[trackIndex] = updatedTrack;
        else tracks = [updatedTrack, ...tracks];
        refreshMetadataSuggestionLists();
        renderList(tracks);
        if (activeTrackId === trackId) preserveHighlightedTrack(trackId, { ensureVisible: true });
        if (selectedDetailTrackId === trackId || activeTrackId === trackId) {
          updateRenderedTrackDetail(updatedTrack);
          updateNowPlayingBar(document.getElementById('local-audio') as HTMLAudioElement | null);
        }
        // Avoid rebuilding the active player after modal metadata edits. Replacing
        // the detail pane tears down the audio element and can cause audible pops.
        if (reloadDetail && (selectedDetailTrackId === trackId || activeTrackId === trackId)) {
          await loadTrackDetail(String(trackId), false);
        }
      }
      void loadLibraryOverview();
      return payload;
    }

    async function reanalyzeArtForTrack(
      trackId: number,
      options: { force?: boolean; reloadDetail?: boolean } = {},
    ) {
      const { force = false, reloadDetail = true } = options;
      appendScanLog(`Reanalyze Art started for track ${trackId}`, 'info', {
        category: 'reanalyze-art',
        trackId,
        force,
      });
      const response = await fetch(`/api/tracks/${trackId}/reanalyze-art`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      const debugInfo = payload.debug && typeof payload.debug === 'object' ? payload.debug as Record<string, unknown> : undefined;
      appendSpotifyDebugLog('Reanalyze Art', debugInfo, { trackId, category: 'reanalyze-art' });
      appendSpotifyStderrLog('Reanalyze Art', debugInfo?.stderr, { trackId, category: 'reanalyze-art' });
      if (!response.ok) {
        appendScanLog(`Reanalyze Art failed for track ${trackId}: ${String(payload.error ?? 'Artwork refresh failed.')}`, 'error', {
          category: 'reanalyze-art',
          trackId,
          debug: debugInfo,
        });
        throw new Error(String(payload.error ?? 'Artwork refresh failed.'));
      }

      const refreshed = payload.track && typeof payload.track === 'object'
        ? payload.track as Record<string, unknown>
        : null;
      if (refreshed) {
        const trackIndex = tracks.findIndex((item) => Number(item.id) === trackId);
        if (trackIndex !== -1) tracks[trackIndex] = refreshed;
        else tracks = [refreshed, ...tracks];
        renderList(tracks);
      }
      if (reloadDetail) {
        await loadTrackDetail(String(trackId), false);
      }
      appendScanLog(`Reanalyze Art finished for track ${trackId}: ${String(payload.message ?? 'Artwork refresh complete.')}`, 'success', {
        category: 'reanalyze-art',
        trackId,
        albumArtSource: String(refreshed?.album_art_source ?? ''),
        albumArtUrl: String(refreshed?.album_art_url ?? ''),
        debug: debugInfo,
      });
      return { payload, refreshed };
    }

    async function reanalyzeArtBulk(ids: number[], options: { force?: boolean; label?: string } = {}) {
      const { force = false, label = 'tracks' } = options;
      if (!ids.length) {
        showToast('No tracks to refresh art for.', 'info');
        return;
      }
      appendScanLog(`Fill Missing Art started for ${ids.length} ${label}.`, 'info', {
        category: 'reanalyze-art-bulk',
        trackIds: ids,
        force,
      });
      const response = await fetch('/api/tracks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'reanalyze_art', force }),
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        appendScanLog(`Fill Missing Art failed: ${String(payload.error ?? 'Bulk artwork refresh failed.')}`, 'error', {
          category: 'reanalyze-art-bulk',
          debug: payload,
        });
        showToast(String(payload.error ?? 'Bulk artwork refresh failed.'), 'error');
        return;
      }
      const results = Array.isArray(payload.results) ? payload.results as Record<string, unknown>[] : [];
      for (const item of results) {
        appendScanLog(`Art refresh track ${item.id}: ${String(item.message ?? '')}`, item.ok ? 'info' : 'error', {
          category: 'reanalyze-art-bulk',
          trackId: Number(item.id ?? 0),
          debug: item.debug && typeof item.debug === 'object' ? item.debug as Record<string, unknown> : undefined,
        });
      }
      await loadTracks(searchEl.value.trim());
      await loadLibraryOverview();
      if (selectedDetailTrackId != null) {
        await loadTrackDetail(String(selectedDetailTrackId), false);
      }
      const succeeded = Number(payload.succeeded ?? 0);
      const failed = Number(payload.failed ?? 0);
      showToast(`Fill Missing Art finished: ${succeeded} succeeded, ${failed} failed.`, failed ? 'warning' : 'success');
    }

    async function reanalyzeBpmBulk(ids: number[], options: { label?: string } = {}) {
      const { label = 'tracks' } = options;
      if (!ids.length) {
        showToast('No tracks to analyze BPM for.', 'info');
        return;
      }
      appendScanLog(`Bulk BPM analysis started for ${ids.length} ${label}.`, 'info', {
        category: 'reanalyze-bpm-bulk',
        trackIds: ids,
      });
      const response = await fetch('/api/tracks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'reanalyze_bpm' }),
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        appendScanLog(`Bulk BPM analysis failed: ${String(payload.error ?? 'Bulk BPM analysis failed.')}`, 'error', {
          category: 'reanalyze-bpm-bulk',
          debug: payload,
        });
        showToast(String(payload.error ?? 'Bulk BPM analysis failed.'), 'error');
        return;
      }
      const results = Array.isArray(payload.results) ? payload.results as Record<string, unknown>[] : [];
      for (const item of results) {
        const debug = item.debug && typeof item.debug === 'object' ? item.debug as Record<string, unknown> : undefined;
        const googleDriveDownload = debug?.googleDriveDownload && typeof debug.googleDriveDownload === 'object'
          ? debug.googleDriveDownload as Record<string, unknown>
          : undefined;
        if (googleDriveDownload) {
          appendScanLog(
            `Track ${item.id}: Google Drive cache ${googleDriveDownload.cached ? 'reused' : 'downloaded'} for ${String(googleDriveDownload.name ?? 'file')}.`,
            'info',
            { category: 'reanalyze-bpm-bulk', trackId: Number(item.id ?? 0), googleDriveDownload },
          );
        }
        appendScanLog(
          `BPM analysis track ${item.id}: ${String(item.message ?? '')}`,
          item.ok ? 'success' : 'error',
          {
            category: 'reanalyze-bpm-bulk',
            trackId: Number(item.id ?? 0),
            debug,
          },
        );
      }
      await loadTracks(searchEl.value.trim());
      await loadLibraryOverview();
      if (selectedDetailTrackId != null) {
        await loadTrackDetail(String(selectedDetailTrackId), false);
      }
      const succeeded = Number(payload.succeeded ?? 0);
      const failed = Number(payload.failed ?? 0);
      showToast(`Analyze BPM finished: ${succeeded} succeeded, ${failed} failed.`, failed ? 'warning' : 'success');
    }

    async function readFileAsDataUrl(file: File): Promise<string> {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === 'string' && result.startsWith('data:image/')) {
            resolve(result);
            return;
          }
          reject(new Error('Selected file is not a supported image.'));
        };
        reader.onerror = () => reject(reader.error ?? new Error('Could not read image file.'));
        reader.readAsDataURL(file);
      });
    }

    async function saveManualCoverArt(trackId: number, dataUrl: string, source: 'manual_upload' | 'manual_paste') {
      appendScanLog(`Manual cover art save started for track ${trackId}`, 'info', {
        category: 'manual-cover-art',
        trackId,
        source,
        size: dataUrl.length,
      });
      const payload = await saveTrackMetadata(
        trackId,
        {
          album_art_url: dataUrl,
          album_art_source: source,
          album_art_confidence: 100,
          album_art_review_status: 'approved',
          album_art_review_notes: source === 'manual_paste' ? 'manual image pasted from clipboard' : 'manual image uploaded from file',
        },
        { reloadDetail: true },
      );
      if (!payload?.track) {
        appendScanLog(`Manual cover art save failed for track ${trackId}`, 'error', {
          category: 'manual-cover-art',
          trackId,
          source,
        });
        throw new Error('Could not save cover art.');
      }
      appendScanLog(`Manual cover art saved for track ${trackId}`, 'success', {
        category: 'manual-cover-art',
        trackId,
        source,
      });
      return payload.track as Record<string, unknown>;
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

      const renderFallbackWaveform = (currentTime = audio?.currentTime ?? 0) => {
        context.clearRect(0, 0, width, height);
        context.fillStyle = 'rgba(255,255,255,0.04)';
        context.fillRect(0, 0, width, height);
        const seed = (trackId % 17) + 7;
        const barCount = Math.max(48, Math.floor(width / 6));
        const progressRatio = audio && Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.max(0, Math.min(1, currentTime / audio.duration))
          : 0;
        const progressX = progressRatio * width;
        for (let i = 0; i < barCount; i += 1) {
          const ratio = i / Math.max(1, barCount - 1);
          const x = ratio * width;
          const amplitude = 0.18 + (((Math.sin((i + seed) * 0.63) + 1) / 2) * 0.52);
          const barHeight = Math.max(10, amplitude * height * 0.9);
          const y = (height - barHeight) / 2;
          context.fillStyle = x <= progressX ? 'rgba(255,108,0,0.85)' : 'rgba(255,255,255,0.16)';
          context.fillRect(x, y, Math.max(2, width / barCount - 1), barHeight);
        }
        context.strokeStyle = 'rgba(255,255,255,0.92)';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(progressX, 0);
        context.lineTo(progressX, height);
        context.stroke();
      };

      const bindFallbackScrubbing = () => {
        if (!audio) return;
        const seekFromPointer = (clientX: number) => {
          if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
          const rect = canvas.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          audio.currentTime = ratio * audio.duration;
          renderFallbackWaveform(audio.currentTime);
        };
        let scrubbing = false;
        const stopScrub = () => { scrubbing = false; };
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
        const syncFallback = () => renderFallbackWaveform(audio.currentTime);
        audio.addEventListener('timeupdate', syncFallback);
        audio.addEventListener('seeked', syncFallback);
        audio.addEventListener('loadedmetadata', syncFallback);
        audio.addEventListener('canplay', syncFallback);
        audio.addEventListener('play', syncFallback);
        audio.addEventListener('pause', syncFallback);
      };

      if (!src.trim()) {
        renderFallbackWaveform();
        return;
      }

      try {
        const waveformRes = await fetch(`/api/tracks/${trackId}/waveform?width=${width}`);
        if (!waveformRes.ok) {
          let message = `waveform peaks failed (${waveformRes.status})`;
          try {
            const payload = await waveformRes.json();
            if (payload && typeof payload.error === 'string' && payload.error.trim()) {
              message = payload.error;
            }
          } catch {
            // Ignore malformed error payloads and use the generic message.
          }
          throw new Error(message);
        }
        const waveformPayload = await waveformRes.json() as {
          waveform?: {
            duration?: number;
            peaks?: Array<{ min: number; max: number }>;
          };
        };
        const peaks = Array.isArray(waveformPayload.waveform?.peaks) ? waveformPayload.waveform!.peaks : [];
        const waveformDuration = Number(waveformPayload.waveform?.duration ?? audio?.duration ?? 0);
        if (!peaks.length) throw new Error('waveform peaks missing');
        if (!Number.isFinite(waveformDuration) || waveformDuration <= 0) {
          throw new Error('waveform duration missing');
        }
        const amp = height / 2;

        let rafId = 0;
        const renderFrame = (currentTime = audio?.currentTime ?? 0) => {
          context.clearRect(0, 0, width, height);
          context.fillStyle = 'rgba(255,255,255,0.04)';
          context.fillRect(0, 0, width, height);
          const progressRatio = waveformDuration > 0 ? Math.max(0, Math.min(1, currentTime / waveformDuration)) : 0;
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
            const x = waveformDuration > 0 ? (cue.time / waveformDuration) * width : 0;
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
          if (!audio || !Number.isFinite(waveformDuration) || waveformDuration <= 0) return;
          const rect = canvas.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          audio.currentTime = ratio * waveformDuration;
          renderFrame(audio.currentTime);
        };

        renderFrame();

        if (audio) {
          let scrubbing = false;
          const stopScrub = () => { scrubbing = false; };
          const syncWaveform = () => {
            if (document.visibilityState !== 'visible') return;
            renderFrame(audio.currentTime);
          };
          const tick = () => {
            if (document.visibilityState !== 'visible') {
              rafId = 0;
              return;
            }
            renderFrame(audio.currentTime);
            if (!audio.paused && !audio.ended) rafId = requestAnimationFrame(tick);
          };
          const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
              renderFrame(audio.currentTime);
              if (!audio.paused && !audio.ended && !rafId) {
                rafId = requestAnimationFrame(tick);
              }
              return;
            }
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
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
          document.addEventListener('visibilitychange', handleVisibilityChange);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendScanLog(`Waveform preview fallback for track ${trackId}: ${message}`, 'warning', {
          category: 'waveform',
          trackId,
          source: src,
          audioCurrentTime: audio ? Number(audio.currentTime ?? 0) : null,
          audioDuration: audio ? Number(audio.duration ?? 0) : null,
          audioPaused: audio ? Boolean(audio.paused) : null,
          readyState: audio ? Number(audio.readyState ?? 0) : null,
          networkState: audio ? Number(audio.networkState ?? 0) : null,
          errorName: error instanceof Error ? error.name : typeof error,
          stack: error instanceof Error ? error.stack ?? null : null,
          userAgent: navigator.userAgent,
          visibilityState: document.visibilityState,
        });
        showToast('Waveform preview fell back to simplified mode.', 'warning');
        renderFallbackWaveform();
        bindFallbackScrubbing();
      }
    }

    // ── Panel switching ───────────────────────────────────────────────────────
    document.querySelectorAll('.panel-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const requestedPanel = ((btn as HTMLElement).dataset.panel ?? 'track') as 'track' | 'sets' | 'library' | 'activity';
        const panel = isProdFlavor && requestedPanel === 'activity' ? 'track' : requestedPanel;
        currentPanel = panel;
        document.querySelectorAll('.panel-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        panelTrack.style.display = panel === 'track' ? '' : 'none';
        panelSets.style.display = panel === 'sets' ? '' : 'none';
        panelLibrary.style.display = panel === 'library' ? '' : 'none';
        if (panelActivity) panelActivity.style.display = panel === 'activity' ? '' : 'none';
        if (panel === 'sets') renderSetsPanel();
        if (panel === 'library') renderLibraryPanel();
        if (panel === 'activity' && !isProdFlavor) renderActivityPanel();
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

    function buildTrackRowSignature(track: Record<string, unknown>): string {
      return JSON.stringify({
        id: track.id,
        artist: track.artist ?? '',
        title: track.title ?? '',
        album: albumNameFor(track),
        path: track.path ?? '',
        sourceSummary: trackSourceSummary(track),
        sourceCount: Number(track.source_count ?? 0),
        bitrate: track.bitrate ?? '',
        bpm: track.effective_bpm ?? '',
        key: track.effective_key ?? '',
        duration: track.duration ?? '',
        tags: Array.isArray(track.custom_tags) ? (track.custom_tags as string[]).join('|') : '',
        art: track.album_art_url ?? '',
        active: Number(track.id) === activeTrackId,
        selected: selectedTrackIds.has(Number(track.id)),
        recent: recentNewTrackIds.has(Number(track.id)),
        mult: getMult(track.id as number),
        prefs: [
          preferences.listShowAlbum,
          preferences.listShowBitrate,
          preferences.listShowTags,
          preferences.listShowBpmSource,
          preferences.listShowKey,
          preferences.listShowLength,
          preferences.listShowRecent,
        ].join('|'),
      });
    }

    function trackRowMarkup(track: Record<string, unknown>): string {
      return `
        <label class="row-check">
          <input type="checkbox" class="track-select" data-track-id="${track.id}" ${selectedTrackIds.has(Number(track.id)) ? 'checked' : ''} />
        </label>
        ${track.album_art_url ? `<img class="thumb" src="${esc(track.album_art_url)}" alt="" />` : '<div class="thumb placeholder">♪</div>'}
        <div>
          <strong><button type="button" class="nav-link inline" data-nav-kind="artist" data-nav-value="${esc(track.artist ?? 'Unknown Artist')}">${esc(track.artist ?? 'Unknown Artist')}</button> - ${esc(track.title ?? 'Untitled')}</strong>
          <span>${trackSubtitleParts(track).join(' · ')}</span>
        </div>
        ${rowMetricTemplate(track)}
      `;
    }

    function bindTrackRowEvents(row: HTMLElement) {
      if (row.dataset.bound !== 'true') {
        row.addEventListener('click', () => selectTrack(row.dataset.id!, preferences.autoplayOnSelect));
        row.dataset.bound = 'true';
      }
      const checkbox = row.querySelector('.track-select[data-track-id]') as HTMLInputElement | null;
      checkbox?.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      checkbox?.addEventListener('change', () => {
        const trackId = parseInt(checkbox.dataset.trackId!, 10);
        if (checkbox.checked) selectedTrackIds.add(trackId);
        else selectedTrackIds.delete(trackId);
        renderBulkToolbar();
      });
      const bpmCell = row.querySelector('.bpm-cell[data-track-id]') as HTMLElement | null;
      bpmCell?.addEventListener('click', (e) => {
        e.stopPropagation();
        const tid = parseInt(bpmCell.dataset.trackId!, 10);
        cycleMult(tid);
        renderList(tracks);
        if (activeTrackId === tid) {
          applyMultToDetail(tid);
        } else {
          detailEl.querySelectorAll(`[data-raw-bpm][data-track-id="${tid}"]`).forEach((el) => {
            (el as HTMLElement).textContent = displayBpm((el as HTMLElement).dataset.rawBpm, tid) + ' BPM';
          });
        }
      });
      bindLibraryNavLinks(row);
    }

    function updateTrackRowElement(row: HTMLElement, track: Record<string, unknown>) {
      const signature = buildTrackRowSignature(track);
      row.dataset.id = String(track.id);
      row.classList.toggle('active', Number(track.id) === activeTrackId);
      if (row.dataset.signature === signature) return;
      row.dataset.signature = signature;
      row.innerHTML = trackRowMarkup(track);
      bindTrackRowEvents(row);
    }

    function createTrackRowElement(track: Record<string, unknown>): HTMLElement {
      const row = document.createElement('div');
      row.className = `row ${Number(track.id) === activeTrackId ? 'active' : ''}`;
      updateTrackRowElement(row, track);
      return row;
    }

    function listRowHeight(): number {
      return document.body.dataset.listDensity === 'compact' ? 50 : 62;
    }

    function shouldVirtualizeList(count: number): boolean {
      return count > 250;
    }

    function renderTrackRows(rowsSource: Record<string, unknown>[], topOffset = 0, bottomOffset = 0) {
      const existingRows = new Map(
        Array.from(listEl.querySelectorAll<HTMLElement>('.row[data-id]')).map((row) => [row.dataset.id ?? '', row]),
      );
      const children: HTMLElement[] = [];
      if (topOffset > 0) {
        const spacer = document.createElement('div');
        spacer.className = 'list-spacer';
        spacer.style.height = `${topOffset}px`;
        children.push(spacer);
      }
      for (const track of rowsSource) {
        const key = String(track.id);
        const row = existingRows.get(key) ?? createTrackRowElement(track);
        updateTrackRowElement(row, track);
        existingRows.delete(key);
        children.push(row);
      }
      if (bottomOffset > 0) {
        const spacer = document.createElement('div');
        spacer.className = 'list-spacer';
        spacer.style.height = `${bottomOffset}px`;
        children.push(spacer);
      }
      listEl.replaceChildren(...children);
    }

    function renderVisibleTrackWindow(sorted: Record<string, unknown>[], scrollTop: number) {
      const rowHeight = listRowHeight();
      const viewportHeight = Math.max(listEl.clientHeight, rowHeight * 8);
      const overscan = 10;
      const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
      const end = Math.min(
        sorted.length,
        Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
      );
      renderTrackRows(
        sorted.slice(start, end),
        start * rowHeight,
        Math.max(0, (sorted.length - end) * rowHeight),
      );
    }

    function renderList(items: Record<string, unknown>[]) {
      const sorted = visibleTracks(items);
      currentRenderedList = sorted;
      const previousScrollTop = listEl.scrollTop;
      if (hiddenCountBadge) hiddenCountBadge.textContent = `Shown: ${sorted.length}`;
      statusbar.innerHTML = `Collection: <strong>${tracks.length}</strong> | Visible: <strong>${sorted.length}</strong>${activeQuickFilter ? ` | Filter: <strong>${esc(activeQuickFilterLabel())}</strong>` : ''}${recentNewTrackIds.size ? ` | New: <strong>${recentNewTrackIds.size}</strong>` : ''}${activeArtistScope ? ` | Artist: <strong>${esc(activeArtistScope)}</strong>` : ''}${activeAlbumScope ? ` | Album: <strong>${esc(activeAlbumScope)}</strong>` : ''} | <button type="button" class="statusbar-action" id="statusbar-select-all-visible-btn">Select All Visible</button>`;
      if (!items.length) {
        listIsVirtualized = false;
        listEl.innerHTML = `
          <div class="empty empty-state">
            <strong>Your collection is empty.</strong>
            <span>Choose a music source and import tracks into the desktop app.</span>
            <div class="empty-actions">
              <button type="button" class="btn" id="list-empty-choose-folder-btn">Add Music</button>
              <button type="button" class="btn" id="list-empty-start-scan-btn">Start Scan</button>
            </div>
          </div>
        `;
        document.getElementById('list-empty-choose-folder-btn')?.addEventListener('click', () => {
          openAddMusicSourceModal();
        });
        document.getElementById('list-empty-start-scan-btn')?.addEventListener('click', () => {
          void triggerScan();
        });
        syncAddMusicUi();
        renderBulkToolbar();
        listEl.scrollTop = previousScrollTop;
        return;
      }
      if (!sorted.length) {
        listIsVirtualized = false;
        listEl.innerHTML = `
          <div class="empty empty-state">
            <strong>No tracks match this view.</strong>
            <span>Clear the current scope or filters to get back to the full collection.</span>
            <div class="empty-actions">
              <button type="button" class="btn" id="list-empty-clear-scope-btn">Clear Scope</button>
              <button type="button" class="btn" id="list-empty-clear-filters-btn">Clear Filters</button>
            </div>
          </div>
        `;
        document.getElementById('list-empty-clear-scope-btn')?.addEventListener('click', () => {
          activeArtistScope = '';
          activeAlbumScope = '';
          renderBrowseScope();
          renderList(tracks);
        });
        document.getElementById('list-empty-clear-filters-btn')?.addEventListener('click', () => {
          searchEl.value = '';
          bpmMinEl.value = '';
          bpmMaxEl.value = '';
          keyFilterEl.value = '';
          if (showOnlyNoBpmEl) showOnlyNoBpmEl.checked = false;
          hideUnknownArtistsEl.checked = false;
          activeQuickFilter = '';
          renderQuickFilters();
          void loadTracks();
        });
        renderBulkToolbar();
        listEl.scrollTop = previousScrollTop;
        document.getElementById('statusbar-select-all-visible-btn')?.addEventListener('click', () => {
          selectAllVisibleTracks();
        });
        return;
      }
      listIsVirtualized = shouldVirtualizeList(sorted.length);
      if (listIsVirtualized) renderVisibleTrackWindow(sorted, previousScrollTop);
      else renderTrackRows(sorted);
      listEl.scrollTop = previousScrollTop;
      document.getElementById('statusbar-select-all-visible-btn')?.addEventListener('click', () => {
        selectAllVisibleTracks();
      });
      renderBulkToolbar();
      updateNowPlayingBar();
    }

    // ── BPM editing ───────────────────────────────────────────────────────────
    async function saveBpm(trackId: number, newBpm: number) {
      const roundedBpm = Math.round(newBpm);
      const res = await fetch(`/api/tracks/${trackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bpm: roundedBpm }),
      });
      if (!res.ok) throw new Error('Could not save BPM.');
      // Update local tracks array
      const idx = tracks.findIndex((t) => t.id === trackId);
      if (idx !== -1) {
        tracks[idx] = { ...tracks[idx], bpm_override: roundedBpm, effective_bpm: roundedBpm };
        renderList(tracks);
      }
      if (selectedDetailTrackId === trackId || activeTrackId === trackId) {
        await loadTrackDetail(String(trackId), false);
      }
    }

    function adjustTapBpm(multiplier: number) {
      if (tapBpmValue <= 0) return;
      tapBpmValue = Math.max(1, Math.round((tapBpmValue * multiplier) * 10) / 10);
      tapBpmTapTimes = [];
      if (tapBpmStatusEl) {
        tapBpmStatusEl.textContent = multiplier > 1
          ? 'BPM doubled. Save it if it matches the groove.'
          : 'BPM halved. Save it if it matches the groove.';
      }
      updateTapBpmUi();
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
          try {
            const val = parseFloat(input.value);
            if (!isNaN(val) && val > 0) await saveBpm(trackId, val);
          } catch {
            showToast('Could not save BPM.', 'error');
          }
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
      const key = sectionStateKey(trackId, section);
      if (!(key in detailSectionCollapsed)) {
        return section === 'metadata-editor' || section === 'cover-match';
      }
      return Boolean(detailSectionCollapsed[key]);
    }

    function setDetailSectionCollapsed(trackId: number, section: string, collapsed: boolean) {
      detailSectionCollapsed[sectionStateKey(trackId, section)] = collapsed;
    }

    // ── Track detail ──────────────────────────────────────────────────────────
    function renderDetail(payload: Record<string, unknown>) {
      const track = payload.track as Record<string, unknown>;
      const otherTracks = relatedArtistTracks(track);
      const albums = artistAlbums(String(track.artist ?? ''));
      const coverUrl = (track.album_art_url as string) || '';
      const coverLabel = (track.album ?? track.title ?? 'Unknown') as string;
      const trackId = track.id as number;
      const streamProbeUrl = `/api/tracks/${trackId}/stream`;
      const trackPath = String(track.path ?? '');
      const isGoogleDriveTrack = isGoogleDriveTrackPath(trackPath);
      const playbackUrl = isGoogleDriveTrack ? streamProbeUrl : (adapter.mediaUrlForPath?.(trackPath) || streamProbeUrl);
      nextTracksByTrackId[trackId] = Array.isArray(payload.next_tracks) ? payload.next_tracks as Record<string, unknown>[] : [];
      const mult = getMult(trackId);
      const trackTags = Array.isArray(track.custom_tags) ? track.custom_tags as string[] : [];
      const nextPageSize = 10;
      const initialNextTracks = filteredNextTracksFor(trackId);
      const nextPageCount = Math.max(1, Math.ceil(initialNextTracks.length / nextPageSize));
      const currentNextPage = Math.min(nextTracksPageByTrackId[trackId] ?? 0, nextPageCount - 1);
      nextTracksPageByTrackId[trackId] = currentNextPage;
      const pagedNextTracks = initialNextTracks.slice(currentNextPage * nextPageSize, (currentNextPage + 1) * nextPageSize);
      const currentDetailMode = detailMode(trackId);
      const nextCollapsed = isDetailSectionCollapsed(trackId, 'next-tracks');
      const artistCollapsed = isDetailSectionCollapsed(trackId, 'artist-tracks');
      const metadataCollapsed = isDetailSectionCollapsed(trackId, 'metadata-editor');
      const coverCollapsed = isDetailSectionCollapsed(trackId, 'cover-match');
      const coverReviewStatus = String(track.album_art_review_status ?? (track.album_art_url ? 'approved' : 'missing'));
      const coverReviewNotes = String(track.album_art_review_notes ?? '');
      const coverSource = String(track.album_art_source ?? (track.album_art_url ? 'unknown' : 'none'));
      const coverConfidence = Number(track.album_art_confidence ?? 0);
      const coverStatusClass = coverReviewStatus === 'approved' ? 'success' : coverReviewStatus === 'missing' ? 'subtle' : 'warn';
      const tunebatUrl = tunebatUrlForTrack(track);
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
            <h2 id="detail-track-heading"><button type="button" class="nav-link hero-link" data-nav-kind="artist" data-nav-value="${esc(track.artist ?? 'Unknown Artist')}">${esc(track.artist ?? 'Unknown Artist')}</button> - ${esc(track.title ?? 'Untitled')}</h2>
            <div class="meta">
              <span>ID ${track.id}</span>
              <span>${bpmDisplay} BPM ${multButtons}</span>
              <span>${esc(track.effective_key ?? '--')}</span>
              <span><strong>Length</strong> ${formatDuration(track.duration)}</span>
              <span>${formatBitrate(track.bitrate)}</span>
            </div>
            <div class="meta meta-path">
              <span id="detail-track-path" title="${esc(trackSourceSummary(track))}">${esc(trackSourceSummary(track))}</span>
            </div>
            <div class="chips">
              ${albumNameFor(track) ? `<button type="button" class="chip nav-chip" data-nav-kind="album" data-nav-value="${esc(albumNameFor(track))}" data-nav-artist="${esc(track.artist ?? '')}">${esc(albumNameFor(track))}</button>` : ''}
              ${trackSourcesMarkup(track)}
              ${track.album_art_url ? '<span class="chip success">Album art</span>' : '<span class="chip subtle">No album art</span>'}
              ${track.analysis_status ? `<span class="chip subtle">${esc(track.analysis_status)}</span>` : ''}
              ${track.bpm_source ? `<span class="chip subtle">BPM ${esc(track.bpm_source)}</span>` : ''}
              ${track.decode_failed === 'true' ? '<span class="chip warn">Unreadable audio</span>' : ''}
            </div>
          </div>
        </div>
        <div class="detail-inner">
          <div class="detail-mode-tabs">
            <button type="button" class="detail-mode-tab ${currentDetailMode === 'overview' ? 'active' : ''}" data-detail-mode="overview">Overview</button>
            <button type="button" class="detail-mode-tab ${currentDetailMode === 'match' ? 'active' : ''}" data-detail-mode="match">Match / Metadata</button>
            <button type="button" class="detail-mode-tab ${currentDetailMode === 'related' ? 'active' : ''}" data-detail-mode="related">Related</button>
          </div>
          <div class="buttons">
            <button class="btn" id="play-btn" type="button"><span class="btn-icon">▶</span> Play</button>
            <button class="btn" id="reanalyze-bpm-btn" type="button">Reanalyze BPM</button>
            <button class="btn" id="reanalyze-art-btn" type="button">Reanalyze Art</button>
            ${track.album_art_url ? '<button class="btn" id="cover-btn" type="button">Album Cover</button>' : ''}
            <button class="btn" id="open-tunebat-btn" type="button" title="Open this track on Tunebat">Tunebat</button>
            ${track.youtube_url ? '<button class="btn" id="open-youtube-btn" type="button">YouTube</button>' : ''}
            ${sets.length > 0 ? `
              <div style="display:inline-flex;gap:6px;align-items:center;">
                <select id="set-select" style="background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:13px;">
                  ${setOptions}
                </select>
                <button class="btn" id="add-to-set-btn" type="button">+ Add to playlist</button>
                <button class="btn danger" id="delete-track-btn" type="button">Delete</button>
              </div>
            ` : `
              <div style="display:inline-flex;gap:6px;align-items:center;">
                <button class="btn" id="open-sets-btn" type="button">+ Add to playlist</button>
                <button class="btn danger" id="delete-track-btn" type="button">Delete</button>
              </div>
            `}
          </div>
          <div class="detail-sources">
            ${trackSourceDetailMarkup(track)}
          </div>
          <audio id="local-audio" class="local-audio-hidden" preload="auto" data-track-id="${trackId}" data-probe-url="${esc(streamProbeUrl)}" ${playbackUrl ? `src="${esc(playbackUrl)}"` : ''}></audio>
          <div class="waveform-panel detail-mode-section ${currentDetailMode === 'overview' ? '' : 'hidden'}" data-mode-section="overview">
            <canvas class="waveform-canvas" id="waveform-${track.id}"></canvas>
          </div>
          <div class="chips detail-mode-section ${currentDetailMode === 'overview' ? '' : 'hidden'}" data-mode-section="overview" style="margin-bottom:14px;">
            ${track.analysis_stage ? `<span class="chip subtle">Stage ${esc(track.analysis_stage)}</span>` : ''}
            ${track.spotify_id ? `<span class="chip success">Spotify matched</span>` : `<span class="chip subtle">No Spotify match</span>`}
            <span class="chip ${coverStatusClass}">Cover ${esc(coverReviewStatus)}</span>
            <span class="chip subtle">Source ${esc(coverSource || 'none')}</span>
            <span class="chip subtle">Score ${esc(coverConfidence.toFixed(1))}</span>
            ${track.analysis_error ? `<span class="chip warn">${esc(track.analysis_error)}</span>` : ''}
          </div>
          ${isGoogleDriveTrack ? '<div class="scan-preflight subtle">Google Drive track — first play will download to local cache.</div>' : ''}
          <section class="detail-section detail-mode-section ${currentDetailMode === 'match' ? 'hidden' : ''} ${nextCollapsed ? 'collapsed' : ''}" id="next-tracks-section" data-section="next-tracks" data-mode-section="overview">
            <div class="detail-section-head" id="next-tracks-head">
              <h3>Can play next</h3>
              <div class="detail-section-actions">
                <label class="preference-field detail-inline-select">
                  <span>Intent</span>
                  <select id="next-intent-select">
                    <option value="safe" ${nextTracksIntent === 'safe' ? 'selected' : ''}>Safe</option>
                    <option value="up" ${nextTracksIntent === 'up' ? 'selected' : ''}>Energy Up</option>
                    <option value="down" ${nextTracksIntent === 'down' ? 'selected' : ''}>Energy Down</option>
                    <option value="same" ${nextTracksIntent === 'same' ? 'selected' : ''}>Same Vibe</option>
                  </select>
                </label>
                <label class="scan-option compact detail-inline-toggle">
                  <input id="next-include-unknown-artists" type="checkbox" ${includeUnknownArtistsInNextTracks ? 'checked' : ''} />
                  Include Unknown Artist
                </label>
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
                    <small>${albumNameFor(item) ? `<button type="button" class="nav-link inline subtle" data-nav-kind="album" data-nav-value="${esc(albumNameFor(item))}" data-nav-artist="${esc(item.artist ?? '')}">${esc(albumNameFor(item))}</button> · ` : ''}<span data-raw-bpm="${item.effective_bpm ?? ''}" data-track-id="${item.id}">${displayBpm(item.effective_bpm, item.id as number)} BPM</span> · ${esc(item.effective_key ?? '--')} · ${formatBitrate(item.bitrate)} · ${esc(item.reason ?? '')}</small>
                  </div>
                `).join('') || `<div class="empty">${esc(nextTracksEmptyMessage())}</div>`}
              </div>
            </div>
          </section>
          <div class="artist-nav-panel detail-mode-section ${currentDetailMode === 'match' ? 'hidden' : ''}" data-mode-section="overview">
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
                      <small>${albumNameFor(item) ? `<button type="button" class="nav-link inline subtle" data-nav-kind="album" data-nav-value="${esc(albumNameFor(item))}" data-nav-artist="${esc(item.artist ?? '')}">${esc(albumNameFor(item))}</button> · ` : ''}<span data-raw-bpm="${item.effective_bpm ?? ''}" data-track-id="${item.id}">${displayBpm(item.effective_bpm, item.id as number)} BPM</span> · ${esc(item.effective_key ?? '--')} · ${formatBitrate(item.bitrate)}</small>
                    </div>
                  `).join('') || '<div class="empty">No other songs by this artist in the library.</div>'}
                </div>
              </div>
            </section>
          </div>
          <section class="detail-section detail-mode-section ${currentDetailMode === 'match' ? '' : 'hidden'} ${metadataCollapsed ? 'collapsed' : ''}" id="metadata-editor-section" data-section="metadata-editor" data-mode-section="match">
            <div class="detail-section-head" id="metadata-editor-head">
              <h3>Edit Metadata</h3>
              <div class="detail-section-actions">
                <button type="button" class="icon-btn detail-toggle-btn" id="metadata-editor-toggle-btn">${metadataCollapsed ? 'Expand' : 'Collapse'}</button>
              </div>
            </div>
            <div class="detail-section-body metadata-editor" id="metadata-editor-body" ${metadataCollapsed ? 'hidden' : ''}>
              <div class="metadata-grid">
                <label><span>Artist</span><input id="meta-artist" list="artist-suggestions" value="${esc(track.artist ?? '')}" /></label>
                <label><span>Title</span><input id="meta-title" value="${esc(track.title ?? '')}" /></label>
                <label><span>Album</span><input id="meta-album" list="album-suggestions" value="${esc(track.album ?? '')}" /></label>
                <label><span>Key</span><input id="meta-key" value="${esc(track.key ?? track.effective_key ?? '')}" /></label>
                <label class="metadata-wide"><span>Tags</span><input id="meta-tags" value="${esc(trackTags.join(', '))}" placeholder="warmup, vocal, peak-time" /></label>
                <label class="metadata-toggle"><input id="meta-ignored" type="checkbox" ${track.ignored ? 'checked' : ''} /><span>Ignored</span></label>
              </div>
              <div class="buttons">
                <button class="btn" id="save-metadata-btn" type="button">Save Metadata</button>
              </div>
            </div>
          </section>
          <section class="detail-section detail-mode-section ${currentDetailMode === 'match' ? '' : 'hidden'} ${coverCollapsed ? 'collapsed' : ''}" id="cover-match-section" data-section="cover-match" data-mode-section="match">
            <div class="detail-section-head" id="cover-match-head">
              <h3>Cover Match</h3>
              <div class="detail-section-actions">
                <button type="button" class="icon-btn detail-toggle-btn" id="cover-match-toggle-btn">${coverCollapsed ? 'Expand' : 'Collapse'}</button>
              </div>
            </div>
            <div class="detail-section-body metadata-editor cover-review-panel" id="cover-match-body" ${coverCollapsed ? 'hidden' : ''}>
              <div class="scan-summary">
                <div class="scan-summary-item"><span>Source</span><strong>${esc(coverSource || 'none')}</strong></div>
                <div class="scan-summary-item"><span>Confidence</span><strong>${esc(coverConfidence.toFixed(1))}</strong></div>
                <div class="scan-summary-item"><span>Status</span><strong>${esc(coverReviewStatus)}</strong></div>
                <div class="scan-summary-item"><span>Embedded</span><strong>${track.embedded_album_art ? 'yes' : 'no'}</strong></div>
              </div>
              <div class="chips">
                ${track.album_art_url ? '<button class="btn" id="approve-cover-btn" type="button">Approve Cover</button>' : ''}
                <button class="btn" id="upload-cover-btn" type="button">Upload Image</button>
                <button class="btn" id="paste-cover-btn" type="button">Paste Image</button>
                <input id="upload-cover-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden />
                <button class="btn" id="mark-cover-review-btn" type="button">Needs Review</button>
              </div>
              ${coverReviewNotes ? `<div class="scan-preflight">${esc(coverReviewNotes)}</div>` : ''}
            </div>
          </section>
        </div>
      `;

      attachBpmEdit(trackId);
      bindLibraryNavLinks(detailEl);

      const applyDetailMode = () => {
        const mode = detailMode(trackId);
        detailEl.querySelectorAll<HTMLElement>('[data-mode-section]').forEach((section) => {
          section.classList.toggle('hidden', section.dataset.modeSection !== mode);
        });
        detailEl.querySelectorAll<HTMLElement>('.detail-mode-tab[data-detail-mode]').forEach((button) => {
          button.classList.toggle('active', button.dataset.detailMode === mode);
        });
      };
      detailEl.querySelectorAll<HTMLElement>('.detail-mode-tab[data-detail-mode]').forEach((button) => {
        button.addEventListener('click', () => {
          setDetailMode(trackId, (button.dataset.detailMode as 'overview' | 'match' | 'related') ?? 'overview');
          applyDetailMode();
        });
      });
      applyDetailMode();

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
      document.getElementById('delete-track-btn')?.addEventListener('click', () => {
        openDeleteTracksModal([Number(track.id)], 'single');
      });
      // Suggestion clicks
      detailEl.querySelectorAll('.suggestion[data-track-id]').forEach((card) => {
        card.addEventListener('click', () => selectTrack((card as HTMLElement).dataset.trackId!, true));
      });
      document.getElementById('next-include-unknown-artists')?.addEventListener('change', (event) => {
        includeUnknownArtistsInNextTracks = (event.currentTarget as HTMLInputElement).checked;
        nextTracksPageByTrackId[trackId] = 0;
        renderNextTracksSection(trackId);
      });
      document.getElementById('next-intent-select')?.addEventListener('change', async (event) => {
        nextTracksIntent = (((event.currentTarget as HTMLSelectElement).value) === 'up'
          || ((event.currentTarget as HTMLSelectElement).value) === 'down'
          || ((event.currentTarget as HTMLSelectElement).value) === 'same'
          ? (event.currentTarget as HTMLSelectElement).value
          : 'safe') as 'safe' | 'up' | 'down' | 'same';
        nextTracksPageByTrackId[trackId] = 0;
        try {
          const response = await fetch(`/api/tracks/${trackId}?intent=${encodeURIComponent(nextTracksIntent)}`);
          if (!response.ok) throw new Error(`Could not refresh recommendations (${response.status})`);
          const refreshed = await response.json();
          nextTracksByTrackId[trackId] = Array.isArray(refreshed.next_tracks) ? refreshed.next_tracks as Record<string, unknown>[] : [];
          renderNextTracksSection(trackId);
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'Could not refresh recommendations.', 'error');
        }
      });
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
        if (section === 'next-tracks') renderNextTracksSection(trackId);
        else applyArtistTracksState();
      };
      const applySimpleSectionState = (section: 'metadata-editor' | 'cover-match') => {
        const sectionEl = document.getElementById(`${section}-section`);
        const body = document.getElementById(`${section}-body`);
        const toggleBtn = document.getElementById(`${section}-toggle-btn`) as HTMLButtonElement | null;
        if (!sectionEl || !body || !toggleBtn) return;
        const collapsed = isDetailSectionCollapsed(trackId, section);
        sectionEl.classList.toggle('collapsed', collapsed);
        body.hidden = collapsed;
        toggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
      };
      const toggleSimpleSection = (section: 'metadata-editor' | 'cover-match') => {
        setDetailSectionCollapsed(trackId, section, !isDetailSectionCollapsed(trackId, section));
        applySimpleSectionState(section);
      };
      document.getElementById('next-first-btn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        nextTracksPageByTrackId[trackId] = 0;
        renderNextTracksSection(trackId);
      });
      document.getElementById('next-prev-btn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        nextTracksPageByTrackId[trackId] = Math.max(0, (nextTracksPageByTrackId[trackId] ?? 0) - 1);
        renderNextTracksSection(trackId);
      });
      document.getElementById('next-next-btn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        const pageCount = Math.max(1, Math.ceil(filteredNextTracksFor(trackId).length / nextPageSize));
        nextTracksPageByTrackId[trackId] = Math.min(pageCount - 1, (nextTracksPageByTrackId[trackId] ?? 0) + 1);
        renderNextTracksSection(trackId);
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
      renderNextTracksSection(trackId);
      applyArtistTracksState();
      document.getElementById('metadata-editor-toggle-btn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleSimpleSection('metadata-editor');
      });
      document.getElementById('cover-match-toggle-btn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleSimpleSection('cover-match');
      });
      document.getElementById('metadata-editor-head')?.addEventListener('click', () => {
        toggleSimpleSection('metadata-editor');
      });
      document.getElementById('cover-match-head')?.addEventListener('click', () => {
        toggleSimpleSection('cover-match');
      });
      applySimpleSectionState('metadata-editor');
      applySimpleSectionState('cover-match');

      // Audio player
      const playBtn = document.getElementById('play-btn') as HTMLButtonElement | null;
      const reanalyzeBpmBtn = document.getElementById('reanalyze-bpm-btn') as HTMLButtonElement | null;
      const reanalyzeArtBtn = document.getElementById('reanalyze-art-btn') as HTMLButtonElement | null;
      const coverBtn = document.getElementById('cover-btn') as HTMLButtonElement | null;
      const localAudio = document.getElementById('local-audio') as HTMLAudioElement | null;
      const resumeKey = `dj-assist-resume-${track.id}`;
      let lastResumeStateWriteAt = 0;

      const loadResumeState = () => {
        try { return JSON.parse(sessionStorage.getItem(resumeKey) || 'null') || {}; } catch { return {}; }
      };
      const saveResumeState = (force = false) => {
        if (!localAudio) return;
        const now = performance.now();
        if (!force && now - lastResumeStateWriteAt < 750) return;
        lastResumeStateWriteAt = now;
        try { sessionStorage.setItem(resumeKey, JSON.stringify({ time: localAudio.currentTime, paused: localAudio.paused })); } catch { /* ignore */ }
      };

      if (playBtn && localAudio) {
        nowPlayingTrackId = trackId;
        localAudio.muted = audioMuted;
        updateNowPlayingBar(localAudio);
        const resumeState = loadResumeState();
        let resumeApplied = false;
        if (!isGoogleDriveTrack) {
          localAudio.load();
        }
        localAudio.addEventListener('loadedmetadata', () => {
          if (!resumeApplied && resumeState.time > 0) {
            localAudio.currentTime = Math.min(resumeState.time, (localAudio.duration || 0) - 0.25);
            resumeApplied = true;
            if (!resumeState.paused) localAudio.play().catch(() => {});
          }
          localAudio.muted = audioMuted;
          updateNowPlayingBar(localAudio);
        });
        localAudio.addEventListener('timeupdate', () => {
          saveResumeState();
          updateNowPlayingBar(localAudio);
        });
        localAudio.addEventListener('canplay', () => {
          localAudio.muted = audioMuted;
          updateNowPlayingBar(localAudio);
        });
        localAudio.addEventListener('waiting', () => {
          appendScanLog(`Playback buffer waiting for track ${trackId}`, 'warning', {
            category: 'playback',
            trackId,
            currentTime: Number(localAudio.currentTime ?? 0),
            readyState: Number(localAudio.readyState ?? 0),
            networkState: Number(localAudio.networkState ?? 0),
          });
        });
        localAudio.addEventListener('stalled', () => {
          appendScanLog(`Playback stalled for track ${trackId}`, 'warning', {
            category: 'playback',
            trackId,
            currentTime: Number(localAudio.currentTime ?? 0),
            readyState: Number(localAudio.readyState ?? 0),
            networkState: Number(localAudio.networkState ?? 0),
          });
        });
        localAudio.addEventListener('error', () => {
          const mediaError = localAudio.error;
          const code = mediaError?.code;
          const label =
            code === MediaError.MEDIA_ERR_ABORTED ? 'Playback aborted' :
            code === MediaError.MEDIA_ERR_NETWORK ? 'Audio network error' :
            code === MediaError.MEDIA_ERR_DECODE ? 'Audio decode error' :
            code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? 'Audio format not supported' :
            'Audio failed to load';
          showToast(label, 'error');
          updateNowPlayingBar(localAudio);

          const errorCodeName =
            code === MediaError.MEDIA_ERR_ABORTED ? 'MEDIA_ERR_ABORTED' :
            code === MediaError.MEDIA_ERR_NETWORK ? 'MEDIA_ERR_NETWORK' :
            code === MediaError.MEDIA_ERR_DECODE ? 'MEDIA_ERR_DECODE' :
            code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? 'MEDIA_ERR_SRC_NOT_SUPPORTED' :
            `unknown(${code})`;

          appendScanLog(`Audio error for track ${trackId}: ${label}`, 'error', {
            category: 'playback',
            trackId,
            errorCode: code,
            errorCodeName,
            errorMessage: mediaError?.message ?? null,
            src: localAudio.src,
            networkState: localAudio.networkState,
            readyState: localAudio.readyState,
            currentSrc: localAudio.currentSrc,
          });

          if (isGoogleDriveTrack) {
            appendScanLog(`Audio probe skipped for Google Drive track ${trackId}: no local playback file yet.`, 'warning', {
              category: 'playback',
              trackId,
              path: trackPath,
            });
            return;
          }

          const probeUrl = localAudio.dataset.probeUrl || streamProbeUrl;
          fetch(probeUrl, { headers: { Range: 'bytes=0-0' } })
            .then(async (response) => {
              appendScanLog(`Audio probe response for track ${trackId}`, 'info', {
                category: 'playback',
                trackId,
                probeUrl,
                status: response.status,
                contentType: response.headers.get('content-type'),
                contentRange: response.headers.get('content-range'),
                acceptRanges: response.headers.get('accept-ranges'),
              });
              if (response.status !== 404) return;
              const payload = await response.json().catch(() => ({}));
              if (String((payload as Record<string, unknown>).error ?? '') !== 'file missing') return;
              await pruneMissingTracks([trackId]);
            })
            .catch((probeErr) => {
              appendScanLog(`Audio probe fetch failed for track ${trackId}: ${probeErr instanceof Error ? probeErr.message : String(probeErr)}`, 'error', {
                category: 'playback',
                trackId,
                probeUrl,
              });
            });
        });
        playBtn.addEventListener('click', async () => {
          try {
            if (localAudio.paused) {
              await localAudio.play();
            } else {
              localAudio.pause();
            }
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Playback failed', 'error');
          }
        });
        const setPlaying = (playing: boolean) => {
          playBtn.classList.toggle('playing', playing);
          playBtn.innerHTML = playing ? '<span class="btn-icon">❚❚</span> Pause' : '<span class="btn-icon">▶</span> Play';
        };
        localAudio.addEventListener('play', () => { setPlaying(true); saveResumeState(true); updateNowPlayingBar(localAudio); });
        localAudio.addEventListener('pause', () => { setPlaying(false); saveResumeState(true); updateNowPlayingBar(localAudio); });
        localAudio.addEventListener('ended', () => {
          setPlaying(false);
          try { sessionStorage.removeItem(resumeKey); } catch { /* ignore */ }
          updateNowPlayingBar(localAudio);
          selectRelativeTrack(1);
        });
        // Sync global button to current state (e.g. resumed track)
        setPlaying(!localAudio.paused);
        updateNowPlayingBar(localAudio);
      }
      muteBtn?.addEventListener('click', () => {
        toggleCurrentAudioMute();
      });
      syncMuteButton(localAudio);
      if (localAudio) {
        void drawWaveform(trackId, playbackUrl ?? '', [], localAudio);
      }
      reanalyzeBpmBtn?.addEventListener('click', async () => {
        const previousLabel = reanalyzeBpmBtn.textContent ?? 'Reanalyze BPM';
        reanalyzeBpmBtn.disabled = true;
        reanalyzeBpmBtn.textContent = 'Analyzing…';
        appendScanLog(`Reanalyze BPM started for track ${trackId}: ${track.artist ?? 'Unknown Artist'} - ${track.title ?? 'Untitled'}`, 'info', {
          category: 'reanalyze-bpm',
          trackId,
          artist: String(track.artist ?? ''),
          title: String(track.title ?? ''),
          path: String(track.path ?? ''),
        });
        if (isGoogleDriveTrack) {
          appendScanLog(`Google Drive track ${trackId}: downloading a local cache copy before BPM analysis.`, 'info', {
            category: 'reanalyze-bpm',
            trackId,
            path: String(track.path ?? ''),
          });
        }
        try {
          const response = await fetch(`/api/tracks/${trackId}/reanalyze-bpm`, { method: 'POST' });
          const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
          const debugInfo = payload.debug && typeof payload.debug === 'object' ? payload.debug as Record<string, unknown> : undefined;
          const googleDriveDownload = debugInfo?.googleDriveDownload && typeof debugInfo.googleDriveDownload === 'object'
            ? debugInfo.googleDriveDownload as Record<string, unknown>
            : undefined;
          appendSpotifyDebugLog('Reanalyze BPM', debugInfo, { trackId, category: 'reanalyze-bpm' });
          appendSpotifyStderrLog('Reanalyze BPM', debugInfo?.stderr, { trackId, category: 'reanalyze-bpm' });
          if (googleDriveDownload) {
            appendScanLog(
              `Google Drive cache ready for track ${trackId}: ${String(googleDriveDownload.name ?? 'file')} (${googleDriveDownload.cached ? 'cached copy reused' : 'downloaded now'}).`,
              'info',
              { category: 'reanalyze-bpm', trackId, googleDriveDownload },
            );
          }
          if (!response.ok) {
            const stderr = String(debugInfo?.stderr ?? '').trim();
            const stdout = String(debugInfo?.stdout ?? '').trim();
            appendScanLog(`Reanalyze BPM failed for track ${trackId}: ${String(payload.error ?? 'BPM reanalysis failed.')}`, 'error', {
              category: 'reanalyze-bpm',
              trackId,
              debug: debugInfo,
            });
            if (stderr) appendScanLog(`Reanalyze BPM stderr for track ${trackId}: ${stderr.slice(0, 1200)}`, 'error', { category: 'reanalyze-bpm', trackId });
            if (stdout) appendScanLog(`Reanalyze BPM stdout for track ${trackId}: ${stdout.slice(0, 1200)}`, 'info', { category: 'reanalyze-bpm', trackId });
            showToast(String(payload.error ?? 'BPM reanalysis failed.'), 'error');
            return;
          }
          const refreshed = payload.track && typeof payload.track === 'object'
            ? payload.track as Record<string, unknown>
            : null;
          if (refreshed) {
            const index = tracks.findIndex((item) => Number(item.id) === trackId);
            if (index !== -1) tracks[index] = { ...tracks[index], ...refreshed };
            renderList(tracks);
          }
          await loadTrackDetail(String(trackId), false);
          appendScanLog(`Reanalyze BPM finished for track ${trackId}`, 'success', {
            category: 'reanalyze-bpm',
            trackId,
            bpm: Number(refreshed?.effective_bpm ?? refreshed?.bpm ?? 0),
            bpmConfidence: Number(refreshed?.bpm_confidence ?? 0),
            albumArtSource: String(refreshed?.album_art_source ?? ''),
            albumArtUrl: String(refreshed?.album_art_url ?? ''),
            debug: debugInfo,
          });
          const bpmValue = Number(refreshed?.effective_bpm ?? refreshed?.bpm ?? 0);
          const bpmConfidence = Number(refreshed?.bpm_confidence ?? 0);
          const confidenceLabel = bpmConfidence > 0 ? analyzerConfidenceLabel(bpmConfidence) : '';
          showToast(
            bpmValue > 0
              ? `${confidenceLabel === 'Low' ? 'Low-confidence result: ' : ''}BPM updated to ${Math.round(bpmValue)}.${confidenceLabel === 'Low' ? ' Verify with Tap BPM if needed.' : ''}`
              : 'No BPM could be detected for this file.',
            bpmValue > 0 ? (confidenceLabel === 'Low' ? 'warning' : 'success') : 'warning',
          );
        } catch (error) {
          appendScanLog(`Reanalyze BPM failed for track ${trackId}: ${error instanceof Error ? error.message : 'BPM reanalysis failed.'}`, 'error', {
            category: 'reanalyze-bpm',
            trackId,
          });
          showToast(error instanceof Error ? error.message : 'BPM reanalysis failed.', 'error');
        } finally {
          reanalyzeBpmBtn.disabled = false;
          reanalyzeBpmBtn.textContent = previousLabel;
        }
      });
      reanalyzeArtBtn?.addEventListener('click', async () => {
        const previousLabel = reanalyzeArtBtn.textContent ?? 'Reanalyze Art';
        reanalyzeArtBtn.disabled = true;
        reanalyzeArtBtn.textContent = 'Analyzing…';
        try {
          const { payload, refreshed } = await reanalyzeArtForTrack(trackId, { force: false, reloadDetail: true });
          showToast(
            String(payload.message ?? (refreshed?.album_art_url ? 'Artwork updated.' : 'No art found.')),
            refreshed?.album_art_url ? 'success' : 'warning',
          );
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'Artwork analysis failed.', 'error');
        } finally {
          reanalyzeArtBtn.disabled = false;
          reanalyzeArtBtn.textContent = previousLabel;
        }
      });
      document.getElementById('approve-cover-btn')?.addEventListener('click', async () => {
        await saveTrackMetadata(trackId, {
          album_art_review_status: 'approved',
          album_art_review_notes: 'manual approval from track detail',
        });
      });
      const uploadCoverBtn = document.getElementById('upload-cover-btn') as HTMLButtonElement | null;
      const uploadCoverInput = document.getElementById('upload-cover-input') as HTMLInputElement | null;
      uploadCoverBtn?.addEventListener('click', () => {
        uploadCoverInput?.click();
      });
      if (uploadCoverBtn && uploadCoverInput) {
        uploadCoverInput.addEventListener('change', async () => {
          const file = uploadCoverInput.files?.[0];
          uploadCoverInput.value = '';
          if (!file) return;
          uploadCoverBtn.disabled = true;
          try {
            const dataUrl = await readFileAsDataUrl(file);
            await saveManualCoverArt(trackId, dataUrl, 'manual_upload');
            showToast('Cover image uploaded.', 'success');
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Could not upload cover image.', 'error');
          } finally {
            uploadCoverBtn.disabled = false;
          }
        });
      }
      const pasteCoverBtn = document.getElementById('paste-cover-btn') as HTMLButtonElement | null;
      pasteCoverBtn?.addEventListener('click', async () => {
        pasteCoverBtn.disabled = true;
        try {
          const clipboard = navigator.clipboard as Clipboard & { read?: () => Promise<ClipboardItem[]> };
          if (!clipboard?.read) throw new Error('Clipboard image paste is not supported here.');
          const items = await clipboard.read();
          let imageFile: File | null = null;
          for (const item of items) {
            const imageType = item.types.find((type) => type.startsWith('image/'));
            if (!imageType) continue;
            const blob = await item.getType(imageType);
            imageFile = new File([blob], `clipboard.${imageType.split('/')[1] || 'png'}`, { type: imageType });
            break;
          }
          if (!imageFile) throw new Error('Clipboard does not contain an image.');
          const dataUrl = await readFileAsDataUrl(imageFile);
          await saveManualCoverArt(trackId, dataUrl, 'manual_paste');
          showToast('Cover image pasted from clipboard.', 'success');
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'Could not paste cover image.', 'error');
        } finally {
          pasteCoverBtn.disabled = false;
        }
      });
      document.getElementById('mark-cover-review-btn')?.addEventListener('click', async () => {
        await saveTrackMetadata(trackId, {
          album_art_review_status: 'needs_review',
          album_art_review_notes: 'marked for manual review from track detail',
        });
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
      document.getElementById('open-tunebat-btn')?.addEventListener('click', async () => {
        const opened = await adapter.openExternal(tunebatUrl);
        if (!opened) showToast('Could not open Tunebat.', 'error');
      });
      document.getElementById('open-youtube-btn')?.addEventListener('click', async () => {
        const youtubeUrl = String(track.youtube_url ?? '').trim();
        if (!youtubeUrl) return;
        const opened = await adapter.openExternal(youtubeUrl);
        if (!opened) showToast('Could not open YouTube.', 'error');
      });
      document.getElementById('prefer-local-source-btn')?.addEventListener('click', async () => {
        await saveTrackMetadata(trackId, { source_preference: 'local' });
        showToast('Track now prefers the local source.', 'success');
      });
      document.getElementById('prefer-drive-source-btn')?.addEventListener('click', async () => {
        await saveTrackMetadata(trackId, { source_preference: 'google_drive' });
        showToast('Track now prefers the Google Drive source.', 'success');
      });
      document.getElementById('clear-source-preference-btn')?.addEventListener('click', async () => {
        await saveTrackMetadata(trackId, { source_preference: null });
        showToast('Track source preference cleared.', 'success');
      });
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
            <div class="set-track-row" data-set-id="${setId}" data-entry-id="${esc(String(t.client_entry_id ?? ''))}">
              <div>
                <strong><button type="button" class="nav-link inline" data-nav-kind="artist" data-nav-value="${esc(t.artist ?? 'Unknown')}">${esc(t.artist ?? 'Unknown')}</button> - ${esc(t.title ?? 'Untitled')}</strong>
                <span>${albumNameFor(t) ? `<button type="button" class="nav-link inline subtle" data-nav-kind="album" data-nav-value="${esc(albumNameFor(t))}" data-nav-artist="${esc(t.artist ?? '')}">${esc(albumNameFor(t))}</button> · ` : ''}${t.bpm ? displayBpm(t.bpm, t.id as number) + ' BPM' : '--'} · ${esc(t.key ?? '--')}</span>
              </div>
              <button class="icon-btn danger remove-track-btn" data-set-id="${setId}" data-entry-id="${esc(String(t.client_entry_id ?? ''))}" title="Remove">✕</button>
            </div>
          `).join('') + `<div class="set-suggestions" id="set-suggestions-${setId}"><div class="scan-log-entry info">Loading intelligent suggestions…</div></div>`;
          bindLibraryNavLinks(tracksDiv);
          tracksDiv.querySelectorAll('.remove-track-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const sid = parseInt((btn as HTMLElement).dataset.setId!, 10);
              const entryId = String((btn as HTMLElement).dataset.entryId ?? '').trim();
              if (!entryId) return;
              await fetch(`/api/sets/${sid}/tracks/${encodeURIComponent(entryId)}`, { method: 'DELETE' });
              renderSetsPanel();
            });
          });
          const lastTrack = set.tracks[set.tracks.length - 1];
          if (lastTrack?.id) {
            const nextRes = await fetch(`/api/tracks/${lastTrack.id}?intent=${encodeURIComponent(nextTracksIntent)}`);
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
        const response = await fetch('/api/sets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          showToast(payload?.error || 'Could not create playlist.', 'error');
          return;
        }
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
      await refreshServerAccountAccess({ registerDevice: true });
      const issues: string[] = [];
      if (!runtimeHealth?.python_ok) issues.push(`Python runtime unavailable${runtimeHealth?.python_error ? `: ${String(runtimeHealth.python_error)}` : ''}`);
      if (!runtimeHealth?.database_url_set) issues.push('Local database unavailable');
      if (issues.length) {
        warningBanner.style.display = 'block';
        warningBanner.innerHTML = `<strong>Startup diagnostics:</strong> ${esc(issues.join(' | '))}`;
      } else if (warningBanner.textContent?.includes('Startup diagnostics:')) {
        warningBanner.style.display = 'none';
      }
      renderLibraryPanel();
      renderActivityPanel();
      syncGoogleAuthEntryPoint();
      syncAddMusicUi();
      if (googleSignedInUser()) {
        closeModal(googleAuthUpsellModal);
      }
      maybeOpenGoogleAuthUpsell();
    }

    async function loadWatchFolders() {
      const res = await fetch('/api/watch');
      if (!res.ok) return;
      watchFolders = (await res.json()).watches ?? [];
      renderActivityPanel();
    }

    function applySmartCrate(query: string) {
      if (query === 'bpm:missing') {
        if (showOnlyNoBpmEl) showOnlyNoBpmEl.checked = true;
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
      if (query === 'art:review') {
        searchEl.value = '';
        renderList(tracks.filter((track) => ['needs_review', 'missing', 'conflict'].includes(String(track.album_art_review_status ?? ''))));
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
        return;
      }
    }

    function startReviewMode(kind: 'art' | 'key' | 'decode' | 'attention') {
      const candidate = tracks.find((track) => {
        if (kind === 'art') return !track.album_art_url;
        if (kind === 'key') return !track.effective_key;
        if (kind === 'decode') return String(track.decode_failed ?? '') === 'true';
        return trackNeedsAttention(track);
      });
      if (!candidate) {
        showToast('Nothing to review in that category.', 'info');
        return;
      }
      if (kind === 'art') setActiveQuickFilter('missing-art');
      else if (kind === 'key') setActiveQuickFilter('missing-key');
      else if (kind === 'decode') setActiveQuickFilter('decode-failed');
      else setActiveQuickFilter('needs-attention');
      openPanel('track');
      void selectTrack(String(candidate.id), false);
    }

    function renderLibraryPanel() {
      if (!libraryOverview) {
        libraryPanel.innerHTML = '<div class="empty">Loading collection tools…</div>';
        return;
      }

      const smartCrates = (libraryOverview.smart_crates as Record<string, unknown>[]) ?? [];
      const artists = (libraryOverview.artists as Record<string, unknown>[]) ?? [];
      const tags = (libraryOverview.tags as Record<string, unknown>[]) ?? [];
      const googleOauth = googleOauthRuntimeSummary();
      const googleOauthConfigured = googleOauth?.configured === true;
      const googleDrive = googleDriveRuntimeSummary();
      const googleUser = googleSignedInUser();
      const accountUser = serverAccountSession?.user && typeof serverAccountSession.user === 'object'
        ? serverAccountSession.user as Record<string, unknown>
        : null;
      const accountEntitlementChips = serverEntitlements.size
        ? [...serverEntitlements].sort().map((capability) => `<span class="chip subtle">${esc(formatCapabilityLabel(capability))}</span>`).join('')
        : '<span class="chip subtle">No premium capabilities active</span>';
      const googleDriveCardMarkup = (!isProdFlavor || canUseGoogleDriveFeature()) ? `
          <section class="library-card">
            <div class="scan-log-head"><strong>Google Drive Import</strong></div>
            <div class="scan-preflight">Import audio file metadata from the connected Google Drive account into DJ Assist. Imported Drive items are added to the Songs list locally and synced to the server.</div>
            <div class="scan-preflight">Selected scope: ${esc(selectedGoogleDriveFolderLabel())}</div>
            <div class="scan-preflight" id="google-drive-import-status" data-state="idle">${esc(googleDriveRuntimeLabel())}</div>
            <div class="google-drive-import-progress-card" id="google-drive-import-progress-card" data-state="${esc(googleDriveImportStage)}">
              <div class="google-drive-import-progress-head">
                <div>
                  <strong id="google-drive-import-stage-label">${esc(googleDriveImportStageLabel)}</strong>
                  <span id="google-drive-import-stage-detail">${esc(googleDriveImportStageDetail)}</span>
                </div>
                <strong id="google-drive-import-stage-count">${googleDriveImportStageTotal > 0 ? esc(`${googleDriveImportStageCurrent} / ${googleDriveImportStageTotal}`) : (googleDriveImportBusy ? 'Working…' : '--')}</strong>
              </div>
              <div class="google-drive-import-progress-track">
                <div
                  class="google-drive-import-progress-bar ${googleDriveImportStageTotal > 0 ? '' : (googleDriveImportBusy ? 'indeterminate' : '')}"
                  id="google-drive-import-stage-bar"
                  data-indeterminate="${googleDriveImportStageTotal > 0 ? 'false' : (googleDriveImportBusy ? 'true' : 'false')}"
                  style="width:${googleDriveImportStageTotal > 0 ? `${Math.min(100, (googleDriveImportStageCurrent / Math.max(1, googleDriveImportStageTotal)) * 100)}%` : (googleDriveImportBusy ? '100%' : '0%')}"
                ></div>
              </div>
              <div class="google-drive-import-progress-meta">
                <span id="google-drive-import-stage-meta">${esc(googleDriveImportStageMeta)}</span>
                <span id="google-drive-import-stage-mode">${googleDriveImportStageTotal > 0 ? 'Measured progress' : (googleDriveImportBusy ? 'Stage progress' : 'Waiting')}</span>
                <span id="google-drive-import-stage-scope">${esc(selectedGoogleDriveFolderLabel())}</span>
              </div>
            </div>
            <div class="buttons">
              <button type="button" class="btn" id="google-drive-import-btn" ${googleUser && googleDrive?.connected ? '' : 'disabled'}>Import Google Drive Metadata</button>
              <button type="button" class="btn secondary" id="google-drive-preview-btn" ${googleUser && googleDrive?.connected ? '' : 'disabled'}>${googleDriveFilesLoaded ? 'Refresh Drive Files' : 'Preview Drive Files'}</button>
              <button type="button" class="btn secondary" id="google-drive-folder-picker-btn" ${googleUser && googleDrive?.connected ? '' : 'disabled'}>Choose Drive Folder</button>
              <button type="button" class="btn secondary" id="google-drive-connect-btn">${googleUser ? 'Manage Google' : 'Sign in with Google'}</button>
            </div>
            <div class="scan-history">
              ${googleDriveFilesLoaded
                ? (googleDriveFiles.length
                  ? googleDriveFiles.map((file) => `
                    <div class="scan-history-item">
                      <strong>${esc(String(file.name ?? 'Untitled'))}</strong>
                      <span>${esc(formatDriveFileSize(file.size))} · ${esc(formatDriveModifiedTime(file.modifiedTime))}</span>
                      <span>${esc(String(file.mimeType ?? 'audio'))}</span>
                    </div>
                  `).join('')
                  : '<div class="empty">No Drive audio files loaded yet.</div>')
                : `<div class="empty">Preview Google Drive files from ${esc(selectedGoogleDriveFolderLabel())} to inspect what the app can see before importing.</div>`}
            </div>
          </section>
      ` : `
          <section class="library-card">
            <div class="scan-log-head"><strong>Google Drive Import</strong></div>
            <div class="scan-preflight">${esc(googleDriveFeatureStatusLabel())}</div>
            <div class="buttons">
              <button type="button" class="btn secondary" id="google-drive-connect-btn">${googleSignedInUser() ? 'Manage Google' : 'Sign in with Google'}</button>
            </div>
          </section>
      `;

      libraryPanel.innerHTML = `
        <div class="library-grid">
          <section class="library-card">
            <div class="scan-log-head"><strong>Account Status</strong></div>
            <div class="scan-preflight">
              ${googleUser
                ? `${esc(String(accountUser?.email ?? googleUser.email ?? googleUser.name ?? 'Google user'))} · ${esc(accountPlanSummary())}`
                : (isProdFlavor ? 'Not signed in. Premium capabilities stay locked until you connect your account.' : 'Debug build keeps premium capabilities available without account gating.')}
            </div>
            <div class="scan-preflight">
              ${isProdFlavor
                ? (googleUser ? `Active capabilities: ${serverEntitlements.size}` : 'Capabilities will load after Google sign-in.')
                : 'Debug build: account checks are visible, but premium features stay unlocked for development.'}
            </div>
            <div class="chips">${accountEntitlementChips}</div>
            <div class="buttons">
              <button type="button" class="btn secondary" id="account-status-google-btn">${googleUser ? 'Manage Google' : 'Sign in with Google'}</button>
            </div>
          </section>
          <section class="library-card">
            <div class="scan-log-head"><strong>Library Reset</strong></div>
            <div class="scan-preflight">Clear tracks, playlists, scan history, and watched folders from this app database.</div>
            <div class="buttons">
              <button type="button" class="btn danger" id="reset-library-data-btn">Reset Library Data</button>
            </div>
          </section>
          ${googleDriveCardMarkup}
          <section class="library-card">
            <div class="scan-log-head"><strong>Preferences</strong></div>
            <div class="preferences-list">
              <label class="preference-row"><input id="pref-autoplay-on-select" type="checkbox" ${preferences.autoplayOnSelect ? 'checked' : ''} /><span>Autoplay when selecting tracks</span></label>
              <label class="preference-row"><input id="pref-load-library-on-startup" type="checkbox" ${preferences.loadLibraryOnStartup ? 'checked' : ''} /><span>Load existing library on startup</span></label>
              <label class="preference-row"><input id="pref-collapse-scan-log" type="checkbox" ${preferences.collapseScanLog ? 'checked' : ''} /><span>Keep scan log collapsed by default</span></label>
              <label class="preference-row"><input id="pref-scan-progress-toasts" type="checkbox" ${preferences.scanProgressToasts ? 'checked' : ''} /><span>Show scan progress toasts</span></label>
              <label class="preference-field">
                <span>Default list density</span>
                <select id="pref-default-list-density">
                  <option value="comfortable" ${preferences.defaultListDensity === 'comfortable' ? 'selected' : ''}>Comfortable</option>
                  <option value="compact" ${preferences.defaultListDensity === 'compact' ? 'selected' : ''}>Compact</option>
                </select>
              </label>
              <div class="preference-columns">
                <strong>Track list columns</strong>
                <label class="preference-row"><input id="pref-col-album" type="checkbox" ${preferences.listShowAlbum ? 'checked' : ''} /><span>Album</span></label>
                <label class="preference-row"><input id="pref-col-bitrate" type="checkbox" ${preferences.listShowBitrate ? 'checked' : ''} /><span>Bitrate</span></label>
                <label class="preference-row"><input id="pref-col-tags" type="checkbox" ${preferences.listShowTags ? 'checked' : ''} /><span>Tags</span></label>
                <label class="preference-row"><input id="pref-col-bpm-source" type="checkbox" ${preferences.listShowBpmSource ? 'checked' : ''} /><span>BPM source</span></label>
                <label class="preference-row"><input id="pref-col-key" type="checkbox" ${preferences.listShowKey ? 'checked' : ''} /><span>Key</span></label>
                <label class="preference-row"><input id="pref-col-length" type="checkbox" ${preferences.listShowLength ? 'checked' : ''} /><span>Length</span></label>
                <label class="preference-row"><input id="pref-col-recent" type="checkbox" ${preferences.listShowRecent ? 'checked' : ''} /><span>Recent marker</span></label>
              </div>
            </div>
          </section>
          ${isProdFlavor ? '' : `<section class="library-card" hidden>
            <div class="scan-log-head"><strong>Fast Scan Server</strong></div>
            <div class="preferences-list">
              <label class="preference-row"><input id="server-sync-enabled" type="checkbox" ${serverRuntimeSummary()?.enabled !== false ? 'checked' : ''} /><span>Send scan results to DJ Assist Server</span></label>
              <label class="preference-row"><input id="server-local-debug" type="checkbox" ${serverRuntimeSummary()?.localDebug ? 'checked' : ''} /><span>Local debug server</span></label>
              <label class="preference-field">
                <span>Server URL</span>
                <input id="server-url" value="${esc(String(serverRuntimeSummary()?.serverUrl ?? ''))}" autocomplete="off" spellcheck="false" />
              </label>
              <label class="preference-field">
                <span>Local server URL</span>
                <input id="server-local-url" value="${esc(String(serverRuntimeSummary()?.localServerUrl ?? 'http://localhost:3001'))}" autocomplete="off" spellcheck="false" />
              </label>
              <div class="scan-preflight" id="server-sync-status" data-state="idle">${esc(serverRuntimeLabel())}</div>
              <div class="scan-preflight">Google sign-in is optional. Signed-in users can fetch exact matches before local analysis; anonymous users only upload scan results.</div>
              <label class="preference-field">
                <span>Google Client ID</span>
                <input id="google-client-id" placeholder="${esc(String(googleOauth?.client_id_masked ?? 'Paste Google OAuth Client ID'))}" autocomplete="off" spellcheck="false" />
              </label>
              <label class="preference-field">
                <span>Google Client Secret</span>
                <input id="google-client-secret" type="password" placeholder="${googleOauth?.has_secret ? 'Saved secret on file' : 'Paste Google OAuth Client Secret'}" autocomplete="off" spellcheck="false" />
              </label>
              <div class="scan-preflight">Development setup only. Production builds include the app OAuth client automatically.</div>
              <div class="scan-preflight" id="google-oauth-status" data-state="idle">${esc(googleOauthRuntimeLabel())}</div>
              <div class="buttons">
                <button type="button" class="btn" id="server-settings-save-btn">Save Server Settings</button>
                <button type="button" class="btn" id="google-oauth-save-btn">Save Google Settings</button>
                <button type="button" class="btn" id="google-sign-in-btn">Sign in with Google</button>
                <button type="button" class="btn secondary" id="google-sign-out-btn">Sign out</button>
              </div>
            </div>
          </section>`}
          ${isProdFlavor ? '' : `<section class="library-card" hidden>
            <div class="scan-log-head"><strong>Spotify Credentials</strong></div>
            <div class="preferences-list">
              <label class="preference-field">
                <span>Client ID</span>
                <input id="spotify-client-id" placeholder="${esc(String(spotifyRuntimeSummary()?.client_id_masked ?? 'Paste Spotify Client ID'))}" autocomplete="off" spellcheck="false" />
              </label>
              <label class="preference-field">
                <span>Client Secret</span>
                <input id="spotify-client-secret" type="password" placeholder="${spotifyRuntimeSummary()?.has_secret ? 'Saved secret on file' : 'Paste Spotify Client Secret'}" autocomplete="off" spellcheck="false" />
              </label>
              <div class="scan-preflight" id="spotify-credentials-status" data-state="idle">${esc(spotifyRuntimeLabel())}</div>
              <div class="buttons">
                <button type="button" class="btn" id="spotify-save-test-btn">Save &amp; Test</button>
                <button type="button" class="btn" id="spotify-test-saved-btn">Test Saved</button>
              </div>
            </div>
          </section>`}
          ${isProdFlavor ? '' : `<section class="library-card" hidden>
            <div class="scan-log-head"><strong>Smart Crates</strong></div>
            <div class="chips">
              ${smartCrates.map((crate) => `<button type="button" class="chip nav-chip smart-crate-btn" data-query="${esc(crate.query)}">${esc(crate.label)} · ${esc(crate.count)}</button>`).join('')}
            </div>
            <div class="chips">
              ${tags.slice(0, 12).map((tag) => `<button type="button" class="chip nav-chip tag-filter-btn" data-tag="${esc(tag.tag)}">${esc(tag.tag)} · ${esc(tag.count)}</button>`).join('') || '<span class="chip subtle">No tags yet</span>'}
            </div>
          </section>`}
          ${isProdFlavor ? '' : `<section class="library-card" hidden>
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
          </section>`}
        </div>
      `;

      libraryPanel.querySelectorAll('.smart-crate-btn[data-query]').forEach((button) => {
        button.addEventListener('click', () => {
          document.querySelector('[data-panel="track"]')?.dispatchEvent(new MouseEvent('click'));
          applySmartCrate((button as HTMLElement).dataset.query ?? '');
        });
      });
      libraryPanel.querySelectorAll('.review-mode-btn[data-review-kind]').forEach((button) => {
        button.addEventListener('click', () => {
          startReviewMode(((button as HTMLElement).dataset.reviewKind as 'art' | 'key' | 'decode' | 'attention') ?? 'attention');
        });
      });
      document.getElementById('fill-visible-missing-art-btn')?.addEventListener('click', () => {
        const ids = visibleTracksOrdered()
          .filter((track) => !track.album_art_url)
          .map((track) => Number(track.id))
          .filter((id) => Number.isFinite(id));
        void reanalyzeArtBulk(ids, { label: 'visible filtered tracks' });
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
      libraryPanel.querySelectorAll('.cover-review-open-btn[data-track-id]').forEach((button) => {
        button.addEventListener('click', () => {
          document.querySelector('[data-panel="track"]')?.dispatchEvent(new MouseEvent('click'));
          void selectTrack((button as HTMLElement).dataset.trackId!, false);
        });
      });
      libraryPanel.querySelectorAll('.cover-review-approve-btn[data-track-id], .cover-review-mark-btn[data-track-id]').forEach((button) => {
        button.addEventListener('click', async () => {
          const trackId = parseInt((button as HTMLElement).dataset.trackId ?? '0', 10);
          const status = String((button as HTMLElement).dataset.status ?? 'approved');
          if (!trackId) return;
          await saveTrackMetadata(trackId, {
            album_art_review_status: status,
            album_art_review_notes: status === 'approved' ? 'manual approval from library review queue' : 'marked for manual cover review',
          });
        });
      });
      document.getElementById('pref-autoplay-on-select')?.addEventListener('change', (event) => {
        preferences.autoplayOnSelect = (event.currentTarget as HTMLInputElement).checked;
        savePreferences();
      });
      document.getElementById('pref-load-library-on-startup')?.addEventListener('change', (event) => {
        preferences.loadLibraryOnStartup = (event.currentTarget as HTMLInputElement).checked;
        savePreferences();
      });
      document.getElementById('pref-collapse-scan-log')?.addEventListener('change', (event) => {
        preferences.collapseScanLog = (event.currentTarget as HTMLInputElement).checked;
        savePreferences();
      });
      document.getElementById('pref-scan-progress-toasts')?.addEventListener('change', (event) => {
        preferences.scanProgressToasts = (event.currentTarget as HTMLInputElement).checked;
        savePreferences();
        syncProgressToastPreference();
        if (googleDriveImportBusy) {
          startGoogleDriveImportProgressPolling();
        }
      });
      document.getElementById('pref-default-list-density')?.addEventListener('change', (event) => {
        const value = (event.currentTarget as HTMLSelectElement).value === 'compact' ? 'compact' : 'comfortable';
        preferences.defaultListDensity = value;
        savePreferences();
        setListDensity(value);
      });
      const bindColumnPreference = (id: string, key: keyof Preferences) => {
        document.getElementById(id)?.addEventListener('change', (event) => {
          (preferences[key] as boolean) = (event.currentTarget as HTMLInputElement).checked;
          savePreferences();
          renderList(tracks);
        });
      };
      bindColumnPreference('pref-col-album', 'listShowAlbum');
      bindColumnPreference('pref-col-bitrate', 'listShowBitrate');
      bindColumnPreference('pref-col-tags', 'listShowTags');
      bindColumnPreference('pref-col-bpm-source', 'listShowBpmSource');
      bindColumnPreference('pref-col-key', 'listShowKey');
      bindColumnPreference('pref-col-length', 'listShowLength');
      bindColumnPreference('pref-col-recent', 'listShowRecent');
      document.getElementById('spotify-save-test-btn')?.addEventListener('click', () => {
        void submitSpotifyCredentials('save');
      });
      document.getElementById('spotify-test-saved-btn')?.addEventListener('click', () => {
        void submitSpotifyCredentials('test-current');
      });
      document.getElementById('spotify-client-secret')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void submitSpotifyCredentials('save');
      });
      document.getElementById('google-oauth-save-btn')?.addEventListener('click', () => {
        void submitGoogleOauthCredentials();
      });
      document.getElementById('google-client-id')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void submitGoogleOauthCredentials();
      });
      document.getElementById('server-settings-save-btn')?.addEventListener('click', () => {
        void submitServerSettings();
      });
      document.getElementById('server-local-url')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void submitServerSettings();
      });
      document.getElementById('google-sign-in-btn')?.addEventListener('click', () => {
        void signInWithGoogle();
      });
      document.getElementById('google-sign-out-btn')?.addEventListener('click', () => {
        void logoutGoogleAuth();
      });
      document.getElementById('google-drive-import-btn')?.addEventListener('click', () => {
        void importGoogleDriveMetadata();
      });
      document.getElementById('google-drive-preview-btn')?.addEventListener('click', () => {
        void loadGoogleDriveFiles();
      });
      document.getElementById('google-drive-folder-picker-btn')?.addEventListener('click', () => {
        void openGoogleDriveFolderModal();
      });
      document.getElementById('google-drive-folder-back-btn')?.addEventListener('click', () => {
        if (!googleDriveFolderTrail.length) return;
        const nextTrail = googleDriveFolderTrail.slice(0, -1);
        const parentId = nextTrail[nextTrail.length - 1]?.id ?? '';
        void loadGoogleDriveFolders({
          parentId,
          trail: nextTrail,
        });
      });
      document.getElementById('google-drive-folder-use-current-btn')?.addEventListener('click', () => {
        const current = googleDriveFolderTrail[googleDriveFolderTrail.length - 1];
        if (!current) return;
        applySelectedGoogleDriveFolder(current.id, current.name);
      });
      document.getElementById('google-drive-connect-btn')?.addEventListener('click', () => {
        void signInWithGoogle();
      });
      document.getElementById('account-status-google-btn')?.addEventListener('click', () => {
        openGoogleAuthModal();
      });
      document.getElementById('reset-library-data-btn')?.addEventListener('click', async () => {
        const confirmed = window.confirm('Reset the current DJ Assist library data? This clears tracks, playlists, scan history, and watched folders from the app database.');
      if (!confirmed) return;
      const response = await fetch('/api/library/reset', { method: 'POST' });
      if (!response.ok) {
        showToast('Could not reset the library data.', 'error');
        return;
      }
      stopStreamingScanJob();
      activeScanJobId = null;
      activeScanStatus = 'idle';
      frozenTrackIdsDuringScan = null;
      pendingTrackDetailTimer && clearTimeout(pendingTrackDetailTimer);
      pendingTrackDetailTimer = null;
      trackDetailAbortController?.abort();
      tracks = [];
      sets = [];
      scanHistory = [];
        libraryOverview = null;
        watchFolders = [];
        activeTrackId = null;
        nowPlayingTrackId = null;
        selectedDetailTrackId = null;
        selectedTrackIds.clear();
        activeArtistScope = '';
        activeAlbumScope = '';
        activeQuickFilter = '';
        recentNewTrackIds = new Set();
        hasScanBaseline = false;
        preScanTrackIds = new Set();
        searchEl.value = '';
        bpmMinEl.value = '';
        bpmMaxEl.value = '';
        keyFilterEl.value = '';
        if (showOnlyNoBpmEl) showOnlyNoBpmEl.checked = false;
        hideUnknownArtistsEl.checked = false;
        renderBrowseScope();
        renderQuickFilters();
        renderBulkToolbar();
        renderList(tracks);
        detailEl.innerHTML = '<div class="empty">Select a track from the library to view details.</div>';
        updateNowPlayingBar();
      await Promise.all([
        loadLibraryOverview(),
        loadWatchFolders(),
        loadScanHistory(),
      ]);
      setScanStatus('Idle');
      setScanProgress(0, 0, 'No scan in progress');
      resetScanLog();
      showToast('Library data reset.', 'success');
      });
    }

    function renderActivityPanel() {
      if (isProdFlavor || !activityPanel) return;
      const spotify = spotifyRuntimeSummary();
      const diagnostics = [
        { label: 'Database', ok: Boolean(runtimeHealth?.database_url_set), value: runtimeHealth?.database_path ?? 'Not configured' },
        { label: 'Python', ok: Boolean(runtimeHealth?.python_ok), value: runtimeHealth?.python_executable ?? runtimeHealth?.python ?? runtimeHealth?.python_error ?? 'Not available' },
        { label: 'Spotify', ok: Boolean(spotify?.configured), value: spotifyRuntimeLabel() },
        { label: 'Node', ok: true, value: runtimeHealth?.node ?? 'unknown' },
      ];
      activityPanel.innerHTML = `
        <div class="library-grid">
          <section class="library-card library-span">
            <div class="scan-log-head"><strong>Startup Diagnostics</strong></div>
            <div class="runtime-list">
              ${diagnostics.map((item) => `<div><strong>${esc(item.label)}</strong><span>${item.ok ? 'Ready' : 'Needs attention'} · ${esc(String(item.value ?? ''))}</span></div>`).join('')}
            </div>
          </section>
          <section class="library-card library-span">
            <div class="scan-log-head collapsible-log-title" id="activity-log-title" role="button" tabindex="0" aria-controls="activity-log-section-body"><strong>Backend Logs</strong></div>
            <div class="scan-preflight">Live backend activity appears here, including scan progress and server calls.</div>
            <div class="chips">
              <button type="button" class="chip nav-chip" id="refresh-activity-log-btn">Refresh Scan Log</button>
              <button type="button" class="chip nav-chip" id="copy-activity-log-btn">Copy Backend Logs (C)</button>
              <button type="button" class="chip nav-chip" id="activity-log-filter-all" aria-pressed="true">All Logs</button>
              <button type="button" class="chip nav-chip" id="activity-log-filter-bpm-missing" aria-pressed="false">BPM Failures Only</button>
              <button type="button" class="chip nav-chip" id="activity-open-collection-btn">Open Collection</button>
            </div>
            <div class="collapsible-log-section" id="activity-log-section-body">
              <div class="scan-progress-file bottom" id="scan-progress-file">No scan in progress</div>
              <div class="scan-log-head"><strong>Server Calls</strong></div>
              <div class="scan-history scan-server-call-list" id="activity-server-list">
                <div class="scan-log-entry info">No server calls yet.</div>
              </div>
              <div class="scan-log" id="activity-log-list">
                <div class="scan-log-entry info">No scan activity.</div>
              </div>
            </div>
          </section>
          <section class="library-card library-span">
            <div class="scan-log-head collapsible-log-title" id="frontend-log-title" role="button" tabindex="0" aria-controls="frontend-log-section-body"><strong>Frontend Logs</strong></div>
            <div class="scan-preflight" id="frontend-log-path">Loading renderer diagnostics…</div>
            <div class="chips">
              <button type="button" class="chip nav-chip" id="refresh-frontend-logs-btn">Refresh Frontend Logs</button>
              <button type="button" class="chip nav-chip" id="copy-frontend-logs-btn">Copy (C)</button>
            </div>
            <div class="collapsible-log-section" id="frontend-log-section-body">
              <div class="scan-log" id="frontend-log-list">
                <div class="scan-log-entry info">Loading frontend logs…</div>
              </div>
            </div>
          </section>
        </div>
      `;
      const loadClientLogFeed = async (options: { force?: boolean; silent?: boolean } = {}) => {
        const listEl = document.getElementById('frontend-log-list');
        const pathEl = document.getElementById('frontend-log-path');
        if (!listEl || !pathEl) return;
        if (frontendLogRefreshInFlight) return;
        frontendLogRefreshInFlight = true;
        const shouldShowLoading = options.silent !== true && !listEl.dataset.loaded;
        if (shouldShowLoading) {
          listEl.innerHTML = '<div class="scan-log-entry info">Loading frontend logs…</div>';
        }
        try {
        const response = await fetch('/api/logs/client?limit=300');
        if (!response.ok) {
          if (!listEl.dataset.loaded) {
            listEl.innerHTML = '<div class="scan-log-entry error">Could not load frontend logs.</div>';
          }
          pathEl.textContent = 'Renderer diagnostics unavailable.';
          return;
        }
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        const pathText = String(payload.path ?? '').trim();
        const pathLabel = pathText ? `Renderer diagnostics file: ${pathText}` : 'Renderer diagnostics file unavailable.';
        if (pathLabel !== frontendLogPathLabel) {
          frontendLogPathLabel = pathLabel;
          pathEl.textContent = pathLabel;
        }
        const entries = Array.isArray(payload.entries) ? payload.entries as Record<string, unknown>[] : [];
        const signature = JSON.stringify(entries.map((entry) => [
          String(entry.timestamp ?? ''),
          String(entry.level ?? 'info'),
          String(entry.category ?? ''),
          String(entry.message ?? ''),
        ]));
        if (options.force || signature !== frontendLogSignature || !listEl.dataset.loaded) {
          frontendLogSignature = signature;
          renderFrontendLogEntries(listEl, entries);
          listEl.dataset.loaded = 'true';
        }
        } finally {
          frontendLogRefreshInFlight = false;
        }
      };
      document.getElementById('refresh-activity-log-btn')?.addEventListener('click', () => {
        flushPendingScanLogs();
      });
      document.getElementById('copy-activity-log-btn')?.addEventListener('click', () => {
        void copyActivityLogs();
      });
      document.getElementById('activity-log-filter-all')?.addEventListener('click', () => {
        setActivityLogFilter('all');
      });
      document.getElementById('activity-log-filter-bpm-missing')?.addEventListener('click', () => {
        setActivityLogFilter('bpm-missing');
      });
      const toggleBackendLogs = () => {
        const collapsed = !readCollapsedState(activityScanLogCollapsedKey, preferences.collapseScanLog);
        writeCollapsedState(activityScanLogCollapsedKey, collapsed);
        syncCollapsibleLogSection({
          bodyId: 'activity-log-section-body',
          controlId: 'activity-log-title',
          storageKey: activityScanLogCollapsedKey,
          fallbackCollapsed: preferences.collapseScanLog,
        });
      };
      const toggleFrontendLogs = () => {
        const collapsed = !readCollapsedState(frontendLogCollapsedKey, false);
        writeCollapsedState(frontendLogCollapsedKey, collapsed);
        syncCollapsibleLogSection({
          bodyId: 'frontend-log-section-body',
          controlId: 'frontend-log-title',
          storageKey: frontendLogCollapsedKey,
        });
        if (!collapsed) void loadClientLogFeed({ force: true, silent: true });
      };
      const toggleOnEnterOrSpace = (event: KeyboardEvent, toggle: () => void) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle();
      };
      document.getElementById('activity-log-title')?.addEventListener('click', toggleBackendLogs);
      document.getElementById('activity-log-title')?.addEventListener('keydown', (event) => {
        toggleOnEnterOrSpace(event, toggleBackendLogs);
      });
      document.getElementById('activity-open-collection-btn')?.addEventListener('click', () => {
        openPanel('library');
      });
      syncActivityLogFilterUi();
      renderActivityLogEntries();
      document.getElementById('frontend-log-title')?.addEventListener('click', toggleFrontendLogs);
      document.getElementById('frontend-log-title')?.addEventListener('keydown', (event) => {
        toggleOnEnterOrSpace(event, toggleFrontendLogs);
      });
      document.getElementById('refresh-frontend-logs-btn')?.addEventListener('click', () => {
        void loadClientLogFeed({ force: true, silent: true });
      });
      document.getElementById('copy-frontend-logs-btn')?.addEventListener('click', () => {
        void copyFrontendLogs();
      });
      if (activityLogAutoRefreshTimer) clearInterval(activityLogAutoRefreshTimer);
      activityLogAutoRefreshTimer = setInterval(() => {
        flushPendingScanLogs();
        if (currentPanel === 'activity' && !readCollapsedState(frontendLogCollapsedKey, true)) {
          void loadClientLogFeed({ silent: true });
        }
      }, 3000);
      syncCollapsibleLogSection({
        bodyId: 'activity-log-section-body',
        controlId: 'activity-log-title',
        storageKey: activityScanLogCollapsedKey,
        fallbackCollapsed: true,
      });
      syncCollapsibleLogSection({
        bodyId: 'frontend-log-section-body',
        controlId: 'frontend-log-title',
        storageKey: frontendLogCollapsedKey,
        fallbackCollapsed: true,
      });
      renderServerCallSummary();
      flushPendingScanLogs();
      if (!readCollapsedState(frontendLogCollapsedKey, true)) {
        void loadClientLogFeed({ force: true, silent: false });
      }
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
          const status = String(event.status ?? 'running');
          activeScanStatus = String(event.status ?? 'running');
          ensureBackgroundRefreshLoop();
          setScanStatus(status, ['failed', 'cancelled'].includes(status) ? 'error' : status === 'completed' ? 'success' : 'running');
          setScanProgress(Number(event.current ?? 0), Number(event.total ?? 0), String(event.current_file ?? event.directory ?? ''));
          if (status === 'queued' || status === 'running') {
            maybeShowLocalScanProgressToast(
              Number(event.current ?? 0),
              Number(event.total ?? 0),
              String(event.current_file ?? event.directory ?? ''),
            );
          }
          setScanSummary(summary, { createdAt: scanHistory.find((job) => job.id === jobId)?.createdAt ?? null });
          if (['completed', 'failed', 'cancelled'].includes(status)) {
            frozenTrackIdsDuringScan = null;
            await loadScanHistory();
            if (status === 'completed') {
              const scanned = Number(summary?.scanned ?? 0);
              const analyzed = Number(summary?.analyzed ?? 0);
              await loadTracks(searchEl.value.trim());
              await loadLibraryOverview();
              updateRecentNewTrackIdsFromTracks(tracks);
              const newCount = recentNewTrackIds.size;
              showToast(
                newCount
                  ? `Scan finished: ${scanned} scanned, ${analyzed} analyzed, ${newCount} new.`
                  : `Scan finished: ${scanned} scanned, ${analyzed} analyzed.`,
                'success',
                newCount ? {
                  label: 'View New Tracks',
                  onClick: () => {
                    openPanel('track');
                    setActiveQuickFilter('new');
                  },
                } : undefined,
              );
              showProgressToast(
                'local-scan-progress',
                newCount
                  ? `Scan finished: ${scanned} scanned, ${analyzed} analyzed, ${newCount} new.`
                  : `Scan finished: ${scanned} scanned, ${analyzed} analyzed.`,
                'success',
                true,
              );
            } else if (status === 'cancelled') {
              showToast('Scan stopped.', 'warning');
              showProgressToast('local-scan-progress', 'Scan stopped.', 'warning', true);
            } else if (status === 'failed') {
              showToast('Scan failed.', 'error');
              showProgressToast('local-scan-progress', 'Scan failed.', 'error', true);
            }
          }
          return;
        }

        if (type === 'log') {
          if (Boolean(event.replay)) return;
          const rawLevel = String(event.level ?? 'info');
          const level = (rawLevel === 'error' || rawLevel === 'warning' || rawLevel === 'success' ? rawLevel : 'info') as 'info' | 'warning' | 'error' | 'success';
          appendScanLog(String(event.message ?? ''), level, undefined, {
            timestamp: typeof event.created_at === 'string' ? event.created_at : undefined,
            eventType: typeof event.eventType === 'string' ? event.eventType : undefined,
          });
          return;
        }

        if (type === 'track_start') {
          setScanProgress(Number(event.current ?? 0), Number(event.total ?? 0), String(event.file ?? event.path ?? 'Scanning…'));
          maybeShowLocalScanProgressToast(
            Number(event.current ?? 0),
            Number(event.total ?? 0),
            String(event.file ?? event.path ?? 'Scanning…'),
          );
          return;
        }

        if (type === 'track_complete') {
          const status = String(event.status ?? '');
          const reason = String(event.reason ?? '');
          const label = String(event.file ?? event.path ?? 'Track');
          setScanProgress(Number(event.current ?? 0), Number(event.total ?? 0), `${label} · ${status}`);
          maybeShowLocalScanProgressToast(
            Number(event.current ?? 0),
            Number(event.total ?? 0),
            `${label} · ${status || reason || 'done'}`,
          );
          queueDbRefresh(700, 'light');
          return;
        }

        if (type === 'scan_failed') {
          activeScanStatus = 'failed';
          frozenTrackIdsDuringScan = null;
          ensureBackgroundRefreshLoop();
          setScanStatus('failed', 'error');
          appendScanLog(String(event.error ?? 'Scan failed'), 'error');
          showToast('Scan failed.', 'error');
          showProgressToast('local-scan-progress', `Scan failed: ${String(event.error ?? 'Unknown error')}`, 'error', true);
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
      activeScanStatus = String(job.status ?? 'idle');
      if (['queued', 'running'].includes(activeScanStatus) && !frozenTrackIdsDuringScan) {
        frozenTrackIdsDuringScan = [...tracks]
          .sort(compareTracks)
          .map((track) => Number(track.id))
          .filter((id) => Number.isFinite(id));
      } else if (!['queued', 'running'].includes(activeScanStatus)) {
        frozenTrackIdsDuringScan = null;
      }
      ensureBackgroundRefreshLoop();
      if (typeof job.directory === 'string' && job.directory) {
        scanDirectoryEl.value = job.directory;
        updateScanDirectoryDisplay();
        pushRecentDirectory(job.directory);
      }
      setScanStatus(String(job.status ?? 'idle'), ['failed', 'cancelled'].includes(String(job.status ?? '')) ? 'error' : String(job.status ?? '') === 'completed' ? 'success' : 'running');
      setScanProgress(Number(job.processedFiles ?? 0), Number(job.totalFiles ?? 0), String(job.currentFile ?? job.directory ?? ''));
      setScanSummary(job.summary as Record<string, unknown>, job);
      const validation = (job.validation as Record<string, unknown> | null) ?? null;
      if (validation && typeof validation.audio_file_count !== 'undefined') {
        scanPreflightEl.textContent = `Supported audio files: ${validation.audio_file_count ?? 0}${validation.empty ? ' · directory looks empty' : ''}`;
      } else {
        scanPreflightEl.textContent = 'Music folder ready.';
      }
      resetScanLog();
      for (const log of ((job.logs ?? []) as Record<string, unknown>[]).slice().reverse()) {
        const level = String(log.level ?? 'info') as 'info' | 'warning' | 'error' | 'success';
        appendScanLog(String(log.message ?? ''), level, undefined, {
          timestamp: typeof log.created_at === 'string'
            ? log.created_at
            : typeof log.createdAt === 'string'
              ? log.createdAt
              : undefined,
          eventType: typeof log.eventType === 'string'
            ? log.eventType
            : typeof log.event_type === 'string'
              ? log.event_type
              : undefined,
        });
      }
      renderScanHistory();
      if (reconnect && ['queued', 'running'].includes(String(job.status ?? ''))) {
        await subscribeToScanJob(jobId);
      }
    }

    async function preflightDirectory(directory: string) {
      if (!directory.trim()) {
        scanPreflightEl.textContent = 'Choose a music folder to check.';
        return;
      }
      const res = await fetch(`/api/scan/validate?directory=${encodeURIComponent(directory)}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const raw = String(payload.error ?? 'Folder check failed');
        const lower = raw.toLowerCase();
        let friendly = raw;
        if (lower.includes('permission') || lower.includes('eacces') || lower.includes('eperm')) {
          friendly = 'Folder access was denied. Give DJ Assist permission to read that location in macOS Privacy & Security.';
        } else if (lower.includes('not found') || lower.includes('enoent')) {
          friendly = 'That folder could not be found. Choose an existing music folder.';
        } else if (lower.includes('not a directory')) {
          friendly = 'The selected path is not a folder. Choose a music folder instead.';
        }
        scanPreflightEl.textContent = friendly;
        return;
      }
      const validation = payload.validation ?? {};
      scanPreflightEl.textContent = `Supported audio files: ${validation.audio_file_count ?? 0}${validation.empty ? ' · directory looks empty' : ''}`;
    }

    // ── Scanning ──────────────────────────────────────────────────────────────
    async function triggerScan() {
      if (scanSourceMode === 'google_drive') {
        if (!googleSignedInUser()) {
          setScanStatus('Sign in with Google first', 'error');
          setScanProgress(0, 0, 'Google Drive access required');
          showToast('Sign in with Google before importing Drive tracks.', 'warning');
          openGoogleAuthModal();
          return;
        }
        if (!canUseGoogleDriveFeature()) {
          setScanStatus('Google Drive is locked', 'error');
          setScanProgress(0, 0, googleDriveFeatureStatusLabel());
          showToast(googleDriveFeatureStatusLabel(), 'warning');
          openGoogleAuthModal();
          return;
        }
        await importGoogleDriveMetadata();
        return;
      }
      const directory = scanDirectoryEl.value.trim();
      if (!directory) {
        setScanStatus('Choose a music source', 'error');
        setScanProgress(0, 0, 'Choose a music source');
        showToast('Choose a music source first.', 'warning');
        openAddMusicSourceModal();
        return;
      }

      activeScanStatus = 'queued';
      localScanToastLastAt = 0;
      localScanToastLastPercentBucket = -1;
      localScanToastLastLabel = '';
      frozenTrackIdsDuringScan = tracks.length
        ? [...tracks]
            .sort(compareTracks)
            .map((track) => Number(track.id))
            .filter((id) => Number.isFinite(id))
        : null;
      preScanTrackIds = new Set(tracks.map((track) => Number(track.id)).filter((id) => Number.isFinite(id)));
      hasScanBaseline = tracks.length > 0;
      ensureBackgroundRefreshLoop();
      setScanStatus('Scanning collection…', 'running');
      setScanProgress(0, 0, directory);
      showProgressToast('local-scan-progress', `Scanning collection · ${directory}`, 'info', false);
      warningBanner.style.display = 'none';
      resetScanLog();
      appendScanLog(`Starting scan for ${directory}`);

      try {
      try { localStorage.setItem(scanDirectoryKey, directory); } catch { /* ignore */ }
      pushRecentDirectory(directory);

        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            directory,
            fetchAlbumArt: true,
            fastScan: false,
            autoDoubleBpm: true,
            verbose: false,
            rescanMode: 'smart',
          }),
        });

        if (!res.ok) {
          frozenTrackIdsDuringScan = null;
          const detail = await res.text();
          setScanStatus('Scan failed', 'error');
          setScanProgress(0, 0, 'Scan request failed');
          appendScanLog(`Scan request failed: ${detail.slice(0, 200)}`, 'error');
          showToast('Scan could not be started.', 'error');
          warningBanner.style.display = 'block';
          warningBanner.innerHTML = `<strong>Scan failed:</strong> ${esc(detail.slice(0, 400))}`;
          return;
        }

        const payload = await res.json();
        const job = payload.job as Record<string, unknown>;
        activeScanJobId = String(job.id);
        activeScanStatus = String(job.status ?? 'queued');
        ensureBackgroundRefreshLoop();
        appendScanLog(`Scan job created: ${activeScanJobId}`, 'info');
        showToast('Scan started.', 'success');
        await loadScanHistory();
        await loadScanJob(activeScanJobId, true);
      } catch (error) {
        activeScanStatus = 'failed';
        frozenTrackIdsDuringScan = null;
        ensureBackgroundRefreshLoop();
        setScanStatus('Scan failed', 'error');
        setScanProgress(0, 0, 'Scan failed');
        appendScanLog(error instanceof Error ? error.message : String(error), 'error');
        showToast('Scan failed.', 'error');
        warningBanner.style.display = 'block';
        warningBanner.innerHTML = `<strong>Scan failed:</strong> ${esc(error instanceof Error ? error.message : String(error))}`;
      }
    }

    // ── Track loading ─────────────────────────────────────────────────────────
    async function loadTracks(query = '', options: { autoplayHighlighted?: boolean } = {}) {
      const { autoplayHighlighted = false } = options;
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (bpmMinEl.value) params.set('bpm_min', bpmMinEl.value);
      if (bpmMaxEl.value) params.set('bpm_max', bpmMaxEl.value);
      if (keyFilterEl.value) params.set('key', keyFilterEl.value);
      const res = await fetch(`/api/tracks?${params.toString()}`);
      const response = await res.json().catch(() => null) as Record<string, unknown> | null;
      if (!res.ok) {
        const message = String(response?.error ?? `Track refresh failed (${res.status})`);
        warningBanner.style.display = 'block';
        warningBanner.innerHTML = `<strong>Collection refresh failed:</strong> ${esc(message.slice(0, 400))}`;
        appendScanLog(`Collection refresh failed: ${message.slice(0, 200)}`, 'error');
        return;
      }
      if (!response || typeof response !== 'object') {
        const message = 'Track refresh returned an invalid response.';
        warningBanner.style.display = 'block';
        warningBanner.innerHTML = `<strong>Collection refresh failed:</strong> ${esc(message)}`;
        appendScanLog(`Collection refresh failed: ${message}`, 'error');
        return;
      }
      tracks = Array.isArray(response.tracks) ? response.tracks as Record<string, unknown>[] : [];
      refreshMetadataSuggestionLists();
      updateRecentNewTrackIdsFromTracks(tracks);
      for (const id of [...selectedTrackIds]) {
        if (!tracks.some((track) => Number(track.id) === id)) selectedTrackIds.delete(id);
      }
      const debug = (response.debug && typeof response.debug === 'object') ? response.debug as Record<string, unknown> : {};
      const missingEnv = Array.isArray(debug.spotify_missing)
        ? debug.spotify_missing.filter((value): value is string => typeof value === 'string')
        : [];
      if (!missingEnv.length && warningBanner.textContent?.includes('Missing setup:')) {
        warningBanner.style.display = 'none';
      }
      renderList(tracks);
      renderBulkToolbar();
      renderQuickFilters();
      if (!hasOpenModal()) {
        const visible = visibleTracksOrdered();
        if (autoplayHighlighted && visible.length) {
          const highlighted = activeTrackId != null
            ? visible.find((track) => Number(track.id) === activeTrackId) ?? null
            : null;
          const target = highlighted ?? visible[0] ?? null;
          if (target) {
            setKeyboardPane('list');
            void selectTrack(String(target.id), true, true);
            return;
          }
        }
        if (tracks.length && activeTrackId == null) {
          let storedId: number | null = null;
          try { storedId = Number(sessionStorage.getItem(activeTrackKey) || 0) || null; } catch { /* ignore */ }
          const preferred = storedId ? tracks.find((t) => t.id === storedId) ?? null : null;
          setKeyboardPane('list');
          void selectTrack(String((preferred ?? visible[0] ?? tracks[0]).id), false, true);
          return;
        }
        ensureActiveTrackSelection();
      }
    }

    function applyTrackSelection(id: string, ensureVisible = false) {
      activeTrackId = Number(id);
      nowPlayingTrackId = activeTrackId;
      try { sessionStorage.setItem(activeTrackKey, String(activeTrackId)); } catch { /* ignore */ }
      renderList(tracks);
      if (ensureVisible) {
        requestAnimationFrame(() => {
          listEl.querySelector<HTMLElement>(`.row[data-id="${activeTrackId}"]`)?.scrollIntoView({ block: 'nearest' });
        });
      }
    }

    function preserveHighlightedTrack(trackId: number, options: { ensureVisible?: boolean; focusList?: boolean } = {}) {
      const { ensureVisible = true, focusList = false } = options;
      if (!tracks.some((track) => Number(track.id) === trackId)) return;
      applyTrackSelection(String(trackId), ensureVisible);
      syncActiveTrackRowHighlight();
      if (focusList) setKeyboardPane('list', { focus: true });
    }

    async function loadTrackDetail(id: string, autoPlay = false) {
      const requestedTrackId = Number(id);
      const requestToken = ++trackDetailRequestToken;
      trackDetailAbortController?.abort();
      const abortController = new AbortController();
      trackDetailAbortController = abortController;
      if (!sets.length) {
        void loadSets().catch(() => {});
      }
      const params = new URLSearchParams({ intent: nextTracksIntent });
      let payload: Record<string, unknown>;
      try {
        const res = await fetch(`/api/tracks/${id}?${params.toString()}`, { signal: abortController.signal });
        payload = await res.json();
      } catch (error) {
        if (abortController.signal.aborted) return;
        showToast(error instanceof Error ? error.message : 'Could not load track details.', 'error');
        return;
      }
      if (requestToken !== trackDetailRequestToken || activeTrackId !== requestedTrackId) return;
      if (trackDetailAbortController === abortController) {
        trackDetailAbortController = null;
      }
      selectedDetailTrackId = requestedTrackId;
      renderDetail(payload);
      updateNowPlayingBar();
      if (autoPlay) {
        const localAudio = document.getElementById('local-audio') as HTMLAudioElement | null;
        localAudio?.play().catch(() => {});
      }
    }

    function scheduleTrackDetailLoad(id: string, autoPlay = false, delayMs = 0) {
      if (pendingTrackDetailTimer) {
        clearTimeout(pendingTrackDetailTimer);
        pendingTrackDetailTimer = null;
      }
      if (delayMs <= 0) {
        void loadTrackDetail(id, autoPlay);
        return;
      }
      pendingTrackDetailTimer = setTimeout(() => {
        pendingTrackDetailTimer = null;
        void loadTrackDetail(id, autoPlay);
      }, delayMs);
    }

    async function selectTrack(id: string, autoPlay = false, ensureVisible = false, detailDelayMs = 0) {
      applyTrackSelection(id, ensureVisible);
      scheduleTrackDetailLoad(id, autoPlay, detailDelayMs);
    }

    function playHighlightedTrackImmediately() {
      if (activeTrackId == null) return;
      const activeId = String(activeTrackId);
      const audio = document.getElementById('local-audio') as HTMLAudioElement | null;
      const audioMatchesSelection = String(audio?.dataset.trackId ?? '') === activeId;
      if (selectedDetailTrackId !== activeTrackId || !audio || !audioMatchesSelection) {
        void selectTrack(activeId, true, true, 0);
        return;
      }
      audio.play().catch(() => {});
    }

    // ── Keyboard playback toggle ─────────────────────────────────────────────
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (tapBpmModal?.classList.contains('open')) {
          closeModal(tapBpmModal);
          returnToSongsPane();
          return;
        }
        if (deleteTrackModal?.classList.contains('open')) {
          closeDeleteTracksModal();
          return;
        }
        if (quitAppModal?.classList.contains('open')) {
          void closeQuitAppModal();
          return;
        }
        if (editMetadataModal?.classList.contains('open')) {
          closeModal(editMetadataModal);
          return;
        }
        if (commandPaletteModal?.classList.contains('open')) {
          closeModal(commandPaletteModal);
          return;
        }
        if (shortcutsModal?.classList.contains('open')) {
          closeModal(shortcutsModal);
          return;
        }
        if (coverModal.classList.contains('open')) {
          closeModal(coverModal);
          return;
        }
        if (hasActiveCollectionFilters()) {
          clearCollectionFiltersAndScope();
          return;
        }
      }
      const target = event.target as HTMLElement | null;
      const isEditableTarget = Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'));
      if (tapBpmModal?.classList.contains('open')) {
        if (event.code === 'Space') {
          event.preventDefault();
          registerTapBpmTap();
        }
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'd' && deleteTrackModal?.classList.contains('open')) {
        const now = Date.now();
        const isQuickRepeat = now - lastDeleteShortcutAt <= deleteShortcutDoubleTapMs;
        if (isQuickRepeat && pendingDeleteTrackIds.length) {
          event.preventDefault();
          if (deleteTrackRemoveFileEl) deleteTrackRemoveFileEl.checked = true;
          void confirmDeleteTracks();
        }
        lastDeleteShortcutAt = 0;
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        commandPaletteActiveIndex = 0;
        openModal(commandPaletteModal);
        renderCommandPalette(commandPaletteInput?.value ?? '');
        commandPaletteInput?.focus();
        commandPaletteInput?.select();
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        commandPaletteActiveIndex = 0;
        openModal(commandPaletteModal);
        renderCommandPalette(commandPaletteInput?.value ?? '');
        commandPaletteInput?.focus();
        commandPaletteInput?.select();
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        openModal(shortcutsModal);
        return;
      }
      if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
        event.preventDefault();
        setKeyboardPane(activeKeyboardPane === 'list' ? 'detail' : 'list', { focus: true });
        return;
      }
      if (event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        stepSelectionInList(1);
        return;
      }
      if (event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        stepSelectionInList(-1);
        return;
      }
      if (isEditableTarget) {
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'm') {
        if (toggleCurrentAudioMute()) {
          event.preventDefault();
          return;
        }
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'c') {
        if (currentPanel === 'activity') {
          event.preventDefault();
          void copyActivityLogs();
          return;
        }
        event.preventDefault();
        void copyActiveTrackPath();
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && ['s', 'i'].includes(event.key.toLowerCase())) {
        if (activeTrackId != null) {
          event.preventDefault();
          toggleTrackSelection(activeTrackId);
        }
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'b') {
        if (activeTrackId != null) {
          event.preventDefault();
          openTapBpmModal();
        }
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'e') {
        if (activeTrackId != null) {
          event.preventDefault();
          openEditMetadataModal();
        }
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'd') {
        const now = Date.now();
        const isQuickRepeat = now - lastDeleteShortcutAt <= deleteShortcutDoubleTapMs;
        const selectedIds = [...selectedTrackIds].filter((id) => Number.isFinite(id));
        if (selectedIds.length) {
          event.preventDefault();
          lastDeleteShortcutAt = now;
          openDeleteTracksModal(selectedIds, 'bulk');
        } else if (activeTrackId != null) {
          event.preventDefault();
          lastDeleteShortcutAt = now;
          openDeleteTracksModal([activeTrackId], 'single');
        }
        return;
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchEl.focus();
        searchEl.select();
        return;
      }
      if (event.key === 'PageDown' && activeKeyboardPane === 'list') {
        event.preventDefault();
        stepSelectionInListPage(1);
        return;
      }
      if (event.key === 'PageUp' && activeKeyboardPane === 'list') {
        event.preventDefault();
        stepSelectionInListPage(-1);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        stepSelectionInList(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        stepSelectionInList(-1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        if (seekCurrentAudio(event.shiftKey ? -15 : -5)) {
          event.preventDefault();
          return;
        }
      }
      if (event.key === 'ArrowRight') {
        if (seekCurrentAudio(event.shiftKey ? 15 : 5)) {
          event.preventDefault();
          return;
        }
      }
      if (event.key === 'Enter' && activeTrackId != null) {
        event.preventDefault();
        playHighlightedTrackImmediately();
        return;
      }
      if (event.key.toLowerCase() === 'a' && activeTrack()) {
        event.preventDefault();
        navigateLibrary('artist', String(activeTrack()?.artist ?? ''));
        return;
      }
      if (event.key.toLowerCase() === 'l' && activeTrack() && albumNameFor(activeTrack() ?? {})) {
        event.preventDefault();
        const track = activeTrack();
        if (!track) return;
        navigateLibrary('album', albumNameFor(track), String(track.artist ?? ''));
        return;
      }
      if (event.code !== 'Space') return;
      const audio = document.getElementById('local-audio') as HTMLAudioElement | null;
      if (!audio) return;
      event.preventDefault();
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
    searchEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const firstVisible = visibleTracksOrdered()[0];
      if (!firstVisible) return;
      openPanel('track');
      setKeyboardPane('list', { focus: true });
      void selectTrack(String(firstVisible.id), true, true);
    });
    [bpmMinEl, bpmMaxEl].forEach((el) => el.addEventListener('input', () => {
      void loadTracks(searchEl.value.trim(), { autoplayHighlighted: true });
    }));
    keyFilterEl.addEventListener('input', () => {
      void loadTracks(searchEl.value.trim());
    });
    showOnlyNoBpmEl?.addEventListener('change', () => loadTracks(searchEl.value.trim()));
    hideUnknownArtistsEl.addEventListener('change', () => {
      renderList(tracks);
      if (selectedDetailTrackId != null) {
        void refreshSelectedTrackRecommendations({ resetPage: true });
      }
    });
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
      if (frozenTrackIdsDuringScan?.length && ['queued', 'running'].includes(activeScanStatus)) {
        frozenTrackIdsDuringScan = [...tracks]
          .sort(compareTracks)
          .map((track) => Number(track.id))
          .filter((id) => Number.isFinite(id));
      }
      setActiveSortButton(sortMode);
      renderList(tracks);
    });

    // ── Boot ──────────────────────────────────────────────────────────────────
    try {
      preferences = parsePreferences(localStorage.getItem(preferencesKey));
      const savedDirectory = localStorage.getItem(scanDirectoryKey);
      if (savedDirectory) scanDirectoryEl.value = savedDirectory;
      updateScanDirectoryDisplay();
      syncAddMusicUi();
      const savedNewTrackIds = JSON.parse(localStorage.getItem(recentNewTrackIdsKey) || '[]');
      if (Array.isArray(savedNewTrackIds)) {
        recentNewTrackIds = new Set(savedNewTrackIds.map((value) => Number(value)).filter((id) => Number.isFinite(id)));
      }
      setListDensity((localStorage.getItem(listDensityKey) as 'comfortable' | 'compact' | null) || preferences.defaultListDensity);
    } catch {
      updateScanDirectoryDisplay();
      syncAddMusicUi();
      preferences = { ...defaultPreferences };
      setListDensity(preferences.defaultListDensity);
    }
    document.getElementById('empty-choose-folder-btn')?.addEventListener('click', () => {
      openAddMusicSourceModal();
    });
    document.getElementById('empty-start-scan-btn')?.addEventListener('click', () => {
      void triggerScan();
    });
    quickChooseFolderBtn?.addEventListener('click', () => {
      openAddMusicSourceModal();
    });
    openCommandPaletteBtn?.addEventListener('click', () => {
      commandPaletteActiveIndex = 0;
      openModal(commandPaletteModal);
      renderCommandPalette(commandPaletteInput?.value ?? '');
      commandPaletteInput?.focus();
    });
    closeCommandPaletteBtn?.addEventListener('click', () => {
      closeModal(commandPaletteModal);
    });
    closeShortcutsBtn?.addEventListener('click', () => {
      closeModal(shortcutsModal);
    });
    closeEditMetadataBtn?.addEventListener('click', () => {
      closeModal(editMetadataModal);
      returnToSongsPane();
    });
    closeDeleteTrackBtn?.addEventListener('click', () => {
      closeDeleteTracksModal();
    });
    closeTapBpmBtn?.addEventListener('click', () => {
      closeModal(tapBpmModal);
      returnToSongsPane();
    });
    closeGoogleAuthUpsellBtn?.addEventListener('click', () => {
      dismissGoogleAuthUpsell();
    });
    closeGoogleDriveFolderModalBtn?.addEventListener('click', () => {
      closeModal(googleDriveFolderModal);
    });
    closeAddMusicSourceModalBtn?.addEventListener('click', () => {
      closeModal(addMusicSourceModal);
    });
    document.getElementById('add-music-source-local-btn')?.addEventListener('click', () => {
      void chooseLocalMusicSource();
    });
    document.getElementById('add-music-source-google-drive-btn')?.addEventListener('click', () => {
      if (!canUseGoogleDriveFeature()) {
        showToast(googleDriveFeatureStatusLabel(), 'warning');
        openGoogleAuthModal();
        return;
      }
      void chooseGoogleDriveMusicSource();
    });
    commandPaletteModal?.addEventListener('click', (event) => {
      if (event.target === commandPaletteModal) closeModal(commandPaletteModal);
    });
    shortcutsModal?.addEventListener('click', (event) => {
      if (event.target === shortcutsModal) closeModal(shortcutsModal);
    });
    editMetadataModal?.addEventListener('click', (event) => {
      if (event.target === editMetadataModal) {
        closeModal(editMetadataModal);
        returnToSongsPane();
      }
    });
    deleteTrackModal?.addEventListener('click', (event) => {
      if (event.target === deleteTrackModal) closeDeleteTracksModal();
    });
    quitAppModal?.addEventListener('click', (event) => {
      if (event.target === quitAppModal) {
        void closeQuitAppModal();
      }
    });
    tapBpmModal?.addEventListener('click', (event) => {
      if (event.target === tapBpmModal) {
        closeModal(tapBpmModal);
        returnToSongsPane();
      }
    });
    googleAuthUpsellModal?.addEventListener('click', (event) => {
      if (event.target === googleAuthUpsellModal) dismissGoogleAuthUpsell();
    });
    googleDriveFolderModal?.addEventListener('click', (event) => {
      if (event.target === googleDriveFolderModal) closeModal(googleDriveFolderModal);
    });
    addMusicSourceModal?.addEventListener('click', (event) => {
      if (event.target === addMusicSourceModal) closeModal(addMusicSourceModal);
    });
    deleteTrackModal?.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusables = [deleteTrackRemoveFileEl, confirmDeleteTrackBtn].filter(Boolean) as HTMLElement[];
      if (!focusables.length) return;
      const currentIndex = focusables.findIndex((element) => element === document.activeElement);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1)
        : (currentIndex === -1 || currentIndex >= focusables.length - 1 ? 0 : currentIndex + 1);
      event.preventDefault();
      focusables[nextIndex]?.focus();
    });
    quitAppModal?.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusables = [cancelQuitAppBtn, confirmQuitAppBtn].filter(Boolean) as HTMLElement[];
      if (!focusables.length) return;
      const currentIndex = focusables.findIndex((element) => element === document.activeElement);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1)
        : (currentIndex === -1 || currentIndex >= focusables.length - 1 ? 0 : currentIndex + 1);
      event.preventDefault();
      focusables[nextIndex]?.focus();
    });
    document.getElementById('save-edit-metadata-btn')?.addEventListener('click', () => {
      void saveEditMetadataModal();
    });
    googleAuthMainBtn?.addEventListener('click', () => {
      openGoogleAuthModal();
    });
    document.getElementById('google-auth-upsell-sign-in-btn')?.addEventListener('click', () => {
      dismissGoogleAuthUpsell();
      void signInWithGoogle();
    });
    document.getElementById('google-auth-modal-sign-out-btn')?.addEventListener('click', () => {
      void logoutGoogleAuth();
    });
    document.getElementById('google-auth-upsell-decline-btn')?.addEventListener('click', () => {
      dismissGoogleAuthUpsell();
      showToast('Quick scan stays unavailable until you sign in with Google.', 'info');
    });
    confirmDeleteTrackBtn?.addEventListener('click', () => {
      void confirmDeleteTracks();
    });
    closeQuitAppBtn?.addEventListener('click', () => {
      void closeQuitAppModal();
    });
    cancelQuitAppBtn?.addEventListener('click', () => {
      void closeQuitAppModal();
    });
    confirmQuitAppBtn?.addEventListener('click', () => {
      void confirmQuitApp();
    });
    tapBpmResetBtn?.addEventListener('click', () => {
      resetTapBpmState();
      tapBpmResetBtn?.focus();
    });
    tapBpmHalfBtn?.addEventListener('click', () => {
      adjustTapBpm(0.5);
      tapBpmHalfBtn?.focus();
    });
    tapBpmDoubleBtn?.addEventListener('click', () => {
      adjustTapBpm(2);
      tapBpmDoubleBtn?.focus();
    });
    tapBpmSaveBtn?.addEventListener('click', () => {
      void saveTapBpmValue();
    });
    tapBpmManualInputEl?.addEventListener('input', () => {
      const value = parseFloat(tapBpmManualInputEl.value);
      tapBpmTapTimes = [];
      tapBpmValue = Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : 0;
      if (tapBpmStatusEl) {
        tapBpmStatusEl.textContent = tapBpmValue > 0
          ? 'Manual BPM ready to save.'
          : 'Type a BPM value or tap Space repeatedly.';
      }
      updateTapBpmUi();
    });
    tapBpmManualInputEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void saveTapBpmValue();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal(tapBpmModal);
        returnToSongsPane();
      }
    });
    editMetadataModal?.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void saveEditMetadataModal();
      });
    });
    document.addEventListener('focusin', (event) => {
      const input = event.target as HTMLInputElement | null;
      if (!metadataSuggestionKeyForInput(input)) return;
      requestAnimationFrame(() => showInputSuggestions(input));
    });
    document.addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement | null;
      if (!metadataSuggestionKeyForInput(input)) return;
      syncMetadataSuggestions(input);
    });
    document.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement | null;
      if (!metadataSuggestionKeyForInput(input)) return;
      syncMetadataSuggestions(input, { closeOnExactMatch: true });
    });
    editMetadataModal?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      if ((event.target as HTMLElement | null)?.closest('button')) return;
      event.preventDefault();
      void saveEditMetadataModal();
    });
    deleteTrackModal?.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void confirmDeleteTracks();
      });
    });
    updateTapBpmUi();
    commandPaletteInput?.addEventListener('input', () => {
      renderCommandPalette(commandPaletteInput.value);
    });
    commandPaletteInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeModal(commandPaletteModal);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!commandPaletteResults.length) return;
        commandPaletteActiveIndex = Math.min(commandPaletteResults.length - 1, commandPaletteActiveIndex + 1);
        syncCommandPaletteSelection();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!commandPaletteResults.length) return;
        commandPaletteActiveIndex = Math.max(0, commandPaletteActiveIndex - 1);
        syncCommandPaletteSelection();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const active = commandPaletteList?.querySelector<HTMLElement>(`.command-palette-item[data-command-index="${commandPaletteActiveIndex}"]`);
        active?.click();
      }
    });
    quickStartScanBtn?.addEventListener('click', () => {
      void triggerScan();
    });
    const unsubscribeQuitRequest = adapter.onQuitRequested(() => {
      openQuitAppModal();
    });
    listEl.tabIndex = 0;
    detailEl.tabIndex = 0;
    listEl.addEventListener('focus', () => setKeyboardPane('list'));
    detailEl.addEventListener('focus', () => setKeyboardPane('detail'));
    setKeyboardPane('list');
    quickFilterBarEl?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('.quick-filter-btn[data-filter]');
      if (!button) return;
      setActiveQuickFilter(button.dataset.filter ?? '');
    });
    listEl.addEventListener('scroll', () => {
      if (!listIsVirtualized || !currentRenderedList.length) return;
      if (listScrollRaf) cancelAnimationFrame(listScrollRaf);
      listScrollRaf = requestAnimationFrame(() => {
        listScrollRaf = 0;
        const scrollTop = listEl.scrollTop;
        renderVisibleTrackWindow(currentRenderedList, scrollTop);
        listEl.scrollTop = scrollTop;
      });
    });
    listDensityEl?.addEventListener('change', () => {
      setListDensity(listDensityEl.value);
    });
    document.body.addEventListener('dragover', (event) => {
      event.preventDefault();
    });
    document.body.addEventListener('drop', (event) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files ?? []);
      const first = files[0];
      if (!first) return;
      const candidate = String((first as File & { path?: string }).path ?? '');
      if (!candidate) return;
      const directory = candidate.replace(/\/[^/]+$/, '');
      if (!directory) return;
      scanDirectoryEl.value = directory;
      void preflightDirectory(directory);
      showToast('Dropped folder ready to scan.', 'success');
    });
    scanDirectoryEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void triggerScan();
      }
    });
    setScanStatus('Idle');
    setScanProgress(0, 0, 'No scan in progress');
    resetScanLog();
    updateDesktopStatusBadge();
    renderQuickFilters();
    updateNowPlayingBar();
    ensureBackgroundRefreshLoop();
    updateScanDirectoryDisplay();
    renderBrowseScope();
    renderBulkToolbar();
    void preflightDirectory(scanDirectoryEl.value);
    loadSets().then(() => {
      renderBulkToolbar();
      if (preferences.loadLibraryOnStartup) {
        return loadTracks();
      }
      tracks = [];
      renderList(tracks);
      detailEl.innerHTML = `
        <div class="empty empty-state">
          <strong>Library autoload is turned off.</strong>
          <span>Your saved tracks are still in the app database, but they will stay hidden until you start a scan or load the library manually.</span>
          <div class="empty-actions">
            <button type="button" class="btn" id="startup-empty-load-library-btn">Load Library</button>
            <button type="button" class="btn" id="startup-empty-start-scan-btn">Start Scan</button>
          </div>
        </div>
      `;
      document.getElementById('startup-empty-load-library-btn')?.addEventListener('click', () => {
        void loadTracks(searchEl.value.trim());
      });
      document.getElementById('startup-empty-start-scan-btn')?.addEventListener('click', () => {
        void triggerScan();
      });
      syncAddMusicUi();
      return Promise.resolve();
    });
    void loadLibraryOverview();
    void loadRuntimeHealth();
    void loadWatchFolders();
    const handleWindowFocus = () => {
      void loadRuntimeHealth();
    };
    window.addEventListener('focus', handleWindowFocus);
    void loadScanHistory();

    return () => {
      stopStreamingScanJob();
      if (backgroundRefreshTimer) clearInterval(backgroundRefreshTimer);
      if (activityLogAutoRefreshTimer) clearInterval(activityLogAutoRefreshTimer);
      if (queuedDbRefreshTimer) clearTimeout(queuedDbRefreshTimer);
      if (scanLogFlushTimer) clearTimeout(scanLogFlushTimer);
      if (listScrollRaf) cancelAnimationFrame(listScrollRaf);
      if (searchTimer) clearTimeout(searchTimer);
      trackDetailAbortController?.abort();
      window.removeEventListener('focus', handleWindowFocus);
      unsubscribeQuitRequest();
    };
  }, [adapter]);

  return null;
}
