export type TrackSearchFilter =
  | { kind: 'bpm'; min?: number | null; max?: number | null; missing?: boolean }
  | { kind: 'key'; value?: string | null; missing?: boolean }
  | { kind: 'art'; missing?: boolean }
  | { kind: 'ignored'; value: boolean }
  | { kind: 'notes'; value: string }
  | { kind: 'tag'; value: string }
  | { kind: 'duplicate'; value: boolean };

export type ParsedTrackSearch = {
  textTerms: string[];
  filters: TrackSearchFilter[];
};

function tokenize(query: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]+)"|'([^']+)'|(\S+)/g;
  for (const match of query.matchAll(pattern)) {
    tokens.push((match[1] ?? match[2] ?? match[3] ?? '').trim());
  }
  return tokens.filter(Boolean);
}

function parseBooleanToken(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

export function parseTrackSearchQuery(query: string): ParsedTrackSearch {
  const textTerms: string[] = [];
  const filters: TrackSearchFilter[] = [];

  for (const token of tokenize(query)) {
    const separatorIndex = token.indexOf(':');
    if (separatorIndex === -1) {
      const normalized = token.trim().toLowerCase();
      if (['duplicate', 'duplicates', 'dup'].includes(normalized)) {
        filters.push({ kind: 'duplicate', value: true });
        continue;
      }
      textTerms.push(token);
      continue;
    }

    const key = token.slice(0, separatorIndex).trim().toLowerCase();
    const value = token.slice(separatorIndex + 1).trim();
    if (!value) {
      textTerms.push(token);
      continue;
    }

    if (key === 'bpm') {
      if (value.toLowerCase() === 'missing') {
        filters.push({ kind: 'bpm', missing: true });
        continue;
      }
      const [minRaw, maxRaw] = value.split('-').map((part) => part.trim()).filter(Boolean);
      const min = Number(minRaw);
      const max = Number(maxRaw ?? minRaw);
      if (Number.isFinite(min) && Number.isFinite(max) && maxRaw) {
        filters.push({ kind: 'bpm', min: Math.min(min, max), max: Math.max(min, max) });
      } else if (Number.isFinite(min)) {
        filters.push({ kind: 'bpm', min, max: min });
      } else {
        textTerms.push(token);
      }
      continue;
    }

    if (key === 'key') {
      if (value.toLowerCase() === 'missing') {
        filters.push({ kind: 'key', missing: true });
      } else {
        filters.push({ kind: 'key', value });
      }
      continue;
    }

    if (key === 'art' || key === 'albumart' || key === 'cover') {
      if (['missing', 'none', 'false'].includes(value.toLowerCase())) {
        filters.push({ kind: 'art', missing: true });
      } else {
        filters.push({ kind: 'art', missing: false });
      }
      continue;
    }

    if (key === 'ignored') {
      const boolValue = parseBooleanToken(value);
      if (boolValue == null) {
        textTerms.push(token);
      } else {
        filters.push({ kind: 'ignored', value: boolValue });
      }
      continue;
    }

    if (key === 'notes' || key === 'note') {
      filters.push({ kind: 'notes', value });
      continue;
    }

    if (key === 'tag' || key === 'tags') {
      filters.push({ kind: 'tag', value });
      continue;
    }

    if (key === 'duplicate' || key === 'dup') {
      const boolValue = parseBooleanToken(value);
      filters.push({ kind: 'duplicate', value: boolValue ?? true });
      continue;
    }

    textTerms.push(token);
  }

  return { textTerms, filters };
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function hasTextMatch(haystacks: string[], terms: string[]): boolean {
  if (!terms.length) return true;
  const normalizedHaystacks = haystacks.map((value) => normalize(value));
  return terms.every((term) => normalizedHaystacks.some((haystack) => haystack.includes(normalize(term))));
}

export function matchesTrackSearchQuery(
  track: Record<string, unknown>,
  query: string,
  options?: { duplicateTrackIds?: Set<number> },
): boolean {
  const parsed = parseTrackSearchQuery(query);
  const haystacks = [
    String(track.title ?? ''),
    String(track.artist ?? ''),
    String(track.album ?? ''),
    String(track.spotify_album_name ?? ''),
    String(track.path ?? ''),
    Array.isArray(track.custom_tags) ? track.custom_tags.join(' ') : String(track.custom_tags ?? ''),
    String(track.track_notes ?? ''),
  ];
  if (!hasTextMatch(haystacks, parsed.textTerms)) return false;

  for (const filter of parsed.filters) {
    if (filter.kind === 'bpm') {
      const bpm = Number(track.effective_bpm ?? track.bpm_override ?? track.bpm ?? track.spotify_tempo ?? 0);
      if (filter.missing) {
        if (bpm > 0) return false;
        continue;
      }
      if (filter.min != null && bpm < filter.min) return false;
      if (filter.max != null && bpm > filter.max) return false;
      continue;
    }
    if (filter.kind === 'key') {
      const effectiveKey = normalize(track.effective_key ?? track.key ?? track.spotify_key ?? track.key_numeric ?? '');
      if (filter.missing) {
        if (effectiveKey) return false;
        continue;
      }
      if (filter.value && !effectiveKey.includes(normalize(filter.value))) return false;
      continue;
    }
    if (filter.kind === 'art') {
      const hasArt = Boolean(String(track.album_art_url ?? '').trim());
      if (filter.missing && hasArt) return false;
      if (!filter.missing && !hasArt) return false;
      continue;
    }
    if (filter.kind === 'ignored') {
      if (Boolean(track.ignored) !== filter.value) return false;
      continue;
    }
    if (filter.kind === 'notes') {
      const notes = normalize(track.track_notes ?? '');
      if (!notes.includes(normalize(filter.value))) return false;
      continue;
    }
    if (filter.kind === 'tag') {
      const tags = Array.isArray(track.custom_tags) ? track.custom_tags.map((value) => normalize(value)) : [];
      if (!tags.some((tag) => tag.includes(normalize(filter.value)))) return false;
      continue;
    }
    if (filter.kind === 'duplicate') {
      if (!filter.value) continue;
      const duplicateTrackIds = options?.duplicateTrackIds;
      if (!duplicateTrackIds || !duplicateTrackIds.has(Number(track.id))) return false;
    }
  }

  return true;
}
