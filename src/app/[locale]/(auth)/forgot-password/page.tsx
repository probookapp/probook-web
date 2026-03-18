import { generatePageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { ForgotPasswordPage } from "@/features/auth";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generatePageMetadata("forgotPassword", locale, {
    path: "/forgot-password",
    noindex: true,
  });
}

export default function ForgotPassword() {
  return <ForgotPasswordPage />;
}
