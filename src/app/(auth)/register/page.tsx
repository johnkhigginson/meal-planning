import type { Metadata } from "next";
import { connection } from "next/server";
import { enabledOAuthProviders } from "@/lib/oauth-config";
import RegisterForm from "./RegisterForm";

export const metadata: Metadata = {
  title: "Create your account",
};

export default async function RegisterPage() {
  // Read the Google/Apple keys at request time, not at build time.
  await connection();
  return <RegisterForm oauthProviders={enabledOAuthProviders()} />;
}
