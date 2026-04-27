#!/usr/bin/env node
/**
 * Standalone Google OAuth debug tool.
 * Runs the full PKCE loopback flow in isolation.
 *
 * Usage:
 *   node scripts/debug-google-oauth.cjs <CLIENT_ID>
 *   GOOGLE_CLIENT_ID=<id> node scripts/debug-google-oauth.cjs
 *
 * No npm install needed — Node.js built-ins only.
 */

const http = require('node:http');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

// ── Config ────────────────────────────────────────────────────────────────────

const clientId = (process.argv[2] || process.env.GOOGLE_CLIENT_ID || '').trim();
const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

if (!clientId) {
  console.error('Error: no client ID provided.');
  console.error('');
  console.error('  node scripts/debug-google-oauth.cjs <CLIENT_ID>');
  console.error('  GOOGLE_CLIENT_ID=<id> node scripts/debug-google-oauth.cjs');
  process.exit(1);
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function pkceVerifier() {
  return crypto.randomBytes(48).toString('base64url');
}

function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function randomBase64url(bytes) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// ── Browser launcher ──────────────────────────────────────────────────────────

function openBrowser(url) {
  try {
    if (process.platform === 'darwin') execSync(`open "${url}"`, { stdio: 'ignore' });
    else if (process.platform === 'win32') execSync(`start "" "${url}"`, { stdio: 'ignore' });
    else execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
  } catch {
    // user will copy-paste
  }
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function step(label) {
  console.log(`\n[${label}]`);
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  console.log(`  ✗ ${msg}`);
}

function info(msg) {
  console.log(`    ${msg}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Google OAuth Debug Tool ===');
  console.log('');
  console.log(`  Client ID : ${clientId}`);
  console.log(`  Secret    : ${clientSecret ? 'present ✓' : 'not set'}`);
  console.log(`  Platform  : ${process.platform} / Node ${process.version}`);

  // ── 1. Start loopback server ───────────────────────────────────────────────

  step('1 / 5 — Start loopback server');

  const server = http.createServer();

  await new Promise((resolve, reject) => {
    server.once('error', (err) => {
      fail(`Could not start server: ${err.message}`);
      reject(err);
    });
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}/`;
  ok(`Listening on port ${port}`);
  info(`Redirect URI: ${redirectUri}`);

  // ── 2. Build auth URL ──────────────────────────────────────────────────────

  step('2 / 5 — Build authorization URL');

  const verifier = pkceVerifier();
  const challenge = pkceChallenge(verifier);
  const state = randomHex(24);
  const nonce = randomBase64url(24);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('nonce', nonce);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('prompt', 'select_account');

  ok('Auth URL ready (PKCE S256, loopback redirect)');

  // ── 3. Open browser ────────────────────────────────────────────────────────

  step('3 / 5 — Open browser');
  console.log('');
  console.log('  If the browser does not open automatically, copy this URL:');
  console.log('');
  console.log(' ', authUrl.toString());
  console.log('');

  openBrowser(authUrl.toString());
  ok('Browser launched — complete sign-in there');

  // ── 4. Wait for callback ───────────────────────────────────────────────────

  step('4 / 5 — Waiting for OAuth callback...');

  const callbackResult = await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      server.close();
      resolve({ ok: false, error: 'Timed out after 5 minutes waiting for callback.' });
    }, 5 * 60 * 1000);

    server.on('request', async (req, res) => {
      clearTimeout(timeout);

      const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);

      if (url.pathname !== '/') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code') || '';
      const returnedState = url.searchParams.get('state') || '';
      const oauthError = url.searchParams.get('error') || '';

      if (oauthError) {
        const html = page('error', `Google returned: <code>${oauthError}</code>`);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        server.close();
        resolve({ ok: false, error: `Google error: ${oauthError}` });
        return;
      }

      if (!code) {
        const html = page('error', 'No authorization code in callback.');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        server.close();
        resolve({ ok: false, error: 'Callback had no authorization code.' });
        return;
      }

      if (returnedState !== state) {
        const html = page('error', 'State mismatch — possible CSRF.');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        server.close();
        resolve({ ok: false, error: 'State mismatch.' });
        return;
      }

      // Respond immediately, then finish async work
      const html = page('pending', 'Exchanging tokens — check terminal…');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      server.close();
      resolve({ ok: true, code });
    });
  });

  if (!callbackResult.ok) {
    fail(callbackResult.error);
    process.exit(1);
  }

  ok(`Callback received — code: ${callbackResult.code.slice(0, 8)}…`);
  ok('State matched');

  // ── 5. Token exchange ──────────────────────────────────────────────────────

  step('5 / 5 — Token exchange');

  let tokenResponse;
  try {
    tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        code: callbackResult.code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });
  } catch (err) {
    fail(`Network error: ${err.message}`);
    process.exit(1);
  }

  const raw = await tokenResponse.text();
  info(`HTTP ${tokenResponse.status} ${tokenResponse.statusText}`);

  let tokens = {};
  try { tokens = JSON.parse(raw); } catch { /* show raw below */ }

  if (!tokenResponse.ok) {
    fail('Token exchange failed');
    info(`error             : ${tokens.error || '—'}`);
    info(`error_description : ${tokens.error_description || raw}`);
    console.log('');
    console.log('  Common causes:');
    console.log('  • "redirect_uri_mismatch" → client type is Web application, not Desktop app');
    console.log('  • "invalid_client"        → client ID does not exist or was deleted');
    console.log('  • "invalid_grant"         → code already used or expired (try again)');
    process.exit(1);
  }

  ok('Token exchange succeeded');
  info(`access_token  : ${tokens.access_token ? 'present ✓' : 'missing ✗'}`);
  info(`id_token      : ${tokens.id_token ? 'present ✓' : 'missing ✗'}`);
  info(`refresh_token : ${tokens.refresh_token ? 'present ✓' : 'not returned'}`);
  info(`scope         : ${tokens.scope || '—'}`);

  if (!tokens.id_token) {
    fail('No ID token returned — cannot verify identity.');
    process.exit(1);
  }

  // ── ID token verification ──────────────────────────────────────────────────

  console.log('');
  console.log('  [Verifying ID token via tokeninfo]');

  let verifyResponse;
  try {
    verifyResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${tokens.id_token}`);
  } catch (err) {
    fail(`Network error during verification: ${err.message}`);
    process.exit(1);
  }

  const verifyRaw = await verifyResponse.text();
  let identity = {};
  try { identity = JSON.parse(verifyRaw); } catch { /* show raw */ }

  if (!verifyResponse.ok) {
    fail('ID token verification failed');
    info(verifyRaw);
    process.exit(1);
  }

  ok('ID token verified');
  info(`email          : ${identity.email || '—'}`);
  info(`email_verified : ${identity.email_verified || '—'}`);
  info(`name           : ${identity.name || '—'}`);
  info(`sub            : ${identity.sub || '—'}`);

  console.log('');
  console.log('=== All steps passed — OAuth flow is working correctly ===');
  console.log('');
}

// ── Simple HTML pages for the browser tab ────────────────────────────────────

function page(kind, message) {
  const title = kind === 'error' ? 'Sign-in failed' : 'Sign-in in progress…';
  const color = kind === 'error' ? '#b33a3a' : '#1a6fa8';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title>
<style>body{font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f5f5}
main{padding:32px 40px;border-radius:16px;background:#fff;box-shadow:0 8px 32px rgba(0,0,0,.12);max-width:420px;text-align:center}
h1{margin:0 0 12px;font-size:22px;color:${color}}p{margin:0;color:#444;font-size:15px}</style>
</head><body><main><h1>${title}</h1><p>${message}</p><p style="margin-top:12px;font-size:13px;color:#888">Check the terminal for details.</p></main></body></html>`;
}

// ── Run ───────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('');
  console.error('Fatal:', err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
