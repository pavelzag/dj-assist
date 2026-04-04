const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

const HOST = process.env.DJ_ASSIST_ELECTRON_HOST || '127.0.0.1';
const PORT = process.env.DJ_ASSIST_ELECTRON_PORT || '3000';
const URL = `http://${HOST}:${PORT}`;

function waitForServer(url, attempts = 120) {
  return new Promise((resolve, reject) => {
    let remaining = attempts;
    const probe = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
      request.on('error', () => {
        remaining -= 1;
        if (remaining <= 0) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(probe, 500);
      });
    };
    probe();
  });
}

function resolveElectronBinary() {
  return require('electron');
}

function spawnNextDev() {
  fs.rmSync(path.join(__dirname, '..', '.next'), { recursive: true, force: true });
  return spawn(
    process.execPath,
    [require.resolve('next/dist/bin/next'), 'dev', '--hostname', HOST, '--port', PORT],
    {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, ELECTRON: 'true' },
      stdio: 'inherit',
    },
  );
}

function spawnElectron() {
  return spawn(resolveElectronBinary(), ['electron/main.cjs'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DJ_ASSIST_ELECTRON_URL: URL },
    stdio: 'inherit',
  });
}

async function main() {
  const next = spawnNextDev();
  let electron = null;

  const shutdown = (code = 0) => {
    if (electron && !electron.killed) electron.kill('SIGTERM');
    if (!next.killed) next.kill('SIGTERM');
    process.exit(code);
  };

  next.on('exit', (code) => {
    shutdown(code ?? 0);
  });

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  await waitForServer(URL);
  electron = spawnElectron();
  electron.on('exit', (code) => {
    shutdown(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
