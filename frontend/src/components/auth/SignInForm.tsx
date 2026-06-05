"use client";

import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { useAuth } from "@/context/AuthContext";
import GoogleSignInButton from "./GoogleSignInButton";
import React, { useState } from "react";

export default function SignInForm() {
  const { login, loginWithGoogle } = useAuth();
  const [username,  setUsername] = useState("");
  const [password,  setPassword] = useState("");
  const [showPass,  setShowPass] = useState(false);
  const [error,     setError]    = useState<string | null>(null);
  const [loading,   setLoading]  = useState(false);

  // Hard navigation (not router.replace): forces a fresh top-level request that
  // carries the new auth cookie and bypasses any cached RSC redirect the
  // proxy/middleware produced while we were unauthenticated on /signin.
  const goHome = () => window.location.assign("/");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) { setError("Username and password are required."); return; }
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
      goHome();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async (credential: string) => {
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle(credential);
      goHome();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Sign In
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter your analyst credentials to continue.
            </p>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <Label>
                  Username <span className="text-error-500">*</span>
                </Label>
                <Input
                  type="text"
                  placeholder="e.g. analyst1"
                  error={!!error}
                  onChange={(e) => { setError(null); setUsername(e.target.value); }}
                />
              </div>
              <div>
                <Label>
                  Password <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showPass ? "text" : "password"}
                    placeholder="Enter your password"
                    error={!!error}
                    onChange={(e) => { setError(null); setPassword(e.target.value); }}
                  />
                  <span
                    onClick={() => setShowPass(!showPass)}
                    className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                  >
                    {showPass ? (
                      <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                    ) : (
                      <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                    )}
                  </span>
                </div>
              </div>

              {error && (
                <p className="text-sm text-error-500">{error}</p>
              )}

              <div>
                <Button className="w-full" size="sm" disabled={loading}>
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </div>
            </div>
          </form>

          {/* Divider + Google SSO. The button renders only when a Client ID is
              configured (NEXT_PUBLIC_GOOGLE_CLIENT_ID). */}
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
            <span className="text-xs text-gray-400">or</span>
            <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          </div>
          <GoogleSignInButton onCredential={handleGoogle} onError={setError} />
        </div>
      </div>
    </div>
  );
}
