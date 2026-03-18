import { generatePageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { PricingPage } from "@/components/public/PricingPage";
import { SoftwareApplicationJsonLd } from "@/lib/structured-data";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generatePageMetadata("pricing", locale, { path: "/pricing" });
}

export default function Page() {
  return (
    <>
      <SoftwareApplicationJsonLd />
      <PricingPage />
    </>
  );
}
