import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type AppLogLevel = 'info' | 'warning' | 'error' | 'success';
export type AppLogSource = 'renderer' | 'server';

export type AppLogEntry = {
  timestamp: string;
  level: AppLogLevel;
  message: string;
  source: AppLogSource;
  category?: string;
  context?: Record<string, unknown>;
};

export type ClientDiagnosticLogEntry = AppLogEntry & {
  source: 'renderer';
};

export function getAppLogPath() {
  const explicitDir = process.env.DJ_ASSIST_LOG_DIR?.trim();
  const fallbackDir = process.env.DJ_ASSIST_CONFIG_DIR?.trim()
    ? path.join(process.env.DJ_ASSIST_CONFIG_DIR.trim(), 'logs')
    : path.join(process.cwd(), 'logs');
  const logDir = explicitDir || fallbackDir;
  return path.join(logDir, 'dj-assist-client.ndjson');
}

export const getClientLogPath = getAppLogPath;

export async function appendAppLog(entry: AppLogEntry) {
  const filePath = getAppLogPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  return filePath;
}

export async function appendClientDiagnosticLog(entry: ClientDiagnosticLogEntry) {
  return appendAppLog(entry);
}

export async function getAppLogs(limit = 100): Promise<AppLogEntry[]> {
  const filePath = getAppLogPath();
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
          const parsed = JSON.parse(line) as AppLogEntry;
          return parsed && typeof parsed === 'object' ? [parsed] : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

export const getClientDiagnosticLogs = getAppLogs;

export async function logServerEvent(input: {
  level: 'info' | 'warning' | 'error';
  message: string;
  category: string;
  context?: Record<string, unknown>;
  alsoConsole?: boolean;
}) {
  if (input.alsoConsole) {
    if (input.level === 'error') console.error(input.message);
    else if (input.level === 'warning') console.warn(input.message);
    else console.log(input.message);
  }
  return appendAppLog({
    timestamp: new Date().toISOString(),
    level: input.level,
    message: input.message,
    source: 'server',
    category: input.category,
    context: input.context,
  });
}
