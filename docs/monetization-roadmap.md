# DJ Assist Monetization Roadmap

## Product split

- Free and open source:
  - local desktop library management
  - local scanning and metadata analysis
  - playlists on a single device
  - waveform, playback, cues, metadata editing
- Paid at `$3/month`:
  - account sign-in
  - cloud playlist sync across desktop and iOS
  - Google Drive access
  - faster cloud-assisted scan lookups

## Principles

- Keep the core desktop workflow usable without an account.
- Charge for hosted infrastructure and cross-device convenience, not basic local use.
- Make premium value concrete: sync, backup, Drive, and faster known-track lookups.
- Ship the premium system in phases so the free app remains stable while the server grows.

## Feature matrix

### Free

- local library import and rescans
- BPM/key/artwork analysis on-device
- local playlists and collection editing
- playback, waveform, and source inspection
- manual metadata correction

### Paid

- Google sign-in backed by DJ Assist account identity
- cloud sync for playlists, cues, tags, and preferences
- Google Drive browsing, import, and playback support
- faster scan path via cloud exact-match cache
- desktop and iOS access on the same account

## Roadmap

### Phase 1: Foundation and entitlement-ready desktop

Goal: prepare the desktop app and server for monetization without breaking the existing free local workflow.

Workstreams:

- Product boundaries
  - freeze the free vs paid feature split
  - define premium naming, likely `DJ Assist Sync`
  - define which desktop UI surfaces are public, debug-only, and premium-gated
- Desktop app flavoring
  - keep a `debug` build with the full current UI
  - keep a `prod` build with a reduced user-facing surface
  - make feature gating deterministic at build time first
- Account and entitlement model
  - define `users`, `subscriptions`, `devices`, and `entitlements`
  - represent premium capabilities as named flags, not one-off booleans
  - keep room for future tiers without rewriting the client
- Backend groundwork
  - create private server routes for auth bootstrap, entitlement lookup, and device registration
  - create migration plan for playlists, cues, and track-level user metadata
  - define audit logging for sync and billing actions
- Billing foundation
  - choose Stripe as the initial web/desktop billing system
  - support monthly and annual plans from the start
  - defer native iOS purchase flow until after desktop/web validation
- Observability and support
  - add clear client/server logs for auth, entitlement checks, and sync failures
  - add admin visibility into user status, last sync, and subscription state

Deliverables:

- feature-flagged desktop builds
- first private server schema for users, subscriptions, devices, entitlements
- desktop auth bootstrap contract
- entitlement response contract for the client
- initial billing model and webhook plan
- implementation notes for the sync data model

Exit criteria:

- desktop app can be built in `debug` and `prod` flavors
- prod flavor hides non-launch features and lowers UI noise
- server repo contains the initial monetization architecture and schema plan
- auth and entitlement APIs are specified well enough for implementation

### Phase 2: Accounts, billing, and desktop sync beta

- ship Google sign-in tied to DJ Assist accounts
- launch Stripe subscriptions
- unlock premium entitlements from the server
- sync playlists, cues, tags, and preferences across desktop devices
- add account status and subscription management UI

### Phase 3: Google Drive premium rollout

- move Drive import and browsing behind entitlement checks
- support premium Drive-backed library flows
- improve cache repair, playback, and metadata hydration for Drive tracks

### Phase 4: Cloud-assisted fast scan

- fingerprint tracks locally
- query server for known exact matches before expensive local analysis
- return cached BPM/key/artwork/metadata when available
- fall back to local analysis for unknown tracks

### Phase 5: iOS companion

- sign in with the same account
- sync playlists and user metadata
- optionally add Drive-backed playback after sync is stable

## Phase 1 implementation plan

### 1. Desktop build flavors

- Introduce a single app flavor variable: `debug` or `prod`.
- `debug` keeps all current UI and diagnostics.
- `prod` removes:
  - `Hide unknown artists`
  - `Activity`
  - `Google Drive Import`
  - `Fast Scan Server`
  - `Spotify Credentials`
  - `Smart Crates`
  - `Artist Browser`
- `prod` also reduces non-critical toast traffic.

### 2. Premium capability model

Represent entitlements as capability keys:

- `google_auth`
- `playlist_sync`
- `google_drive`
- `fast_scan_cloud`
- `ios_access`

This allows:

- one paid tier now
- more granular gating later
- short-term debug overrides without schema churn

### 3. Server schema draft

Initial tables:

- `users`
- `subscriptions`
- `devices`
- `entitlements`
- `playlists`
- `playlist_tracks`
- `track_identities`
- `user_tracks`
- `cue_points`
- `sync_revisions`

Supporting tables later:

- `billing_events`
- `google_accounts`
- `scan_match_cache`

### 4. API draft

Initial endpoints:

- `POST /api/auth/google/start`
- `GET /api/auth/google/callback`
- `GET /api/account/session`
- `GET /api/account/entitlements`
- `POST /api/devices/register`
- `POST /api/billing/webhooks/stripe`

Next wave:

- `GET /api/sync/bootstrap`
- `POST /api/sync/playlists/push`
- `GET /api/sync/playlists/pull`

### 5. Entitlement enforcement strategy

- Build-time flavor controls what ships in the app UI.
- Runtime entitlements control what signed-in users can access.
- Local free workflows must remain available when offline.
- Premium features should fail closed with clear messaging, not broken UI.

### 6. First milestone after this document

- land private server schema migrations
- implement account session endpoint
- implement entitlement lookup endpoint
- connect desktop sign-in state to entitlement fetch
- add local debug override for premium capability testing

## Notes

- Do not make “login itself” the paid value in messaging. The paid value is sync, Drive, and cloud acceleration.
- Keep the hosted backend private even if the desktop app stays open source.
- Plan for Apple IAP constraints before selling the subscription natively in iOS.
