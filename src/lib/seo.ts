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
    fr: { title: "Probook — Facturation & Gestion d'Entreprise", description: "Simplifiez votre facturation, devis, bons de livraison et suivi des dépenses. Conçu pour les entreprises modernes." },
    ar: { title: "Probook — الفوترة وإدارة الأعمال", description: "بسّط فواتيرك وعروض الأسعار وسندات التسليم وتتبع المصاريف. مصمم للشركات الحديثة." },
  },
  pricing: {
    en: { title: "Pricing", description: "Affordable plans for shops and enterprises. Start managing your business with Probook today." },
    fr: { title: "Tarifs", description: "Des forfaits abordables pour les commerces et les entreprises. Commencez à gérer votre activité avec Probook." },
    ar: { title: "الأسعار", description: "خطط ميسورة التكلفة للمتاجر والشركات. ابدأ إدارة أعمالك مع Probook اليوم." },
  },
  about: {
    en: { title: "About", description: "Learn about Probook's mission to empower businesses with simple, reliable management tools." },
    fr: { title: "À propos", description: "Découvrez la mission de Probook : offrir aux entreprises des outils de gestion simples et fiables." },
    ar: { title: "من نحن", description: "تعرف على مهمة Probook في تمكين الشركات بأدوات إدارة بسيطة وموثوقة." },
  },
  contact: {
    en: { title: "Contact", description: "Get in touch with the Probook team. We're here to help with questions, support, and partnerships." },
    fr: { title: "Contact", description: "Contactez l'équipe Probook. Nous sommes là pour répondre à vos questions et vous accompagner." },
    ar: { title: "اتصل بنا", description: "تواصل مع فريق Probook. نحن هنا للمساعدة في الأسئلة والدعم والشراكات." },
  },
  faq: {
    en: { title: "FAQ", description: "Frequently asked questions about Probook. Find answers about features, pricing, and getting started." },
    fr: { title: "FAQ", description: "Questions fréquemment posées sur Probook. Trouvez des réponses sur les fonctionnalités, les tarifs et la prise en main." },
    ar: { title: "الأسئلة الشائعة", description: "الأسئلة المتكررة حول Probook. اعثر على إجابات حول الميزات والأسعار وكيفية البدء." },
  },
  guide: {
    en: { title: "User guide", description: "Learn Probook on video, chapter by chapter: quotes, invoices, point of sale, stock, purchases and reports, filmed in the real application." },
    fr: { title: "Guide d'utilisation", description: "Apprenez Probook en vidéo, chapitre par chapitre : devis, factures, caisse, stock, achats et rapports, filmés dans la vraie application." },
    ar: { title: "دليل الاستخدام", description: "تعلّم Probook بالفيديو، فصلاً بفصل: عروض الأسعار، الفواتير، الصندوق، المخزون، المشتريات والتقارير، مُصوَّرة داخل التطبيق الحقيقي." },
  },
  privacy: {
    en: { title: "Privacy Policy", description: "How Probook collects, uses, and protects your data. Read our full privacy policy." },
    fr: { title: "Politique de confidentialité", description: "Comment Probook collecte, utilise et protège vos données. Lisez notre politique de confidentialite." },
    ar: { title: "سياسة الخصوصية", description: "كيف يجمع Probook بياناتك ويستخدمها ويحميها. اقرأ سياسة الخصوصية الكاملة." },
  },
  terms: {
    en: { title: "Terms of Service", description: "Terms and conditions for using Probook. Please read before creating an account." },
    fr: { title: "Conditions d'utilisation", description: "Conditions générales d'utilisation de Probook. Veuillez les lire avant de créer un compte." },
    ar: { title: "شروط الخدمة", description: "شروط وأحكام استخدام Probook. يرجى القراءة قبل إنشاء حساب." },
  },

  // Auth pages
  login: {
    en: { title: "Sign In", description: "Sign in to your Probook account." },
    fr: { title: "Connexion", description: "Connectez-vous à votre compte Probook." },
    ar: { title: "تسجيل الدخول", description: "سجّل الدخول إلى حسابك على Probook." },
  },
  signup: {
    en: { title: "Create Account", description: "Create your Probook account and start managing your business." },
    fr: { title: "Créer un compte", description: "Créez votre compte Probook et commencez à gérer votre activité." },
    ar: { title: "إنشاء حساب", description: "أنشئ حسابك على Probook وابدأ إدارة أعمالك." },
  },
  forgotPassword: {
    en: { title: "Forgot Password", description: "Reset your Probook password." },
    fr: { title: "Mot de passe oublié", description: "Réinitialisez votre mot de passe Probook." },
    ar: { title: "نسيت كلمة المرور", description: "إعادة تعيين كلمة مرور Probook." },
  },
  resetPassword: {
    en: { title: "Reset Password", description: "Set a new password for your Probook account." },
    fr: { title: "Réinitialiser le mot de passe", description: "Définissez un nouveau mot de passe pour votre compte Probook." },
    ar: { title: "إعادة تعيين كلمة المرور", description: "عيّن كلمة مرور جديدة لحسابك على Probook." },
  },
  verifyEmail: {
    en: { title: "Verify Email", description: "Verify your email address for your Probook account." },
    fr: { title: "Vérifier l'email", description: "Vérifiez votre adresse email pour votre compte Probook." },
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
  opts?: {
    noindex?: boolean;
    path?: string;
    /** For a page whose text is its own, like one chapter of the guide. */
    title?: string;
    description?: string;
  }
): Metadata {
  const loc = (["en", "fr", "ar"].includes(locale) ? locale : "en") as Locale;
  const page = seo[pageKey] as Record<Locale, { title: string; description: string }>;
  const title = opts?.title ?? page[loc].title;
  const description = opts?.description ?? page[loc].description;

  const pageUrl = opts?.path ? `${SITE_URL}/${loc}${opts.path}` : `${SITE_URL}/${loc}`;
  // A title that already names the brand (the home page) must not get the
  // root layout's "%s | Probook" template on top, or it reads "Probook — … | Probook".
  const branded = title.startsWith(SITE_NAME);
  const fullTitle = branded ? title : `${title} | ${SITE_NAME}`;

  const metadata: Metadata = {
    title: branded ? { absolute: title } : title,
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
      title: fullTitle,
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
      title: fullTitle,
      description,
      images: [`${SITE_URL}/og-image.png`],
    },
  };

  if (opts?.noindex) {
    metadata.robots = { index: false, follow: false };
  }

  return metadata;
}
