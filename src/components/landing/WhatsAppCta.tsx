"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/lib/navigation";
import { trackMetaEvent } from "@/components/analytics/MetaPixel";

// Business WhatsApp number in international format, digits only (no +, spaces, or dashes).
const WHATSAPP_NUMBER = "213799630526";

// wa.me links only honor the `phone` and `text` params — any UTM query string is
// dropped by WhatsApp. To keep campaign attribution we read the ad's UTM params off
// the landing URL and fold them into the prefilled message text (the `ref`).
function buildRef(): string {
  if (typeof window === "undefined") return "site";
  const params = new URLSearchParams(window.location.search);
  const source = params.get("utm_source") || "site";
  const campaign = params.get("utm_campaign");
  return campaign ? `${source}/${campaign}` : source;
}

interface Props {
  /** "hero" renders an inline button; "float" renders a fixed bottom-corner bubble. */
  variant: "hero" | "float";
}

export function WhatsAppCta({ variant }: Props) {
  const { t } = useTranslation("common");
  const locale = useLocale();

  // Default href (ref = "site") is used for SSR / first paint and right-click.
  // Once mounted we recompute with any UTM params present on the URL.
  const baseHref = (ref: string) =>
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      t("landing.whatsapp.prefill", { ref })
    )}`;

  const [href, setHref] = useState(() => baseHref("site"));

  useEffect(() => {
    setHref(baseHref(buildRef()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const label = t("landing.whatsapp.button");

  const icon = (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={variant === "float" ? "h-7 w-7" : "h-5 w-5"}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );

  if (variant === "float") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackMetaEvent("Contact", { content_name: "whatsapp_cta", locale })}
        aria-label={label}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105"
      >
        {icon}
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackMetaEvent("Contact", { content_name: "whatsapp_cta", locale })}
      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-white text-lg font-semibold px-8 py-3.5 rounded-xl shadow-lg transition-all bg-[#25D366] hover:bg-[#1eb455] hover:-translate-y-0.5"
    >
      {icon}
      {label}
    </a>
  );
}
