import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/shared/Providers";
import { AppShell } from "@/components/shared/AppShell";
import { ServiceWorkerRegistrar } from "@/components/shared/ServiceWorkerRegistrar";
import { Analytics } from "@/components/shared/Analytics";
import { getSiteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { TITLE_SUFFIX } from "@/lib/seo";
import "./globals.css";

// Body and UI: Figtree (variable, 300-900). Self-hosted; licence in ./fonts.
const figtree = localFont({
  src: "./fonts/Figtree-VF.ttf",
  variable: "--font-figtree",
  weight: "300 900",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

// App headings (font-heading) and the blog (font-display). Regular (400) is
// the only weight, so hierarchy comes from size, tracking and colour.
const geistSerif = localFont({
  src: "./fonts/GeistSerif-Regular.woff2",
  variable: "--font-geist-serif",
  weight: "400",
  style: "normal",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  // Page titles read "Recipe name | My Lemon Kitchen". See pageTitle in
  // src/lib/seo.ts for keeping long names under about 60 characters.
  title: { default: SITE_NAME, template: `%s${TITLE_SUFFIX}` },
  description: SITE_DESCRIPTION,
  // Share defaults. The image comes from app/opengraph-image.tsx.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Lemon Kitchen",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Matches --background and the manifest's theme_color.
  themeColor: "#fbf7ee",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${geistSerif.variable} h-full antialiased`}
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="flex h-full min-h-screen flex-col sm:flex-row">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <Analytics />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
