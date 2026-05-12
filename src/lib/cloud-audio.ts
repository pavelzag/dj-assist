const AUDIO_EXTENSIONS = [
  '.mp3',
  '.flac',
  '.wav',
  '.ogg',
  '.m4a',
  '.aac',
  '.aiff',
  '.aif',
  '.opus',
  '.wma',
  '.alac',
  '.mp4',
  '.m4b',
  '.ape',
  '.mpga',
];

const PLAYLIST_EXTENSIONS = [
  '.m3u',
  '.m3u8',
  '.pls',
  '.cue',
];

const PLAYLIST_MIME_FRAGMENTS = [
  'audio/x-mpegurl',
  'audio/mpegurl',
  'application/x-mpegurl',
  'application/vnd.apple.mpegurl',
  'application/mpegurl',
  'audio/x-scpls',
  'application/pls+xml',
];

export function hasKnownAudioExtension(name: string): boolean {
  const normalized = String(name ?? '').trim().toLowerCase();
  return AUDIO_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export function hasKnownPlaylistExtension(name: string): boolean {
  const normalized = String(name ?? '').trim().toLowerCase();
  return PLAYLIST_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export function isLikelyAudioFile(input: { name: string; mimeType?: string | null }): boolean {
  if (hasKnownPlaylistExtension(input.name)) return false;
  const mimeType = String(input.mimeType ?? '').trim().toLowerCase();
  if (PLAYLIST_MIME_FRAGMENTS.some((fragment) => mimeType.includes(fragment))) return false;
  if (!mimeType || mimeType === 'application/octet-stream' || mimeType === 'binary/octet-stream') {
    return hasKnownAudioExtension(input.name);
  }
  if (mimeType === 'video/mp4' || mimeType === 'application/mp4') {
    return hasKnownAudioExtension(input.name);
  }
  return mimeType.includes('audio/') || hasKnownAudioExtension(input.name);
}

