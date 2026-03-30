import type { Metadata, Viewport } from "next";
import { Nunito, Nunito_Sans } from "next/font/google";
import { Providers } from "@/components/shared/Providers";
import { AppShell } from "@/components/shared/AppShell";
import { ServiceWorkerRegistrar } from "@/components/shared/ServiceWorkerRegistrar";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "My Lemon Kitchen",
  description: "Plan meals, track your pantry, and generate smart grocery lists",
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
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${nunitoSans.variable} h-full antialiased`}
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className="flex h-full min-h-screen flex-col lg:flex-row">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
