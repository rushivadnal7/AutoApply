import { getAccessToken, setAccessToken } from "./token-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string };
}

// Module-scoped (not per-caller) so every caller in the same tick shares one
// in-flight request. This matters because refresh tokens ROTATE on use: two
// near-simultaneous callers each presenting the same (still-valid) cookie
// would otherwise race — the second to reach the server would find the
// first's call had already rotated/revoked that token and trip theft
// detection, logging the user out. The concrete trigger we hit in testing
// was React StrictMode's dev-mode double-invoke of the mount effect firing
// two `/auth/refresh` calls back to back; the same race is also latent
// with multiple tabs or a retried request, so the fix belongs here, not in
// the caller.
let refreshInFlight: Promise<AuthResponse | null> | null = null;

async function tryRefresh(): Promise<AuthResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "X-Requested-With": "fetch" },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as AuthResponse;
        setAccessToken(data.accessToken);
        return data;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  isForm?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}, allowRetry = true): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // The API requires this on /auth/refresh and /auth/logout specifically —
  // its two cookie-authenticated (not Bearer-authenticated) endpoints — as
  // defense-in-depth against CSRF (see apps/api/src/routes/auth.routes.ts,
  // assertSameOriginFetch). Setting it on every request is simplest and is
  // a no-op everywhere else.
  headers.set("X-Requested-With", "fetch");

  let body: BodyInit | undefined;
  if (options.isForm) {
    body = options.body as FormData;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    body,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && allowRetry && path !== "/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options, false);
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(res.status, payload?.error?.message ?? res.statusText, payload?.error?.code, payload?.error?.details);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function requestBlob(path: string, allowRetry = true): Promise<Blob> {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // Deliberately no `credentials: "include"` here, unlike request() above.
  // This endpoint is Bearer-authenticated, not cookie-authenticated, so our
  // own API never needs the cookie for it — and it matters concretely: this
  // request 302-redirects to a signed Supabase Storage URL, and fetch
  // carries the same credentials mode through a redirect. Supabase's signed
  // URL responds with `Access-Control-Allow-Origin: *` (correct on their
  // end — anyone holding the valid signed token should be able to fetch
  // it), and browsers hard-block combining a wildcard ACAO with a
  // credentialed request. Sending credentials here broke every resume
  // download in production with a CORS error, even though the request to
  // our own API was never the problem.
  const res = await fetch(`${API_URL}${path}`, { headers });

  if (res.status === 401 && allowRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) return requestBlob(path, false);
  }
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.blob();
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form, isForm: true }),
  // Used on app mount to silently restore a session from the httpOnly
  // refresh cookie. Goes through the same de-duped tryRefresh() as the
  // automatic 401-retry path — see the comment on refreshInFlight above.
  refreshSession: tryRefresh,
  // Downloads need the Bearer header attached, which a plain <a href> can't
  // do — fetch as a blob and trigger a client-side save instead.
  downloadFile: async (path: string, suggestedFileName: string) => {
    const blob = await requestBlob(path);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = suggestedFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
