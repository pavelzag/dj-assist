import { randomUUID } from 'node:crypto';
import { stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import {
  addScanLog,
  createScanRun,
  finalizeScanRun,
  getScanLogs,
  getScanRunById,
  listScanRuns,
  updateScanRun,
} from '@/lib/db';
import { spawnScanProcess, type ScanProgressEvent, type ScanRequest } from '@/lib/scan';

export type RescanMode = 'smart' | 'missing-metadata' | 'missing-analysis' | 'missing-art' | 'full';

export type ScanJobState = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  directory: string;
  currentFile: string;
  totalFiles: number;
  processedFiles: number;
  summary: {
    scanned: number;
    analyzed: number;
    skipped: number;
    errors: number;
    with_bpm: number;
    with_key: number;
    with_spotify: number;
    with_album_art: number;
    decode_failures: number;
  };
  validation: Record<string, unknown>;
  options: {
    fetchAlbumArt: boolean;
    fastScan: boolean;
    verbose: boolean;
    rescanMode: RescanMode;
  };
  fatalError?: string;
  logs: Array<{ level: string; message: string; eventType: string; createdAt: string }>;
};

type Subscriber = (event: Record<string, unknown>) => void;

type InMemoryJob = {
  state: ScanJobState;
  child: ChildProcessByStdio<null, Readable, Readable> | null;
  subscribers: Set<Subscriber>;
  stdoutBuffer: string;
  stderrBuffer: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __scanJobs: Map<string, InMemoryJob> | undefined;
}

function jobsStore(): Map<string, InMemoryJob> {
  if (!global.__scanJobs) global.__scanJobs = new Map<string, InMemoryJob>();
  return global.__scanJobs;
}

let staleRunsCleanupPromise: Promise<void> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function classifyLogLevel(message: string, fallback: string): 'info' | 'warning' | 'error' | 'success' {
  if (fallback === 'success') return 'success';
  if (/libmpg123|mpeg header|runtimewarning/i.test(message)) return 'warning';
  if (/spotify timeout|decode|missing|skipped/i.test(message)) return fallback === 'error' ? 'error' : 'warning';
  if (fallback === 'error') return 'error';
  return 'info';
}

async function quickCountAudioFiles(directory: string): Promise<number> {
  let count = 0;
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop()!;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(mp3|flac|wav|ogg|m4a|aiff|aif)$/i.test(entry.name)) count += 1;
    }
  }
  return count;
}

export async function validateScanDirectory(directory: string): Promise<Record<string, unknown>> {
  const trimmed = directory.trim();
  if (!trimmed) throw new Error('Directory is required');
  const info = await stat(trimmed).catch(() => null);
  if (!info) throw new Error(`Directory not found: ${trimmed}`);
  if (!info.isDirectory()) throw new Error(`Path is not a directory: ${trimmed}`);
  const audioFileCount = await quickCountAudioFiles(trimmed);
  return {
    exists: true,
    is_directory: true,
    audio_file_count: audioFileCount,
    empty: audioFileCount === 0,
  };
}

function emit(job: InMemoryJob, event: Record<string, unknown>) {
  for (const subscriber of job.subscribers) subscriber(event);
}

async function cleanupStaleScanRuns(): Promise<void> {
  const inFlight = staleRunsCleanupPromise;
  if (inFlight) return inFlight;
  staleRunsCleanupPromise = (async () => {
    const runs = await listScanRuns(200);
    const activeJobIds = new Set(jobsStore().keys());
    for (const run of runs) {
      if (!['queued', 'running'].includes(run.status)) continue;
      if (activeJobIds.has(run.id)) continue;
      await finalizeScanRun(run.id, {
        status: 'cancelled',
        fatal_error: 'Scan stopped when the app backend was restarted or the app quit.',
      });
      await addScanLog({
        scanRunId: run.id,
        level: 'warning',
        message: 'Marked cancelled after app restart or quit',
        eventType: 'cancel',
      });
    }
  })().finally(() => {
    staleRunsCleanupPromise = null;
  });
  return staleRunsCleanupPromise;
}

async function persistLog(jobId: string, level: string, message: string, eventType = 'log', payload: Record<string, unknown> = {}) {
  try {
    await addScanLog({ scanRunId: jobId, level, message, eventType, payload });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    // The library reset flow can remove scan_runs while a late log event is still
    // in flight. Ignore that foreign-key miss instead of crashing backend stderr.
    if (/constraint failed|foreign key/i.test(messageText)) return;
    throw error;
  }
}

async function pushLog(job: InMemoryJob, level: 'info' | 'warning' | 'error' | 'success', message: string, eventType = 'log', payload: Record<string, unknown> = {}) {
  job.state.logs.unshift({ level, message, eventType, createdAt: nowIso() });
  job.state.logs = job.state.logs.slice(0, 100);
  emit(job, { event: 'log', level, message, eventType, created_at: nowIso(), payload });
  await persistLog(job.state.id, level, message, eventType, payload);
}

function applyProgressEvent(job: InMemoryJob, event: ScanProgressEvent & Record<string, unknown>) {
  if (typeof event.total === 'number') job.state.totalFiles = event.total;
  if (typeof event.current === 'number') job.state.processedFiles = event.current;
  if (typeof event.file === 'string') job.state.currentFile = event.file;
}

async function updatePersistentState(job: InMemoryJob) {
  await updateScanRun(job.state.id, {
    status: job.state.status,
    total_files: job.state.totalFiles,
    processed_files: job.state.processedFiles,
    current_file: job.state.currentFile || null,
    scanned: job.state.summary.scanned,
    analyzed: job.state.summary.analyzed,
    skipped: job.state.summary.skipped,
    errors: job.state.summary.errors,
    with_bpm: job.state.summary.with_bpm,
    with_key: job.state.summary.with_key,
    with_spotify: job.state.summary.with_spotify,
    with_album_art: job.state.summary.with_album_art,
    decode_failures: job.state.summary.decode_failures,
    summary: job.state.summary,
    validation: job.state.validation,
    fatal_error: job.state.fatalError ?? null,
  });
}

async function handleStructuredEvent(job: InMemoryJob, event: ScanProgressEvent & Record<string, unknown>) {
  applyProgressEvent(job, event);

  switch (event.event) {
    case 'scan_start':
      job.state.status = 'running';
      await updatePersistentState(job);
      break;
    case 'track_complete': {
      const status = String(event.status ?? '');
      if (status === 'analyzed' || status === 'server_match') {
        if (event.bpm && Number(event.bpm) > 0) job.state.summary.with_bpm += 1;
        if (event.key) job.state.summary.with_key += 1;
        if (event.spotify_id) job.state.summary.with_spotify += 1;
        if (event.album_art_url) job.state.summary.with_album_art += 1;
      }
      if (event.decode_failed) job.state.summary.decode_failures += 1;
      if (status === 'skipped') job.state.summary.skipped += 0;
      await updatePersistentState(job);
      break;
    }
    case 'scan_complete':
    case 'summary': {
      const results = event.results as Record<string, number> | undefined;
      if (results) {
        job.state.summary.scanned = Number(results.scanned ?? job.state.summary.scanned);
        job.state.summary.analyzed = Number(results.analyzed ?? job.state.summary.analyzed);
        job.state.summary.skipped = Number(results.skipped ?? job.state.summary.skipped);
        job.state.summary.errors = Number(results.errors ?? job.state.summary.errors);
      }
      job.state.status = job.state.fatalError ? 'failed' : 'completed';
      await finalizeScanRun(job.state.id, {
        status: job.state.status,
        total_files: job.state.totalFiles,
        processed_files: job.state.processedFiles,
        current_file: null,
        scanned: job.state.summary.scanned,
        analyzed: job.state.summary.analyzed,
        skipped: job.state.summary.skipped,
        errors: job.state.summary.errors,
        with_bpm: job.state.summary.with_bpm,
        with_key: job.state.summary.with_key,
        with_spotify: job.state.summary.with_spotify,
        with_album_art: job.state.summary.with_album_art,
        decode_failures: job.state.summary.decode_failures,
        summary: job.state.summary,
        fatal_error: job.state.fatalError ?? null,
      });
      break;
    }
    case 'scan_failed':
      job.state.status = 'failed';
      job.state.fatalError = String(event.error ?? 'Scan failed');
      await finalizeScanRun(job.state.id, {
        status: 'failed',
        fatal_error: job.state.fatalError,
        summary: job.state.summary,
      });
      break;
    default:
      break;
  }
}

export async function createScanJob(input: {
  directory: string;
  fetchAlbumArt: boolean;
  fastScan: boolean;
  verbose: boolean;
  rescanMode: RescanMode;
}): Promise<ScanJobState> {
  const validation = await validateScanDirectory(input.directory);
  const id = randomUUID();
  const state: ScanJobState = {
    id,
    status: 'queued',
    directory: input.directory,
    currentFile: '',
    totalFiles: Number(validation.audio_file_count ?? 0),
    processedFiles: 0,
    summary: {
      scanned: 0,
      analyzed: 0,
      skipped: 0,
      errors: 0,
      with_bpm: 0,
      with_key: 0,
      with_spotify: 0,
      with_album_art: 0,
      decode_failures: 0,
    },
    validation,
    options: {
      fetchAlbumArt: input.fetchAlbumArt,
      fastScan: input.fastScan,
      verbose: input.verbose,
      rescanMode: input.rescanMode,
    },
    logs: [],
  };

  await createScanRun({
    id,
    directory: input.directory,
    rescanMode: input.rescanMode,
    fetchAlbumArt: input.fetchAlbumArt,
    verbose: input.verbose,
    validation,
  });

  const job: InMemoryJob = {
    state,
    child: null,
    subscribers: new Set(),
    stdoutBuffer: '',
    stderrBuffer: '',
  };
  jobsStore().set(id, job);
  await pushLog(job, validation.empty ? 'warning' : 'info', validation.empty ? 'No supported audio files found in directory' : `Validated directory with ${state.totalFiles} supported audio files`, 'preflight', validation);
  return state;
}

export async function startScanJob(jobId: string): Promise<void> {
  const job = jobsStore().get(jobId);
  if (!job) throw new Error('Scan job not found');
  if (job.child || job.state.status === 'running') return;

  const request: ScanRequest = {
    directory: job.state.directory,
    fetchAlbumArt: job.state.options.fetchAlbumArt,
    fastScan: job.state.options.fastScan,
    verbose: job.state.options.verbose,
    autoDoubleBpm: true,
    rescanMode: job.state.options.rescanMode,
  } as ScanRequest & { rescanMode: RescanMode };

  const { child, command } = await spawnScanProcess(request);
  job.child = child;
  job.state.status = 'running';
  emit(job, { event: 'process_start', command, job_id: jobId });
  await updatePersistentState(job);

  child.stdout.on('data', (chunk) => {
    job.stdoutBuffer += String(chunk);
    let idx = job.stdoutBuffer.indexOf('\n');
    while (idx !== -1) {
      const line = job.stdoutBuffer.slice(0, idx).trim();
      job.stdoutBuffer = job.stdoutBuffer.slice(idx + 1);
      if (line) {
        try {
          const event = JSON.parse(line) as ScanProgressEvent & Record<string, unknown>;
          emit(job, { ...event, job_id: jobId });
          void handleStructuredEvent(job, event);
          if (event.event === 'log') {
            const message = String(event.message ?? '');
            const level = classifyLogLevel(message, String(event.level ?? 'info'));
            void pushLog(job, level, message, 'log', event);
          }
        } catch {
          emit(job, { event: 'log', level: 'info', message: line, job_id: jobId });
          void pushLog(job, 'info', line, 'stdout');
        }
      }
      idx = job.stdoutBuffer.indexOf('\n');
    }
  });

  child.stderr.on('data', (chunk) => {
    job.stderrBuffer += String(chunk);
    let idx = job.stderrBuffer.indexOf('\n');
    while (idx !== -1) {
      const line = job.stderrBuffer.slice(0, idx).trim();
      job.stderrBuffer = job.stderrBuffer.slice(idx + 1);
      if (line) {
        const level = classifyLogLevel(line, /error/i.test(line) ? 'error' : 'warning');
        emit(job, { event: 'log', level, message: line, job_id: jobId });
        void pushLog(job, level, line, 'stderr');
      }
      idx = job.stderrBuffer.indexOf('\n');
    }
  });

  child.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    job.state.status = 'failed';
    job.state.fatalError = message;
    emit(job, { event: 'scan_failed', error: message, job_id: jobId });
    void pushLog(job, 'error', message, 'process_error');
    void finalizeScanRun(jobId, { status: 'failed', fatal_error: message, summary: job.state.summary });
  });

  child.on('close', (code, signal) => {
    if (job.stderrBuffer.trim()) {
      const line = job.stderrBuffer.trim();
      const level = classifyLogLevel(line, /error/i.test(line) ? 'error' : 'warning');
      emit(job, { event: 'log', level, message: line, job_id: jobId });
      void pushLog(job, level, line, 'stderr');
      job.stderrBuffer = '';
    }
    if (job.stdoutBuffer.trim()) {
      const line = job.stdoutBuffer.trim();
      emit(job, { event: 'log', level: 'info', message: line, job_id: jobId });
      void pushLog(job, 'info', line, 'stdout');
      job.stdoutBuffer = '';
    }
    job.child = null;
    if (job.state.status === 'cancelled') {
      void finalizeScanRun(jobId, { status: 'cancelled', summary: job.state.summary, fatal_error: null, current_file: null });
      emit(job, { event: 'scan_cancelled', job_id: jobId });
      return;
    }
    if (code !== 0 && job.state.status !== 'failed' && job.state.status !== 'completed') {
      job.state.status = 'failed';
      job.state.fatalError = `Scan process exited with code ${code ?? 1}${signal ? ` (${signal})` : ''}`;
      emit(job, { event: 'scan_failed', error: job.state.fatalError, job_id: jobId });
      void pushLog(job, 'error', job.state.fatalError, 'exit');
      void finalizeScanRun(jobId, { status: 'failed', fatal_error: job.state.fatalError, summary: job.state.summary });
    }
  });
}

export function subscribeToScanJob(jobId: string, subscriber: Subscriber): () => void {
  const job = jobsStore().get(jobId);
  if (!job) {
    subscriber({
      event: 'job_state',
      job_id: jobId,
      status: 'missing',
      current: 0,
      total: 0,
      current_file: '',
    });
    return () => {};
  }
  job.subscribers.add(subscriber);
  subscriber({
    event: 'job_state',
    job_id: jobId,
    status: job.state.status,
    directory: job.state.directory,
    current: job.state.processedFiles,
    total: job.state.totalFiles,
    current_file: job.state.currentFile,
    summary: job.state.summary,
    validation: job.state.validation,
    options: job.state.options,
  });
  for (const log of [...job.state.logs].reverse()) {
    subscriber({ event: 'log', level: log.level, message: log.message, eventType: log.eventType, created_at: log.createdAt, replay: true, job_id: jobId });
  }
  return () => {
    job.subscribers.delete(subscriber);
  };
}

export async function cancelScanJob(jobId: string): Promise<void> {
  const job = jobsStore().get(jobId);
  if (!job) throw new Error('Scan job not found');
  if (!job.child) return;
  job.state.status = 'cancelled';
  job.child.kill('SIGTERM');
  await pushLog(job, 'warning', 'Scan cancelled by user', 'cancel');
}

export async function cancelAllScanJobs(): Promise<void> {
  const jobs = [...jobsStore().values()];
  const pendingStops: Promise<void>[] = [];
  for (const job of jobs) {
    if (!job.child) continue;
    job.state.status = 'cancelled';
    const child = job.child;
    const closed = new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      child.once('close', finish);
      setTimeout(finish, 1500);
    });
    job.child.kill('SIGTERM');
    await pushLog(job, 'warning', 'Scan cancelled due to library reset', 'cancel');
    pendingStops.push(closed);
  }
  await Promise.all(pendingStops);
}

export async function getScanJobSnapshot(jobId: string) {
  await cleanupStaleScanRuns();
  const inMemory = jobsStore().get(jobId);
  if (inMemory) {
    return {
      ...inMemory.state,
      logs: inMemory.state.logs,
    };
  }
  const run = await getScanRunById(jobId);
  if (!run) return null;
  const logs = await getScanLogs(jobId, 200);
  return {
    id: run.id,
    status: run.status,
    directory: run.directory,
    currentFile: run.current_file ?? '',
    totalFiles: run.total_files,
    processedFiles: run.processed_files,
    summary: {
      scanned: run.scanned,
      analyzed: run.analyzed,
      skipped: run.skipped,
      errors: run.errors,
      with_bpm: run.with_bpm,
      with_key: run.with_key,
      with_spotify: run.with_spotify,
      with_album_art: run.with_album_art,
      decode_failures: run.decode_failures,
    },
    validation: run.validation,
    options: {
      fetchAlbumArt: run.fetch_album_art,
      verbose: run.verbose_enabled,
      rescanMode: run.rescan_mode as RescanMode,
    },
    fatalError: run.fatal_error ?? undefined,
    logs: logs.map((log) => ({
      level: log.level,
      message: log.message,
      eventType: log.event_type,
      createdAt: log.created_at?.toISOString() ?? nowIso(),
    })),
    createdAt: run.created_at?.toISOString() ?? null,
    finishedAt: run.finished_at?.toISOString() ?? null,
  };
}

export async function listScanJobHistory(limit = 20) {
  await cleanupStaleScanRuns();
  const runs = await listScanRuns(limit);
  return runs.map((run) => ({
    id: run.id,
    status: run.status,
    directory: run.directory,
    currentFile: run.current_file ?? '',
    totalFiles: run.total_files,
    processedFiles: run.processed_files,
    summary: {
      scanned: run.scanned,
      analyzed: run.analyzed,
      skipped: run.skipped,
      errors: run.errors,
      with_bpm: run.with_bpm,
      with_key: run.with_key,
      with_spotify: run.with_spotify,
      with_album_art: run.with_album_art,
      decode_failures: run.decode_failures,
    },
    validation: run.validation,
    options: {
      fetchAlbumArt: run.fetch_album_art,
      verbose: run.verbose_enabled,
      rescanMode: run.rescan_mode as RescanMode,
    },
    fatalError: run.fatal_error ?? undefined,
    createdAt: run.created_at?.toISOString() ?? null,
    finishedAt: run.finished_at?.toISOString() ?? null,
  }));
}
