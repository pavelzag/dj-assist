import { NextRequest, NextResponse } from 'next/server';
import {
  createDesktopAuthState,
  createPkceChallenge,
} from '@/lib/desktop-oauth';
import { appendAuthLog, createAuthDiagnosticId, maskValue } from '@/lib/auth-log';
import { normalizeCloudSourceKind } from '@/lib/cloud-source';
import {
  applyDropboxOauthCredentialsToEnv,
  clearPendingCloudAuthSession,
  effectiveDropboxOauthCredentials,
  loadPendingCloudAuthSession,
  saveDropboxAuth,
  savePendingCloudAuthSession,
} from '@/lib/runtime-settings';
import { createDropboxDesktopAuthUrl, exchangeDropboxAuthCode, fetchDropboxProfile } from '@/lib/dropbox-auth';
import { googleFeaturesEnabled } from '@/lib/app-flavor';

export const runtime = 'nodejs';

function unsupported(provider: string) {
  return NextResponse.json({ error: `Unsupported cloud provider: ${provider}` }, { status: 404 });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  if (!googleFeaturesEnabled()) {
    return NextResponse.json({ error: 'Unavailable in this app version.' }, { status: 404 });
  }

  const { provider: rawProvider } = await context.params;
  const provider = normalizeCloudSourceKind(rawProvider);
  if (provider !== 'dropbox') {
    return unsupported(rawProvider);
  }

  const diagnosticId = createAuthDiagnosticId();
  const oauth = await effectiveDropboxOauthCredentials();
  if (oauth.credentials) applyDropboxOauthCredentialsToEnv(oauth.credentials);

  const clientId = String(oauth.credentials?.clientId ?? '').trim();
  const clientSecret = String(oauth.credentials?.clientSecret ?? '').trim();
  const requestUrl = new URL(request.url);
  const fixedDropboxRedirectUri = `${requestUrl.origin}${requestUrl.pathname}`;
  if (!clientId) {
    await appendAuthLog({
      id: diagnosticId,
      level: 'error',
      event: 'dropbox_oauth_not_configured',
      message: 'Dropbox sign-in is not configured.',
      context: {
        provider,
        oauth_source: oauth.summary.source,
        configured: oauth.summary.configured,
        missing: oauth.summary.missing,
      },
    });
    return NextResponse.json({ error: 'Dropbox sign-in is not configured.' }, { status: 400 });
  }

  if (requestUrl.searchParams.has('code') || requestUrl.searchParams.has('error')) {
    return handleDropboxFixedCallback(request, {
      diagnosticId,
      clientId,
      clientSecret: clientSecret || undefined,
      requestOrigin: requestUrl.origin,
      redirectUri: fixedDropboxRedirectUri,
    });
  }

  const authState = createDesktopAuthState();
  const challenge = createPkceChallenge(authState.verifier);
  const scopes = ['files.metadata.read', 'files.content.read'];

  await appendAuthLog({
    id: diagnosticId,
    level: 'info',
    event: 'dropbox_oauth_start',
    message: 'Dropbox sign-in started.',
    context: {
      provider,
      client_id_masked: maskValue(clientId),
      has_client_secret: Boolean(clientSecret),
      redirect_uri: fixedDropboxRedirectUri,
      scopes,
      pkce: true,
      oauth_source: oauth.summary.source,
      configured: oauth.summary.configured,
    },
  });

  await savePendingCloudAuthSession({
    state: authState.state,
    verifier: authState.verifier,
    nonce: authState.nonce,
  });

  const authUrl = createDropboxDesktopAuthUrl({
    clientId,
    redirectUri: fixedDropboxRedirectUri,
    state: authState.state,
    challenge,
  });

  await appendAuthLog({
    id: diagnosticId,
    level: 'info',
    event: 'dropbox_oauth_authorize_url_ready',
    message: 'Dropbox authorize URL ready.',
    context: {
      provider,
      redirect_uri: fixedDropboxRedirectUri,
      authorize_host: authUrl.host,
      path: authUrl.pathname,
      scopes,
      token_access_type: 'offline',
    },
  });

  return NextResponse.redirect(authUrl, { headers: { 'Cache-Control': 'no-store' } });
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
  const pending = await loadPendingCloudAuthSession();

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
    await clearPendingCloudAuthSession();
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
    await clearPendingCloudAuthSession();
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
    await clearPendingCloudAuthSession();
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

  await clearPendingCloudAuthSession();
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
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
