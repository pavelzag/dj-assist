import { existsSync } from 'node:fs';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { join } from 'node:path';

export interface ScanRequest {
  directory: string;
  fetchAlbumArt?: boolean;
  rescanExisting?: boolean;
  rescanMode?: 'smart' | 'missing-metadata' | 'missing-analysis' | 'missing-art' | 'full';
  autoDoubleBpm?: boolean;
  verbose?: boolean;
}

export interface ScanSummary {
  scanned: number;
  analyzed: number;
  skipped: number;
  errors: number;
}

export interface ScanProgressEvent {
  event: string;
  current?: number;
  total?: number;
  directory?: string;
  file?: string;
  path?: string;
  status?: string;
  level?: string;
  message?: string;
  error?: string;
  artist?: string | null;
  title?: string | null;
  results?: ScanSummary;
}

export interface ScanProcess {
  child: ChildProcessByStdio<null, Readable, Readable>;
  command: string[];
}

export class ScanSetupError extends Error {
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ScanSetupError';
    this.details = details;
  }
}

function repoRoot(): string {
  return process.cwd();
}

function resolvePythonCandidates(): string[] {
  const candidates: string[] = [];
  const localVenvPython = join(repoRoot(), '.venv', 'bin', 'python');
  const explicit = process.env.PYTHON_EXECUTABLE?.trim();

  if (explicit) candidates.push(explicit);
  candidates.push('python3');
  candidates.push('python');
  if (existsSync(localVenvPython)) candidates.push(localVenvPython);

  return [...new Set(candidates)];
}

function buildScanArgs(request: ScanRequest): string[] {
  const directory = request.directory.trim();
  const args = ['-m', 'dj_assist.cli', 'scan', directory, '--json-progress'];

  const rescanMode = request.rescanMode ?? (request.rescanExisting ? 'full' : 'smart');
  args.push('--rescan-mode', rescanMode);
  if (request.fetchAlbumArt !== false) args.push('--fetch-album-art');
  else args.push('--no-fetch-album-art');
  if (request.autoDoubleBpm !== false) args.push('--auto-double');
  if (request.verbose) args.push('--verbose');

  return args;
}

async function runPythonCheck(python: string): Promise<{ ok: boolean; output: string }> {
  const child = spawn(python, ['-m', 'dj_assist.cli', '--help'], {
    cwd: repoRoot(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });

  const exitCode = await new Promise<number>((resolve) => {
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });

  return { ok: exitCode === 0, output };
}

export async function resolveWorkingPython(): Promise<string> {
  let lastError =
    process.env.DJ_ASSIST_BUNDLED_PYTHON_ERROR?.trim() ||
    'No usable Python runtime found for scanning. Open Collection -> Startup Diagnostics and verify Python is ready.';
  let lastDetails: Record<string, unknown> = {};
  const explicit = process.env.PYTHON_EXECUTABLE?.trim();

  for (const python of resolvePythonCandidates()) {
    const result = await runPythonCheck(python);
    if (result.ok) return python;

    const missingPackage = /ModuleNotFoundError:\s+No module named/i.test(result.output);
    const missingInterpreter = /not found|enoent/i.test(result.output);
    const trimmedOutput = result.output.trim();
    lastError = trimmedOutput || lastError;
    lastDetails = { python, output: result.output.trim() };

    if (explicit && python === explicit) {
      throw new ScanSetupError(lastError, lastDetails);
    }

    if (!missingPackage && !missingInterpreter) {
      throw new ScanSetupError(lastError, lastDetails);
    }
  }

  throw new ScanSetupError(
    `${lastError}${lastDetails.python ? ` Interpreter tried: ${String(lastDetails.python)}` : ''}`,
    lastDetails,
  );
}

export async function spawnScanProcess(request: ScanRequest): Promise<ScanProcess> {
  const directory = request.directory.trim();
  if (!directory) {
    throw new ScanSetupError('Directory is required');
  }

  const python = await resolveWorkingPython();
  const command = [python, ...buildScanArgs(request)];
  const child = spawn(command[0], command.slice(1), {
    cwd: repoRoot(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return { child, command };
}
