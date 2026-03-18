import { generatePageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { ContactPage } from "@/components/public/ContactPage";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generatePageMetadata("contact", locale, { path: "/contact" });
}

export default function Page() {
  return <ContactPage />;
}
