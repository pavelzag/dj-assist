import { watch, type FSWatcher } from 'node:fs';
import { createScanJob, listScanJobHistory, startScanJob, validateScanDirectory } from '@/lib/scan-jobs';

type WatchEntry = {
  directory: string;
  watcher: FSWatcher;
  pendingTimer: NodeJS.Timeout | null;
  lastEventAt: string | null;
  lastChangedPath: string | null;
  lastJobId: string | null;
  status: 'watching' | 'scanning' | 'error';
  error?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __watchFolders: Map<string, WatchEntry> | undefined;
}

function store(): Map<string, WatchEntry> {
  if (!global.__watchFolders) global.__watchFolders = new Map();
  return global.__watchFolders;
}

function isAudioFile(path: string | null): boolean {
  return Boolean(path && /\.(mp3|flac|wav|ogg|m4a|aiff|aif)$/i.test(path));
}

async function triggerWatchScan(entry: WatchEntry) {
  const running = (await listScanJobHistory(10)).find((job) => ['queued', 'running'].includes(String(job.status ?? '')) && String(job.directory ?? '') === entry.directory);
  if (running?.id) {
    entry.status = 'scanning';
    entry.lastJobId = String(running.id);
    return;
  }

  const job = await createScanJob({
    directory: entry.directory,
    fetchAlbumArt: true,
    fastScan: false,
    verbose: false,
    rescanMode: 'smart',
  });
  entry.status = 'scanning';
  entry.lastJobId = job.id;
  await startScanJob(job.id);
}

export async function listWatchFolders() {
  return [...store().values()].map((entry) => ({
    directory: entry.directory,
    status: entry.status,
    lastEventAt: entry.lastEventAt,
    lastChangedPath: entry.lastChangedPath,
    lastJobId: entry.lastJobId,
    error: entry.error ?? null,
  }));
}

export async function addWatchFolder(directory: string) {
  const normalized = directory.trim();
  await validateScanDirectory(normalized);
  const existing = store().get(normalized);
  if (existing) {
    return {
      directory: existing.directory,
      status: existing.status,
      lastEventAt: existing.lastEventAt,
      lastChangedPath: existing.lastChangedPath,
      lastJobId: existing.lastJobId,
      error: existing.error ?? null,
    };
  }

  const entry: WatchEntry = {
    directory: normalized,
    watcher: watch(normalized, { recursive: true }, (_eventType, filename) => {
      const changedPath = typeof filename === 'string' ? filename : null;
      if (!isAudioFile(changedPath)) return;
      entry.lastEventAt = new Date().toISOString();
      entry.lastChangedPath = changedPath;
      entry.status = 'watching';
      if (entry.pendingTimer) clearTimeout(entry.pendingTimer);
      entry.pendingTimer = setTimeout(() => {
        entry.pendingTimer = null;
        void triggerWatchScan(entry).catch((error) => {
          entry.status = 'error';
          entry.error = error instanceof Error ? error.message : String(error);
        });
      }, 1500);
    }),
    pendingTimer: null,
    lastEventAt: null,
    lastChangedPath: null,
    lastJobId: null,
    status: 'watching',
  };
  store().set(normalized, entry);
  return {
    directory: entry.directory,
    status: entry.status,
    lastEventAt: entry.lastEventAt,
    lastChangedPath: entry.lastChangedPath,
    lastJobId: entry.lastJobId,
    error: null,
  };
}

export async function removeWatchFolder(directory: string) {
  const normalized = directory.trim();
  const entry = store().get(normalized);
  if (!entry) return false;
  if (entry.pendingTimer) clearTimeout(entry.pendingTimer);
  entry.watcher.close();
  store().delete(normalized);
  return true;
}

export async function clearWatchFolders() {
  for (const entry of store().values()) {
    if (entry.pendingTimer) clearTimeout(entry.pendingTimer);
    entry.watcher.close();
  }
  store().clear();
}
