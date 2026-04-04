# Electron Plan

This repo now supports a first Electron shell without removing the existing web app.

## Goal

Keep both modes in the repo:

- web mode for current development and browser use
- Electron mode for desktop packaging work

## Current Electron Scope

The current Electron integration is intentionally light:

- launches the existing Next app on localhost
- opens the dedicated `/desktop` route in an Electron `BrowserWindow`
- keeps the current web app intact
- exposes a preload bridge for desktop-only APIs

## Route Split

The app now has separate top-level entrypoints:

- web app: `/`
- Electron app: `/desktop`

They share core scanning/library logic, but platform-specific behavior can now diverge cleanly.

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

## Why This Is The Right First Step

This keeps risk low:

- no disruption to the current web app
- no DB migration yet
- no scanner rewrite yet
- allows iterative desktop work

## Recommended Next Steps

1. Wire native folder picking into the scan UI via `window.djAssistDesktop.pickDirectory()`
2. Add Electron-specific app branding and menus
3. Replace PostgreSQL with SQLite for desktop mode
4. Decide whether the Python scanner stays bundled or becomes an external dependency
5. Add packaging with `electron-builder` or `electron-forge`

## Important Limitation

This is not yet a packaged desktop product.

It is an Electron wrapper around the current local app architecture. That is the correct first migration step, but not the final distribution model.
