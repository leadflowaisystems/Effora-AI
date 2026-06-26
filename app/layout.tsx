import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/toaster";
import { CookieBanner } from "@/components/marketing/cookie-banner";
import { PageTracker } from "@/components/analytics/page-tracker";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const BASE_URL = "https://www.effora.co.in";

export const metadata: Metadata = {
  title: "Effora AI — AI Inbox for Service Businesses",
  description: "Turn every Instagram DM into booked revenue. AI replies in your voice. Real-time inbox, bookings, payments, CRM — all automated.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Effora AI" },
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: BASE_URL },
  openGraph: {
    type:        "website",
    siteName:    "Effora AI",
    title:       "Effora AI — AI Inbox for Service Businesses",
    description: "Turn every Instagram DM into booked revenue. AI replies in your voice.",
    url:         BASE_URL,
    images:      [{ url: "/og-image.png", width: 1200, height: 630, alt: "Effora AI" }],
  },
  twitter: {
    card:        "summary_large_image",
    title:       "Effora AI — AI Inbox for Service Businesses",
    description: "Turn every Instagram DM into booked revenue.",
    images:      ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#36E6A0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${hankenGrotesk.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#36E6A0" />
      </head>
      <body>
        {children}
        <Toaster />
        <CookieBanner />
        <PageTracker />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}`,
          }}
        />
      </body>
    </html>
  );
}
