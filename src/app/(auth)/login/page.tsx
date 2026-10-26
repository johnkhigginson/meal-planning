import type { Metadata } from "next";
import { connection } from "next/server";
import { enabledOAuthProviders } from "@/lib/oauth-config";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  // Read the Google/Apple keys at request time, not at build time.
  await connection();
  return <LoginForm oauthProviders={enabledOAuthProviders()} />;
}
