# Product Shipping Guide

This document explains the realistic ways to ship DJ Assist as a product.

## Summary Recommendation

### Best product form

A desktop app.

### Best short-term shipping form

Source distribution or Docker for technical pilots.

### Best long-term client-facing form

Electron, after a small architecture pass.

## Option 1: Ship As Source + Setup Guide

### Pros

- fastest path
- no packaging work
- easiest to keep aligned with development

### Cons

- not suitable for non-technical clients
- setup errors are common
- poor support burden

### Use for

- internal teams
- pilot users
- early validation

## Option 2: Ship As Docker

### Pros

- consistent runtime
- easier environment control
- good for demos and QA

### Cons

- not a good end-user experience
- local music-library access is awkward
- audio playback and folder permissions are clumsy
- users still need Docker

### Verdict

Good for technical deployment, not ideal as the final product.

## Option 3: Ship As Electron

### Pros

- best fit for local music folders
- best fit for playback and local scanning
- natural desktop UX
- can support native folder pickers
- easier to present as a real product

### Cons

- packaging complexity
- code signing and installers
- Python and audio dependencies must be bundled correctly
- the Python runtime must be a relocatable bundled runtime, not a copied Homebrew virtualenv

### Verdict

Best product direction.

## Recommended Architecture For Electron

### Current architecture

- Electron shell
- UI: Next.js
- scanner: Python
- database: SQLite

### Current desktop packaging architecture

- Electron shell
- local UI rendered inside Electron
- Python scanner staged as a bundled child process
- SQLite local database

## Why SQLite Is Better For Desktop

For a client desktop install:

- no DB server to run
- no port management
- simpler backup
- simpler installer
- fewer support issues

PostgreSQL makes sense for server deployments, but it is unnecessary friction for a single-user desktop tool.

## Electron Migration Difficulty

## Level of effort

### Easy part

- wrapping the existing UI in Electron

### Medium part

- adding native file/folder pickers
- packaging app updates
- desktop menus and shortcuts

### Hard part

- bundling Python cleanly
- bundling audio-analysis dependencies
- shipping signed installers

## Practical estimate

For a solid first Electron product, expect a moderate project rather than a quick wrapper.

Typical phases:

1. Stage a relocatable Python runtime and build an in-bundle scanner environment from it
2. Isolate scanner process management
3. Add packaging/signing
4. QA on clean client machines

## Shipping Paths I Recommend

## Path A: fastest practical pilot

1. Keep current app architecture
2. Use the install guide
3. Support only technical pilot users

## Path B: real product

1. Keep the Python scanner
2. Keep SQLite as the local database
3. Build Electron app
4. Add native folder picker
5. Produce signed macOS installer

This is the path I recommend.

## What I Would Avoid

- shipping the current architecture directly as a polished client product
- requiring clients to install Docker
- requiring clients to run PostgreSQL manually

## Product Install Experience Goal

The target client experience should be:

1. Download `.dmg`
2. Drag app into `Applications`
3. Open app
4. Choose music folder
5. Scan and use

That should be the product bar.
