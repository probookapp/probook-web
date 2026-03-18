import { generatePageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { TermsPage } from "@/components/public/TermsPage";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generatePageMetadata("terms", locale, { path: "/terms" });
}

export default function Page() {
  return <TermsPage />;
}
