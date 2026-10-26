import Link from "next/link";
import { cn } from "@/lib/utils";

// The public pages every footer links to: the landing page, the blog, the
// auth pages and Settings.
const links = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
  { href: "/help", label: "Help" },
  { href: "/blog", label: "Recipe blogs" },
];

export function FooterLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Footer" className={cn("flex flex-wrap gap-x-6 gap-y-2", className)}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded transition-colors duration-200 ease-out hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
