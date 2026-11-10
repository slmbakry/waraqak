import type { Metadata, Viewport } from "next";
import { SessionProvider } from "@/components/session";
import Shell from "@/components/Shell";
import "./globals.css";

// Link previews need absolute image URLs, so they point at the public domain.
const site = process.env.NEXT_PUBLIC_SITE_URL || "https://waraqak.com";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "ورقك",
  description: "قريبًا.",
  robots: { index: false, follow: false },
  manifest: "/site.webmanifest",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/favicon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  // Link previews stay bare until launch: the name and "soon", without the slogan image.
  openGraph: { title: "ورقك", description: "قريبًا", locale: "ar_EG", type: "website" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0f2a44" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Readex+Pro:wght@500;600;700&display=swap" />
      </head>
      <body>
        <SessionProvider>
          <Shell>{children}</Shell>
        </SessionProvider>
      </body>
    </html>
  );
}
