import http from 'node:http';
import { NextRequest, NextResponse } from 'next/server';
import {
  createDesktopAuthState,
  createLoopbackRedirectUri,
  createPkceChallenge,
} from '@/lib/desktop-oauth';
import { appendAuthLog, createAuthDiagnosticId, maskValue } from '@/lib/auth-log';
import { normalizeCloudSourceKind, type CloudSourceKind } from '@/lib/cloud-source';
import {
  applyDropboxOauthCredentialsToEnv,
  applyOneDriveOauthCredentialsToEnv,
  clearPendingCloudAuthSession,
  effectiveDropboxOauthCredentials,
  effectiveOneDriveOauthCredentials,
  loadPendingCloudAuthSession,
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

  const diagnosticId = createAuthDiagnosticId();
  const oauth = provider === 'onedrive'
    ? await effectiveOneDriveOauthCredentials()
    : await effectiveDropboxOauthCredentials();
  if (provider === 'onedrive' && oauth.credentials) applyOneDriveOauthCredentialsToEnv(oauth.credentials);
  if (provider === 'dropbox' && oauth.credentials) applyDropboxOauthCredentialsToEnv(oauth.credentials);

  const clientId = String(oauth.credentials?.clientId ?? '').trim();
  const clientSecret = String(oauth.credentials?.clientSecret ?? '').trim();
  const requestUrl = new URL(request.url);
  const fixedDropboxRedirectUri = `${requestUrl.origin}${requestUrl.pathname}`;
  if (!clientId) {
    await appendAuthLog({
      id: diagnosticId,
      level: 'error',
      event: `${provider}_oauth_not_configured`,
      message: `${provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} sign-in is not configured.`,
      context: {
        provider,
        oauth_source: oauth.summary.source,
        configured: oauth.summary.configured,
        missing: oauth.summary.missing,
      },
    });
    return NextResponse.json({ error: `${provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} sign-in is not configured.` }, { status: 400 });
  }

  if (provider === 'dropbox' && (requestUrl.searchParams.has('code') || requestUrl.searchParams.has('error'))) {
    return handleDropboxFixedCallback(request, {
      diagnosticId,
      clientId,
      clientSecret: clientSecret || undefined,
      requestOrigin: requestUrl.origin,
      redirectUri: fixedDropboxRedirectUri,
    });
  }

  if (activeSession) {
    activeSession.server.close();
    activeSession = null;
  }

  const authState = createDesktopAuthState();
  const challenge = createPkceChallenge(authState.verifier);
  let redirectUri = '';
  const session = provider === 'dropbox'
    ? null
    : await new Promise<LoopbackSession>((resolve, reject) => {
      const callbackServer = http.createServer((req, res) => {
        void handleLoopbackCallback(req, res, {
          provider,
          clientId,
          clientSecret: clientSecret || undefined,
          authState,
          requestOrigin: requestUrl.origin,
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
  if (session) {
    activeSession = session;
    redirectUri = session.redirectUri;
  } else {
    redirectUri = fixedDropboxRedirectUri;
  }

  const scopes = provider === 'onedrive'
    ? ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Files.Read']
    : ['files.metadata.read', 'files.content.read'];
  const resolvedRedirectUri = provider === 'dropbox' ? fixedDropboxRedirectUri : session!.redirectUri;

  await appendAuthLog({
    id: diagnosticId,
    level: 'info',
    event: `${provider}_oauth_start`,
    message: `${provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} sign-in started.`,
    context: {
      provider,
      client_id_masked: maskValue(clientId),
      has_client_secret: Boolean(clientSecret),
      redirect_uri: resolvedRedirectUri,
      scopes,
      pkce: true,
      oauth_source: oauth.summary.source,
      configured: oauth.summary.configured,
    },
  });

  await savePendingCloudAuthSession(provider, {
    state: authState.state,
    verifier: authState.verifier,
    nonce: authState.nonce,
  });

  const authUrl = provider === 'onedrive'
    ? createOneDriveDesktopAuthUrl({
      clientId,
      redirectUri: resolvedRedirectUri,
      state: authState.state,
      challenge,
    })
    : createDropboxDesktopAuthUrl({
      clientId,
      redirectUri: resolvedRedirectUri,
      state: authState.state,
      challenge,
    });

  await appendAuthLog({
    id: diagnosticId,
    level: 'info',
    event: `${provider}_oauth_authorize_url_ready`,
    message: `${provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} authorize URL ready.`,
    context: {
      provider,
      redirect_uri: resolvedRedirectUri,
      authorize_host: authUrl.host,
      path: authUrl.pathname,
      scopes,
      token_access_type: provider === 'dropbox' ? 'offline' : undefined,
    },
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
    const diagnosticId = createAuthDiagnosticId();
    await appendAuthLog({
      id: diagnosticId,
      level: 'info',
      event: `${input.provider}_oauth_callback_received`,
      message: `${input.provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} callback received.`,
      context: {
        provider: input.provider,
        has_code: Boolean(code),
        state_matches: state === input.authState.state,
        error: error || null,
        redirect_uri: input.redirectUri,
      },
    });
    if (error) {
      await appendAuthLog({
        id: diagnosticId,
        level: 'error',
        event: `${input.provider}_oauth_provider_error`,
        message: `${input.provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} returned an OAuth error.`,
        context: {
          provider: input.provider,
          error,
          redirect_uri: input.redirectUri,
        },
      });
      await clearPendingCloudAuthSession(input.provider);
      sendHtml(res, `<h1>Sign-in cancelled</h1><p>${escapeHtml(error)}</p>`);
      return;
    }
    if (!code || state !== input.authState.state) {
      await appendAuthLog({
        id: diagnosticId,
        level: 'error',
        event: `${input.provider}_oauth_state_verification_failed`,
        message: `${input.provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} OAuth state verification failed.`,
        context: {
          provider: input.provider,
          has_code: Boolean(code),
          state_matches: state === input.authState.state,
          redirect_uri: input.redirectUri,
        },
      });
      await clearPendingCloudAuthSession(input.provider);
      sendHtml(res, '<h1>Sign-in failed</h1><p>OAuth state verification failed.</p>');
      return;
    }

    if (input.provider === 'onedrive') {
      await appendAuthLog({
        id: diagnosticId,
        level: 'info',
        event: 'onedrive_oauth_token_exchange_start',
        message: 'Starting OneDrive token exchange.',
        context: {
          provider: input.provider,
          redirect_uri: input.redirectUri,
          has_client_secret: Boolean(input.clientSecret),
        },
      });
      const tokens = await exchangeOneDriveAuthCode({
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        code,
        verifier: input.authState.verifier,
        redirectUri: input.redirectUri,
      });
      await appendAuthLog({
        id: diagnosticId,
        level: 'info',
        event: 'onedrive_oauth_token_exchange_done',
        message: 'OneDrive token exchange completed.',
        context: {
          provider: input.provider,
          has_refresh_token: Boolean(tokens.refreshToken),
          has_id_token: Boolean(tokens.idToken),
          expires_in: tokens.expiresIn ?? null,
        },
      });
      const profile = await fetchOneDriveProfile(String(tokens.accessToken ?? '').trim());
      await appendAuthLog({
        id: diagnosticId,
        level: 'info',
        event: 'onedrive_oauth_profile_loaded',
        message: 'OneDrive profile loaded.',
        context: {
          provider: input.provider,
          account_id: maskValue(profile.id),
          email: profile.email ?? null,
          name: profile.name ?? null,
        },
      });
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
      await appendAuthLog({
        id: diagnosticId,
        level: 'info',
        event: 'dropbox_oauth_token_exchange_start',
        message: 'Starting Dropbox token exchange.',
        context: {
          provider: input.provider,
          redirect_uri: input.redirectUri,
          has_client_secret: Boolean(input.clientSecret),
        },
      });
      const tokens = await exchangeDropboxAuthCode({
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        code,
        verifier: input.authState.verifier,
        redirectUri: input.redirectUri,
      });
      await appendAuthLog({
        id: diagnosticId,
        level: 'info',
        event: 'dropbox_oauth_token_exchange_done',
        message: 'Dropbox token exchange completed.',
        context: {
          provider: input.provider,
          has_refresh_token: Boolean(tokens.refreshToken),
          has_id_token: Boolean(tokens.idToken),
          expires_in: tokens.expiresIn ?? null,
        },
      });
      const profile = await fetchDropboxProfile(String(tokens.accessToken ?? '').trim());
      await appendAuthLog({
        id: diagnosticId,
        level: 'info',
        event: 'dropbox_oauth_profile_loaded',
        message: 'Dropbox profile loaded.',
        context: {
          provider: input.provider,
          account_id: maskValue(profile.id),
          email: profile.email ?? null,
          name: profile.name ?? null,
        },
      });
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
    await appendAuthLog({
      id: diagnosticId,
      level: 'info',
      event: `${input.provider}_oauth_success`,
      message: `${input.provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} sign-in completed.`,
      context: {
        provider: input.provider,
      },
    });
    sendHtml(res, '<h1>Connected</h1><p>You can return to DJ Assist.</p>');
  } catch (error) {
    await appendAuthLog({
      id: createAuthDiagnosticId(),
      level: 'error',
      event: `${input.provider}_oauth_failed`,
      message: `${input.provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} sign-in failed.`,
      context: {
        provider: input.provider,
        error: error instanceof Error ? error.message : String(error),
        redirect_uri: input.redirectUri,
      },
    });
    await clearPendingCloudAuthSession(input.provider);
    sendHtml(res, `<h1>Sign-in failed</h1><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`);
  }
}

function sendHtml(res: http.ServerResponse, body: string) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><html><body style="font-family:system-ui;padding:24px;line-height:1.5">${body}</body></html>`);
}

async function handleDropboxFixedCallback(
  request: NextRequest,
  input: {
    diagnosticId: string;
    clientId: string;
    clientSecret?: string;
    requestOrigin: string;
    redirectUri: string;
  },
) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code') ?? '';
  const state = requestUrl.searchParams.get('state') ?? '';
  const error = requestUrl.searchParams.get('error') ?? '';
  const pending = await loadPendingCloudAuthSession('dropbox');
  await appendAuthLog({
    id: input.diagnosticId,
    level: 'info',
    event: 'dropbox_oauth_callback_received',
    message: 'Dropbox callback received.',
    context: {
      provider: 'dropbox',
      has_code: Boolean(code),
      has_state: Boolean(state),
      error: error || null,
      redirect_uri: input.redirectUri,
      request_origin: input.requestOrigin,
    },
  });
  if (!pending) {
    await appendAuthLog({
      id: input.diagnosticId,
      level: 'error',
      event: 'dropbox_oauth_failed',
      message: 'Dropbox sign-in failed.',
      context: {
        provider: 'dropbox',
        error: 'Missing pending Dropbox auth session.',
        redirect_uri: input.redirectUri,
      },
    });
    await clearPendingCloudAuthSession('dropbox');
    return htmlResponse('<h1>Sign-in failed</h1><p>Dropbox auth session expired. Please try again.</p>', 400);
  }
  if (error) {
    await appendAuthLog({
      id: input.diagnosticId,
      level: 'error',
      event: 'dropbox_oauth_provider_error',
      message: 'Dropbox returned an OAuth error.',
      context: {
        provider: 'dropbox',
        error,
        redirect_uri: input.redirectUri,
      },
    });
    await clearPendingCloudAuthSession('dropbox');
    return htmlResponse(`<h1>Sign-in cancelled</h1><p>${escapeHtml(error)}</p>`);
  }
  if (!code || state !== pending.state) {
    await appendAuthLog({
      id: input.diagnosticId,
      level: 'error',
      event: 'dropbox_oauth_state_verification_failed',
      message: 'Dropbox OAuth state verification failed.',
      context: {
        provider: 'dropbox',
        has_code: Boolean(code),
        state_matches: state === pending.state,
        redirect_uri: input.redirectUri,
      },
    });
    await clearPendingCloudAuthSession('dropbox');
    return htmlResponse('<h1>Sign-in failed</h1><p>OAuth state verification failed.</p>', 400);
  }

  await appendAuthLog({
    id: input.diagnosticId,
    level: 'info',
    event: 'dropbox_oauth_token_exchange_start',
    message: 'Starting Dropbox token exchange.',
    context: {
      provider: 'dropbox',
      redirect_uri: input.redirectUri,
      has_client_secret: Boolean(input.clientSecret),
    },
  });
  const tokens = await exchangeDropboxAuthCode({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    code,
    verifier: pending.verifier,
    redirectUri: input.redirectUri,
  });
  await appendAuthLog({
    id: input.diagnosticId,
    level: 'info',
    event: 'dropbox_oauth_token_exchange_done',
    message: 'Dropbox token exchange completed.',
    context: {
      provider: 'dropbox',
      has_refresh_token: Boolean(tokens.refreshToken),
      has_id_token: Boolean(tokens.idToken),
      expires_in: tokens.expiresIn ?? null,
    },
  });
  let profile = { id: 'dropbox-account' };
  try {
    profile = await fetchDropboxProfile(String(tokens.accessToken ?? '').trim());
  } catch (profileError) {
    await appendAuthLog({
      id: input.diagnosticId,
      level: 'warning',
      event: 'dropbox_oauth_profile_load_failed',
      message: 'Dropbox profile lookup failed; continuing with fallback account id.',
      context: {
        provider: 'dropbox',
        error: profileError instanceof Error ? profileError.message : String(profileError),
      },
    });
  }
  await appendAuthLog({
    id: input.diagnosticId,
    level: 'info',
    event: 'dropbox_oauth_profile_loaded',
    message: 'Dropbox profile loaded.',
    context: {
      provider: 'dropbox',
      account_id: maskValue(profile.id),
      email: (profile as { email?: string }).email ?? null,
      name: (profile as { name?: string }).name ?? null,
    },
  });
  await saveDropboxAuth({
    id: profile.id,
    email: (profile as { email?: string }).email,
    name: (profile as { name?: string }).name,
    picture: (profile as { picture?: string }).picture,
    accessToken: tokens.accessToken ?? undefined,
    accessTokenExpiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString() : undefined,
    refreshToken: tokens.refreshToken ?? undefined,
    scopes: String(tokens.scope ?? '').split(/\s+/).map((scope) => scope.trim()).filter(Boolean),
  });
  await clearPendingCloudAuthSession('dropbox');
  await appendAuthLog({
    id: input.diagnosticId,
    level: 'info',
    event: 'dropbox_oauth_success',
    message: 'Dropbox sign-in completed.',
    context: {
      provider: 'dropbox',
    },
  });
  return htmlResponse('<h1>Connected</h1><p>You can return to DJ Assist.</p>');
}

function htmlResponse(body: string, status = 200) {
  return new NextResponse(`<!doctype html><html><body style="font-family:system-ui;padding:24px;line-height:1.5">${body}</body></html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
