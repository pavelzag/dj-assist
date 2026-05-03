# DJ Assist

DJ Assist is a desktop music-library tool for DJs. It scans local music folders, analyzes BPM and musical key, enriches tracks with Spotify and album-art data, imports audio metadata from Google Drive, and helps build playlists with compatibility-aware recommendations.

## Table of Contents

- [What DJ Assist Does](#what-dj-assist-does)
- [Important Additions Since The Older README](#important-additions-since-the-older-readme)
- [Feature Inventory](#feature-inventory)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Running The App](#running-the-app)
- [Configuration](#configuration)
- [CLI Reference](#cli-reference)
- [API Reference](#api-reference)
- [Building For Distribution](#building-for-distribution)
- [Troubleshooting](#troubleshooting)
- [Additional Docs](#additional-docs)

---

## What DJ Assist Does

DJ Assist combines a desktop shell, a Next.js app, and a Python analysis engine so you can:

- scan local music folders and keep them under watch
- analyze BPM, key, bitrate, duration, and decode health
- enrich tracks with Spotify matches, fallback tempo/key, and album art
- import Google Drive audio metadata into the same library
- preview and play both local and Google Drive-backed tracks
- build playlists and get harmonic / tempo-aware next-track suggestions
- bulk-fix library gaps like missing BPM, missing art, duplicates, and ignored tracks

---

## Important Additions Since The Older README

The earlier README described the base scanner and set builder, but the app has grown substantially. The important capabilities that were missing or under-described are:

- Electron desktop packaging with a persistent backend process that survives window close/reopen
- Google OAuth desktop sign-in flow with PKCE
- Google Drive folder browser with Finder-style navigation
- Google Drive metadata import into the local Songs list and optional server sync
- Google Drive preview before import
- Google Drive local cache for playback, waveform generation, and BPM reanalysis
- Dedicated Google Drive import progress UI with stage-based feedback
- Command palette for commands, artists, tracks, and BPM lookups
- Keyboard shortcuts modal and desktop-focused interaction model
- Tap BPM workflow with save, halve, and double actions
- Interactive waveform scrubbing with cue markers
- Manual track metadata editing from the UI
- Bulk track actions, including ignore/unignore, tag edits, add-to-playlist, delete, BPM reanalysis, and art reanalysis
- Smart crates and collection cleanup workflows
- Runtime health and startup diagnostics
- Preferences panel for playback, scan toasts, list density, and visible library columns
- Playlist management panel built into the app
- Source preference handling for local vs Google Drive versions of the same track
- Activity logging for scan/import diagnostics
- Library reset tools inside the app

---

## Feature Inventory

### Local Library Scanning

- recursive scan of local audio folders
- directory preflight validation before scan start
- scan modes: `smart`, `missing-metadata`, `missing-analysis`, `missing-art`, `full`
- live scan progress with status text and streaming logs
- scan history with summaries and job detail
- cancel in-flight scans
- watch folders that trigger automatic rescans on file changes
- optional album-art fetching during scans

### Audio Analysis And Metadata

- BPM detection via Python analysis pipeline
- musical key detection in Camelot notation
- duration, bitrate, artist, title, and album extraction
- decode failure detection and tracking
- Spotify match lookup for metadata, tempo, and key fallback
- AcoustID fingerprint-assisted metadata recovery
- album art fetching and review status tracking
- embedded artwork extraction for supported files
- per-track BPM reanalysis
- per-track album-art reanalysis

### Google Sign-In And Google Drive

- Google desktop sign-in flow
- Google Drive folder browser with breadcrumb and sidebar navigation
- scrollable folder picker with folder and audio-file contents
- Google Drive preview before import
- Google Drive metadata import into the local library
- local metadata enrichment after Drive import
- Google Drive track local caching for playback and analysis
- playback and waveform support for Google Drive-backed tracks
- stage-based import progress for Drive imports

### Playback And Track Detail

- in-app audio playback
- support for local files and Google Drive-backed tracks
- waveform rendering with scrubbing
- cue point placement and clearing
- playback mute/unmute controls
- album cover modal
- YouTube link support
- track source inspection and source preference switching

### Search, Navigation, And Review

- full-text search across title, artist, album, and tags
- browse by artist and album
- related tracks by artist
- review-oriented smart crates
- next-track suggestions with intent modes such as safe, up, down, and same-vibe
- command palette for search and commands
- keyboard shortcuts for common workflows

### Playlists / Sets

- create, rename, and delete playlists
- add and remove tracks
- reorder by position through set track APIs
- compatibility-aware next-track recommendations from the current track or set context
- export setlists from the CLI

### Library Management

- bulk ignore / unignore
- bulk tag add / remove / clear
- bulk add visible selections to playlists
- bulk delete tracks
- visible Google Drive missing-BPM remediation workflow
- duplicate detection
- collection health overview
- runtime diagnostics and startup diagnostics
- in-app preferences for list columns, list density, autoplay, startup load, and scan toasts
- library reset from the UI

---

## Screenshots

### Logo

![DJ Assist logo](documentation/Screenshot%202026-04-08%20at%2019.18.57.png)

### Main Screen

![Main screen](documentation/Screenshot%202026-04-08%20at%2018.39.29.png)

### Edit Screen

![Edit screen](documentation/Screenshot%202026-04-08%20at%2019.27.42.png)

### Manual BPM Menu

![Manual BPM menu](documentation/Screenshot%202026-04-08%20at%2019.27.52.png)

### Commands Tab

![Commands tab](documentation/Screenshot%202026-04-08%20at%2019.28.07.png)

---

## Architecture

DJ Assist is an Electron desktop app with three main layers:

```text
Electron shell
  └── Next.js 15 UI + API server (TypeScript / Node 22)
        └── Python 3.11 analysis engine
              └── SQLite or PostgreSQL data store
```

| Layer | Tech | Role |
|---|---|---|
| Desktop shell | Electron 41 | Window lifecycle, IPC, app startup, desktop integrations |
| UI | React 19 + Next.js 15 | Library views, playback UI, modals, progress surfaces |
| API | Next.js API routes | Track, scan, auth, Drive, settings, playlist, and log endpoints |
| Analysis engine | Python 3.11 | Scanning, BPM/key analysis, metadata extraction, CLI |
| Database | SQLite by default, PostgreSQL optional | Tracks, playlists, scan jobs, settings-backed workflows |

The backend stays running when the Electron window closes. Reopening the window reconnects to the same backend and restores running jobs from history.

---

## Requirements

- macOS is the primary supported platform
- Node 22.x
- Python 3.11+
- SQLite on macOS, or PostgreSQL if you intentionally configure server-style storage

---

## Installation

### 1. Install system dependencies

```bash
brew install node@22 python@3.11
```

Confirm versions:

```bash
node -v
python3 --version
```

### 2. Clone and install Node dependencies

```bash
git clone <repo-url> dj-assist
cd dj-assist
npm install
```

### 3. Create a Python virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

### 4. Create the app data directory

```bash
mkdir -p ~/.dj_assist
```

### 5. Configure environment

Create `.env.local`:

```bash
DJ_ASSIST_DB_PATH=/Users/<you>/.dj_assist/dj-assist.db
PYTHON_EXECUTABLE=/Users/<you>/Projects/dj-assist/.venv/bin/python
```

If you plan to use Google Drive, Spotify, or server sync, also configure the relevant variables from the table below.

---

## Running The App

### Desktop app

```bash
npm run dev
```

This launches Electron and the embedded Next.js backend together.

### Backend only

```bash
npm run backend:dev
```

Then open `http://localhost:3000`.

### First-run checklist

1. Open `Collection`.
2. Check `Startup Diagnostics`.
3. Add a local music folder or open `Add Music`.
4. Run a local scan or import Google Drive metadata.
5. Open a track and verify playback, waveform, and metadata.

---

## Configuration

All configuration is driven through environment variables, typically from `.env.local`.

| Variable | Default | Description |
|---|---|---|
| `DJ_ASSIST_DB_PATH` | `~/.dj_assist/dj-assist.db` | Local SQLite database path |
| `DJ_ASSIST_DATABASE_URL` | — | PostgreSQL connection string; overrides SQLite |
| `PYTHON_EXECUTABLE` | `python3` | Python used by scan and analysis routes |
| `GOOGLE_CLIENT_ID` | — | Google OAuth desktop client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth desktop client secret for local dev flows |
| `SPOTIFY_CLIENT_ID` | — | Spotify API client ID |
| `SPOTIFY_CLIENT_SECRET` | — | Spotify API client secret |
| `ACOUSTID_API_KEY` | — | AcoustID API key |
| `FPCALC_PATH` | system lookup | AcoustID fingerprint executable path |
| `DJ_ASSIST_SERVER_ENABLED` | `false` | Enable optional server sync features |
| `DJ_ASSIST_SERVER_URL` | — | Production server URL |
| `DJ_ASSIST_LOCAL_SERVER_URL` | `http://localhost:3001` | Local server URL used when local debug mode is enabled |
| `DJ_ASSIST_SERVER_LOCAL_DEBUG` | `false` | Switch server sync calls to the local server URL |
| `DJ_ASSIST_ELECTRON_PORT` | `3000` | Embedded Next.js port |
| `DJ_ASSIST_ELECTRON_HOST` | `127.0.0.1` | Embedded Next.js host |
| `DJ_ASSIST_PYTHON_STANDALONE` | — | Relocatable Python root used for packaging |
| `DJ_ASSIST_CONFIG_DIR` | app-managed default | Config, logs, cache, and waveform base directory |

Google sign-in expects a Google OAuth client of type `Desktop app`.

---

## CLI Reference

The Python package exposes `python -m dj_assist.cli` and related commands.

### Scanning

```bash
dj-assist scan <directory>
```

| Option | Description |
|---|---|
| `--mode smart` | Scan new and changed files |
| `--mode full` | Rescan all files |
| `--mode missing-metadata` | Only files missing Spotify metadata |
| `--mode missing-analysis` | Only files missing BPM/key |
| `--mode missing-art` | Only files missing album art |
| `--fetch-art` | Fetch album art during scan |
| `--verbose` | Verbose diagnostic output |

### Library And Analysis

```bash
dj-assist list
dj-assist search --query "track name"
dj-assist search --artist "Artist"
dj-assist search --key 8A
dj-assist search --bpm-min 120 --bpm-max 130
dj-assist debug <track_id>
dj-assist reanalyze-bpm <track_id>
dj-assist waveform-peaks <file>
dj-assist fetch-art
dj-assist fetch-art --force
dj-assist fetch-art --limit 50
```

### Metadata

```bash
dj-assist write-tags <file> \
  --artist "Artist" \
  --title "Track Title" \
  --album "Album" \
  --key 8A \
  --tags "dark,peak-time"
```

### Sets / Playlists

```bash
dj-assist set new "My Set Name"
dj-assist set list
dj-assist set show <set_id>
dj-assist set add <set_id> <track_id>
dj-assist set remove <set_id> <pos>
dj-assist set recommend <set_id>
dj-assist set export <set_id>
```

### Maintenance

```bash
dj-assist dedupe
dj-assist dedupe --dry-run
dj-assist reset-db
dj-assist reset-db --yes
dj-assist flow
dj-assist web
```

---

## API Reference

Base URL: `http://127.0.0.1:3000/api`

### Authentication

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auth/google/start` | Start Google OAuth desktop flow |
| `GET` | `/api/auth/google/callback` | Complete Google OAuth callback |
| `POST` | `/api/auth/logout` | Clear current Google session |

### Google Drive

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/google-drive/folders` | Browse Drive folders |
| `GET` | `/api/google-drive/files` | List audio files visible to the current Drive scope |
| `POST` | `/api/google-drive/import` | Import Drive metadata into DJ Assist |

### Scanning

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/scan` | List scan jobs |
| `POST` | `/api/scan` | Start a scan |
| `GET` | `/api/scan/:id` | Fetch scan job detail |
| `GET` | `/api/scan/:id/stream` | Stream scan progress |
| `POST` | `/api/scan/validate` | Validate a scan directory |

### Tracks

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tracks` | List tracks with filters |
| `GET` | `/api/tracks/:id` | Fetch track detail |
| `PATCH` | `/api/tracks/:id` | Update track metadata |
| `GET` | `/api/tracks/:id/stream` | Stream track audio |
| `GET` | `/api/tracks/:id/waveform` | Fetch waveform peak data |
| `GET` | `/api/tracks/:id/next` | Fetch next-track recommendations |
| `POST` | `/api/tracks/:id/reanalyze-bpm` | Re-run BPM analysis |
| `POST` | `/api/tracks/:id/reanalyze-art` | Re-run artwork analysis |
| `GET` | `/api/tracks/:id/art` | Resolve or stream track artwork |
| `POST` | `/api/tracks/bulk` | Run bulk actions on selected tracks |

### Playlists / Sets

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sets` | List playlists |
| `POST` | `/api/sets` | Create playlist |
| `GET` | `/api/sets/:id` | Fetch playlist with tracks |
| `PATCH` | `/api/sets/:id` | Rename playlist |
| `POST` | `/api/sets/:id/tracks` | Add track to playlist |
| `DELETE` | `/api/sets/:id/tracks/:position` | Remove playlist item |

### Library And Settings

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/library` | Collection overview and health metrics |
| `POST` | `/api/library/reset` | Reset local library data |
| `POST` | `/api/settings/spotify` | Save Spotify settings |
| `POST` | `/api/settings/google` | Save Google OAuth settings |
| `POST` | `/api/settings/server` | Save server sync settings |

### Watch Folders And Logs

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/watch` | List watch folders |
| `POST` | `/api/watch` | Add watch folder |
| `DELETE` | `/api/watch` | Remove watch folder |
| `GET` | `/api/health` | Runtime health and startup diagnostics |
| `GET` | `/api/logs/client` | Read client diagnostic logs |
| `POST` | `/api/logs/client` | Append client diagnostic log entries |

---

## Building For Distribution

### Local macOS app bundle

```bash
npm run build
npm run pack:mac
```

### DMG + ZIP

```bash
export DJ_ASSIST_PYTHON_STANDALONE=/absolute/path/to/relocatable-python-root
npm run dist:mac
```

For signed and notarized builds, also set:

```bash
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
```

Artifacts are written to `dist-electron/`.

Packaging copies the Python runtime, prepares bundled audio tools, builds the Next.js app, and runs `electron-builder`.

---

## Troubleshooting

### Startup Diagnostics says the runtime is not ready

Open `Collection → Startup Diagnostics`. Verify the Python runtime, database path, and audio tools.

### Python scan fails

```bash
source .venv/bin/activate
python -m dj_assist.cli --help
python -m dj_assist.cli scan /path/to/music
```

### Database is unavailable

Verify `.env.local` and confirm `DJ_ASSIST_DB_PATH` or `DJ_ASSIST_DATABASE_URL` points to a writable and reachable target.

### Google Drive import fails

- verify Google sign-in is active
- open the Drive folder picker and reduce the scope to a smaller folder
- check `Collection` and the activity logs for Drive import progress and failures

### No waveform or playback

```bash
curl -I http://127.0.0.1:3000/api/tracks/<id>/stream
```

For Google Drive-backed tracks, the first play may need to create a local cache copy before waveform or playback becomes available.

### Scan finds files but metadata is sparse

Add Spotify credentials and rerun:

```bash
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
```

or re-run a targeted scan with `--mode missing-metadata`.

### Unsigned macOS build will not open

Right-click the app in Finder, choose `Open`, and confirm. You can also allow it from `System Settings → Privacy & Security`.

---

## Additional Docs

- [Client Install Guide](./docs/CLIENT-INSTALL.md)
- [Product Shipping Guide](./docs/PRODUCT-SHIPPING.md)
- [Electron Plan](./docs/ELECTRON-PLAN.md)
- [Album Art Backfill](./docs/ALBUM-ART-BACKFILL.md)
- [Releases](./docs/RELEASES.md)
