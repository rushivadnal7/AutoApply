/**
 * The access token lives in memory only — never localStorage — so an XSS
 * payload can't read it out of persistent storage. It's lost on page
 * reload by design; AuthProvider silently calls /auth/refresh on mount
 * (using the httpOnly refresh cookie) to get a fresh one.
 */
let currentAccessToken: string | null = null;

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function setAccessToken(token: string | null): void {
  currentAccessToken = token;
}
