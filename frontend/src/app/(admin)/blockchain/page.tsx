import BlockchainClient from "@/components/blockchain/BlockchainClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blockchain | Fraud Analysis System",
  description: "Live Hyperledger Fabric network health, the immutable hash chain, and tamper-proof evidence",
};

export default function BlockchainPage() {
  return <BlockchainClient />;
}
