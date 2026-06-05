"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export interface AuthUser {
  user_id:  number;
  username: string;
  role:     string;
}

interface AuthContextType {
  user:            AuthUser | null;
  loading:         boolean;
  piiConsented:    boolean;
  login:           (username: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout:          () => void;
  grantPiiConsent: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("auth_token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp < Date.now() / 1000) {
      localStorage.removeItem("auth_token");
      document.cookie = "auth_token=; max-age=0; path=/";
      return null;
    }
    return { user_id: payload.user_id, username: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,         setUser]         = useState<AuthUser | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [piiConsented, setPiiConsented] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
    setLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(err.detail ?? "Login failed");
    }
    const data = await res.json();
    persistSession(data);
  };

  // Sign in with Google: send the Google credential to the backend, which
  // verifies it and returns the same app session as a password login.
  const loginWithGoogle = async (credential: string) => {
    const res = await fetch(`${API_URL}/api/auth/google`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ credential }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Google sign-in failed" }));
      throw new Error(err.detail ?? "Google sign-in failed");
    }
    const data = await res.json();
    persistSession(data);
  };

  const persistSession = (data: { token: string; user: AuthUser }) => {
    localStorage.setItem("auth_token", data.token);
    document.cookie = `auth_token=${data.token}; path=/; max-age=${8 * 60 * 60}; SameSite=Lax`;
    setUser(data.user);
    setPiiConsented(false);
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    document.cookie = "auth_token=; max-age=0; path=/";
    setUser(null);
    setPiiConsented(false);
  };

  const grantPiiConsent = () => setPiiConsented(true);

  return (
    <AuthContext.Provider value={{ user, loading, piiConsented, login, loginWithGoogle, logout, grantPiiConsent }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
