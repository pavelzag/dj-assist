# DJ Assist - Track Analysis & Set Builder

## Overview
A CLI tool that scans music directories, analyzes tracks for BPM and musical key, stores metadata in a database, and helps build DJ sets with key/BPM compatibility suggestions.

## Tech Stack
- **Language**: Python 3.11+
- **Audio Analysis**: `librosa` (BPM, key detection), `mutagen` (metadata)
- **Database**: SQLite with `sqlalchemy`
- **CLI Framework**: `click`
- **Visualizations**: ASCII art tables

## Features

### 1. Directory Scanner
- Recursively scan directories for audio files
- Supported formats: MP3, FLAC, WAV, OGG, M4A, AIFF
- Extract metadata: title, artist, album, duration, bitrate
- Detect BPM (beats per minute)
- Detect musical key (Camelot wheel notation)
- Progress bar during scanning
- Skip already-analyzed files (checksum-based deduplication)

### 2. Track Database
- SQLite database storing all track metadata
- Search tracks by: title, artist, BPM range, key
- Sort and filter capabilities
- Export tracklist to text/CSV

### 3. Set Builder
- Create named playlists/sets
- Add tracks manually or via recommendations
- Key compatibility matrix (Camelot wheel rules):
  - Same key (best)
  - +1/-1 step on Camelot wheel
  - Relative major/minor (e.g., 8A → 8B)
  - Energy/BPM grouping
- Calculate set total duration
- Export set as ordered tracklist

### 4. Interactive CLI
```
Commands:
  scan <directory>     Scan directory for audio files
  list                 List all tracks
  search <query>        Search tracks
  set new <name>        Create new set
  set add <set_id> <track_id>  Add track to set
  set list             List all sets
  set show <set_id>    Show tracks in set
  set export <set_id>  Export set to file
```

## Data Model

### Track
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PK | Auto-increment |
| path | TEXT UNIQUE | File path |
| title | TEXT | Track title |
| artist | TEXT | Artist name |
| album | TEXT | Album name |
| duration | FLOAT | Duration in seconds |
| bpm | FLOAT | Beats per minute |
| key | TEXT | Musical key (Camelot) |
| key_numeric | TEXT | Numeric notation (e.g., "11A") |
| file_hash | TEXT | File content hash |
| created_at | DATETIME | When added |

### Set
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PK | Auto-increment |
| name | TEXT | Set name |
| created_at | DATETIME | When created |

### SetTrack
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PK | Auto-increment |
| set_id | INTEGER FK | Reference to Set |
| track_id | INTEGER FK | Reference to Track |
| position | INTEGER | Order in set |

## BPM Detection
- Use librosa's tempo estimation
- Validate BPM is in DJ range (60-180)
- Double/halve BPM if needed to match expected range

## Key Detection
- Use librosa's chroma features
- Map to Camelot wheel notation
- Support major/minor detection

## Camelot Wheel Reference
```
1A  2A  3A  4A  5A  6A  7A  8A  9A  10A 11A 12A
1B  2B  3B  4B  5B  6B  7B  8B  9B  10B 11B 12B
```

Compatible transitions: Same, ±1 step, 8A↔8B (relative major/minor)
