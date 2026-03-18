import { generatePageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { PrivacyPage } from "@/components/public/PrivacyPage";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generatePageMetadata("privacy", locale, { path: "/privacy" });
}

export default function Page() {
  return <PrivacyPage />;
}
