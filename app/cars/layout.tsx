import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "أسعار السيارات الجديدة في السعودية",
    template: "%s | TruePrice",
  },
  description:
    "مرجع أسعار السيارات الجديدة في السعودية حسب العلامة والموديل، مع مقارنة السوق. الأسعار مرجعية وغير موثقة بعد.",
  alternates: { canonical: "/cars" },
};

export default function CarsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
