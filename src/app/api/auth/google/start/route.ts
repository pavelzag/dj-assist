import http from 'node:http';
import { NextRequest, NextResponse } from 'next/server';
import {
  GoogleDesktopTokenExchangeError,
  createLoopbackRedirectUri,
  createDesktopAuthState,
  createGoogleDesktopAuthUrl,
  exchangeGoogleDesktopAuthCode,
} from '@/lib/google-desktop-auth';
import { createPkceChallenge } from '@/lib/google-auth';
import {
  applyGoogleOauthCredentialsToEnv,
  clearPendingGoogleAuthSession,
  effectiveGoogleOauthCredentials,
  saveGoogleAuth,
  savePendingGoogleAuthSession,
} from '@/lib/runtime-settings';
import { appendAuthLog, createAuthDiagnosticId, maskValue } from '@/lib/auth-log';
import { verifyGoogleIdToken, stringOrUndefined } from '@/lib/google-auth';
import { loadRuntimeSettings, maskClientId } from '@/lib/runtime-settings';

export const runtime = 'nodejs';

type LoopbackSession = {
  server: http.Server;
  port: number;
  redirectUri: string;
};

let activeSession: LoopbackSession | null = null;

export async function GET(request: NextRequest) {
  const diagnosticId = createAuthDiagnosticId();
  const googleOauth = await effectiveGoogleOauthCredentials();
  if (googleOauth.credentials) applyGoogleOauthCredentialsToEnv(googleOauth.credentials);
  const clientId = String(googleOauth.credentials?.clientId ?? '').trim();
  const clientSecret = String(googleOauth.credentials?.clientSecret ?? '').trim();
  const settings = await loadRuntimeSettings();
  const savedClientId = String(settings.googleOauth?.clientId ?? '').trim();
  const savedClientSecret = String(settings.googleOauth?.clientSecret ?? '').trim();
  const envClientId = String(process.env.GOOGLE_CLIENT_ID ?? '').trim();
  const envClientSecret = String(process.env.GOOGLE_CLIENT_SECRET ?? '').trim();
  const resolvedIdFrom = envClientId ? 'env' : (savedClientId ? 'saved' : 'none');
  const resolvedSecretFrom = envClientSecret
    ? 'env'
    : (savedClientSecret && savedClientId === clientId ? 'saved' : 'none');

  await appendAuthLog({
    id: diagnosticId,
    level: clientId ? 'info' : 'warning',
    event: 'google_oauth_start',
    message: clientId ? 'Starting Google desktop OAuth flow.' : 'Google OAuth start requested without credentials.',
    context: {
      source: googleOauth.summary.source,
      client_id_masked: maskValue(clientId),
      has_secret: Boolean(clientSecret),
      request_origin: new URL(request.url).origin,
      env_client_id_masked: maskClientId(envClientId),
      env_has_secret: Boolean(envClientSecret),
      saved_client_id_masked: maskClientId(savedClientId),
      saved_has_secret: Boolean(savedClientSecret),
      effective_id_from: resolvedIdFrom,
      effective_secret_from: resolvedSecretFrom,
      effective_has_secret: Boolean(clientSecret),
      env_saved_client_id_match: Boolean(envClientId && savedClientId && envClientId === savedClientId),
      effective_client_id_matches_saved: Boolean(clientId && savedClientId && clientId === savedClientId),
    },
  });

  if (!clientId) {
    return redirectWithMessage(request, 'Google sign-in is not configured.');
  }

  if (activeSession) {
    activeSession.server.close();
    activeSession = null;
  }

  const authState = createDesktopAuthState();
  const challenge = createPkceChallenge(authState.verifier);
  let redirectUri = '';
  const callbackServer = http.createServer((req, res) => {
    void handleLoopbackCallback(req, res, {
      clientId,
      clientSecret,
      authState,
      diagnosticId,
      requestOrigin: new URL(request.url).origin,
      redirectUri,
    });
  });

  const session = await new Promise<LoopbackSession>((resolve, reject) => {
    callbackServer.on('error', reject);
    callbackServer.listen(0, '127.0.0.1', () => {
      const address = callbackServer.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      if (!port) {
        reject(new Error('Unable to allocate a loopback port for Google sign-in.'));
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

  await savePendingGoogleAuthSession({
    state: authState.state,
    verifier: authState.verifier,
    nonce: authState.nonce,
  });

  const authUrl = createGoogleDesktopAuthUrl({
    clientId,
    redirectUri: session.redirectUri,
    state: authState.state,
    nonce: authState.nonce,
    challenge,
  });

  await appendAuthLog({
    id: diagnosticId,
    level: 'info',
    event: 'google_oauth_start_url_ready',
    message: 'Google desktop OAuth authorization URL prepared.',
    context: {
      redirect_uri: session.redirectUri,
      port: session.port,
      has_secret: Boolean(clientSecret),
      effective_secret_from: resolvedSecretFrom,
      flow: 'desktop_loopback',
      redirect_uri_kind: session.redirectUri.startsWith('http://127.0.0.1:') ? 'loopback' : 'other',
      oauth_client_hint: clientSecret ? 'confidential_or_web' : 'public_or_desktop',
    },
  });

  return NextResponse.redirect(authUrl, { headers: { 'Cache-Control': 'no-store' } });
}

async function handleLoopbackCallback(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  input: {
    clientId: string;
    clientSecret?: string;
    authState: { state: string; verifier: string; nonce: string };
    diagnosticId: string;
    requestOrigin: string;
    redirectUri: string;
  },
) {
  try {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    if (requestUrl.pathname !== '/') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const code = requestUrl.searchParams.get('code') ?? '';
    const state = requestUrl.searchParams.get('state') ?? '';
    const oauthError = requestUrl.searchParams.get('error') ?? '';

    await appendAuthLog({
      id: input.diagnosticId,
      level: 'info',
      event: 'google_oauth_callback_received',
      message: 'Received Google OAuth callback.',
      context: {
        request_origin: input.requestOrigin,
        client_id_masked: maskValue(input.clientId),
        has_code: Boolean(code),
        has_state: Boolean(state),
        state_matches: Boolean(state && state === input.authState.state),
        callback_error: oauthError || undefined,
        scope: requestUrl.searchParams.get('scope') ?? undefined,
      },
    });

    if (oauthError) {
      await clearPendingGoogleAuthSession();
      await appendAuthLog({
        id: input.diagnosticId,
        level: 'warning',
        event: 'google_oauth_provider_error',
        message: 'Google returned an OAuth error.',
        context: { error: oauthError },
      });
      await sendAuthResultPage(res, {
        kind: 'error',
        message: googleErrorMessage(oauthError),
        appUrl: input.requestOrigin,
        diagnosticId: input.diagnosticId,
      });
      return;
    }

    if (!code || state !== input.authState.state) {
      await clearPendingGoogleAuthSession();
      await appendAuthLog({
        id: input.diagnosticId,
        level: 'error',
        event: 'google_oauth_state_verification_failed',
        message: 'Google OAuth state was missing or invalid.',
        context: {
          has_code: Boolean(code),
          has_state: Boolean(state),
          state_matches: Boolean(state && state === input.authState.state),
        },
      });
      await sendAuthResultPage(res, {
        kind: 'error',
        message: 'Google sign-in could not be verified.',
        appUrl: input.requestOrigin,
        diagnosticId: input.diagnosticId,
      });
      return;
    }

    await appendAuthLog({
        id: input.diagnosticId,
        level: 'info',
        event: 'google_oauth_token_exchange_start',
        message: 'Exchanging Google OAuth authorization code for tokens.',
        context: {
          redirect_uri: input.redirectUri,
          has_client_secret: Boolean(String(input.clientSecret ?? '').trim()),
          client_secret_length: String(input.clientSecret ?? '').trim().length || 0,
        },
      });

    const tokens = await exchangeGoogleDesktopAuthCode({
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      code,
      verifier: input.authState.verifier,
      redirectUri: input.redirectUri,
    });

    if (!tokens.idToken) {
      await clearPendingGoogleAuthSession();
      await appendAuthLog({
        id: input.diagnosticId,
        level: 'error',
        event: 'google_oauth_missing_id_token',
        message: 'Google OAuth token response did not include an ID token.',
      });
      await sendAuthResultPage(res, {
        kind: 'error',
        message: 'Google sign-in returned no user identity.',
        appUrl: input.requestOrigin,
        diagnosticId: input.diagnosticId,
      });
      return;
    }

    try {
      const identity = await verifyGoogleIdToken({
        token: tokens.idToken,
        clientId: input.clientId,
        nonce: input.authState.nonce,
      });

      await saveGoogleAuth({
        id: identity.sub,
        email: stringOrUndefined(identity.email),
        emailVerified: identity.emailVerified,
        name: stringOrUndefined(identity.name),
        picture: stringOrUndefined(identity.picture),
        idToken: tokens.idToken,
      });
      await clearPendingGoogleAuthSession();
      await appendAuthLog({
        id: input.diagnosticId,
        level: 'info',
        event: 'google_oauth_success',
        message: 'Google OAuth sign-in completed.',
        context: {
          email: identity.email,
          email_verified: identity.emailVerified,
        },
      });
      await sendAuthResultPage(res, {
        kind: 'success',
        message: 'Google sign-in connected. You can return to DJ Assist.',
        appUrl: input.requestOrigin,
        diagnosticId: input.diagnosticId,
      });
    } catch (error) {
      await clearPendingGoogleAuthSession();
      const message = error instanceof Error ? error.message : 'Google sign-in could not be verified.';
      await appendAuthLog({
        id: input.diagnosticId,
        level: 'error',
        event: 'google_oauth_identity_verification_failed',
        message: 'Google ID token verification failed.',
        context: { failure: message },
      });
      await sendAuthResultPage(res, {
        kind: 'error',
        message,
        appUrl: input.requestOrigin,
        diagnosticId: input.diagnosticId,
      });
    }
  } catch (error) {
    await clearPendingGoogleAuthSession();
    const message = error instanceof Error ? error.message : 'Google sign-in failed.';
    const tokenExchangeError = error instanceof GoogleDesktopTokenExchangeError ? error : null;
    await appendAuthLog({
      id: input.diagnosticId,
      level: 'error',
      event: 'google_oauth_callback_error',
      message: 'Google OAuth callback handler failed.',
      context: {
        failure: message,
        flow: 'desktop_loopback',
        redirect_uri: input.redirectUri,
        token_status: tokenExchangeError?.status ?? undefined,
        token_status_text: tokenExchangeError?.statusText ?? undefined,
        token_error: String(tokenExchangeError?.payload?.error ?? '').trim() || undefined,
        token_error_description: String(tokenExchangeError?.payload?.error_description ?? '').trim() || undefined,
        client_secret_required_hint: isMissingClientSecretError(tokenExchangeError),
      },
    });
    if (!res.headersSent) {
      await sendAuthResultPage(res, {
        kind: 'error',
        message,
        appUrl: input.requestOrigin,
        diagnosticId: input.diagnosticId,
      });
    } else {
      res.end();
    }
  } finally {
    activeSession?.server.close();
    activeSession = null;
  }
}

function isMissingClientSecretError(error: GoogleDesktopTokenExchangeError | null): boolean {
  if (!error) return false;
  const description = String(error.payload?.error_description ?? '').toLowerCase();
  const code = String(error.payload?.error ?? '').toLowerCase();
  return code === 'invalid_request' && description.includes('client_secret') && description.includes('missing');
}

async function sendAuthResultPage(
  res: http.ServerResponse,
  input: { kind: 'success' | 'error'; message: string; appUrl: string; diagnosticId?: string },
) {
  const html = renderAuthResultHtml(input);
  res.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/html; charset=utf-8',
  });
  res.end(html);
}

function renderAuthResultHtml(input: { kind: 'success' | 'error'; message: string; appUrl: string; diagnosticId?: string }) {
  const title = input.kind === 'success' ? 'Google Sign-In Complete' : 'Google Sign-In Failed';
  const accent = input.kind === 'success' ? '#1f7a45' : '#b33a3a';
  const safeMessage = escapeHtml(input.message);
  const safeUrl = escapeHtml(input.appUrl);
  const safeDiagnosticId = escapeHtml(input.diagnosticId ?? '');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "SF Pro Display", "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(255,255,255,0.95), rgba(242,238,228,0.92)),
          linear-gradient(135deg, #f7f3ea, #efe5d4);
        color: #181512;
      }
      main {
        width: min(480px, calc(100vw - 32px));
        padding: 28px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 24px 72px rgba(49, 33, 12, 0.16);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: ${accent};
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 18px 0 10px;
        font-size: 30px;
        line-height: 1.1;
      }
      p {
        margin: 0;
        font-size: 15px;
        line-height: 1.55;
      }
      code {
        display: inline-block;
        margin-top: 12px;
        padding: 6px 9px;
        border-radius: 8px;
        background: rgba(24, 21, 18, 0.08);
        font-size: 12px;
      }
      a {
        display: inline-block;
        margin-top: 18px;
        color: #181512;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="badge">${input.kind === 'success' ? 'Connected' : 'Needs Attention'}</div>
      <h1>${title}</h1>
      <p>${safeMessage}</p>
      ${safeDiagnosticId ? `<code>Diagnostic ID: ${safeDiagnosticId}</code>` : ''}
      <a href="${safeUrl}">Return to DJ Assist</a>
    </main>
    <script>
      window.setTimeout(() => {
        if (document.visibilityState === 'visible') window.focus();
      }, 150);
    </script>
  </body>
</html>`;
}

function googleErrorMessage(code: string): string {
  switch (code) {
    case 'access_denied':
      return 'Google sign-in was cancelled.';
    default:
      return 'Google sign-in failed.';
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function redirectWithMessage(request: NextRequest, message: string) {
  const url = new URL('/', request.url);
  url.searchParams.set('auth', message);
  return NextResponse.redirect(url, { headers: { 'Cache-Control': 'no-store' } });
}
