import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://probookapp.net";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/*/dashboard",
          "/*/dashboard/*",
          "/*/clients",
          "/*/clients/*",
          "/*/products",
          "/*/products/*",
          "/*/invoices",
          "/*/invoices/*",
          "/*/quotes",
          "/*/quotes/*",
          "/*/delivery-notes",
          "/*/delivery-notes/*",
          "/*/expenses",
          "/*/expenses/*",
          "/*/settings",
          "/*/settings/*",
          "/*/pos",
          "/*/pos/*",
          "/*/admin",
          "/*/admin/*",
          "/*/reset-password",
          "/*/verify-email",
          "/*/offline",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
