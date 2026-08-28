import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://trueprice-theta.vercel.app"),

  title: {
    default: "TruePrice | اعرف السعر الحقيقي قبل أن تشتري",
    template: "%s | TruePrice",
  },

  description:
    "TruePrice منصة ذكية لمقارنة أسعار المنتجات ومعرفة متوسط السعر وأقل سعر وأعلى سعر والسعر العادل قبل الشراء.",

  keywords: [
    "TruePrice",
    "ترو برايس",
    "أسعار المنتجات",
    "مقارنة الأسعار",
    "السعر الحقيقي",
    "السعر العادل",
    "أسعار الجوالات",
    "أسعار الآيفون",
    "مقارنة أسعار المنتجات في السعودية",
  ],

  authors: [{ name: "TruePrice" }],

  creator: "TruePrice",
  publisher: "TruePrice",

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  openGraph: {
    type: "website",
    locale: "ar_SA",
    url: "https://trueprice-theta.vercel.app",
    siteName: "TruePrice",
    title: "TruePrice | اعرف السعر الحقيقي قبل أن تشتري",
    description:
      "اعرف السعر الحقيقي للمنتج قبل أن تشتري. قارن الأسعار واكتشف المتوسط والأقل والأعلى والسعر العادل.",
  },

  twitter: {
    card: "summary_large_image",
    title: "TruePrice | اعرف السعر الحقيقي قبل أن تشتري",
    description:
      "منصة TruePrice لمقارنة الأسعار ومعرفة السعر العادل قبل الشراء.",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}