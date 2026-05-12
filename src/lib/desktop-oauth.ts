import { randomBytes, createHash } from 'node:crypto';

export function createLoopbackRedirectUri(port: number): string {
  return `http://127.0.0.1:${port}/`;
}

export function createDesktopAuthState() {
  return {
    state: randomBytes(24).toString('hex'),
    verifier: randomBytes(48).toString('base64url'),
    nonce: randomBytes(24).toString('base64url'),
  };
}

export function createPkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

