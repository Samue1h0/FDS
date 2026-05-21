"use client";

import AppHeader from "@/layout/AppHeader";
import React, { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [user, loading, router]);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-(--breakpoint-2xl) p-4 md:p-6">
        <div className="flex justify-end items-center gap-3 mb-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Signed in as <span className="font-medium text-gray-700 dark:text-gray-300">{user.username}</span>
            <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({user.role})</span>
          </span>
          <button
            onClick={logout}
            className="text-sm text-error-500 hover:text-error-600 dark:text-error-400 font-medium transition-colors"
          >
            Sign out
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
