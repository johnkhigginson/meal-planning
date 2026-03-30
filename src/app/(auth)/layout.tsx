import { LemonLogo } from "@/components/shared/LemonLogo";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-4">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <LemonLogo className="h-10 w-10" />
        <span className="text-xl font-bold tracking-tight">My Lemon Kitchen</span>
      </Link>
      {children}
    </div>
  );
}
