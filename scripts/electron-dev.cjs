const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { loadProjectEnv } = require('./load-env.cjs');

function resolveElectronBinary() {
  return require('electron');
}

function main() {
  loadProjectEnv();
  fs.rmSync(path.join(__dirname, '..', '.next'), { recursive: true, force: true });

  const electron = spawn(resolveElectronBinary(), ['electron/main.cjs'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      DJ_ASSIST_ELECTRON_MANAGE_SERVER: '1',
      DJ_ASSIST_ELECTRON_SERVER_MODE: 'dev',
    },
    stdio: 'inherit',
  });

  electron.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main();
