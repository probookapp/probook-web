import { generatePageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { FaqPage } from "@/components/public/FaqPage";
import { FAQPageJsonLd } from "@/lib/structured-data";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generatePageMetadata("faq", locale, { path: "/faq" });
}

const faqItems = [
  { question: "What is Probook?", answer: "Probook is a business management platform that helps you create professional invoices, quotes, and delivery notes, track payments, manage clients and products, and run a point-of-sale system — all in one place." },
  { question: "How do I get started?", answer: "Simply sign up for an account, set up your company information, and start creating your first invoice or quote. The onboarding process guides you through each step." },
  { question: "Is there a free trial?", answer: "Some plans include a free trial period. Check our pricing page for current offers and trial availability." },
  { question: "Can I cancel my subscription anytime?", answer: "Yes, you can cancel your subscription at any time. Your data remains accessible until the end of your current billing period." },
  { question: "Does Probook work offline?", answer: "Yes! Probook is designed to work offline. You can create invoices, manage clients, and use the POS system without an internet connection. All changes sync automatically when you're back online." },
  { question: "What languages are supported?", answer: "Probook is available in English, French, and Arabic, with full right-to-left support for Arabic." },
  { question: "Can I export my data?", answer: "Yes, you can export your invoices, client lists, and reports in various formats. We believe your data belongs to you." },
  { question: "How can I get support?", answer: "You can reach our support team via the contact page or by emailing support@probookapp.net. We typically respond within 24 hours." },
];

export default function Page() {
  return (
    <>
      <FAQPageJsonLd items={faqItems} />
      <FaqPage />
    </>
  );
}
