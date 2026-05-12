import http from 'node:http';
import { NextRequest, NextResponse } from 'next/server';
import {
  createDesktopAuthState,
  createLoopbackRedirectUri,
  createPkceChallenge,
} from '@/lib/desktop-oauth';
import { normalizeCloudSourceKind, type CloudSourceKind } from '@/lib/cloud-source';
import {
  applyDropboxOauthCredentialsToEnv,
  applyOneDriveOauthCredentialsToEnv,
  clearPendingCloudAuthSession,
  effectiveDropboxOauthCredentials,
  effectiveOneDriveOauthCredentials,
  saveDropboxAuth,
  saveOneDriveAuth,
  savePendingCloudAuthSession,
} from '@/lib/runtime-settings';
import { createDropboxDesktopAuthUrl, exchangeDropboxAuthCode, fetchDropboxProfile } from '@/lib/dropbox-auth';
import { createOneDriveDesktopAuthUrl, exchangeOneDriveAuthCode, fetchOneDriveProfile } from '@/lib/onedrive-auth';
import { googleFeaturesEnabled } from '@/lib/app-flavor';

export const runtime = 'nodejs';

type LoopbackSession = {
  server: http.Server;
  port: number;
  redirectUri: string;
};

let activeSession: LoopbackSession | null = null;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  if (!googleFeaturesEnabled()) {
    return NextResponse.json({ error: 'Unavailable in this app version.' }, { status: 404 });
  }
  const { provider: rawProvider } = await context.params;
  const provider = normalizeCloudSourceKind(rawProvider);
  if (!provider || provider === 'google_drive') {
    return NextResponse.json({ error: `Unsupported cloud provider: ${rawProvider}` }, { status: 404 });
  }

  const oauth = provider === 'onedrive'
    ? await effectiveOneDriveOauthCredentials()
    : await effectiveDropboxOauthCredentials();
  if (provider === 'onedrive' && oauth.credentials) applyOneDriveOauthCredentialsToEnv(oauth.credentials);
  if (provider === 'dropbox' && oauth.credentials) applyDropboxOauthCredentialsToEnv(oauth.credentials);

  const clientId = String(oauth.credentials?.clientId ?? '').trim();
  const clientSecret = String(oauth.credentials?.clientSecret ?? '').trim();
  if (!clientId) {
    return NextResponse.json({ error: `${provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} sign-in is not configured.` }, { status: 400 });
  }

  if (activeSession) {
    activeSession.server.close();
    activeSession = null;
  }

  const authState = createDesktopAuthState();
  const challenge = createPkceChallenge(authState.verifier);
  let redirectUri = '';
  const session = await new Promise<LoopbackSession>((resolve, reject) => {
    const callbackServer = http.createServer((req, res) => {
      void handleLoopbackCallback(req, res, {
        provider,
        clientId,
        clientSecret: clientSecret || undefined,
        authState,
        requestOrigin: new URL(request.url).origin,
        redirectUri,
      });
    });
    callbackServer.on('error', reject);
    callbackServer.listen(0, '127.0.0.1', () => {
      const address = callbackServer.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      if (!port) {
        reject(new Error(`Unable to allocate a loopback port for ${provider} sign-in.`));
        return;
      }
      resolve({
        server: callbackServer,
        port,
        redirectUri: createLoopbackRedirectUri(port),
      });
    });
  });
  activeSession = session;
  redirectUri = session.redirectUri;

  await savePendingCloudAuthSession(provider, {
    state: authState.state,
    verifier: authState.verifier,
    nonce: authState.nonce,
  });

  const authUrl = provider === 'onedrive'
    ? createOneDriveDesktopAuthUrl({
      clientId,
      redirectUri: session.redirectUri,
      state: authState.state,
      challenge,
    })
    : createDropboxDesktopAuthUrl({
      clientId,
      redirectUri: session.redirectUri,
      state: authState.state,
      challenge,
    });

  return NextResponse.redirect(authUrl, { headers: { 'Cache-Control': 'no-store' } });
}

async function handleLoopbackCallback(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  input: {
    provider: Exclude<CloudSourceKind, 'google_drive'>;
    clientId: string;
    clientSecret?: string;
    authState: { state: string; verifier: string; nonce: string };
    requestOrigin: string;
    redirectUri: string;
  },
) {
  try {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    const code = requestUrl.searchParams.get('code') ?? '';
    const state = requestUrl.searchParams.get('state') ?? '';
    const error = requestUrl.searchParams.get('error') ?? '';
    if (error) {
      await clearPendingCloudAuthSession(input.provider);
      sendHtml(res, `<h1>Sign-in cancelled</h1><p>${escapeHtml(error)}</p>`);
      return;
    }
    if (!code || state !== input.authState.state) {
      await clearPendingCloudAuthSession(input.provider);
      sendHtml(res, '<h1>Sign-in failed</h1><p>OAuth state verification failed.</p>');
      return;
    }

    if (input.provider === 'onedrive') {
      const tokens = await exchangeOneDriveAuthCode({
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        code,
        verifier: input.authState.verifier,
        redirectUri: input.redirectUri,
      });
      const profile = await fetchOneDriveProfile(String(tokens.accessToken ?? '').trim());
      await saveOneDriveAuth({
        id: profile.id,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        accessToken: tokens.accessToken ?? undefined,
        accessTokenExpiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString() : undefined,
        refreshToken: tokens.refreshToken ?? undefined,
        scopes: String(tokens.scope ?? '').split(/\s+/).map((scope) => scope.trim()).filter(Boolean),
      });
    } else {
      const tokens = await exchangeDropboxAuthCode({
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        code,
        verifier: input.authState.verifier,
        redirectUri: input.redirectUri,
      });
      const profile = await fetchDropboxProfile(String(tokens.accessToken ?? '').trim());
      await saveDropboxAuth({
        id: profile.id,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        accessToken: tokens.accessToken ?? undefined,
        accessTokenExpiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString() : undefined,
        refreshToken: tokens.refreshToken ?? undefined,
        scopes: String(tokens.scope ?? '').split(/\s+/).map((scope) => scope.trim()).filter(Boolean),
      });
    }
    await clearPendingCloudAuthSession(input.provider);
    sendHtml(res, '<h1>Connected</h1><p>You can return to DJ Assist.</p>');
  } catch (error) {
    await clearPendingCloudAuthSession(input.provider);
    sendHtml(res, `<h1>Sign-in failed</h1><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`);
  }
}

function sendHtml(res: http.ServerResponse, body: string) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><html><body style="font-family:system-ui;padding:24px;line-height:1.5">${body}</body></html>`);
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
