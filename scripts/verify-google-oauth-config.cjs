#!/usr/bin/env node
const { loadProjectEnv } = require('./load-env.cjs');

function mask(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= 10) return `${text.slice(0, 2)}...`;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function looksLikeGoogleClientId(value) {
  return /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(String(value).trim());
}

async function main() {
  loadProjectEnv();

  const clientId = String(process.env.GOOGLE_CLIENT_ID ?? '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET ?? '').trim();

  if (!clientId) {
    console.error('Missing GOOGLE_CLIENT_ID.');
    process.exit(1);
  }

  if (!looksLikeGoogleClientId(clientId)) {
    console.error(`GOOGLE_CLIENT_ID does not look valid: ${mask(clientId)}`);
    process.exit(1);
  }

  const redirectUri = 'http://127.0.0.1:1/callback';
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      code: 'ci-verification-invalid-code',
      code_verifier: 'ci-verification-invalid-verifier',
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
  });

  const raw = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }

  const errorCode = String(payload?.error ?? '').trim();
  const errorDescription = String(payload?.error_description ?? raw ?? '').trim();

  if (!response.ok) {
    if (errorCode === 'invalid_grant') {
      console.log('Google OAuth config verification passed.');
      console.log(`GOOGLE_CLIENT_ID=${mask(clientId)}`);
      console.log(`GOOGLE_CLIENT_SECRET_PRESENT=${Boolean(clientSecret)}`);
      console.log(`redirect_uri_probe=${redirectUri}`);
      console.log(`google_response=${errorCode}`);
      return;
    }

    if (errorCode === 'invalid_client' || errorCode === 'unauthorized_client') {
      console.error(
        `Google rejected the provided OAuth client configuration: ${errorCode}${errorDescription ? ` - ${errorDescription}` : ''}`,
      );
      process.exit(1);
    }

    if (errorCode === 'invalid_request' && errorDescription.toLowerCase().includes('client_secret')) {
      console.error(
        `Google requires a client secret for this OAuth client but GOOGLE_CLIENT_SECRET is not set: ${errorDescription}`,
      );
      process.exit(1);
    }

    console.error(
      `Google OAuth config probe returned an unexpected response: ${response.status} ${response.statusText}${errorCode ? ` (${errorCode})` : ''}${errorDescription ? ` - ${errorDescription}` : ''}`,
    );
    process.exit(1);
  }

  console.error('Unexpected successful token exchange during CI probe.');
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
