import { NextRequest, NextResponse } from 'next/server';
import {
  applyGoogleOauthCredentialsToEnv,
  clearPendingGoogleAuthSession,
  effectiveGoogleOauthCredentials,
  loadPendingGoogleAuthSession,
  saveGoogleAuth,
} from '@/lib/runtime-settings';
import {
  stringOrUndefined,
  verifyGoogleIdToken,
} from '@/lib/google-auth';
import { appendAuthLog, createAuthDiagnosticId, maskValue } from '@/lib/auth-log';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const diagnosticId = createAuthDiagnosticId();
  const googleOauth = await effectiveGoogleOauthCredentials();
  if (googleOauth.credentials) applyGoogleOauthCredentialsToEnv(googleOauth.credentials);
  const clientId = String(googleOauth.credentials?.clientId ?? '').trim();
  const clientSecret = String(googleOauth.credentials?.clientSecret ?? '').trim();
  const envClientId = String(process.env.GOOGLE_CLIENT_ID ?? '').trim();
  const envClientSecret = String(process.env.GOOGLE_CLIENT_SECRET ?? '').trim();
  const resolvedIdFrom = envClientId ? 'env' : (clientId ? googleOauth.summary.source : 'none');
  const resolvedSecretFrom = envClientSecret
    ? 'env'
    : (clientSecret ? googleOauth.summary.source : 'none');
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code') ?? '';
  const state = searchParams.get('state') ?? '';
  const oauthError = searchParams.get('error') ?? '';
  const pendingAuth = await loadPendingGoogleAuthSession();
  const expectedState = pendingAuth?.state ?? '';
  const verifier = pendingAuth?.verifier ?? '';
  const expectedNonce = pendingAuth?.nonce ?? '';
  const requestOrigin = new URL(request.url).origin;

  await appendAuthLog({
    id: diagnosticId,
    level: 'info',
    event: 'google_oauth_callback_received',
    message: 'Received Google OAuth callback.',
    context: {
      request_origin: requestOrigin,
      credential_source: googleOauth.summary.source,
      client_id_masked: maskValue(clientId),
      has_secret: Boolean(clientSecret),
      env_client_id_masked: maskValue(envClientId),
      env_has_secret: Boolean(envClientSecret),
      effective_id_from: resolvedIdFrom,
      effective_secret_from: resolvedSecretFrom,
      effective_has_secret: Boolean(clientSecret),
      has_code: Boolean(code),
      has_state: Boolean(state),
      has_pending_session: Boolean(pendingAuth),
      state_matches: Boolean(state && expectedState && state === expectedState),
      callback_error: oauthError || undefined,
      scope: searchParams.get('scope') ?? undefined,
    },
  });

  if (!clientId) {
    await appendAuthLog({
      id: diagnosticId,
      level: 'error',
      event: 'google_oauth_missing_client_id',
      message: 'Google OAuth callback cannot continue because no client ID is configured.',
      context: { credential_source: googleOauth.summary.source },
    });
    return authResultResponse(request, 'error', 'Google sign-in is not configured.', diagnosticId);
  }

  if (oauthError) {
    await clearPendingGoogleAuthSession();
    await appendAuthLog({
      id: diagnosticId,
      level: 'warning',
      event: 'google_oauth_provider_error',
      message: 'Google returned an OAuth error.',
      context: { error: oauthError },
    });
    return authResultResponse(request, 'error', googleErrorMessage(oauthError), diagnosticId);
  }

  if (!code || !state || !expectedState || state !== expectedState || !verifier || !expectedNonce) {
    await clearPendingGoogleAuthSession();
    const missingPendingSession = !pendingAuth;
    await appendAuthLog({
      id: diagnosticId,
      level: 'error',
      event: 'google_oauth_state_verification_failed',
      message: 'Google OAuth state, verifier, or nonce was missing or invalid.',
      context: {
        has_code: Boolean(code),
        has_state: Boolean(state),
        has_expected_state: Boolean(expectedState),
        state_matches: Boolean(state && expectedState && state === expectedState),
        has_verifier: Boolean(verifier),
        has_expected_nonce: Boolean(expectedNonce),
      },
    });
    return authResultResponse(
      request,
      'error',
      missingPendingSession
        ? 'Google sign-in session was not active on this device. Start sign-in again from the DJ Assist app.'
        : 'Google sign-in could not be verified.',
      diagnosticId,
    );
  }

  const redirectUri = new URL('/api/auth/google/callback', request.url).toString();
  await appendAuthLog({
    id: diagnosticId,
    level: 'info',
    event: 'google_oauth_token_exchange_start',
    message: 'Exchanging Google OAuth authorization code for tokens.',
    context: {
      redirect_uri: redirectUri,
      has_client_secret: Boolean(clientSecret),
      client_secret_length: clientSecret.length || 0,
      effective_secret_from: resolvedSecretFrom,
    },
  });
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
    cache: 'no-store',
  });

  if (!tokenResponse.ok) {
    await clearPendingGoogleAuthSession();
    const failure = await parseTokenFailure(tokenResponse);
    await appendAuthLog({
      id: diagnosticId,
      level: 'error',
      event: 'google_oauth_token_exchange_failed',
      message: 'Google OAuth token exchange failed.',
      context: {
        status: tokenResponse.status,
        status_text: tokenResponse.statusText,
        failure: failure.userMessage,
        token_error: failure.errorCode,
        token_error_description: failure.errorDescription,
        client_secret_required_hint: failure.clientSecretLikelyRequired,
        has_client_secret: Boolean(clientSecret),
        redirect_uri: redirectUri,
        flow: 'nextjs_callback',
        redirect_uri_kind: redirectUri.includes('/api/auth/google/callback') ? 'nextjs_callback' : 'other',
      },
    });
    return authResultResponse(request, 'error', failure.userMessage, diagnosticId);
  }

  const tokens = await tokenResponse.json() as Record<string, unknown>;
  const idToken = String(tokens.id_token ?? '').trim();
  if (!idToken) {
    await clearPendingGoogleAuthSession();
    await appendAuthLog({
      id: diagnosticId,
      level: 'error',
      event: 'google_oauth_missing_id_token',
      message: 'Google OAuth token response did not include an ID token.',
      context: { token_keys: Object.keys(tokens).sort() },
    });
    return authResultResponse(request, 'error', 'Google sign-in returned no user identity.', diagnosticId);
  }

  try {
    const identity = await verifyGoogleIdToken({
      token: idToken,
      clientId,
      nonce: expectedNonce,
    });

    await saveGoogleAuth({
      id: identity.sub,
      email: stringOrUndefined(identity.email),
      emailVerified: identity.emailVerified,
      name: stringOrUndefined(identity.name),
      picture: stringOrUndefined(identity.picture),
      idToken,
    });
    await clearPendingGoogleAuthSession();
    await appendAuthLog({
      id: diagnosticId,
      level: 'info',
      event: 'google_oauth_success',
      message: 'Google OAuth sign-in completed.',
      context: {
        email: identity.email,
        email_verified: identity.emailVerified,
      },
    });
  } catch (error) {
    await clearPendingGoogleAuthSession();
    const message = error instanceof Error ? error.message : 'Google sign-in could not be verified.';
    await appendAuthLog({
      id: diagnosticId,
      level: 'error',
      event: 'google_oauth_identity_verification_failed',
      message: 'Google ID token verification failed.',
      context: { failure: message },
    });
    return authResultResponse(
      request,
      'error',
      message,
      diagnosticId,
    );
  }

  return authResultResponse(request, 'success', 'Google sign-in connected. You can return to DJ Assist.', diagnosticId);
}

async function parseTokenFailure(response: Response): Promise<{
  userMessage: string;
  errorCode: string | null;
  errorDescription: string | null;
  clientSecretLikelyRequired: boolean;
}> {
  const raw = await response.text();
  let errorCode: string | null = null;
  let errorDescription: string | null = null;
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    errorCode = String(payload.error ?? '').trim() || null;
    errorDescription = String(payload.error_description ?? '').trim() || null;
    const message = errorDescription || errorCode || '';
    if (message) {
      return {
        userMessage: message,
        errorCode,
        errorDescription,
        clientSecretLikelyRequired: isClientSecretMissingError(errorCode, errorDescription),
      };
    }
  } catch {
    // ignore JSON parsing failures
  }
  return {
    userMessage: raw.trim() || 'Google sign-in failed.',
    errorCode,
    errorDescription,
    clientSecretLikelyRequired: isClientSecretMissingError(errorCode, errorDescription),
  };
}

function googleErrorMessage(code: string): string {
  switch (code) {
    case 'access_denied':
      return 'Google sign-in was cancelled.';
    default:
      return 'Google sign-in failed.';
  }
}

function authResultResponse(request: NextRequest, kind: 'success' | 'error', message: string, diagnosticId?: string) {
  const appUrl = new URL('/', request.url).toString();
  const response = new NextResponse(
    renderAuthResultHtml({
      appUrl,
      kind,
      message,
      diagnosticId,
    }),
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      },
    },
  );
  return response;
}

function isClientSecretMissingError(errorCode: string | null, errorDescription: string | null): boolean {
  const code = String(errorCode ?? '').toLowerCase();
  const description = String(errorDescription ?? '').toLowerCase();
  return code === 'invalid_request' && description.includes('client_secret') && description.includes('missing');
}

function renderAuthResultHtml(input: { appUrl: string; kind: 'success' | 'error'; message: string; diagnosticId?: string }) {
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
