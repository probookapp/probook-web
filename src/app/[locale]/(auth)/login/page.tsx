import { generatePageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { LoginPage } from "@/features/auth";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generatePageMetadata("login", locale, { path: "/login" });
}

export default function Login() {
  return <LoginPage />;
}
