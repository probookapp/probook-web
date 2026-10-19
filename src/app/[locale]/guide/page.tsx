import type { Metadata } from "next";
import { generatePageMetadata } from "@/lib/seo";
import { GuidePage } from "@/components/public/guide/GuidePage";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generatePageMetadata("guide", locale, { path: "/guide" });
}

export default function Page() {
  return <GuidePage />;
}
