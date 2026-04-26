# Release Strategy

## v0.5.0

- Google sign-in uses OAuth PKCE with Desktop App OAuth credentials embedded at build time.
- Users no longer need to provide OAuth credentials or a service-account key for Gmail/Google account connection.
- GitHub release builds embed `GOOGLE_CLIENT_ID` from repository configuration so paying clients are not asked for OAuth setup.
- Manual release workflow runs without an explicit tag automatically bump the patch version, commit it, tag it, and build that version.

This project currently has one automated release target that is ready to ship:

- macOS desktop builds through GitHub Actions

Windows and Linux builds are not yet release-ready because the current packaging flow depends on macOS-specific tooling in:

- [scripts/prepare-python-bundle.cjs](/Users/pavel/Projects/dj-assist/scripts/prepare-python-bundle.cjs)
- [scripts/prepare-audio-tools.cjs](/Users/pavel/Projects/dj-assist/scripts/prepare-audio-tools.cjs)

Those scripts currently use:

- `otool`
- `install_name_tool`
- `codesign`

## Recommended Versioning

Use SemVer tags:

- stable releases: `v1.2.3`
- beta releases: `v1.3.0-beta.1`
- release candidates: `v1.3.0-rc.1`

The GitHub release workflow already treats tags containing `-` as prereleases.

## Release Options

### Option 1: Stable-only releases

Use only tags like:

- `v0.3.0`
- `v0.1.1`
- `v0.3.0`

Pros:

- simplest for users
- simplest for support

Cons:

- no clean place for test builds

### Option 2: Stable + prerelease

Use:

- stable: `v0.3.0`
- beta: `v0.3.0-beta.1`
- RC: `v0.3.0-rc.1`

Pros:

- good structure for testing new builds
- GitHub releases can mark prereleases automatically
- clear upgrade path

Cons:

- slightly more process to manage

### Option 3: Stable + prerelease + nightly/dev builds

Use:

- stable: `v0.3.0`
- beta: `v0.3.0-beta.1`
- nightly: `nightly-2026-04-08`

Pros:

- fastest iteration
- easy internal testing

Cons:

- noisier release history
- more user confusion if exposed broadly

## Recommended Approach For DJ Assist

Use Option 2:

- ship stable releases with `vX.Y.Z`
- test upcoming builds with `vX.Y.Z-beta.N`
- use `vX.Y.Z-rc.N` only when you want final release validation

That gives you:

- clean public releases
- an obvious lane for client testing
- automatic prerelease handling in GitHub

## Current GitHub Action Behavior

The workflow at [release.yml](/Users/pavel/Projects/dj-assist/.github/workflows/release.yml):

- runs on `v*` tags
- on manual runs without a tag, bumps `package.json` and `package-lock.json` from `vX.Y.Z` to `vX.Y.(Z+1)`
- on manual runs with a tag, skips version bumping and builds the requested tag
- builds macOS release artifacts
- requires `GOOGLE_CLIENT_ID` as a GitHub repository variable or secret
- requires `GOOGLE_CLIENT_ID` as a GitHub repository variable or secret
- uploads `.dmg` and `.zip`
- creates a GitHub release
- marks `-beta` and `-rc` style tags as prereleases

## Windows And Linux Options

If you want Windows and Linux later, there are three realistic paths.

### Option A: Experimental releases

Port the packaging scripts and publish:

- macOS as supported
- Windows as experimental
- Linux as experimental

This is the most practical next step if you want optional downloads without promising full support.

### Option B: Full first-class multi-platform releases

Port the packaging, add CI matrix builds, and test all three targets regularly.

This gives the cleanest public story, but it is the highest maintenance path.

### Option C: macOS-only official releases

Keep GitHub Releases official for macOS only until the Python and audio-tool bundling flow is made cross-platform.

This is the safest option today.

## Recommended Platform Policy

For now:

- macOS: supported and released
- Windows: experimental later
- Linux: experimental later

That keeps the release process honest while still leaving room to add optional builds once the bundling scripts are ported.
