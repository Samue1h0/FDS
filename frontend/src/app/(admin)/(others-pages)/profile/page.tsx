import AnalystProfile from "@/components/user-profile/AnalystProfile";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Profile | Fraud Analysis System",
  description: "Your analyst account, review activity, and security settings",
};

export default function Profile() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-800 dark:text-white/90">Profile</h1>
      <AnalystProfile />
    </div>
  );
}
