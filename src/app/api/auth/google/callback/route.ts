import { NextRequest, NextResponse } from 'next/server';
import {
  clearPendingGoogleAuthSession,
  loadPendingGoogleAuthSession,
  saveGoogleAuth,
} from '@/lib/runtime-settings';
import {
  googleClientId,
  googleClientSecret,
  stringOrUndefined,
  verifyGoogleIdToken,
} from '@/lib/google-auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code') ?? '';
  const state = searchParams.get('state') ?? '';
  const oauthError = searchParams.get('error') ?? '';
  const pendingAuth = await loadPendingGoogleAuthSession();
  const expectedState = pendingAuth?.state ?? '';
  const verifier = pendingAuth?.verifier ?? '';
  const expectedNonce = pendingAuth?.nonce ?? '';

  if (!clientId) {
    return authResultResponse(request, 'error', 'Google sign-in is not configured.');
  }

  if (oauthError) {
    await clearPendingGoogleAuthSession();
    return authResultResponse(request, 'error', googleErrorMessage(oauthError));
  }

  if (!code || !state || !expectedState || state !== expectedState || !verifier || !expectedNonce) {
    await clearPendingGoogleAuthSession();
    return authResultResponse(request, 'error', 'Google sign-in could not be verified.');
  }

  const redirectUri = new URL('/api/auth/google/callback', request.url).toString();
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
    return authResultResponse(request, 'error', await tokenFailureMessage(tokenResponse));
  }

  const tokens = await tokenResponse.json() as Record<string, unknown>;
  const idToken = String(tokens.id_token ?? '').trim();
  if (!idToken) {
    await clearPendingGoogleAuthSession();
    return authResultResponse(request, 'error', 'Google sign-in returned no user identity.');
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
  } catch (error) {
    await clearPendingGoogleAuthSession();
    return authResultResponse(
      request,
      'error',
      error instanceof Error ? error.message : 'Google sign-in could not be verified.',
    );
  }

  return authResultResponse(request, 'success', 'Google sign-in connected. You can return to DJ Assist.');
}

async function tokenFailureMessage(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const message = String(payload.error_description ?? payload.error ?? '').trim();
    if (message) return message;
  } catch {
    // ignore JSON parsing failures
  }
  return raw.trim() || 'Google sign-in failed.';
}

function googleErrorMessage(code: string): string {
  switch (code) {
    case 'access_denied':
      return 'Google sign-in was cancelled.';
    default:
      return 'Google sign-in failed.';
  }
}

function authResultResponse(request: NextRequest, kind: 'success' | 'error', message: string) {
  const appUrl = new URL('/', request.url).toString();
  const response = new NextResponse(
    renderAuthResultHtml({
      appUrl,
      kind,
      message,
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

function renderAuthResultHtml(input: { appUrl: string; kind: 'success' | 'error'; message: string }) {
  const title = input.kind === 'success' ? 'Google Sign-In Complete' : 'Google Sign-In Failed';
  const accent = input.kind === 'success' ? '#1f7a45' : '#b33a3a';
  const safeMessage = escapeHtml(input.message);
  const safeUrl = escapeHtml(input.appUrl);

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
