# DJ Assist

DJ Assist is a desktop-oriented music-library tool for DJs. It scans local audio folders, analyzes BPM and key, enriches tracks with Spotify metadata and album art, stores the results in a database, and helps build playlists with compatibility suggestions.

## Current Architecture

The current application is an Electron-first desktop stack:

- Next.js 15 service UI
- Python 3.11 scanner and analysis pipeline
- SQLite (managed automatically in desktop mode)
- Local audio playback from the user machine

This is important for packaging decisions: the app works best when it can access the user's local music folders directly.

## Feature Overview

### Library scanning

- Trigger scans from the UI
- Progress bar with live scan logs
- Scan history and scan summaries
- Cancel running scans
- Directory preflight validation
- Rescan modes:
  - smart
  - missing metadata
  - missing BPM/key
  - missing album art
  - full rescan
- Optional album art fetching
- Verbose diagnostics mode

### Track analysis

- BPM detection
- Camelot-style key detection
- Spotify matching
- Spotify tempo/key fallback
- Album art matching
- Decode failure tracking
- Per-track diagnostics and analysis status

### Library navigation

- Search tracks by title, artist, album, and tags
- Browse by artist
- Browse by album
- Artist catalog shortcuts in the detail view
- Related songs by artist
- "Can play next" recommendations with pagination

### Playback and track detail

- Local audio playback
- Resume position while navigating
- Interactive waveform
- Canvas scrubbing
- Cue point creation and clearing
- Album cover modal
- Direct YouTube link when available

### Playlist / set building

- Create playlists
- Add tracks to playlists
- Remove tracks from playlists
- Playlist intelligence suggestions based on the last track

### Library management

- Collection health dashboard
- Smart crates for cleanup workflows
- Duplicate detection
- Bulk actions from the library list
- Track tagging
- Manual metadata editing
- Ignore / unignore tracks
- Runtime health panel
- Watch folders that trigger scans on changes

## Best Way To Ship It

### Short answer

For a real client-facing product, the best target is a desktop app.

### Recommendation

1. Short-term pilot / technical users:
   ship as source code plus local setup, or Docker for technical teams.
2. Real product for DJs on their own computers:
   ship as a desktop app, most likely Electron.

### Why Docker is not the best end-user product here

Docker works, but it is a poor end-user experience for this app because:

- clients still need Docker installed
- local music-folder access is awkward
- audio playback and filesystem permissions are less natural
- Python and audio-analysis dependencies still have to behave correctly inside the container
- it feels like developer infrastructure, not a consumer app

Docker is still useful for:

- internal deployments
- demos
- QA environments
- technical clients

### Why Electron is a better product fit

Electron fits this app better because:

- the app is fundamentally local-library oriented
- users expect a desktop-style app for managing music folders
- local playback, local scanning, and folder access are natural in a desktop app
- you can provide one installable package per platform

## How Hard Is Electron?

### Short answer

Moderate, but not trivial.

### Real assessment

If you want a good Electron version, the hardest parts are not the UI shell. The hard parts are packaging the backend reliably.

Main work items:

1. Bundle the Python scanner runtime cleanly.
   - Stage a working Python environment into the app bundle, or
   - replace the analysis stack with native Node tooling

2. Finish the move from browser-style assumptions to desktop-style assumptions.
   - folder pickers
   - native menus
   - app updates
   - code signing
   - platform-specific packaging

### Practical migration difficulty

- Electron shell only: low

### macOS packaging

1. Install desktop packaging dependencies:
   - `npm install`
2. Point packaging at a self-contained Python runtime:
   - `export DJ_ASSIST_PYTHON_STANDALONE=/absolute/path/to/your/relocatable-python-root`
3. Optional for signed/notarized macOS builds:
   - `export APPLE_ID=...`
   - `export APPLE_APP_SPECIFIC_PASSWORD=...`
   - `export APPLE_TEAM_ID=...`
4. Create an unsigned macOS app bundle for local testing:
   - `npm run pack:mac`
5. Create macOS distributables:
   - `npm run dist:mac`

Artifacts are written to `dist-electron/`.
The packaging flow now copies that relocatable runtime into `python/runtime`, creates a fresh in-bundle virtualenv at `python/env`, and installs the scanner dependencies there before `electron-builder` runs.
- Electron app that actually ships cleanly to clients: medium-high
- Electron app with bundled Python analysis and reliable installers: high

### Recommended migration path

1. Keep the current Next.js + Python app working locally.
2. Keep SQLite as the local desktop database.
3. Wrap the UI in Electron.
4. Bundle the Python scanner as a managed local process.
5. Add native folder picker and installer packaging.

## Install

See:

- [Client Install Guide](./docs/CLIENT-INSTALL.md)
- [Product Shipping Guide](./docs/PRODUCT-SHIPPING.md)
- [Electron Plan](./docs/ELECTRON-PLAN.md)

## Development Requirements

- Node 22.x
- Python 3.11+
- SQLite (default desktop database)
- macOS recommended for current local setup

## Desktop Dev Run

```bash
cd /Users/pavel/Projects/dj-assist
mkdir -p ~/.dj_assist
npm install
npm run dev
```

This launches the Electron app and a reusable local backend.

Behavior in desktop mode:

- the backend stays running when the Electron window quits
- scans can continue in the background while the desktop window is closed
- reopening the Electron app reconnects to the same backend and the scan UI restores the running job from scan history

## Backend-only Run

If you need to run only the backend for debugging:

```bash
npm run backend:dev
```

With `.env.local`:

```bash
DJ_ASSIST_DB_PATH=/absolute/path/to/dj-assist.db
PYTHON_EXECUTABLE=/Users/pavel/Projects/dj-assist-venv/bin/python3
```
