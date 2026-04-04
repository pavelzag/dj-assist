from __future__ import annotations

import logging
import socket

from flask import Flask, abort, jsonify, render_template_string, request, send_file
from werkzeug.exceptions import HTTPException

from .analyzer import get_recommended_next_tracks
from .db import Database
from .media import SpotifyClient, build_media_links


TEMPLATE = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DJ Assist</title>
  <style>
    :root { color-scheme: dark; --bg: #0b1020; --panel: #121a33; --line: #25304f; --text: #e8ecff; --muted: #95a2cc; --accent: #7c5cff; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: linear-gradient(135deg, #08101f, #10162a 52%, #0d1020); color: var(--text); }
    header { padding: 20px 24px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; gap: 16px; align-items: center; }
    header h1 { margin: 0; font-size: 18px; letter-spacing: 0.08em; text-transform: uppercase; }
    header input { width: min(520px, 100%); background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
    .filters { display: flex; gap: 8px; flex-wrap: wrap; margin-left: 12px; align-items: center; }
    .filters input { width: 120px; background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; }
    .filters label { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; border: 1px solid var(--line); border-radius: 999px; padding: 9px 12px; background: rgba(255,255,255,0.03); }
    .filters input[type="checkbox"] { width: auto; margin: 0; }
    .filters .badge { display: inline-flex; align-items: center; gap: 6px; padding: 9px 12px; border-radius: 999px; border: 1px solid var(--line); background: rgba(255,255,255,0.03); color: var(--muted); font-size: 12px; }
    .sorts { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 18px 12px; }
    .sorts button { background: rgba(255,255,255,0.03); color: var(--text); border: 1px solid var(--line); border-radius: 999px; padding: 8px 12px; cursor: pointer; }
    .sorts button.active { background: rgba(124, 92, 255, 0.25); border-color: rgba(124, 92, 255, 0.7); }
    .sort-group { display: flex; gap: 6px; }
    main { display: grid; grid-template-columns: 1.05fr 0.95fr; min-height: calc(100vh - 74px); }
    .pane { padding: 18px; }
    .list, .detail { background: rgba(18, 26, 51, 0.82); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
    .list { height: calc(100vh - 120px); overflow: auto; }
    .row { display: grid; grid-template-columns: 44px 1.3fr 90px 72px; gap: 12px; padding: 12px 14px; border-bottom: 1px solid rgba(37, 48, 79, 0.55); cursor: pointer; align-items: center; }
    .row:hover, .row.active { background: rgba(124, 92, 255, 0.16); }
    .row strong { display: block; font-size: 14px; }
    .row span { color: var(--muted); font-size: 12px; }
    .thumb { width: 44px; height: 44px; border-radius: 12px; object-fit: cover; background: #0a1020; border: 1px solid rgba(255,255,255,0.08); }
    .thumb.placeholder { display: grid; place-items: center; color: var(--muted); font-size: 16px; font-weight: 700; }
    .detail { min-height: calc(100vh - 120px); overflow: hidden; }
    .hero { position: relative; min-height: 300px; padding: 22px; display: grid; grid-template-columns: 220px 1fr; gap: 18px; align-items: end; border-bottom: 1px solid var(--line); overflow: hidden; }
    .hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(12,18,36,0.92), rgba(12,18,36,0.5)); z-index: 0; }
    .hero-art { position: absolute; inset: 0; background-size: cover; background-position: center; filter: blur(22px) saturate(1.1); transform: scale(1.08); opacity: 0.24; }
    .hero-cover { position: relative; z-index: 1; width: 220px; aspect-ratio: 1 / 1; border-radius: 20px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 18px 48px rgba(0,0,0,0.35); background: #0a1020; display: grid; place-items: center; }
    .hero-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .hero-cover.no-art { background: linear-gradient(135deg, rgba(124, 92, 255, 0.22), rgba(7, 12, 24, 0.92)); }
    .cover-placeholder { display: grid; place-items: center; gap: 10px; text-align: center; padding: 18px; color: #d7ddf7; }
    .cover-placeholder .icon { font-size: 42px; line-height: 1; }
    .cover-placeholder small { color: var(--muted); }
    .hero-copy { position: relative; z-index: 1; }
    .detail h2 { margin: 0 0 8px; font-size: 30px; line-height: 1.05; }
    .meta { color: var(--muted); display: flex; flex-wrap: wrap; gap: 10px; font-size: 13px; margin: 14px 0 16px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
    .chip { background: rgba(124, 92, 255, 0.15); color: #d9d1ff; border: 1px solid rgba(124, 92, 255, 0.35); padding: 6px 10px; border-radius: 999px; font-size: 12px; }
    .chip.warn { background: rgba(255, 173, 51, 0.14); color: #ffd48a; border-color: rgba(255, 173, 51, 0.38); }
    .chip.success { background: rgba(54, 197, 126, 0.14); color: #9cf4c7; border-color: rgba(54, 197, 126, 0.4); }
    .chip.subtle { background: rgba(255,255,255,0.04); color: var(--muted); border-color: rgba(255,255,255,0.08); }
    .detail-inner { padding: 18px; }
    .buttons { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); color: var(--text); text-decoration: none; background: rgba(255,255,255,0.04); cursor: pointer; }
    .btn:hover { border-color: rgba(124, 92, 255, 0.7); }
    .btn.playing { background: rgba(124, 92, 255, 0.3); border-color: rgba(124, 92, 255, 0.85); }
    .btn-icon { width: 18px; height: 18px; display: inline-grid; place-items: center; }
    .scrub-row { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font-size: 12px; margin-bottom: 8px; font-variant-numeric: tabular-nums; }
    .scrub-row span { line-height: 1; }
    .scrub-separator { opacity: 0.7; margin: 0 1px; }
    .embed-wrap { display: none; margin: 0 0 18px; border: 1px solid var(--line); border-radius: 16px; overflow: hidden; background: #000; }
    .embed-wrap.open { display: block; }
    .embed-wrap iframe { width: 100%; min-height: 352px; border: 0; display: block; }
    audio { width: 100%; margin-bottom: 18px; display: none; }
    .spotify-inline { display: grid; gap: 12px; margin: 0 0 18px; }
    .spotify-inline button { width: fit-content; }
    .spotify-embed { display: none; border: 1px solid var(--line); border-radius: 16px; overflow: hidden; background: #000; }
    .spotify-embed.open { display: block; }
    .spotify-embed iframe { width: 100%; min-height: 160px; border: 0; display: block; }
    .spotify-empty { color: var(--muted); padding: 16px; border: 1px dashed var(--line); border-radius: 16px; }
    details.debug { margin-top: 14px; border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; background: rgba(255,255,255,0.03); }
    details.debug summary { cursor: pointer; color: var(--muted); }
    pre.debug-text { white-space: pre-wrap; word-break: break-word; margin: 10px 0 0; color: #d7ddf7; font-size: 12px; }
    .suggestions { display: grid; gap: 10px; }
    .suggestion { border: 1px solid var(--line); border-radius: 14px; padding: 12px; background: rgba(255,255,255,0.03); cursor: pointer; transition: border-color 0.15s ease, transform 0.15s ease, background 0.15s ease; }
    .suggestion:hover { border-color: rgba(124, 92, 255, 0.7); background: rgba(124, 92, 255, 0.08); transform: translateY(-1px); }
    .suggestion small { color: var(--muted); }
    .empty { color: var(--muted); padding: 20px; }
    .banner { margin: 16px 18px 0; padding: 12px 14px; border-radius: 14px; border: 1px solid rgba(255, 89, 89, 0.45); background: rgba(255, 89, 89, 0.12); color: #ffd1d1; }
    .banner strong { color: #fff; }
    @media (max-width: 960px) {
      main { grid-template-columns: 1fr; }
      .list, .detail { height: auto; min-height: unset; }
      .hero { grid-template-columns: 1fr; }
      .hero-cover { width: 100%; max-width: 320px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>DJ Assist</h1>
    <input id="search" placeholder="Search tracks, artist, album..." />
      <div class="filters">
      <input id="bpm-min" type="number" step="0.1" placeholder="BPM min" />
      <input id="bpm-max" type="number" step="0.1" placeholder="BPM max" />
      <input id="key-filter" placeholder="Key" />
      <label><input id="show-only-no-bpm" type="checkbox" /> Show only no BPM</label>
      <span class="badge" id="hidden-count-badge">Hidden: 0</span>
    </div>
  </header>
    <div class="banner" id="warning-banner" style="display:none;"></div>
    <div class="statusbar" id="statusbar"></div>
    <main>
    <section class="pane">
      <div class="sorts" id="sorts">
        <button type="button" data-sort="name" class="active">Name</button>
        <div class="sort-group">
          <button type="button" data-sort="artist-asc">Artist ▲</button>
          <button type="button" data-sort="artist-desc">Artist ▼</button>
        </div>
        <div class="sort-group">
          <button type="button" data-sort="bpm-asc">BPM ▲</button>
          <button type="button" data-sort="bpm-desc">BPM ▼</button>
        </div>
        <div class="sort-group">
          <button type="button" data-sort="key-asc">Key ▲</button>
          <button type="button" data-sort="key-desc">Key ▼</button>
        </div>
        <div class="sort-group">
          <button type="button" data-sort="duration-asc">Dur ▲</button>
          <button type="button" data-sort="duration-desc">Dur ▼</button>
        </div>
      </div>
      <div class="list" id="track-list"></div>
    </section>
    <section class="pane">
      <div class="detail" id="detail">
        <div class="empty">Select a track to see details and what can follow it.</div>
      </div>
    </section>
  </main>
  <div class="modal" id="cover-modal" aria-hidden="true">
    <div class="modal-card">
      <div class="modal-head">
        <h3 id="cover-title">Album cover</h3>
        <button class="close" id="close-cover" type="button">&times;</button>
      </div>
      <img id="cover-image" alt="Album cover" />
    </div>
  </div>
  <script>
    const listEl = document.getElementById('track-list');
    const detailEl = document.getElementById('detail');
    const searchEl = document.getElementById('search');
    const bpmMinEl = document.getElementById('bpm-min');
    const bpmMaxEl = document.getElementById('bpm-max');
    const keyFilterEl = document.getElementById('key-filter');
    const showOnlyNoBpmEl = document.getElementById('show-only-no-bpm');
    const hiddenCountBadge = document.getElementById('hidden-count-badge');
    const sortsEl = document.getElementById('sorts');
    const sortModeEl = document.getElementById('sort-mode');
    const coverModal = document.getElementById('cover-modal');
    const coverImage = document.getElementById('cover-image');
    const coverTitle = document.getElementById('cover-title');
    const closeCover = document.getElementById('close-cover');
    const warningBanner = document.getElementById('warning-banner');
    const statusbar = document.getElementById('statusbar');
    const activeTrackKey = 'dj-assist-active-track-id';
    let activeTrackId = null;
    let tracks = [];
    let sortMode = 'bpm-asc';

    function esc(value) {
      return String(value ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
    }

    function formatDuration(seconds) {
      if (!seconds) return '--:--';
      const minutes = Math.floor(seconds / 60);
      const remainder = Math.floor(seconds % 60);
      return `${minutes}:${String(remainder).padStart(2, '0')}`;
    }

    function compareTracks(a, b) {
      if (sortMode === 'name') {
        return String(a.title || '').localeCompare(String(b.title || '')) || String(a.artist || '').localeCompare(String(b.artist || ''));
      }
      if (sortMode === 'artist-asc' || sortMode === 'artist-desc') {
        const av = String(a.artist || '');
        const bv = String(b.artist || '');
        if (av !== bv) return sortMode === 'artist-asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        return String(a.title || '').localeCompare(String(b.title || ''));
      }
      if (sortMode === 'bpm-asc' || sortMode === 'bpm-desc') {
        const av = Number(a.effective_bpm || 0);
        const bv = Number(b.effective_bpm || 0);
        if (av !== bv) return sortMode === 'bpm-asc' ? av - bv : bv - av;
        return String(a.artist || '').localeCompare(String(b.artist || '')) || String(a.title || '').localeCompare(String(b.title || ''));
      }
      if (sortMode === 'key-asc' || sortMode === 'key-desc') {
        const ak = String(a.effective_key || '');
        const bk = String(b.effective_key || '');
        if (ak !== bk) return sortMode === 'key-asc' ? ak.localeCompare(bk) : bk.localeCompare(ak);
        const av = Number(a.effective_bpm || 0);
        const bv = Number(b.effective_bpm || 0);
        if (av !== bv) return sortMode === 'key-asc' ? av - bv : bv - av;
        return String(a.artist || '').localeCompare(String(b.artist || '')) || String(a.title || '').localeCompare(String(b.title || ''));
      }
      if (sortMode === 'duration-asc' || sortMode === 'duration-desc') {
        const av = Number(a.duration || 0);
        const bv = Number(b.duration || 0);
        if (av !== bv) return sortMode === 'duration-asc' ? av - bv : bv - av;
        return String(a.artist || '').localeCompare(String(b.artist || '')) || String(a.title || '').localeCompare(String(b.title || ''));
      }
      return String(a.artist || '').localeCompare(String(b.artist || '')) || String(a.title || '').localeCompare(String(b.title || ''));
    }

    if (sortModeEl) {
      sortModeEl.value = sortMode;
    }

    function setActiveSortButton(mode) {
      if (!sortsEl) return;
      sortsEl.querySelectorAll('button[data-sort]').forEach(item => {
        item.classList.toggle('active', item.dataset.sort === mode);
      });
    }

    setActiveSortButton(sortMode);

    function hasBpm(track) {
      return Number(track.effective_bpm || 0) > 0;
    }

    function passesBpmVisibility(track) {
      if (showOnlyNoBpmEl.checked) {
        return !hasBpm(track);
      }
      return hasBpm(track);
    }

    function renderList(items) {
      const sorted = [...items].filter(passesBpmVisibility).sort(compareTracks);
      hiddenCountBadge.textContent = `Hidden: ${Math.max(0, items.length - sorted.length)}`;
      statusbar.innerHTML = `Tracks: <strong>${tracks.length}</strong> | Showing: <strong>${sorted.length}</strong> | BPM filter: <strong>${bpmMinEl.value || '--'}-${bpmMaxEl.value || '--'}</strong> | Key: <strong>${keyFilterEl.value || '--'}</strong> | No BPM only: <strong>${showOnlyNoBpmEl.checked ? 'yes' : 'no'}</strong>`;
      listEl.innerHTML = sorted.map(track => `
        <div class="row ${track.id === activeTrackId ? 'active' : ''}" data-id="${track.id}">
          ${track.album_art_url ? `<img class="thumb" src="${esc(track.album_art_url)}" alt="${esc(track.album || track.title || 'Album art')}" />` : '<div class="thumb placeholder">♪</div>'}
          <div>
            <strong>${esc(track.artist || 'Unknown Artist')} - ${esc(track.title || 'Untitled')}</strong>
            <span>${esc(track.path)}</span>
            <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;"></div>
          </div>
          <div><strong>${track.effective_bpm ? Number(track.effective_bpm).toFixed(1) : '--'}</strong><span>BPM</span></div>
          <div><strong>${esc(track.effective_key || '--')}</strong><span>Key</span></div>
        </div>
      `).join('');

      listEl.querySelectorAll('.row').forEach(row => {
        row.addEventListener('click', () => selectTrack(row.dataset.id, true));
      });
    }

    function renderDetail(payload) {
      const track = payload.track;
      const coverUrl = track.album_art_url || '';
      const coverLabel = track.album || track.title || 'Unknown';
      const scrubId = `scrub-${track.id}`;
      const currentTimeId = `current-${track.id}`;
      const durationTimeId = `duration-${track.id}`;

      detailEl.innerHTML = `
        <div class="hero">
          <div class="hero-art" style="${coverUrl ? `background-image:url('${esc(coverUrl)}')` : ''}"></div>
          <div class="hero-cover ${coverUrl ? '' : 'no-art'}">
            ${coverUrl ? `<img src="${esc(coverUrl)}" alt="Album cover" />` : `<div class="cover-placeholder"><div class="icon">♪</div><div>No cover</div><small>${esc(coverLabel)}</small></div>`}
          </div>
          <div class="hero-copy">
            <h2>${esc(track.artist || 'Unknown Artist')} - ${esc(track.title || 'Untitled')}</h2>
            <div class="meta">
              <span>ID ${track.id}</span>
              <span>${track.effective_bpm ? Number(track.effective_bpm).toFixed(1) : '--'} BPM</span>
              <span>${esc(track.effective_key || '--')}</span>
              <span>${formatDuration(track.duration)}</span>
              <span>${esc(track.bpm_source || 'analysis')}</span>
            </div>
            <div class="chips">
              ${track.album ? `<span class="chip">${esc(track.album)}</span>` : ''}
              ${track.youtube_url ? '<span class="chip">YouTube ready</span>' : '<span class="chip">YouTube unavailable</span>'}
          ${track.decode_failed ? '<span class="chip warn">Unreadable audio</span>' : ''}
          ${track.analysis_stage ? `<span class="chip">${esc(track.analysis_stage)}</span>` : ''}
            </div>
            ${track.album_art_debug ? `
              <details class="debug" style="margin-top:12px;">
                <summary>Album art debug</summary>
                <pre class="debug-text">${esc(JSON.stringify(track.album_art_debug, null, 2))}</pre>
              </details>
            ` : ''}
          </div>
        </div>
        <div class="detail-inner">
          <div class="buttons">
            <button class="btn" id="play-btn" type="button"><span class="btn-icon">▶</span> Play</button>
            ${track.youtube_url ? `<a class="btn" href="${esc(track.youtube_url)}" target="_blank" rel="noreferrer">YouTube</a>` : ''}
            ${track.album_art_url ? `<button class="btn" id="cover-btn" type="button">Album cover</button>` : ''}
            <a class="btn" href="/api/tracks/${track.id}/next" target="_blank" rel="noreferrer">Raw next-track data</a>
          </div>
          <div class="local-player">
            <audio id="local-audio" controls preload="metadata" src="${esc(`/api/tracks/${track.id}/stream`)}"></audio>
            <div class="scrub-wrap">
              <div class="scrub-row"><span id="${scrubId}-current">0:00</span><span class="scrub-separator">/</span><span id="${scrubId}-duration">0:00</span></div>
              <input id="${scrubId}" type="range" min="0" max="0" value="0" step="0.01" />
            </div>
            <div class="spotify-empty">Playing from local disk</div>
          </div>
          <h3>Can play next</h3>
          <div class="suggestions">
            ${(payload.next_tracks || []).map(item => `
              <div class="suggestion" data-track-id="${item.id}">
                <strong>${esc(item.artist || 'Unknown Artist')} - ${esc(item.title || 'Untitled')}</strong><br>
                <small>${item.effective_bpm ? Number(item.effective_bpm).toFixed(1) : '--'} BPM · ${esc(item.effective_key || '--')} · ${esc(item.reason || '')}</small>
              </div>
            `).join('') || '<div class="empty">No compatible tracks found.</div>'}
          </div>
          ${track.analysis_debug ? `
            <details class="debug">
              <summary>Debug info</summary>
              <pre class="debug-text">${esc(track.analysis_debug)}</pre>
            </details>
          ` : ''}
        </div>
      `;

      const playBtn = document.getElementById('play-btn');
      const localAudio = document.getElementById('local-audio');
      const scrubRange = document.getElementById(`${scrubId}`);
      const currentTimeEl = document.getElementById(`${scrubId}-current`);
      const durationTimeEl = document.getElementById(`${scrubId}-duration`);
      const previewBtn = document.getElementById('preview-btn');
      const previewAudio = document.getElementById('preview-audio');
      const coverBtn = document.getElementById('cover-btn');
      const resumeKey = `dj-assist-resume-${track.id}`;
      const loadResumeState = () => {
        try {
          return JSON.parse(sessionStorage.getItem(resumeKey) || 'null') || {};
        } catch {
          return {};
        }
      };
      const saveResumeState = () => {
        if (!localAudio) return;
        try {
          sessionStorage.setItem(
            resumeKey,
            JSON.stringify({
              time: Number(localAudio.currentTime || 0),
              paused: localAudio.paused,
            })
          );
        } catch {
          // Ignore storage failures.
        }
      };
      detailEl.querySelectorAll('.suggestion[data-track-id]').forEach(card => {
        card.addEventListener('click', () => selectTrack(card.dataset.trackId, true));
      });

      if (playBtn && localAudio) {
        const resumeState = loadResumeState();
        const shouldResume = Boolean(resumeState.time) && resumeState.paused === false;
        let resumeApplied = false;

        const formatTime = seconds => {
          if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
          const minutes = Math.floor(seconds / 60);
          const remainder = Math.floor(seconds % 60);
          return `${minutes}:${String(remainder).padStart(2, '0')}`;
        };

        localAudio.addEventListener('loadedmetadata', () => {
          if (!resumeApplied && Number.isFinite(resumeState.time) && resumeState.time > 0) {
            const targetTime = Math.min(resumeState.time, Math.max(0, (localAudio.duration || 0) - 0.25));
            localAudio.currentTime = targetTime;
            scrubRange.value = String(targetTime);
            currentTimeEl.textContent = formatTime(targetTime);
            resumeApplied = true;
            if (shouldResume) {
              localAudio.play().catch(() => {});
            }
          }
          scrubRange.max = String(localAudio.duration || 0);
          durationTimeEl.textContent = formatTime(localAudio.duration || 0);
        });

        localAudio.addEventListener('timeupdate', () => {
          scrubRange.value = String(localAudio.currentTime || 0);
          currentTimeEl.textContent = formatTime(localAudio.currentTime || 0);
          saveResumeState();
        });

        scrubRange.addEventListener('input', () => {
          localAudio.currentTime = Number(scrubRange.value || 0);
          saveResumeState();
        });

        playBtn.addEventListener('click', async () => {
          if (localAudio.paused) {
            await localAudio.play();
            playBtn.classList.add('playing');
            playBtn.innerHTML = '<span class="btn-icon">❚❚</span> Pause';
          } else {
            localAudio.pause();
          }
        });

        localAudio.addEventListener('play', () => {
          playBtn.classList.add('playing');
          playBtn.innerHTML = '<span class="btn-icon">❚❚</span> Pause';
          saveResumeState();
        });

        localAudio.addEventListener('pause', () => {
          playBtn.classList.remove('playing');
          playBtn.innerHTML = '<span class="btn-icon">▶</span> Play';
          saveResumeState();
        });

        localAudio.addEventListener('ended', () => {
          playBtn.classList.remove('playing');
          playBtn.innerHTML = '<span class="btn-icon">▶</span> Play';
          try {
            sessionStorage.removeItem(resumeKey);
          } catch {
            // Ignore storage failures.
          }
        });

        window.addEventListener('beforeunload', saveResumeState, { once: true });
      }

      if (coverBtn && track.album_art_url) {
        coverBtn.addEventListener('click', () => {
          coverImage.src = track.album_art_url;
          coverTitle.textContent = track.spotify_album_name || track.album || 'Album cover';
          coverModal.classList.add('open');
          coverModal.setAttribute('aria-hidden', 'false');
        });
      }

      if (previewBtn && previewAudio) {
        previewBtn.addEventListener('click', async () => {
          if (previewAudio.paused) {
            await previewAudio.play();
            previewBtn.textContent = 'Pause preview';
            previewBtn.classList.add('playing');
          } else {
            previewAudio.pause();
            previewBtn.textContent = 'Preview clip';
            previewBtn.classList.remove('playing');
          }
        });
        previewAudio.addEventListener('ended', () => {
          previewBtn.textContent = 'Preview clip';
          previewBtn.classList.remove('playing');
        });
      }
    }

    closeCover.addEventListener('click', () => {
      coverModal.classList.remove('open');
      coverModal.setAttribute('aria-hidden', 'true');
    });
    coverModal.addEventListener('click', event => {
      if (event.target === coverModal) {
        coverModal.classList.remove('open');
        coverModal.setAttribute('aria-hidden', 'true');
      }
    });

    async function loadTracks(query = '') {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (bpmMinEl.value) params.set('bpm_min', bpmMinEl.value);
      if (bpmMaxEl.value) params.set('bpm_max', bpmMaxEl.value);
      if (keyFilterEl.value) params.set('key', keyFilterEl.value);
      const res = await fetch(`/api/tracks?${params.toString()}`);
      const response = await res.json();
      tracks = response.tracks || [];
      const debug = response.debug || {};
      const missingEnv = debug.spotify_missing || [];
      const spotifyConnection = debug.spotify_connection || {};
      if (missingEnv.length) {
        warningBanner.style.display = 'block';
        warningBanner.innerHTML = `<strong>Missing env:</strong> ${missingEnv.join(', ')}. Optional metadata lookups may be unavailable.`;
      } else {
        warningBanner.style.display = 'none';
        warningBanner.innerHTML = '';
      }
      const spotifyStatus = spotifyConnection.enabled ? (spotifyConnection.token_ok ? 'connected' : `error: ${spotifyConnection.error || 'token failed'}`) : 'disabled';
      statusbar.innerHTML = `DB: <strong>${debug.database_url || 'unknown'}</strong> | Rows: <strong>${debug.rows ?? 0}</strong> | With BPM: <strong>${debug.with_bpm ?? 0}</strong> | Spotify: <strong>${spotifyStatus}</strong> | Missing env: <strong>${(debug.spotify_missing || []).join(', ') || 'none'}</strong>`;
      if (spotifyConnection.enabled && !spotifyConnection.token_ok) {
        warningBanner.style.display = 'block';
        warningBanner.innerHTML = `<strong>Spotify auth:</strong> ${spotifyConnection.error || 'token request failed'}.`;
      }
      renderList(tracks);
      if (tracks.length && !activeTrackId) {
        let storedTrackId = null;
        try {
          storedTrackId = Number(sessionStorage.getItem(activeTrackKey) || 0) || null;
        } catch {
          storedTrackId = null;
        }
        const preferred = storedTrackId ? tracks.find(track => track.id === storedTrackId) : null;
        selectTrack((preferred || tracks[0]).id, Boolean(preferred));
      }
    }

    async function selectTrack(id, autoPlay = false) {
      activeTrackId = Number(id);
      try {
        sessionStorage.setItem('dj-assist-active-track-id', String(activeTrackId));
      } catch {
        // Ignore storage failures.
      }
      renderList(tracks);
      const res = await fetch(`/api/tracks/${id}`);
      const payload = await res.json();
      renderDetail(payload);
      if (autoPlay) {
        const localAudio = document.getElementById('local-audio');
        if (localAudio) {
          localAudio.play().catch(() => {});
        }
      }
    }

    let searchTimer = null;
    searchEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadTracks(searchEl.value.trim()), 200);
    });

    [bpmMinEl, bpmMaxEl, keyFilterEl].forEach(el => {
      el.addEventListener('input', () => loadTracks(searchEl.value.trim()));
    });

    showOnlyNoBpmEl.addEventListener('change', () => loadTracks(searchEl.value.trim()));
    if (sortModeEl) {
      sortModeEl.addEventListener('change', () => {
        sortMode = sortModeEl.value;
        renderList(tracks);
      });
    }

    if (sortsEl) {
      sortsEl.addEventListener('click', event => {
        const button = event.target.closest('button[data-sort]');
        if (!button) return;
        sortMode = button.dataset.sort || sortMode;
        setActiveSortButton(sortMode);
        renderList(tracks);
      });
    }

    loadTracks();
  </script>
</body>
</html>
"""


def _db() -> Database:
    return Database()


def _serialize_track(track):
    return {
        "id": track.id,
        "path": track.path,
        "title": track.title,
        "artist": track.artist,
        "album": track.album,
        "duration": track.duration,
        "bpm": track.bpm,
        "key": track.key,
        "key_numeric": track.key_numeric,
        "spotify_id": getattr(track, "spotify_id", None),
        "spotify_uri": getattr(track, "spotify_uri", None),
        "spotify_url": getattr(track, "spotify_url", None),
        "spotify_preview_url": getattr(track, "spotify_preview_url", None),
        "spotify_tempo": getattr(track, "spotify_tempo", None),
        "spotify_key": getattr(track, "spotify_key", None),
        "spotify_mode": getattr(track, "spotify_mode", None),
        "album_art_url": getattr(track, "album_art_url", None),
        "spotify_album_name": getattr(track, "spotify_album_name", None),
        "spotify_match_score": getattr(track, "spotify_match_score", None),
        "spotify_high_confidence": str(getattr(track, "spotify_high_confidence", "")).lower() == "true",
        "album_art_debug": {
            "album_art_url": getattr(track, "album_art_url", None) or "",
            "spotify_id": getattr(track, "spotify_id", None) or "",
            "spotify_album_name": getattr(track, "spotify_album_name", None) or "",
            "spotify_match_score": getattr(track, "spotify_match_score", None) or 0,
            "spotify_high_confidence": str(getattr(track, "spotify_high_confidence", "")).lower() == "true",
            "has_album_art": bool(getattr(track, "album_art_url", None)),
        },
        "youtube_url": getattr(track, "youtube_url", None),
        "bpm_source": getattr(track, "bpm_source", None),
        "analysis_status": getattr(track, "analysis_status", None),
        "analysis_error": getattr(track, "analysis_error", None),
        "decode_failed": getattr(track, "decode_failed", None),
        "analysis_stage": getattr(track, "analysis_stage", None),
        "analysis_debug": getattr(track, "analysis_debug", None),
        "effective_bpm": getattr(track, "bpm", None) or getattr(track, "spotify_tempo", None),
        "effective_key": getattr(track, "key", None) or getattr(track, "spotify_key", None) or getattr(track, "key_numeric", None) or "",
    }


def create_app() -> Flask:
    app = Flask(__name__)
    app.logger.setLevel(logging.INFO)

    @app.before_request
    def log_request():
        app.logger.info("%s %s from %s", request.method, request.path, request.remote_addr)

    @app.after_request
    def log_response(response):
        app.logger.info("%s %s -> %s", request.method, request.path, response.status_code)
        return response

    @app.errorhandler(Exception)
    def log_error(error):
        if isinstance(error, HTTPException):
            return error
        app.logger.exception("Unhandled error: %s", error)
        return jsonify({"error": "internal server error"}), 500

    @app.get("/")
    def index():
        return render_template_string(TEMPLATE)

    @app.get("/health")
    def health():
        return jsonify({"ok": True})

    @app.get("/api/tracks")
    def api_tracks():
        query = request.args.get("query")
        bpm_min = request.args.get("bpm_min", type=float)
        bpm_max = request.args.get("bpm_max", type=float)
        key = request.args.get("key")
        high_confidence_only = request.args.get("spotify_high_confidence", default="false").lower() in {"1", "true", "yes", "on"}
        db = _db()
        base_tracks = db.search_tracks(query=query, bpm_min=bpm_min, bpm_max=bpm_max, key=key) if any([query, bpm_min is not None, bpm_max is not None, key]) else db.get_all_tracks()
        payload = [_serialize_track(track) for track in base_tracks]
        import os
        spotify_client = SpotifyClient()
        spotify_missing = [name for name in ("SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET") if not os.getenv(name)]
        spotify_connection = spotify_client.connection_status()
        debug = {
            "database_url": str(db.engine.url),
            "rows": len(payload),
            "with_bpm": sum(1 for item in payload if item.get("effective_bpm")),
            "with_spotify": sum(1 for item in payload if item.get("spotify_id")),
            "with_album_art": sum(1 for item in payload if item.get("album_art_url")),
            "high_confidence": sum(1 for item in payload if item.get("spotify_high_confidence")),
            "missing_album_art": sum(1 for item in payload if item.get("spotify_id") and not item.get("album_art_url")),
            "spotify_missing": spotify_missing,
            "spotify_connection": spotify_connection,
        }
        app.logger.info("api/tracks debug: %s", debug)
        if high_confidence_only:
            payload = [item for item in payload if item["spotify_high_confidence"]]
        return jsonify({"tracks": payload, "debug": debug})

    @app.get("/api/tracks/<int:track_id>")
    def api_track(track_id: int):
        db = _db()
        track = db.get_track_by_id(track_id)
        if not track:
            return jsonify({"error": "not found"}), 404

        next_tracks = get_recommended_next_tracks(
            track.key or "",
            track.bpm or 0.0,
            db.get_all_tracks(),
            exclude_ids=[track.id],
        )
        return jsonify(
            {
                "track": _serialize_track(track),
                "next_tracks": [
                    {**_serialize_track(next_track), "reason": reason, "score": score}
                    for next_track, reason, score in next_tracks
                ],
            }
        )

    @app.get("/api/tracks/<int:track_id>/next")
    def api_track_next(track_id: int):
        db = _db()
        track = db.get_track_by_id(track_id)
        if not track:
            return jsonify({"error": "not found"}), 404

        next_tracks = get_recommended_next_tracks(
            track.key or "",
            track.bpm or 0.0,
            db.get_all_tracks(),
            exclude_ids=[track.id],
        )
        return jsonify(
            [
                {**_serialize_track(next_track), "reason": reason, "score": score}
                for next_track, reason, score in next_tracks
            ]
        )

    @app.get("/api/tracks/<int:track_id>/stream")
    def api_track_stream(track_id: int):
        db = _db()
        track = db.get_track_by_id(track_id)
        if not track or not track.path:
            return jsonify({"error": "not found"}), 404

        import os

        file_path = os.path.abspath(os.path.expanduser(track.path))
        if not os.path.exists(file_path):
            return jsonify({"error": "file missing"}), 404
        return send_file(file_path, conditional=True)

    return app


def run_app(host: str = "127.0.0.1", port: int = 5000, debug: bool = False) -> None:
    app = create_app()
    chosen_port = port
    for candidate in range(port, port + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((host, candidate))
            except OSError:
                continue
            chosen_port = candidate
            break

    if chosen_port != port:
        app.logger.info("Port %s is busy, using %s", port, chosen_port)
    app.logger.info("Starting DJ Assist on http://%s:%s", host, chosen_port)
    app.run(host=host, port=chosen_port, debug=debug)
