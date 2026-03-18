import { generatePageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { SignupPage } from "@/features/auth";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generatePageMetadata("signup", locale, { path: "/signup" });
}

export default function Signup() {
  return <SignupPage />;
}
