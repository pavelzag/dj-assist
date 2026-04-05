# Electron Plan

This repo now treats Electron as the primary product shell.

## Goal

Make the app Electron-first while keeping the Next.js service UI architecture as the renderer/backend layer.

## Current Electron Scope

The current Electron integration:

- launches or reuses the local Next backend
- opens the root route `/` in an Electron `BrowserWindow`
- keeps scans alive when the Electron window closes
- reconnects to running scans on relaunch
- exposes a preload bridge for desktop-only APIs

## Routes

The primary app route is now:

- Electron app: `/`

The old `/desktop` route remains only as a compatibility redirect.

## New Files

- `electron/main.cjs`
- `electron/preload.cjs`
- `scripts/electron-dev.cjs`
- `scripts/electron-start.cjs`

## Scripts

After installing Electron dependencies:

```bash
npm install
npm run electron:dev
```

For built mode:

```bash
npm run build
npm run electron:start
```

## Current Desktop APIs

The preload bridge exposes:

- `pickDirectory()`
- `showItemInFolder(path)`
- `platform`

These are available on:

```js
window.djAssistDesktop
```

They are not yet fully wired into the UI.

## Why This Is The Right Step

This keeps the architecture pragmatic:

- Electron is the product shell
- the existing Next/Python stack still does the heavy lifting
- scans can persist across desktop window restarts
- native desktop affordances can be added without maintaining a parallel desktop/web UI split

## Recommended Next Steps

1. Wire native folder picking into the scan UI via `window.djAssistDesktop.pickDirectory()`
2. Add Electron-specific app branding and menus
3. Replace PostgreSQL with SQLite for desktop mode
4. Decide whether the Python scanner stays bundled or becomes an external dependency
5. Add packaging with `electron-builder` or `electron-forge`

## Important Limitation

This is not yet a packaged desktop product.

It is an Electron wrapper around the current local app architecture. That is the correct first migration step, but not the final distribution model.
