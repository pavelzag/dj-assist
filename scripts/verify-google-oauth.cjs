#!/usr/bin/env node
const http = require('node:http');
const { randomBytes, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { loadProjectEnv } = require('./load-env.cjs');

function mask(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= 10) return `${text.slice(0, 2)}...`;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function createVerifier() {
  return randomBytes(48).toString('base64url');
}

function createChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function createState() {
  return randomBytes(24).toString('hex');
}

function createNonce() {
  return randomBytes(24).toString('base64url');
}

function openBrowser(url) {
  if (process.argv.includes('--no-open')) return false;
  if (process.platform === 'darwin') {
    const child = spawn('open', [url], { stdio: 'ignore', detached: true });
    child.unref();
    return true;
  }
  if (process.platform === 'linux') {
    const child = spawn('xdg-open', [url], { stdio: 'ignore', detached: true });
    child.unref();
    return true;
  }
  return false;
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: npm run verify:google-oauth -- [--no-open]');
    console.log('Loads GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from the local environment, starts a one-time localhost callback server, and verifies the desktop OAuth flow against Google.');
    process.exit(0);
  }

  loadProjectEnv();

  const clientId = String(process.env.GOOGLE_CLIENT_ID ?? '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET ?? '').trim();

  if (!clientId) {
    console.error('Missing GOOGLE_CLIENT_ID in the loaded environment.');
    process.exit(1);
  }

  const state = createState();
  const verifier = createVerifier();
  const challenge = createChallenge(verifier);
  const nonce = createNonce();

  const result = await new Promise((resolve, reject) => {
    let port = 0;
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
        if (url.pathname !== '/') {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }

        const code = url.searchParams.get('code') || '';
        const returnedState = url.searchParams.get('state') || '';
        const oauthError = url.searchParams.get('error') || '';

        if (oauthError) {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(`Google returned error: ${oauthError}`);
          server.close(() => resolve({ ok: false, error: oauthError }));
          return;
        }

        if (!code || returnedState !== state) {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Invalid callback received.');
          server.close(() => resolve({ ok: false, error: 'invalid_callback' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Callback received. You can close this tab.');
        server.close(async () => {
          try {
            const redirectUri = `http://127.0.0.1:${port}/`;
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                code,
                code_verifier: verifier,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
              }).toString(),
            });

            const raw = await tokenResponse.text();
            if (!tokenResponse.ok) {
              resolve({
                ok: false,
                error: raw.trim() || `${tokenResponse.status} ${tokenResponse.statusText}`,
              });
              return;
            }

            const tokens = JSON.parse(raw);
            const idToken = String(tokens.id_token ?? '').trim();
            if (!idToken) {
              resolve({ ok: false, error: 'Google returned no ID token.' });
              return;
            }

            const infoUrl = new URL('https://oauth2.googleapis.com/tokeninfo');
            infoUrl.searchParams.set('id_token', idToken);
            const infoResponse = await fetch(infoUrl, { cache: 'no-store' });
            const infoRaw = await infoResponse.text();
            if (!infoResponse.ok) {
              resolve({ ok: false, error: infoRaw.trim() || 'tokeninfo verification failed' });
              return;
            }

            const info = JSON.parse(infoRaw);
            if (String(info.aud ?? '') !== clientId) {
              resolve({ ok: false, error: 'Returned ID token did not validate against the same client ID.' });
              return;
            }

            resolve({
              ok: true,
              accessTokenPresent: Boolean(tokens.access_token),
              idTokenPresent: Boolean(tokens.id_token),
              refreshTokenPresent: Boolean(tokens.refresh_token),
              scope: tokens.scope || null,
              redirectUri,
              clientSecretProvided: Boolean(clientSecret),
            });
          } catch (error) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      port = typeof address === 'object' && address ? address.port : 0;
      if (!port) {
        reject(new Error('Could not allocate a loopback port.'));
        return;
      }
      const redirectUri = `http://127.0.0.1:${port}/`;
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

      console.log(`GOOGLE_CLIENT_ID=${mask(clientId)}`);
      console.log(`GOOGLE_CLIENT_SECRET=${mask(clientSecret)}`);
      console.log(`Open this URL to verify the pair: ${authUrl.toString()}`);
      console.log('client_secret_used_in_token_exchange=false');
      if (!openBrowser(authUrl.toString())) {
        console.log('Browser auto-open is not supported on this platform.');
      }
    });
  });

  if (!result.ok) {
    console.error(`Google OAuth verification failed: ${result.error}`);
    process.exit(1);
  }

  console.log('Google OAuth verification passed.');
  console.log(`access_token_present=${result.accessTokenPresent}`);
  console.log(`id_token_present=${result.idTokenPresent}`);
  console.log(`refresh_token_present=${result.refreshTokenPresent}`);
  console.log(`redirect_uri=${result.redirectUri}`);
  console.log(`client_secret_provided=${result.clientSecretProvided}`);
  if (result.scope) console.log(`scope=${result.scope}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
