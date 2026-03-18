import { generatePageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { VerifyEmailPage } from "@/features/auth";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generatePageMetadata("verifyEmail", locale, {
    path: "/verify-email",
    noindex: true,
  });
}

export default function VerifyEmail() {
  return <VerifyEmailPage />;
}
