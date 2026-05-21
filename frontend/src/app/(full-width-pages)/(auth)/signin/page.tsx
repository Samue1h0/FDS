import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | FAID",
  description: "Fraud Analysis & Immutable Data System",
};

export default function SignIn() {
  return <SignInForm />;
}
