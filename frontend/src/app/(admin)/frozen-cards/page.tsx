import FrozenCardsClient from "@/components/frozen-cards/FrozenCardsClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Frozen Cards | Fraud Analysis System",
  description:
    "Cards automatically frozen after a fraudulent transaction, with full history and the freeze point",
};

export default function FrozenCardsPage() {
  return <FrozenCardsClient />;
}
