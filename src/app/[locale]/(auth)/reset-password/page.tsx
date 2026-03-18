import { generatePageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { ResetPasswordPage } from "@/features/auth";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generatePageMetadata("resetPassword", locale, {
    path: "/reset-password",
    noindex: true,
  });
}

export default function ResetPassword() {
  return <ResetPasswordPage />;
}
