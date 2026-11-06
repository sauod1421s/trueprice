import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./globals.css";
import SiteFooter from "./components/SiteFooter";
import SiteHeader from "./components/SiteHeader";
import { SITE_URL } from "./lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#101c35",
  colorScheme: "light",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: "TruePrice | المرجع الذكي للأسعار",
    template: "%s | TruePrice",
  },

  description:
    "TruePrice منصة مستقلة لمقارنة الأسعار ومعرفة السعر العادل قبل الشراء في السعودية.",

  keywords: [
    "TruePrice",
    "ترو برايس",
    "السعر العادل",
    "مقارنة الأسعار",
    "أسعار السعودية",
    "مرجع الأسعار",
  ],

  openGraph: {
    title: "TruePrice | المرجع الذكي للأسعار",
    description:
      "منصة مستقلة لمقارنة الأسعار ومعرفة السعر العادل قبل الشراء في السعودية.",
    siteName: "TruePrice",
    locale: "ar_SA",
    type: "website",
  },

  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>

        <SiteFooter />
      </body>
    </html>
  );
}