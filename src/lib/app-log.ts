import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type ClientDiagnosticLogEntry = {
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  source: 'renderer';
  category?: string;
  context?: Record<string, unknown>;
};

export function getClientLogPath() {
  const explicitDir = process.env.DJ_ASSIST_LOG_DIR?.trim();
  const fallbackDir = process.env.DJ_ASSIST_CONFIG_DIR?.trim()
    ? path.join(process.env.DJ_ASSIST_CONFIG_DIR.trim(), 'logs')
    : path.join(process.cwd(), 'logs');
  const logDir = explicitDir || fallbackDir;
  return path.join(logDir, 'dj-assist-client.ndjson');
}

export async function appendClientDiagnosticLog(entry: ClientDiagnosticLogEntry) {
  const filePath = getClientLogPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  return filePath;
}

export async function getClientDiagnosticLogs(limit = 100): Promise<ClientDiagnosticLogEntry[]> {
  const filePath = getClientLogPath();
  try {
    const raw = await readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-Math.max(1, Math.min(limit, 500)))
      .reverse()
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as ClientDiagnosticLogEntry;
          return parsed && typeof parsed === 'object' ? [parsed] : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}
