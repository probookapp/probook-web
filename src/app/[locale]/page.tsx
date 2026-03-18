import { generatePageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { OrganizationJsonLd, SoftwareApplicationJsonLd } from "@/lib/structured-data";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generatePageMetadata("home", locale);
}

export default function Home() {
  return (
    <>
      <OrganizationJsonLd />
      <SoftwareApplicationJsonLd />
      <LandingPage />
    </>
  );
}
