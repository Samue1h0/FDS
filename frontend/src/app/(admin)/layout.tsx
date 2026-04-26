"use client";

import AppHeader from "@/layout/AppHeader";
import React from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-(--breakpoint-2xl) p-4 md:p-6">{children}</div>
    </div>
  );
}
