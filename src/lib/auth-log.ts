import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

type AuthLogLevel = 'info' | 'warning' | 'error';

type AuthLogEntry = {
  id?: string;
  level: AuthLogLevel;
  event: string;
  message: string;
  context?: Record<string, unknown>;
};

export function createAuthDiagnosticId() {
  return randomUUID().slice(0, 8);
}

export function getAuthLogPath() {
  const explicitDir = process.env.DJ_ASSIST_LOG_DIR?.trim();
  const fallbackDir = process.env.DJ_ASSIST_CONFIG_DIR?.trim()
    ? path.join(process.env.DJ_ASSIST_CONFIG_DIR.trim(), 'logs')
    : path.join(process.cwd(), 'logs');
  return path.join(explicitDir || fallbackDir, 'dj-assist-auth.ndjson');
}

export async function appendAuthLog(entry: AuthLogEntry) {
  const payload = {
    timestamp: new Date().toISOString(),
    ...entry,
    context: sanitizeAuthContext(entry.context ?? {}),
  };
  const line = JSON.stringify(payload);
  console[entry.level === 'error' ? 'error' : 'log'](`[auth:${entry.level}] ${line}`);
  const filePath = getAuthLogPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${line}\n`, 'utf8');
}

export function maskValue(value: unknown, visibleStart = 6, visibleEnd = 4) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= visibleStart + visibleEnd) return `${text.slice(0, 2)}...`;
  return `${text.slice(0, visibleStart)}...${text.slice(-visibleEnd)}`;
}

function sanitizeAuthContext(context: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      const lowered = key.toLowerCase();
      if (['code', 'token', 'id_token', 'client_secret', 'verifier', 'nonce'].some((part) => lowered.includes(part))) {
        return [key, maskValue(value)];
      }
      return [key, value];
    }),
  );
}
