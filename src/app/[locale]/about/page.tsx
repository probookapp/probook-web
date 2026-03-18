import { generatePageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { AboutPage } from "@/components/public/AboutPage";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generatePageMetadata("about", locale, { path: "/about" });
}

export default function Page() {
  return <AboutPage />;
}
