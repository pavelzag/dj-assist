const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } = require('electron');

const DEFAULT_URL = 'http://127.0.0.1:3000/';
const DEFAULT_HOST = process.env.DJ_ASSIST_ELECTRON_HOST || '127.0.0.1';
const DEFAULT_PORT = process.env.DJ_ASSIST_ELECTRON_PORT || '3000';
const APP_ICON_PATH = path.join(__dirname, 'assets', 'app-icon.png');
const APP_ROOT = path.join(__dirname, '..');

function getStandaloneServerPath() {
  return path.join(APP_ROOT, '.next', 'standalone', 'server.js');
}

function hasStandaloneServer() {
  return fs.existsSync(getStandaloneServerPath());
}

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

function isServerReachable(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(true);
    });
    request.on('error', () => resolve(false));
  });
}

async function ensureManagedServer() {
  if (process.env.DJ_ASSIST_ELECTRON_MANAGE_SERVER !== '1') return;

  const host = DEFAULT_HOST;
  const port = DEFAULT_PORT;
  const rootUrl = `http://${host}:${port}`;
  const mode = process.env.DJ_ASSIST_ELECTRON_SERVER_MODE === 'dev' ? 'dev' : 'start';

  if (await isServerReachable(rootUrl)) {
    process.env.DJ_ASSIST_ELECTRON_URL = `${rootUrl}/`;
    return;
  }

  const useStandalone = mode === 'start' && hasStandaloneServer();
  const childArgs = useStandalone
    ? [getStandaloneServerPath()]
    : [require.resolve('next/dist/bin/next'), mode, '--hostname', host, '--port', port];
  const childEnv = {
    ...process.env,
    ELECTRON: 'true',
    ELECTRON_RUN_AS_NODE: '1',
    HOSTNAME: host,
    PORT: String(port),
  };
  const child = spawn(process.execPath, childArgs, {
    cwd: APP_ROOT,
    env: childEnv,
    stdio: 'ignore',
    detached: true,
  });
  child.unref();

  await waitForServer(rootUrl);
  process.env.DJ_ASSIST_ELECTRON_URL = `${rootUrl}/`;
}

function createMainWindow() {
  const icon = nativeImage.createFromPath(APP_ICON_PATH);
  const win = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    title: 'DJ Assist',
    icon: icon.isEmpty() ? undefined : APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const targetUrl = process.env.DJ_ASSIST_ELECTRON_URL || DEFAULT_URL;
  win.loadURL(targetUrl);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

ipcMain.handle('desktop:pick-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0] ?? null;
});

ipcMain.handle('desktop:show-item-in-folder', async (_event, targetPath) => {
  if (!targetPath) return false;
  shell.showItemInFolder(targetPath);
  return true;
});

app.whenReady().then(() => {
  app.setName('DJ Assist');
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = nativeImage.createFromPath(APP_ICON_PATH);
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }
  ensureManagedServer()
    .then(() => {
      createMainWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      });
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      app.quit();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
