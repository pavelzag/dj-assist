const { spawn } = require('node:child_process');
const path = require('node:path');

function resolveElectronBinary() {
  return require('electron');
}

function main() {
  const electron = spawn(resolveElectronBinary(), ['electron/main.cjs'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      DJ_ASSIST_ELECTRON_MANAGE_SERVER: '1',
      DJ_ASSIST_ELECTRON_SERVER_MODE: 'start',
    },
    stdio: 'inherit',
  });

  electron.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main();
