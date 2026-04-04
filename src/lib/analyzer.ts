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
  bpm: number | null;
  key: string | null;
  spotify_tempo?: number | null;
  spotify_key?: string | null;
}

export function getRecommendedNextTracks(
  currentKey: string,
  currentBpm: number,
  allTracks: TrackForRecommendation[],
  excludeIds: number[] = [],
): Array<{ track: TrackForRecommendation; reason: string; score: number }> {
  const results: Array<{ track: TrackForRecommendation; reason: string; score: number }> = [];

  for (const track of allTracks) {
    if (excludeIds.includes(track.id)) continue;
    const effectiveBpm = track.bpm ?? track.spotify_tempo ?? null;
    const effectiveKey = track.key || track.spotify_key || null;
    if (!effectiveBpm && !effectiveKey) continue;

    const bpmDiff = effectiveBpm ? Math.abs(effectiveBpm - currentBpm) : 999;
    const [compatible, keyReason] = effectiveKey
      ? isCompatibleKey(currentKey, effectiveKey)
      : [false, 'Unknown key'];

    let score: number;
    let reason: string;

    if (compatible && bpmDiff <= 10) {
      // Strong: compatible key + tight BPM
      score = 100 - bpmDiff * 2;
      reason = keyReason;
    } else if (compatible && bpmDiff <= 30) {
      // Good: compatible key + moderate BPM diff
      score = 70 - bpmDiff;
      reason = `${keyReason} · ${bpmDiff.toFixed(0)} BPM off`;
    } else if (compatible) {
      // Weak: key only
      score = Math.max(5, 40 - bpmDiff * 0.25);
      reason = `${keyReason} · ${bpmDiff.toFixed(0)} BPM off`;
    } else if (bpmDiff <= 5) {
      // BPM match, incompatible key
      score = 30 - bpmDiff;
      reason = 'BPM match';
    } else if (bpmDiff <= 15) {
      // Close BPM, key clash
      score = 15 - bpmDiff;
      reason = 'Close BPM';
    } else {
      continue;
    }

    results.push({ track, reason, score });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
