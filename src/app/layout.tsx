import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

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

  return (
    <html
      lang={locale}
      className={serverTheme === "dark" ? "dark" : ""}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;var t=localStorage.getItem('probook_theme');if(t==='dark')d.classList.add('dark');else if(t==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches)d.classList.add('dark')}catch(e){}})()`,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" sizes="180x180" href="/probook-icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
