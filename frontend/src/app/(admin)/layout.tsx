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
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [user, loading, router]);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-(--breakpoint-2xl) p-4 md:p-6">
        {children}
      </div>
    </div>
  );
}
