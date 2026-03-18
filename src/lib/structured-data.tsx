const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://probookapp.net";

// ─── JSON-LD structured data for SEO ─────────────────────────────────────────
// Add these components to pages to help search engines understand your content.

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function OrganizationJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Probook",
        url: SITE_URL,
        logo: `${SITE_URL}/logo.png`,
        description:
          "Professional invoicing and business management software for modern businesses.",
        email: "support@probookapp.net",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Algiers",
          addressCountry: "DZ",
        },
        sameAs: [
          "https://www.facebook.com/people/ProBook-Smart-Business-Manager/61587629459428/",
        ],
      }}
    />
  );
}

export function SoftwareApplicationJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Probook",
        url: SITE_URL,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description:
          "Invoicing, quotes, delivery notes, expense tracking, POS, and client management — all in one platform.",
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
        featureList: [
          "Professional Invoicing",
          "Quotes & Estimates",
          "Delivery Notes",
          "Expense Tracking",
          "Point of Sale (POS)",
          "Client Management",
          "Product & Inventory Management",
          "Offline Support",
          "Multi-language (English, French, Arabic)",
        ],
      }}
    />
  );
}

export function FAQPageJsonLd({
  items,
}: {
  items: { question: string; answer: string }[];
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      }}
    />
  );
}

export function WebPageJsonLd({
  name,
  description,
  url,
}: {
  name: string;
  description: string;
  url: string;
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "WebPage",
        name,
        description,
        url,
        isPartOf: {
          "@type": "WebSite",
          name: "Probook",
          url: SITE_URL,
        },
      }}
    />
  );
}

export function BreadcrumbJsonLd({
  items,
}: {
  items: { name: string; url: string }[];
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: item.name,
          item: item.url,
        })),
      }}
    />
  );
}
