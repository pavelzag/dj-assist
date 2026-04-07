export function isCompatibleKey(key1: string, key2: string): [boolean, string] {
  if (!key1 || !key2) return [false, 'Unknown'];

  const num1 = parseInt(key1.slice(0, -1), 10);
  const mode1 = key1.slice(-1);
  const num2 = parseInt(key2.slice(0, -1), 10);
  const mode2 = key2.slice(-1);

  if (isNaN(num1) || isNaN(num2)) return [false, 'Invalid key'];
  if (key1 === key2) return [true, 'Perfect match'];
  if (num1 === num2 && mode1 !== mode2) return [true, 'Relative major/minor'];
  if (mode1 === mode2 && Math.min((num1 - num2 + 12) % 12, (num2 - num1 + 12) % 12) === 1) {
    return [true, 'Adjacent Camelot'];
  }
  return [false, 'Key clash'];
}

export interface TrackForRecommendation {
  id: number;
  artist?: string | null;
  album?: string | null;
  artist_canonical?: string | null;
  album_canonical?: string | null;
  duration?: number | null;
  bitrate?: number | null;
  bpm: number | null;
  key: string | null;
  spotify_tempo?: number | null;
  spotify_key?: string | null;
  decode_failed?: string | null;
  ignored?: boolean | number | null;
  custom_tags?: string[] | string | null;
}

export type RecommendationIntent = 'safe' | 'up' | 'down' | 'same';

function effectiveBpm(track: TrackForRecommendation): number | null {
  const bpm = Number(track.bpm ?? track.spotify_tempo ?? 0);
  return Number.isFinite(bpm) && bpm > 0 ? bpm : null;
}

function effectiveKey(track: TrackForRecommendation): string | null {
  const key = String(track.key ?? track.spotify_key ?? '').trim();
  return key || null;
}

function canonical(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizedTags(value: TrackForRecommendation['custom_tags']): string[] {
  if (Array.isArray(value)) return value.map((tag) => canonical(tag)).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((tag) => canonical(tag)).filter(Boolean);
  return [];
}

export function getRecommendedNextTracks(
  currentTrack: TrackForRecommendation,
  allTracks: TrackForRecommendation[],
  excludeIds: number[] = [],
  intent: RecommendationIntent = 'safe',
): Array<{ track: TrackForRecommendation; reason: string; score: number }> {
  const results: Array<{ track: TrackForRecommendation; reason: string; score: number }> = [];
  const normalizedCurrentKey = effectiveKey(currentTrack) ?? '';
  const normalizedCurrentBpm = Number(effectiveBpm(currentTrack) ?? 0);
  const hasCurrentKey = Boolean(normalizedCurrentKey);
  const hasCurrentBpm = normalizedCurrentBpm > 0;
  const currentArtist = canonical(currentTrack.artist_canonical ?? currentTrack.artist);
  const currentAlbum = canonical(currentTrack.album_canonical ?? currentTrack.album);
  const currentDuration = Number(currentTrack.duration ?? 0);
  const currentTags = new Set(normalizedTags(currentTrack.custom_tags));

  for (const track of allTracks) {
    if (excludeIds.includes(track.id)) continue;
    if (Boolean(track.ignored) || String(track.decode_failed ?? '').toLowerCase() === 'true') continue;
    const candidateBpm = effectiveBpm(track);
    const candidateKey = effectiveKey(track);
    if (!candidateBpm && !candidateKey) continue;

    const bpmDiff = hasCurrentBpm && candidateBpm ? Math.abs(candidateBpm - normalizedCurrentBpm) : 999;
    const [compatible, keyReason] = candidateKey && hasCurrentKey
      ? isCompatibleKey(normalizedCurrentKey, candidateKey)
      : [false, 'Unknown key'];
    const sameArtist = currentArtist && currentArtist === canonical(track.artist_canonical ?? track.artist);
    const sameAlbum = currentAlbum && currentAlbum === canonical(track.album_canonical ?? track.album);
    const bitrate = Number(track.bitrate ?? 0);
    const duration = Number(track.duration ?? 0);
    const durationDiff = currentDuration > 0 && duration > 0 ? Math.abs(duration - currentDuration) : 9999;
    const candidateTags = new Set(normalizedTags(track.custom_tags));
    const sharedTagCount = [...currentTags].filter((tag) => candidateTags.has(tag)).length;

    let score: number;
    const reasons: string[] = [];

    if (compatible && bpmDiff <= 10) {
      score = 100 - bpmDiff * 2;
      reasons.push(keyReason);
    } else if (compatible && bpmDiff <= 30) {
      score = 70 - bpmDiff;
      reasons.push(keyReason, `${bpmDiff.toFixed(0)} BPM off`);
    } else if (compatible && hasCurrentBpm && candidateBpm != null) {
      score = Math.max(5, 40 - bpmDiff * 0.25);
      reasons.push(keyReason, `${bpmDiff.toFixed(0)} BPM off`);
    } else if (bpmDiff <= 5) {
      score = 30 - bpmDiff;
      reasons.push('BPM match');
    } else if (bpmDiff <= 15) {
      score = 15 - bpmDiff;
      reasons.push('Close BPM');
    } else if (compatible) {
      score = 18;
      reasons.push(keyReason);
    } else if (hasCurrentBpm && candidateBpm && bpmDiff <= 30) {
      score = Math.max(1, 12 - bpmDiff * 0.3);
      reasons.push('BPM fallback', `${bpmDiff.toFixed(0)} BPM off`);
    } else if (!hasCurrentKey && !hasCurrentBpm) {
      score = 1;
      reasons.push('Fallback suggestion');
    } else if (!hasCurrentKey && hasCurrentBpm && candidateBpm) {
      score = Math.max(1, 10 - Math.min(bpmDiff, 30) * 0.25);
      reasons.push(bpmDiff <= 8 ? 'Close BPM' : 'BPM fallback', `${bpmDiff.toFixed(0)} BPM off`);
    } else if (hasCurrentKey && !hasCurrentBpm && compatible) {
      score = 16;
      reasons.push(keyReason);
    } else {
      continue;
    }

    if (sameArtist) {
      score -= 12;
      reasons.push('same artist');
    }
    if (sameAlbum) {
      score -= 8;
      reasons.push('same album');
    }
    if (bitrate > 0 && bitrate < 160) {
      score -= 6;
    } else if (bitrate >= 256) {
      score += 3;
    }
    if (sharedTagCount > 0) {
      score += Math.min(8, sharedTagCount * 3);
      reasons.push(sharedTagCount === 1 ? 'shared tag' : `${sharedTagCount} shared tags`);
    }
    if (durationDiff <= 20) {
      score += 4;
    } else if (durationDiff <= 45) {
      score += 2;
    }
    if (candidateBpm && candidateKey) {
      score += 4;
    }

    if (hasCurrentBpm && candidateBpm) {
      const directionalDiff = candidateBpm - normalizedCurrentBpm;
      if (intent === 'safe') {
        if (Math.abs(directionalDiff) <= 4) score += 8;
        else if (Math.abs(directionalDiff) <= 8) score += 3;
        else if (Math.abs(directionalDiff) > 14) score -= 8;
      } else if (intent === 'up') {
        if (directionalDiff >= 1 && directionalDiff <= 6) {
          score += 12;
          reasons.push('energy up');
        } else if (directionalDiff > 6 && directionalDiff <= 10) {
          score += 6;
          reasons.push('energy up');
        } else if (directionalDiff < -2) {
          score -= 10;
        }
      } else if (intent === 'down') {
        if (directionalDiff <= -1 && directionalDiff >= -6) {
          score += 12;
          reasons.push('energy down');
        } else if (directionalDiff < -6 && directionalDiff >= -10) {
          score += 6;
          reasons.push('energy down');
        } else if (directionalDiff > 2) {
          score -= 10;
        }
      } else if (intent === 'same') {
        if (Math.abs(directionalDiff) <= 3) score += 10;
        else if (Math.abs(directionalDiff) <= 6) score += 4;
        if (sharedTagCount > 0) score += 4;
        if (sameArtist) score += 4;
      }
    }

    if (intent === 'same') {
      if (sameAlbum) score += 2;
    } else {
      if (sameArtist) score -= 4;
      if (sameAlbum) score -= 4;
    }

    if (score <= 0) continue;

    results.push({
      track,
      reason: reasons.filter(Boolean).slice(0, 3).join(' · ') || 'Suggested',
      score,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
