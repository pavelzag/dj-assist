#!/usr/bin/env node

const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const SETTINGS_PATH = path.join(
  process.env.DJ_ASSIST_CONFIG_DIR?.trim() || path.join(os.homedir(), '.dj_assist'),
  'dj-assist-settings.json',
);
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DEFAULT_SERVER_URL = 'https://dj-assist-server.vercel.app';
const DEFAULT_LOCAL_SERVER_URL = 'http://localhost:3001';

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const settings = await loadSettings();
  const auth = await getUsableGoogleAuth(settings);
  const userData = buildUserData(auth);
  const clientId = String(settings.clientId || '').trim();
  if (!clientId) {
    throw new Error(`Missing clientId in ${SETTINGS_PATH}. Launch the desktop app once before running the worker.`);
  }
  const serverUrl = resolveServerUrl(settings);
  const appVersion = await readAppVersion();

  if (options.importFirst) {
    await runImport({
      auth,
      clientId,
      userData,
      serverUrl,
      maxFiles: options.maxFiles,
      folderId: options.folderId,
    });
  }

  const jobs = await fetchAnalysisJobs({
    auth,
    clientId,
    userData,
    serverUrl,
    folderId: options.folderId,
    batchSize: options.batchSize,
  });

  if (jobs.length === 0) {
    console.log('[google-drive-worker] no incomplete Drive tracks were returned');
    return;
  }

  const selectedJobs = options.maxJobs > 0 ? jobs.slice(0, options.maxJobs) : jobs;
  console.log(`[google-drive-worker] processing ${selectedJobs.length} Drive track(s) from ${serverUrl}`);

  let processed = 0;
  let uploaded = 0;
  let failed = 0;

  for (const job of selectedJobs) {
    processed += 1;
    const label = [job.artist, job.title].filter(Boolean).join(' - ') || job.client_track_id || job.drive_file_id;
    const tempPath = path.join(os.tmpdir(), `dj-assist-gdrive-${job.drive_file_id || randomUUID()}.mp3`);
    try {
      await downloadDriveFile(auth.accessToken, job.drive_file_id, tempPath);
      const analysis = await analyzeFile(tempPath);
      await uploadAnalysis({
        auth,
        clientId,
        userData,
        serverUrl,
        appVersion,
        job,
        analysis,
      });
      uploaded += 1;
      console.log(`[google-drive-worker] uploaded analysis for ${label}`);
    } catch (error) {
      failed += 1;
      console.error(`[google-drive-worker] failed ${label}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  console.log(JSON.stringify({
    processed,
    uploaded,
    failed,
    folder_id: options.folderId || null,
    server_url: serverUrl,
  }, null, 2));
}

function parseArgs(argv) {
  const options = {
    folderId: '',
    batchSize: 25,
    maxJobs: 0,
    maxFiles: 2000,
    importFirst: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--folder-id') {
      options.folderId = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (arg === '--batch-size') {
      options.batchSize = clampInteger(argv[index + 1], 1, 500, options.batchSize);
      index += 1;
      continue;
    }
    if (arg === '--max-jobs') {
      options.maxJobs = clampInteger(argv[index + 1], 0, 5000, options.maxJobs);
      index += 1;
      continue;
    }
    if (arg === '--max-files') {
      options.maxFiles = clampInteger(argv[index + 1], 1, 5000, options.maxFiles);
      index += 1;
      continue;
    }
    if (arg === '--import-first') {
      options.importFirst = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/google-drive-analysis-worker.cjs [options]

Options:
  --folder-id <id>      Restrict import/job processing to one Google Drive folder
  --batch-size <n>      Number of incomplete Drive tracks to request from the server (default: 25)
  --max-jobs <n>        Max number of jobs to process from the returned batch (default: all returned)
  --max-files <n>       Max files to metadata-import when --import-first is used (default: 2000)
  --import-first        Refresh server-side Drive metadata before claiming analysis jobs
  -h, --help            Show this help`);
}

async function loadSettings() {
  const raw = await fs.readFile(SETTINGS_PATH, 'utf8').catch(() => null);
  if (!raw) {
    throw new Error(`Could not read settings file at ${SETTINGS_PATH}`);
  }
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

async function getUsableGoogleAuth(settings) {
  const auth = settings.auth;
  if (!auth || auth.provider !== 'google' || !auth.id) {
    throw new Error('Google sign-in is required. Sign in through the desktop app first.');
  }
  if (!hasDriveScope(auth.scopes)) {
    throw new Error('Google Drive file access has not been granted. Sign in again through the desktop app to approve Drive access.');
  }
  if (hasUsableAccessToken(auth)) {
    return auth;
  }
  const refreshed = await refreshGoogleAuth(settings, auth);
  if (!refreshed || !hasUsableAccessToken(refreshed)) {
    throw new Error('Google Drive access token is unavailable. Sign in again through the desktop app.');
  }
  return refreshed;
}

function hasDriveScope(scopes) {
  const values = Array.isArray(scopes) ? scopes.filter((value) => typeof value === 'string') : [];
  return values.includes(GOOGLE_DRIVE_SCOPE) || values.includes('https://www.googleapis.com/auth/drive.metadata.readonly');
}

function hasUsableAccessToken(auth) {
  const token = String(auth.accessToken || '').trim();
  const expiresAt = Date.parse(String(auth.accessTokenExpiresAt || ''));
  return Boolean(token) && Number.isFinite(expiresAt) && expiresAt > Date.now() + 30_000;
}

function hasUsableIdToken(auth) {
  const token = String(auth.idToken || '').trim();
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length < 2) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const expiresAt = Number(payload.exp) * 1000;
    return Number.isFinite(expiresAt) && expiresAt > Date.now() + 30_000;
  } catch {
    return false;
  }
}

async function refreshGoogleAuth(settings, auth) {
  const refreshToken = String(auth.refreshToken || '').trim();
  if (!refreshToken) return null;
  const googleOauth = effectiveGoogleOauthCredentials(settings);
  const clientId = String(googleOauth.clientId || '').trim();
  const clientSecret = String(googleOauth.clientSecret || '').trim();
  if (!clientId) {
    throw new Error('Missing Google OAuth client ID in desktop settings or environment.');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Google token refresh failed (${response.status}): ${raw}`);
  }
  const payload = raw ? JSON.parse(raw) : {};
  const next = {
    ...auth,
    idToken: String(payload.id_token || auth.idToken || '').trim(),
    accessToken: String(payload.access_token || auth.accessToken || '').trim() || undefined,
    accessTokenExpiresAt: computeAccessTokenExpiresAt(payload.expires_in) || auth.accessTokenExpiresAt,
    refreshToken,
    scopes: parseScopes(payload.scope).length ? parseScopes(payload.scope) : auth.scopes,
    updatedAt: new Date().toISOString(),
  };

  await saveSettings({
    ...settings,
    auth: next,
  });

  return next;
}

function effectiveGoogleOauthCredentials(settings) {
  const saved = settings.googleOauth && typeof settings.googleOauth === 'object' ? settings.googleOauth : {};
  const savedId = String(saved.clientId || '').trim();
  const savedSecret = String(saved.clientSecret || '').trim();
  const envId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const envSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (envId) {
    return {
      clientId: envId,
      clientSecret: envSecret || (savedId && savedId === envId ? savedSecret : ''),
    };
  }
  return {
    clientId: savedId,
    clientSecret: savedSecret,
  };
}

async function saveSettings(next) {
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

function computeAccessTokenExpiresAt(expiresInSeconds) {
  const expiresIn = Number(expiresInSeconds);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return '';
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function parseScopes(value) {
  return String(value || '')
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function buildUserData(auth) {
  return {
    type: 'google',
    id: String(auth.id || '').trim(),
    email: auth.email || undefined,
    name: auth.name || undefined,
    picture: auth.picture || undefined,
    google_id_token: hasUsableIdToken(auth) ? String(auth.idToken || '').trim() : undefined,
    google_access_token: hasUsableAccessToken(auth) ? String(auth.accessToken || '').trim() : undefined,
  };
}

function resolveServerUrl(settings) {
  const server = settings.server && typeof settings.server === 'object' ? settings.server : {};
  const localDebug = Boolean(server.localDebug);
  const serverUrl = String(server.serverUrl || DEFAULT_SERVER_URL).trim() || DEFAULT_SERVER_URL;
  const localServerUrl = String(server.localServerUrl || DEFAULT_LOCAL_SERVER_URL).trim() || DEFAULT_LOCAL_SERVER_URL;
  const enabled = server.enabled !== false;
  if (!enabled) {
    throw new Error('Server sync is disabled in desktop settings.');
  }
  return (localDebug ? localServerUrl : serverUrl).replace(/\/+$/, '');
}

async function readAppVersion() {
  const raw = await fs.readFile(PACKAGE_JSON_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return String(parsed.version || '').trim() || '0.0.0';
}

async function runImport({ auth, clientId, userData, serverUrl, maxFiles, folderId }) {
  console.log(`[google-drive-worker] importing Drive metadata from ${serverUrl}`);
  const payload = await postJson(`${serverUrl}/api/v1/google-drive/import`, {
    headers: buildServerHeaders(auth, userData),
    body: {
      client_id: clientId,
      user_data: userData,
      max_files: maxFiles,
      folder_id: folderId || undefined,
      fallback_download_scan: false,
    },
    timeoutMs: 60_000,
  });
  console.log(`[google-drive-worker] import completed imported=${Number(payload.imported ?? 0)} fallback_parsed=${Number(payload.fallback?.parsed_files ?? 0)}`);
}

async function fetchAnalysisJobs({ auth, clientId, userData, serverUrl, folderId, batchSize }) {
  const payload = await postJson(`${serverUrl}/api/v1/google-drive/analysis-jobs`, {
    headers: buildServerHeaders(auth, userData),
    body: {
      client_id: clientId,
      user_data: userData,
      folder_id: folderId || undefined,
      fallback_download_limit: batchSize,
    },
    timeoutMs: 60_000,
  });
  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

function buildServerHeaders(auth, userData) {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'dj-assist-google-drive-worker',
    'X-Google-Access-Token': String(auth.accessToken || userData.google_access_token || '').trim(),
  };
  const googleIdToken = hasUsableIdToken(auth)
    ? String(auth.idToken || userData.google_id_token || '').trim()
    : '';
  if (googleIdToken) {
    headers.Authorization = `Bearer ${googleIdToken}`;
    headers['X-Google-Id-Token'] = googleIdToken;
  }
  return headers;
}

async function postJson(url, { headers, body, timeoutMs }) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  const payload = raw ? safeJsonParse(raw) : {};
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${typeof payload?.error === 'string' ? payload.error : raw}`);
  }
  return payload;
}

async function downloadDriveFile(accessToken, fileId, targetPath) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('alt', 'media');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok || !response.body) {
    const raw = await response.text().catch(() => '');
    throw new Error(`Drive download failed (${response.status}): ${raw}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(targetPath));
}

async function analyzeFile(filePath) {
  const python = await resolvePythonBinary();
  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      ['-m', 'dj_assist.cli', 'analyze-file', filePath, '--bpm-lookup', 'auto', '--auto-double'],
      { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf8').trim();
      const err = Buffer.concat(stderr).toString('utf8').trim();
      if (code !== 0) {
        reject(new Error(err || out || `analyze-file exited with code ${code}`));
        return;
      }
      const parsed = safeJsonParse(out);
      if (!parsed || typeof parsed !== 'object') {
        reject(new Error(`Unexpected analyzer output: ${out}`));
        return;
      }
      resolve(parsed);
    });
  });
}

let cachedPythonBinary = null;

async function resolvePythonBinary() {
  if (cachedPythonBinary) return cachedPythonBinary;
  const candidates = [
    process.env.DJ_ASSIST_PYTHON,
    path.join(REPO_ROOT, 'python', 'bin', 'python3'),
    path.join(REPO_ROOT, 'python', 'bin', 'python'),
    'python3',
    'python',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const ok = await probePython(candidate);
    if (ok) {
      cachedPythonBinary = candidate;
      return candidate;
    }
  }
  throw new Error('Could not find a usable Python interpreter for dj_assist.cli');
}

function probePython(candidate) {
  return new Promise((resolve) => {
    const child = spawn(candidate, ['-c', 'import sys; print(sys.executable)'], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function uploadAnalysis({ auth, clientId, userData, serverUrl, appVersion, job, analysis }) {
  const bpm = numberOrNull(analysis.bpm);
  const bpmConfidence = numberOrNull(analysis.bpm_confidence);
  const key = stringOrNull(analysis.key);
  const keyNumeric = stringOrNull(analysis.key_numeric);
  const decodeFailed = Boolean(analysis.decode_failed);
  const bpmSource = stringOrNull(analysis.bpm_source);
  const bpmError = stringOrNull(analysis.bpm_error);

  const customTags = Array.isArray(job.custom_tags)
    ? job.custom_tags.filter((value) => typeof value === 'string' && value.trim().length > 0)
    : [];
  if (!customTags.includes('drive-local-analysis')) {
    customTags.push('drive-local-analysis');
  }

  const track = {
    client_track_id: String(job.client_track_id || '').trim(),
    title: stringOrNull(job.title),
    artist: stringOrNull(job.artist),
    album: stringOrNull(job.album),
    duration: numberOrNull(job.duration),
    bitrate: numberOrNull(job.bitrate),
    bpm,
    bpm_confidence: bpmConfidence,
    key,
    key_numeric: keyNumeric,
    bpm_source: bpmSource,
    analysis_status: decodeFailed ? 'analysis_failed' : ((bpm || key || keyNumeric) ? 'analysis_complete' : 'analysis_attempted'),
    analysis_error: bpmError || (decodeFailed ? 'decode_failed' : null),
    decode_failed: decodeFailed,
    file_hash: stringOrNull(job.file_hash),
    file_size: numberOrNull(job.file_size),
    file_mtime: numberOrNull(job.file_mtime),
    custom_tags: customTags,
    effective_bpm: bpm,
    effective_key: key || keyNumeric,
  };

  await postJson(`${serverUrl}/api/v1/ingest`, {
    headers: buildServerHeaders(auth, userData),
    body: {
      client_id: clientId,
      user_data: userData,
      batch_id: `google-drive-analysis-${randomUUID()}`,
      sent_at: new Date().toISOString(),
      app_version: appVersion,
      tracks: [track],
      usage_events: [],
    },
    timeoutMs: 60_000,
  });
}

function stringOrNull(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function numberOrNull(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

function clampInteger(raw, min, max, fallback) {
  const normalized = Math.trunc(Number(raw));
  if (!Number.isFinite(normalized)) return fallback;
  return Math.min(Math.max(normalized, min), max);
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

main().catch((error) => {
  console.error(`[google-drive-worker] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
