# DJ Assist

A desktop music-library tool for DJs. Scan local audio folders, analyze BPM and musical key, enrich tracks with Spotify metadata and album art, and build DJ sets with intelligent compatibility suggestions.

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Running the App](#running-the-app)
- [Configuration](#configuration)
- [CLI Reference](#cli-reference)
- [API Reference](#api-reference)
- [Building for Distribution](#building-for-distribution)
- [Troubleshooting](#troubleshooting)

---

## Features

### Library Scanning
- Recursively scan local audio directories
- Live scan progress with streaming logs
- Scan history and job summaries
- Cancel running scans mid-flight
- Directory preflight validation before scanning
- Rescan modes: `smart`, `missing-metadata`, `missing-analysis`, `missing-art`, `full`
- Optional album art fetching during scan
- Watch folders that trigger automatic rescans on file changes

### Track Analysis
- BPM detection via librosa
- Musical key detection in Camelot wheel notation
- Spotify metadata matching (title, artist, album)
- Spotify tempo/key as fallback when local analysis fails
- AcoustID fingerprint-based metadata recovery
- Album art fetching and caching
- Decode failure tracking and per-track diagnostics

### Library Navigation
- Full-text search by title, artist, album, and tags
- Browse by artist and album
- Artist catalog shortcuts in the track detail pane
- Related songs by artist
- "Can play next" recommendations with Camelot wheel compatibility scoring

### Playback and Track Detail
- Local audio playback via the browser
- Resume playback position when navigating between tracks
- Interactive waveform display with scrubbing
- Cue point creation and clearing
- Album cover modal
- YouTube link generation for tracks

### Playlist / Set Building
- Create and name playlists
- Add and remove tracks
- Intelligent next-track suggestions based on the last track in the set (Camelot key and BPM compatibility)

### Library Management
- Collection health dashboard with coverage stats
- Smart crates for common cleanup workflows
- Duplicate detection
- Bulk actions from the library list
- Track tagging and manual metadata editing
- Ignore / unignore individual tracks
- Runtime health panel showing backend status

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

DJ Assist is an **Electron desktop app** with three main layers:

```
Electron shell
  └── Next.js 15 UI + API server (TypeScript / Node 22)
        └── Python 3.11 scanner / analyzer (librosa, mutagen)
              └── SQLite database (~/.dj_assist/dj_assist.db)
```

| Layer | Tech | Role |
|---|---|---|
| Desktop shell | Electron 41 | Window management, IPC, Python process lifecycle |
| UI | React 19 + Next.js 15 | All views, audio playback, waveform rendering |
| API | Next.js API routes | REST endpoints consumed by the UI |
| Scanner | Python 3.11 + Click | Audio analysis, Spotify/AcoustID integration, CLI |
| Database | SQLite via SQLAlchemy | Track library, sets, scan jobs |

The **backend stays running** when the Electron window is closed. In-progress scans continue in the background. Reopening the window reconnects to the same backend and restores any running scan job from history.

PostgreSQL is supported as an alternative database for server deployments; set `DJ_ASSIST_DATABASE_URL` to activate it.

---

## Requirements

- **macOS** (primary supported platform)
- **Node 22.x**
- **Python 3.11+**
- SQLite (no separate install needed on macOS)

---

## Installation

### 1. Install system dependencies

```bash
brew install node@22 python@3.11
```

Confirm versions:

```bash
node -v   # v22.x.x
python3 --version  # Python 3.11.x
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

Create `.env.local` in the project root:

```bash
DJ_ASSIST_DB_PATH=/Users/<you>/.dj_assist/dj-assist.db
PYTHON_EXECUTABLE=/Users/<you>/Projects/dj-assist/.venv/bin/python
```

---

## Running the App

### Desktop (Electron + Next.js)

```bash
npm run dev
```

Launches the Electron window and the Next.js backend together.

### Backend only (for debugging)

```bash
npm run backend:dev
```

Then open `http://localhost:3000` in a browser.

### First-run checklist

1. Open the **Collection** panel and check **Startup Diagnostics** — confirm the runtime shows green.
2. Enter a local music folder path in the scan bar and run a scan.
3. Confirm tracks appear in the library list.
4. Test playback and waveform scrubbing on a track.

---

## Configuration

All configuration is via environment variables (`.env.local` for local dev).

| Variable | Default | Description |
|---|---|---|
| `DJ_ASSIST_DB_PATH` | `~/.dj_assist/dj_assist.db` | Path to the SQLite database |
| `DJ_ASSIST_DATABASE_URL` | — | PostgreSQL connection string; overrides SQLite |
| `PYTHON_EXECUTABLE` | `python3` | Path to the Python interpreter used for scans |
| `GOOGLE_CLIENT_ID` | — | Google OAuth Desktop App client ID used for PKCE sign-in |
| `SPOTIFY_CLIENT_ID` | — | Spotify API client ID for metadata enrichment |
| `SPOTIFY_CLIENT_SECRET` | — | Spotify API client secret |
| `ACOUSTID_API_KEY` | — | AcoustID API key for fingerprint-based metadata |
| `DJ_ASSIST_ELECTRON_PORT` | `3000` | Port the Next.js server listens on |
| `DJ_ASSIST_ELECTRON_HOST` | `127.0.0.1` | Host the Next.js server binds to |

Google sign-in expects a Google OAuth client of type `Desktop app`. Release builds embed `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from GitHub Actions configuration so end users only see **Sign in with Google**. This is not a service-account key; Google treats installed-app client secrets as app credentials rather than user-facing secrets.

Spotify credentials can also be saved from within the app under **Settings → Spotify**.

---

## CLI Reference

The Python package exposes a `dj-assist` command. Activate the virtualenv first, or use `python -m dj_assist.cli`.

### Scanning

```bash
dj-assist scan <directory>
```

| Option | Description |
|---|---|
| `--mode smart` | Only scan new and changed files (default) |
| `--mode full` | Rescan all files |
| `--mode missing-metadata` | Only files with no Spotify metadata |
| `--mode missing-analysis` | Only files missing BPM/key |
| `--mode missing-art` | Only files missing album art |
| `--fetch-art` | Fetch album art during this scan |
| `--verbose` | Enable detailed diagnostic output |

### Library

```bash
dj-assist list                         # List all tracks
dj-assist search --query "track name"  # Search by title/artist
dj-assist search --artist "Artist"
dj-assist search --key 8A
dj-assist search --bpm-min 120 --bpm-max 130
dj-assist debug <track_id>             # Show full analysis details for a track
```

### Analysis

```bash
dj-assist reanalyze-bpm <track_id>     # Re-detect BPM for a single track
dj-assist waveform-peaks <file>        # Extract waveform peaks as JSON
dj-assist fetch-art                    # Fetch missing album art for all tracks
dj-assist fetch-art --force            # Refetch art even if already present
dj-assist fetch-art --limit 50         # Limit to N tracks
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
dj-assist set new "My Set Name"         # Create a new set
dj-assist set list                      # List all sets
dj-assist set show <set_id>             # Show tracks in a set
dj-assist set add <set_id> <track_id>   # Add a track
dj-assist set remove <set_id> <pos>     # Remove track at position
dj-assist set recommend <set_id>        # Get compatible next-track suggestions
dj-assist set export <set_id>           # Export set to file
dj-assist set export <set_id> --output playlist.m3u
```

### Library Management

```bash
dj-assist dedupe                        # Find and remove duplicates (interactive)
dj-assist dedupe --dry-run              # Preview duplicates without deleting
dj-assist reset-db                      # Reset the database (prompts for confirmation)
dj-assist reset-db --yes                # Skip confirmation
```

### Interactive Set Building

```bash
dj-assist flow                          # Start interactive set builder
dj-assist flow --start-track-id <id>    # Start from a specific track
```

### Flask Web UI (legacy)

```bash
dj-assist web
dj-assist web --host 0.0.0.0 --port 8080 --debug
```

---

## API Reference

Base URL: `http://127.0.0.1:3000/api`

### Scanning

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/scan` | List scan job history |
| `POST` | `/api/scan` | Start a new scan |
| `GET` | `/api/scan/:id` | Get scan job status |
| `GET` | `/api/scan/:id/stream` | Stream scan progress (Server-Sent Events) |
| `POST` | `/api/scan/validate` | Validate a directory path before scanning |

**Start scan request body:**

```json
{
  "path": "/Users/you/Music",
  "mode": "smart",
  "fetchArt": false,
  "verbose": false
}
```

### Tracks

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tracks` | List tracks with optional filters |
| `GET` | `/api/tracks/:id` | Get track details |
| `PATCH` | `/api/tracks/:id` | Update track metadata |
| `GET` | `/api/tracks/:id/waveform` | Get waveform peaks array |
| `GET` | `/api/tracks/:id/stream` | Stream the audio file |
| `GET` | `/api/tracks/:id/next` | Get compatible next-track suggestions |
| `POST` | `/api/tracks/:id/reanalyze-bpm` | Trigger BPM reanalysis |
| `PATCH` | `/api/tracks/bulk` | Bulk update multiple tracks |

**Track list query parameters:**

| Param | Type | Description |
|---|---|---|
| `q` | string | Full-text search across title, artist, album, tags |
| `artist` | string | Filter by artist name |
| `album` | string | Filter by album name |
| `key` | string | Filter by Camelot key (e.g. `8A`) |
| `bpmMin` | number | Minimum BPM |
| `bpmMax` | number | Maximum BPM |
| `tag` | string | Filter by tag |
| `limit` | number | Max results (default 50) |
| `offset` | number | Pagination offset |

### Sets

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sets` | List all sets |
| `POST` | `/api/sets` | Create a new set |
| `GET` | `/api/sets/:id` | Get set with tracks |
| `PATCH` | `/api/sets/:id` | Update set name |
| `POST` | `/api/sets/:id/tracks` | Add a track to the set |
| `DELETE` | `/api/sets/:id/tracks/:position` | Remove a track by position |

### Library

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/library` | Library statistics and health metrics |
| `POST` | `/api/library/reset` | Reset the database |

### Settings

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/settings/spotify` | Save Spotify API credentials |

### Watch Folders

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/watch` | List configured watch folders |
| `POST` | `/api/watch` | Add a watch folder |
| `DELETE` | `/api/watch` | Remove a watch folder |

### Other

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/logs/client` | Submit client-side log entries |

---

## Building for Distribution

### macOS app bundle (unsigned, for local testing)

```bash
npm run build       # Build Next.js
npm run pack:mac    # Create .app bundle in dist-electron/
```

### macOS distributables (DMG + ZIP)

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

The packaging flow:
1. Copies the relocatable Python runtime into `python/runtime`
2. Creates a fresh in-bundle virtualenv at `python/env`
3. Installs scanner dependencies into the bundle
4. Runs `electron-builder` to produce the final artifact

> The Python runtime must be a **relocatable standalone build** — not a symlinked Homebrew installation. A Homebrew virtualenv will not work inside the app bundle.

See [Product Shipping Guide](./docs/PRODUCT-SHIPPING.md) for the full discussion of distribution options.

---

## Troubleshooting

### Startup Diagnostics shows the runtime is not ready

Open **Collection → Startup Diagnostics**. It shows whether the bundled Python runtime and database are accessible. In dev, confirm `.env.local` has the correct `PYTHON_EXECUTABLE` and `DJ_ASSIST_DB_PATH`.

### Python scan fails

Test the scanner directly:

```bash
source .venv/bin/activate
python -m dj_assist.cli --help
python -m dj_assist.cli scan /path/to/music
```

### Database is unavailable

Verify `.env.local` exists with `DJ_ASSIST_DB_PATH` pointing to a writable directory, then restart `npm run dev`.

### macOS says the app cannot be opened (unsigned build)

Right-click the app in Finder → **Open**, then confirm. Or go to **System Settings → Privacy & Security** and allow the app.

### App refuses to start due to Node version

DJ Assist requires Node 22.x.

```bash
node -v
brew install node@22 && brew link --force --overwrite node@22
```

### No waveform or audio playback

Confirm the track file path is readable by the backend, then test the stream endpoint directly:

```bash
curl -I http://127.0.0.1:3000/api/tracks/<id>/stream
```

### Scan finds files but no metadata appears

Add your Spotify credentials under **Settings → Spotify** or set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env.local`, then rescan with `--mode missing-metadata`.

---

## Additional Docs

- [Client Install Guide](./docs/CLIENT-INSTALL.md)
- [Product Shipping Guide](./docs/PRODUCT-SHIPPING.md)
- [Electron Plan](./docs/ELECTRON-PLAN.md)
