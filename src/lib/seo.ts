import type { Metadata } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://probookapp.net";
const SITE_NAME = "Probook";

// ─── Centralized SEO metadata for all pages ─────────────────────────────────
// Update titles, descriptions, and translations here. All page files reference this.

export const seo = {
  siteName: SITE_NAME,
  siteUrl: SITE_URL,

  // Default (fallback) metadata
  default: {
    title: "Probook",
    description: "Professional invoicing and business management software for modern businesses.",
  },

  // Public pages
  home: {
    en: { title: "Probook — Invoicing & Business Management", description: "Simplify your invoicing, quotes, delivery notes, and expense tracking. Built for modern businesses." },
    fr: { title: "Probook — Facturation & Gestion d'Entreprise", description: "Simplifiez votre facturation, devis, bons de livraison et suivi des depenses. Concu pour les entreprises modernes." },
    ar: { title: "Probook — الفوترة وإدارة الأعمال", description: "بسّط فواتيرك وعروض الأسعار وسندات التسليم وتتبع المصاريف. مصمم للشركات الحديثة." },
  },
  pricing: {
    en: { title: "Pricing", description: "Affordable plans for shops and enterprises. Start managing your business with Probook today." },
    fr: { title: "Tarifs", description: "Des forfaits abordables pour les commerces et les entreprises. Commencez a gerer votre activite avec Probook." },
    ar: { title: "الأسعار", description: "خطط ميسورة التكلفة للمتاجر والشركات. ابدأ إدارة أعمالك مع Probook اليوم." },
  },
  about: {
    en: { title: "About", description: "Learn about Probook's mission to empower businesses with simple, reliable management tools." },
    fr: { title: "A propos", description: "Decouvrez la mission de Probook : offrir aux entreprises des outils de gestion simples et fiables." },
    ar: { title: "من نحن", description: "تعرف على مهمة Probook في تمكين الشركات بأدوات إدارة بسيطة وموثوقة." },
  },
  contact: {
    en: { title: "Contact", description: "Get in touch with the Probook team. We're here to help with questions, support, and partnerships." },
    fr: { title: "Contact", description: "Contactez l'equipe Probook. Nous sommes la pour repondre a vos questions et vous accompagner." },
    ar: { title: "اتصل بنا", description: "تواصل مع فريق Probook. نحن هنا للمساعدة في الأسئلة والدعم والشراكات." },
  },
  faq: {
    en: { title: "FAQ", description: "Frequently asked questions about Probook. Find answers about features, pricing, and getting started." },
    fr: { title: "FAQ", description: "Questions frequemment posees sur Probook. Trouvez des reponses sur les fonctionnalites, les tarifs et la prise en main." },
    ar: { title: "الأسئلة الشائعة", description: "الأسئلة المتكررة حول Probook. اعثر على إجابات حول الميزات والأسعار وكيفية البدء." },
  },
  privacy: {
    en: { title: "Privacy Policy", description: "How Probook collects, uses, and protects your data. Read our full privacy policy." },
    fr: { title: "Politique de confidentialite", description: "Comment Probook collecte, utilise et protege vos donnees. Lisez notre politique de confidentialite." },
    ar: { title: "سياسة الخصوصية", description: "كيف يجمع Probook بياناتك ويستخدمها ويحميها. اقرأ سياسة الخصوصية الكاملة." },
  },
  terms: {
    en: { title: "Terms of Service", description: "Terms and conditions for using Probook. Please read before creating an account." },
    fr: { title: "Conditions d'utilisation", description: "Conditions generales d'utilisation de Probook. Veuillez lire avant de creer un compte." },
    ar: { title: "شروط الخدمة", description: "شروط وأحكام استخدام Probook. يرجى القراءة قبل إنشاء حساب." },
  },

  // Auth pages
  login: {
    en: { title: "Sign In", description: "Sign in to your Probook account." },
    fr: { title: "Connexion", description: "Connectez-vous a votre compte Probook." },
    ar: { title: "تسجيل الدخول", description: "سجّل الدخول إلى حسابك على Probook." },
  },
  signup: {
    en: { title: "Create Account", description: "Create your Probook account and start managing your business." },
    fr: { title: "Creer un compte", description: "Creez votre compte Probook et commencez a gerer votre activite." },
    ar: { title: "إنشاء حساب", description: "أنشئ حسابك على Probook وابدأ إدارة أعمالك." },
  },
  forgotPassword: {
    en: { title: "Forgot Password", description: "Reset your Probook password." },
    fr: { title: "Mot de passe oublie", description: "Reinitialiser votre mot de passe Probook." },
    ar: { title: "نسيت كلمة المرور", description: "إعادة تعيين كلمة مرور Probook." },
  },
  resetPassword: {
    en: { title: "Reset Password", description: "Set a new password for your Probook account." },
    fr: { title: "Reinitialiser le mot de passe", description: "Definissez un nouveau mot de passe pour votre compte Probook." },
    ar: { title: "إعادة تعيين كلمة المرور", description: "عيّن كلمة مرور جديدة لحسابك على Probook." },
  },
  verifyEmail: {
    en: { title: "Verify Email", description: "Verify your email address for your Probook account." },
    fr: { title: "Verifier l'email", description: "Verifiez votre adresse email pour votre compte Probook." },
    ar: { title: "تأكيد البريد الإلكتروني", description: "تأكيد عنوان بريدك الإلكتروني لحساب Probook." },
  },
} as const;

type Locale = "en" | "fr" | "ar";
type PageKey = keyof typeof seo;

/**
 * Generate Next.js Metadata for a page with locale support and Open Graph.
 */
export function generatePageMetadata(
  pageKey: Exclude<PageKey, "siteName" | "siteUrl" | "default">,
  locale: string,
  opts?: { noindex?: boolean; path?: string }
): Metadata {
  const loc = (["en", "fr", "ar"].includes(locale) ? locale : "en") as Locale;
  const page = seo[pageKey] as Record<Locale, { title: string; description: string }>;
  const { title, description } = page[loc];

  const pageUrl = opts?.path ? `${SITE_URL}/${loc}${opts.path}` : `${SITE_URL}/${loc}`;

  const metadata: Metadata = {
    title,
    description,
    alternates: {
      canonical: pageUrl,
      languages: {
        en: `${SITE_URL}/en${opts?.path || ""}`,
        fr: `${SITE_URL}/fr${opts?.path || ""}`,
        ar: `${SITE_URL}/ar${opts?.path || ""}`,
      },
    },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: pageUrl,
      siteName: SITE_NAME,
      locale: loc,
      type: "website",
      images: [
        {
          url: `${SITE_URL}/og-image.png`,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} — Professional invoicing and business management`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [`${SITE_URL}/og-image.png`],
    },
  };

  if (opts?.noindex) {
    metadata.robots = { index: false, follow: false };
  }

  return metadata;
}
