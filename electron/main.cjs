const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } = require('electron');

const DEFAULT_URL = 'http://127.0.0.1:3000/';
const DEFAULT_HOST = process.env.DJ_ASSIST_ELECTRON_HOST || '127.0.0.1';
const DEFAULT_PORT = process.env.DJ_ASSIST_ELECTRON_PORT || '3000';
const APP_ICON_PATH = path.join(__dirname, 'assets', 'app-icon.png');
const APP_ROOT = path.join(__dirname, '..');
let mainWindow = null;
let managedServerProcess = null;
let managedServerOwned = false;
let quitConfirmed = false;
let quitPromptOpen = false;

function appIconDataUrl() {
  try {
    const buffer = fs.readFileSync(APP_ICON_PATH);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

function shouldManageServer() {
  if (process.env.DJ_ASSIST_ELECTRON_MANAGE_SERVER) {
    return process.env.DJ_ASSIST_ELECTRON_MANAGE_SERVER === '1';
  }
  return app.isPackaged;
}

function serverMode() {
  if (process.env.DJ_ASSIST_ELECTRON_SERVER_MODE === 'dev') return 'dev';
  if (process.env.DJ_ASSIST_ELECTRON_SERVER_MODE === 'start') return 'start';
  return app.isPackaged ? 'start' : 'dev';
}

function getStandaloneServerPath() {
  return path.join(APP_ROOT, '.next', 'standalone', 'server.js');
}

function hasStandaloneServer() {
  return fs.existsSync(getStandaloneServerPath());
}

function resolveManagedDatabasePath() {
  if (process.env.DJ_ASSIST_DB_PATH) return process.env.DJ_ASSIST_DB_PATH;
  return path.join(app.getPath('userData'), 'dj-assist.db');
}

function resolveManagedConfigDir() {
  if (process.env.DJ_ASSIST_CONFIG_DIR) return process.env.DJ_ASSIST_CONFIG_DIR;
  return app.getPath('userData');
}

function managedSettingsPath() {
  return path.join(resolveManagedConfigDir(), 'dj-assist-settings.json');
}

function readManagedSpotifySettings() {
  try {
    const raw = fs.readFileSync(managedSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    const clientId = String(parsed?.spotify?.clientId ?? '').trim();
    const clientSecret = String(parsed?.spotify?.clientSecret ?? '').trim();
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  } catch {
    return null;
  }
}

function resolveBundledPythonPath() {
  if (process.env.PYTHON_EXECUTABLE) return process.env.PYTHON_EXECUTABLE;
  const candidates = [
    path.join(process.resourcesPath, 'python', 'runtime', 'bin', 'python3.11'),
    path.join(process.resourcesPath, 'python', 'env', 'bin', 'python3'),
    path.join(process.resourcesPath, 'python', 'env', 'bin', 'python'),
    path.join(process.resourcesPath, 'python', 'runtime', 'python', 'bin', 'python3.11'),
    path.join(process.resourcesPath, 'python', 'runtime', 'bin', 'python3'),
    path.join(process.resourcesPath, 'python', 'runtime', 'bin', 'python'),
    path.join(process.resourcesPath, 'python', 'runtime', 'python', 'bin', 'python3'),
    path.join(process.resourcesPath, 'python', 'runtime', 'python', 'bin', 'python'),
    path.join(process.resourcesPath, 'python', 'bin', 'python3'),
    path.join(process.resourcesPath, 'python', 'bin', 'python'),
    path.join(APP_ROOT, 'python', 'runtime', 'bin', 'python3.11'),
    path.join(APP_ROOT, 'python', 'env', 'bin', 'python3'),
    path.join(APP_ROOT, 'python', 'env', 'bin', 'python'),
    path.join(APP_ROOT, 'python', 'runtime', 'python', 'bin', 'python3.11'),
    path.join(APP_ROOT, 'python', 'runtime', 'bin', 'python3'),
    path.join(APP_ROOT, 'python', 'runtime', 'bin', 'python'),
    path.join(APP_ROOT, 'python', 'runtime', 'python', 'bin', 'python3'),
    path.join(APP_ROOT, 'python', 'runtime', 'python', 'bin', 'python'),
    path.join(APP_ROOT, 'python', 'bin', 'python3'),
    path.join(APP_ROOT, 'python', 'bin', 'python'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function resolveBundledFpcalcPath() {
  if (process.env.FPCALC_PATH && fs.existsSync(process.env.FPCALC_PATH)) return process.env.FPCALC_PATH;
  const candidates = [
    path.join(process.resourcesPath, 'audio-tools', 'bin', 'fpcalc'),
    path.join(APP_ROOT, 'audio-tools', 'bin', 'fpcalc'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function linkedLibraries(binaryPath) {
  const probe = spawnSync('otool', ['-L', binaryPath], { encoding: 'utf8' });
  if (probe.status !== 0) {
    appendMainLog(`Failed to inspect linked libraries for ${binaryPath}: ${(probe.stderr || probe.stdout || '').trim()}`);
    return [];
  }

  return (probe.stdout || '')
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(' ')[0])
    .filter(Boolean);
}

function validateBundledPythonPath(binaryPath) {
  const externalLinks = linkedLibraries(binaryPath).filter(
    (link) => link.startsWith('/opt/homebrew/') || link.startsWith('/usr/local/'),
  );
  if (externalLinks.length === 0) return true;

  appendMainLog(
    [
      `Rejected bundled Python interpreter ${binaryPath}.`,
      'It still links to external libraries outside the app bundle:',
      ...externalLinks.map((link) => `- ${link}`),
    ].join('\n'),
  );
  process.env.DJ_ASSIST_BUNDLED_PYTHON_ERROR =
    `Bundled Python is not relocatable and still links outside the app bundle:\n${externalLinks.join('\n')}`;
  return false;
}

function applyManagedRuntimeEnv() {
  process.env.DJ_ASSIST_DB_PATH = resolveManagedDatabasePath();
  process.env.DJ_ASSIST_CONFIG_DIR = resolveManagedConfigDir();
  process.env.DJ_ASSIST_LOG_DIR = app.getPath('logs');
  const spotifySettings = readManagedSpotifySettings();
  if (spotifySettings) {
    process.env.SPOTIFY_CLIENT_ID = spotifySettings.clientId;
    process.env.SPOTIFY_CLIENT_SECRET = spotifySettings.clientSecret;
  }
  const bundledPython = resolveBundledPythonPath();
  delete process.env.DJ_ASSIST_BUNDLED_PYTHON_ERROR;
  if (bundledPython && validateBundledPythonPath(bundledPython)) {
    process.env.PYTHON_EXECUTABLE = bundledPython;
    process.env.PYTHONHOME = path.dirname(path.dirname(bundledPython));
  } else if (bundledPython) {
    delete process.env.PYTHON_EXECUTABLE;
    delete process.env.PYTHONHOME;
  }
  const pythonPathParts = [APP_ROOT, process.env.PYTHONPATH].filter(Boolean);
  process.env.PYTHONPATH = [...new Set(pythonPathParts)].join(path.delimiter);
  process.env.PYTHONNOUSERSITE = '1';
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

function findAvailablePort(preferredPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen({ host: DEFAULT_HOST, port: preferredPort }, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : preferredPort;
      server.close(() => resolve(port));
    });
  });
}

function backendLogPaths() {
  const logDir = app.getPath('logs');
  fs.mkdirSync(logDir, { recursive: true });
  return {
    main: path.join(logDir, 'dj-assist-main.log'),
    out: path.join(logDir, 'dj-assist-backend.log'),
    err: path.join(logDir, 'dj-assist-backend-error.log'),
  };
}

function appendMainLog(message) {
  try {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(backendLogPaths().main, line, 'utf8');
  } catch {
    // ignore logging failures
  }

  const bundledFpcalc = resolveBundledFpcalcPath();
  if (bundledFpcalc) {
    process.env.FPCALC_PATH = bundledFpcalc;
  } else {
    delete process.env.FPCALC_PATH;
  }
}

function tailLog(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').filter(Boolean).slice(-40).join('\n');
  } catch {
    return '';
  }
}

function renderDiagnosticHtml(title, intro, details = '', extra = '') {
  const logs = backendLogPaths();
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
    <html>
      <body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#111;color:#f5f5f5;padding:32px;line-height:1.45;">
        <h2 style="margin-top:0;">${title}</h2>
        <p>${intro}</p>
        ${details ? `<pre style="white-space:pre-wrap;background:#1b1b1b;padding:16px;border-radius:12px;border:1px solid #333;">${details}</pre>` : ''}
        <h3>Log files</h3>
        <pre style="white-space:pre-wrap;background:#1b1b1b;padding:16px;border-radius:12px;border:1px solid #333;">Main: ${logs.main}
Backend: ${logs.out}
Backend Error: ${logs.err}</pre>
        ${extra ? `<h3>Recent logs</h3><pre style="white-space:pre-wrap;background:#1b1b1b;padding:16px;border-radius:12px;border:1px solid #333;">${extra}</pre>` : ''}
      </body>
    </html>
  `)}`;
}

function renderSplashHtml(message = 'Loading your collection tools…') {
  const iconDataUrl = appIconDataUrl();
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
    <html>
      <body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:radial-gradient(circle at top,#1c1c1c 0%,#090909 58%,#000 100%);color:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:22px;text-align:center;padding:32px;">
          <div style="width:196px;height:196px;border-radius:44px;background:rgba(255,255,255,0.04);box-shadow:0 26px 80px rgba(0,0,0,0.48), inset 0 0 0 1px rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;overflow:hidden;">
            ${iconDataUrl ? `<img src="${iconDataUrl}" alt="DJ Assist" style="width:100%;height:100%;object-fit:contain;" />` : `<div style="font-size:42px;font-weight:700;letter-spacing:0.18em;">DJ</div>`}
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:28px;font-weight:800;letter-spacing:0.14em;">DJ ASSIST</div>
            <div style="font-size:14px;color:rgba(245,245,245,0.72);">${message}</div>
          </div>
          <div style="width:180px;height:4px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden;">
            <div style="width:44%;height:100%;background:linear-gradient(90deg,#ff6c00 0%,#ff2f3f 100%);border-radius:999px;animation:pulse 1.3s ease-in-out infinite alternate;"></div>
          </div>
        </div>
        <style>
          @keyframes pulse {
            from { transform: translateX(-28%); opacity: .7; }
            to { transform: translateX(112%); opacity: 1; }
          }
        </style>
      </body>
    </html>
  `)}`;
}

function showDiagnosticWindow(title, intro, details = '') {
  const recentLogs = [tailLog(backendLogPaths().main), tailLog(backendLogPaths().out), tailLog(backendLogPaths().err)]
    .filter(Boolean)
    .join('\n\n');
  const target = mainWindow || createMainWindow({ skipInitialLoad: true });
  target.loadURL(renderDiagnosticHtml(title, intro, details, recentLogs)).catch(() => {});
  target.show();
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
  if (!shouldManageServer()) return;

  const host = DEFAULT_HOST;
  const explicitPort = process.env.DJ_ASSIST_ELECTRON_PORT || process.env.PORT;
  const port = explicitPort ? String(explicitPort) : String(await findAvailablePort(3000));
  const rootUrl = `http://${host}:${port}`;
  const mode = serverMode();

  if (await isServerReachable(rootUrl)) {
    appendMainLog(`Reusing existing desktop backend at ${rootUrl}`);
    process.env.DJ_ASSIST_ELECTRON_URL = `${rootUrl}/`;
    managedServerOwned = false;
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
    cwd: useStandalone ? path.dirname(getStandaloneServerPath()) : APP_ROOT,
    env: childEnv,
    stdio: ['ignore', fs.openSync(backendLogPaths().out, 'a'), fs.openSync(backendLogPaths().err, 'a')],
    detached: false,
  });
  managedServerProcess = child;
  managedServerOwned = true;
  child.on('exit', (code, signal) => {
    appendMainLog(`desktop backend exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    if (managedServerProcess === child) managedServerProcess = null;
  });
  appendMainLog(`Spawned desktop backend pid=${child.pid ?? 'unknown'} mode=${mode} url=${rootUrl} cwd=${useStandalone ? path.dirname(getStandaloneServerPath()) : APP_ROOT}`);

  try {
    await waitForServer(rootUrl);
  } catch (error) {
    const logs = [tailLog(backendLogPaths().out), tailLog(backendLogPaths().err)].filter(Boolean).join('\n\n');
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(logs ? `${message}\n\nBackend logs:\n${logs}` : message);
  }
  process.env.DJ_ASSIST_ELECTRON_URL = `${rootUrl}/`;
  appendMainLog(`Desktop backend ready at ${rootUrl}`);
}

function stopManagedServer() {
  if (!managedServerOwned || !managedServerProcess || managedServerProcess.killed) return;
  const pid = managedServerProcess.pid;
  appendMainLog(`Stopping managed backend pid=${pid ?? 'unknown'}`);
  try {
    managedServerProcess.kill('SIGTERM');
  } catch (error) {
    appendMainLog(`Failed to stop managed backend gracefully: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function confirmQuit() {
  if (quitConfirmed || quitPromptOpen) return quitConfirmed;
  quitPromptOpen = true;
  try {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Cancel', 'Quit'],
      defaultId: 1,
      cancelId: 0,
      title: 'Quit DJ Assist?',
      message: 'Are you sure you want to close DJ Assist?',
      detail: 'Any active scan or playback will stop when the app quits.',
      noLink: true,
    });
    quitConfirmed = choice === 1;
    return quitConfirmed;
  } finally {
    quitPromptOpen = false;
  }
}

function createMainWindow(options = {}) {
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
  mainWindow = win;

  win.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    appendMainLog(`did-fail-load code=${code} description=${description} url=${validatedURL} mainFrame=${isMainFrame}`);
    if (isMainFrame) {
      showDiagnosticWindow('DJ Assist could not load', 'The desktop window failed to load the app content.', `${description} (${code})\n${validatedURL}`);
    }
  });
  win.webContents.on('did-start-loading', () => {
    appendMainLog('did-start-loading');
  });
  win.webContents.on('dom-ready', () => {
    appendMainLog('dom-ready');
  });
  win.webContents.on('did-finish-load', () => {
    appendMainLog(`did-finish-load url=${win.webContents.getURL()}`);
  });
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    appendMainLog(`renderer-console level=${level} source=${sourceId}:${line} message=${message}`);
  });
  win.webContents.on('preload-error', (_event, path, error) => {
    appendMainLog(`preload-error path=${path} error=${error instanceof Error ? error.stack || error.message : String(error)}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    appendMainLog(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
    showDiagnosticWindow('DJ Assist renderer stopped', 'The app window process exited unexpectedly.', JSON.stringify(details, null, 2));
  });
  win.on('unresponsive', () => {
    appendMainLog('main window became unresponsive');
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.on('close', (event) => {
    if (quitConfirmed) return;
    event.preventDefault();
    if (confirmQuit()) {
      quitConfirmed = true;
      app.quit();
    }
  });

  if (options.skipInitialLoad) {
    win.loadURL(renderDiagnosticHtml('DJ Assist is starting', 'Waiting for diagnostics…')).catch(() => {});
    return win;
  }
  win.loadURL(renderSplashHtml()).catch(() => {});

  if (process.env.DJ_ASSIST_OPEN_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

function loadMainRenderer(win = mainWindow) {
  if (!win || win.isDestroyed()) return;
  const targetUrl = process.env.DJ_ASSIST_ELECTRON_URL || DEFAULT_URL;
  appendMainLog(`Loading renderer URL ${targetUrl}`);
  win.loadURL(targetUrl).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    appendMainLog(`loadURL failed: ${message}`);
    showDiagnosticWindow('DJ Assist could not start', 'The local desktop backend did not load.', message);
  });
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
  appendMainLog(`App ready. Packaged=${app.isPackaged} resourcesPath=${process.resourcesPath}`);
  applyManagedRuntimeEnv();
  appendMainLog(
    `Runtime env: db=${process.env.DJ_ASSIST_DB_PATH || 'unset'} python=${process.env.PYTHON_EXECUTABLE || 'unset'} fpcalc=${process.env.FPCALC_PATH || 'unset'}`,
  );
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = nativeImage.createFromPath(APP_ICON_PATH);
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }
  createMainWindow();
  ensureManagedServer()
    .then(() => {
      loadMainRenderer();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      });
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      appendMainLog(`ensureManagedServer failed: ${message}`);
      showDiagnosticWindow('DJ Assist could not start', 'The local desktop backend did not load.', message);
    });
});

process.on('uncaughtException', (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  appendMainLog(`uncaughtException: ${message}`);
  if (app.isReady()) showDiagnosticWindow('DJ Assist crashed', 'An unexpected main-process error occurred.', message);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
  appendMainLog(`unhandledRejection: ${message}`);
  if (app.isReady()) showDiagnosticWindow('DJ Assist crashed', 'An unexpected async error occurred.', message);
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (event) => {
  if (!quitConfirmed) {
    event.preventDefault();
    if (!confirmQuit()) return;
    quitConfirmed = true;
    app.quit();
    return;
  }
  stopManagedServer();
});
