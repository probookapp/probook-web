import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import { SentryProvider } from "@/components/providers/SentryProvider";
import "./globals.css";

/**
 * The typefaces, served from our own origin.
 *
 * next/font downloads and self-hosts at build time, so no request ever leaves
 * for a font CDN — which the strict CSP would block anyway, silently falling
 * back to a system face. That is exactly what was happening before: the
 * stylesheet declared Inter and nothing ever loaded it.
 *
 * IBM Plex was drawn for engineering documentation: legible small, with real
 * character in the letterforms. The mono cut carries every figure in the app,
 * so money lines up in a column the way it does on a statement.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://probookapp.net";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Probook — Invoicing & Business Management",
    template: "%s | Probook",
  },
  description: "Professional invoicing and business management software for modern businesses.",
  applicationName: "Probook",
  authors: [{ name: "Probook" }],
  keywords: ["invoicing", "business management", "quotes", "delivery notes", "POS", "Algeria", "facturation"],
  openGraph: {
    type: "website",
    siteName: "Probook",
    locale: "en",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Probook — Smart invoicing & business management for modern businesses" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("NEXT_THEME")?.value;
  const serverTheme = themeCookie === "dark" ? "dark" : "light";
  const locale = cookieStore.get("NEXT_LOCALE")?.value || "en";
  // CSP nonce generated per-request in src/proxy.ts; required for the inline
  // theme-bootstrap script below under the strict production policy.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang={locale}
      className={`${plexSans.variable} ${plexMono.variable} ${serverTheme === "dark" ? "dark" : ""}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="facebook-domain-verification" content="4arj80yrn0r1yulikcr92ihluf0g90" />
        {/*
          suppressHydrationWarning is required, not cosmetic: React deliberately
          omits `nonce` from the props it sends to the client, so the browser
          hydrates this tag with nonce="" against the server's real value and
          reports a mismatch on every page load. The nonce still ships in the
          SSR HTML, which is all the CSP needs — the script never re-runs on the
          client. Without this, a genuine hydration bug would be lost in the noise.
        */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;var t=localStorage.getItem('probook_theme');if(t==='dark')d.classList.add('dark');else if(t==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches)d.classList.add('dark')}catch(e){}})()`,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#12333a" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" sizes="180x180" href="/probook-icon.png" />
      </head>
      <body>
        <SentryProvider />
        {children}
      </body>
    </html>
  );
}
