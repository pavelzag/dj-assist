# Client Install Guide

This guide is for installing DJ Assist on a client computer using the current local setup.

## Current Distribution Model

DJ Assist is not yet packaged as a single installer. Today, installation means setting up:

- Node.js
- Python
- PostgreSQL
- the app source code

For non-technical clients, this is not ideal. For a productized rollout, see [Product Shipping Guide](./PRODUCT-SHIPPING.md).

## Supported Environment

Current recommended environment:

- macOS
- Node 22.x
- Python 3.11+
- PostgreSQL 16

## What Gets Installed

- Next.js UI application
- Python scan/analyzer backend
- PostgreSQL database

## Step 1: Install Homebrew

If Homebrew is not installed:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

## Step 2: Install Node 22

```bash
brew install node@22
brew unlink node
brew link --force --overwrite node@22
node -v
```

Expected:

```bash
v22.x.x
```

## Step 3: Install Python 3.11+

```bash
brew install python@3.11
python3 --version
```

## Step 4: Install PostgreSQL or Docker Desktop

Recommended for the current app:

- install Docker Desktop, then use the bundled `compose.yaml`

Start Docker Desktop before continuing.

## Step 5: Get the Project Files

Place the project folder on the client computer, for example:

```bash
/Applications/dj-assist
```

or

```bash
/Users/<username>/Applications/dj-assist
```

## Step 6: Create a Python Virtual Environment

Inside the project root:

```bash
cd /path/to/dj-assist
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

## Step 7: Start PostgreSQL

From the project root:

```bash
docker compose up -d
```

## Step 8: Create `.env.local`

Create `.env.local` in the project root:

```bash
DATABASE_URL=postgres://dj_assist:dj_assist@127.0.0.1:5432/dj_assist
PYTHON_EXECUTABLE=/path/to/dj-assist/.venv/bin/python
```

Example:

```bash
DATABASE_URL=postgres://dj_assist:dj_assist@127.0.0.1:5432/dj_assist
PYTHON_EXECUTABLE=/Users/pavel/Projects/dj-assist/.venv/bin/python
```

## Step 9: Install Node Dependencies

```bash
cd /path/to/dj-assist
npm install
```

## Step 10: Run the App

```bash
npm run dev
```

Open:

```bash
http://localhost:3000
```

## First-Run Checklist

After opening the app:

1. Open the `Library` panel and confirm runtime health looks correct.
2. Paste a local music-folder path into the scan bar.
3. Run a scan.
4. Confirm tracks appear in the library list.
5. Test playback and waveform scrubbing.

## Features Available To The Client

### Scanning

- scan local folders
- live logs
- progress bar
- rescan modes
- album art fetching
- watch folders

### Playback

- local playback
- waveform progress
- canvas scrubbing
- cue points

### Library management

- artist and album browsing
- duplicate detection
- smart crates
- tags
- bulk actions
- metadata editing

### Playlist building

- create playlists
- add tracks
- get compatible next-track suggestions

## Troubleshooting

### App refuses to start because of Node version

Run:

```bash
node -v
```

DJ Assist requires Node 22.x for the current setup.

### `DATABASE_URL environment variable is not set`

Check `.env.local` exists and restart `npm run dev`.

### Python scan fails

Check:

```bash
python -m dj_assist.cli --help
```

inside the virtualenv.

### Scan cannot connect to database

Make sure Docker Desktop is running and:

```bash
docker compose ps
```

shows PostgreSQL running.

### No waveform or playback

Confirm the track file is readable and the browser can access:

```bash
/api/tracks/<id>/stream
```

## What This Guide Does Not Yet Solve

This is still a developer-style install. It is not yet:

- a `.dmg`
- a signed macOS app
- a one-click desktop installer
- an Electron package

For that path, see [Product Shipping Guide](./PRODUCT-SHIPPING.md).
