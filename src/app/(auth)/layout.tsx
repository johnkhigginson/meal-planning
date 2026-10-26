import { LemonLogo } from "@/components/shared/LemonLogo";
import { FooterLinks } from "@/components/shared/FooterLinks";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-5 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-full focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring"
        >
          <LemonLogo className="h-8 w-8" />
          <span className="font-heading text-xl font-semibold tracking-tight">My Lemon Kitchen</span>
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center px-4 pt-6 pb-20 sm:pt-12">
        {children}
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl justify-center px-4 py-8 text-sm text-muted-foreground sm:px-6">
          <FooterLinks className="justify-center" />
        </div>
      </footer>
    </div>
  );
}
