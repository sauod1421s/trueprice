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

  alternates: {
    canonical: "/",
  },

  openGraph: {
    title: "TruePrice | المرجع الذكي للأسعار",
    description:
      "منصة مستقلة لمقارنة الأسعار ومعرفة السعر العادل قبل الشراء في السعودية.",
    url: "https://trueprice-theta.vercel.app/",
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
        {children}

        <footer className="mt-auto border-t border-gray-700 bg-gray-950 px-6 py-8 text-center text-sm text-gray-400">
          <div className="mx-auto max-w-4xl space-y-3">
            <p className="font-semibold text-gray-300">
              تنبيه وإخلاء مسؤولية
            </p>

            <p>
              TruePrice منصة مستقلة لعرض ومقارنة الأسعار بهدف مساعدة المستخدم
              على معرفة النطاق السعري للمنتجات قبل الشراء.
            </p>

            <p>
              الأسعار والمعلومات المعروضة في المنصة لأغراض مرجعية ومعلوماتية
              فقط، وقد تتغير الأسعار أو التوفر لدى المتاجر في أي وقت.
            </p>

            <p>
              قد تعتمد بعض البيانات المعروضة على معلومات وأسعار منشورة أو
              متاحة من مصادر المتاجر، ولا تضمن TruePrice استمرار دقة الأسعار
              أو توفر المنتجات بشكل لحظي.
            </p>

            <p>
              لا تمثل TruePrice أيًا من المتاجر أو العلامات التجارية المذكورة،
              ولا يعني ظهور أي متجر أو منتج في المنصة وجود شراكة أو اعتماد أو
              علاقة تجارية معه، ما لم يُذكر ذلك صراحة.
            </p>

            <p>
              لا تتم عملية البيع أو الدفع من خلال TruePrice، ويُنصح المستخدم
              بالتحقق من السعر والتوفر والشروط النهائية مباشرةً من المتجر قبل
              إتمام عملية الشراء.
            </p>

            <p className="pt-3 text-xs text-gray-500">
              TruePrice — نموذج أولي قيد التطوير
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}