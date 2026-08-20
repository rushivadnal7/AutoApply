"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type AuthResponse } from "./api-client";
import { setAccessToken } from "./token-store";
import { connectSocket, disconnectSocket } from "./socket-client";

type AuthUser = AuthResponse["user"];

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Access tokens live in memory only (see token-store.ts) and are lost on
    // reload — silently try the httpOnly refresh cookie to restore a
    // session. Goes through the shared, de-duped api.refreshSession() (not
    // a raw POST) so React StrictMode's dev-mode double-invoke of this
    // effect can't fire two concurrent refresh calls and trip the API's
    // rotation-reuse theft detection. A failed refresh just means "no
    // prior session," not an error.
    (async () => {
      const result = await api.refreshSession();
      if (result) {
        setUser(result.user);
        connectSocket();
      } else {
        setUser(null);
      }
      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<AuthResponse>("/auth/login", { email, password });
    setAccessToken(res.accessToken);
    setUser(res.user);
    connectSocket();
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await api.post<AuthResponse>("/auth/register", { email, password });
    setAccessToken(res.accessToken);
    setUser(res.user);
    connectSocket();
  }, []);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    disconnectSocket();
  }, []);

  return <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
