import TriggersClient from "@/components/triggers/TriggersClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Detection Triggers | Fraud Analysis System",
  description: "How the rule engine and ML model decide whether a transaction is fraud",
};

export default function DetectionTriggersPage() {
  return <TriggersClient />;
}
