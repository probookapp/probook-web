import fs from "fs";
import path from "path";

/**
 * Which language the guide is filmed in.
 *
 * One recording per interface language is unavoidable: the buttons, the column
 * headings and the messages are burned into the pixels, so an English caption
 * over a French screen reads as a mistake no subtitle track can repair.
 *
 * What *is* avoidable is writing the chapters three times. The chapters stay
 * written in French — that is the source — and both the selectors and the
 * captions are resolved through this module, so `GUIDE_LOCALE=en` walks the
 * English interface with English narration from the same script.
 *
 * A useful side effect: the English and Arabic interfaces are only guarded
 * today by the key-parity and raw-key barriers, which prove the strings exist
 * but never walk a single flow. Running the guide in those languages does.
 */
export const GUIDE_LOCALES = ["fr", "en", "ar"] as const;
export type GuideLocale = (typeof GUIDE_LOCALES)[number];

function resolveLocale(): GuideLocale {
  const raw = (process.env.GUIDE_LOCALE ?? "fr").toLowerCase();
  if (!(GUIDE_LOCALES as readonly string[]).includes(raw)) {
    throw new Error(
      `GUIDE_LOCALE="${raw}" is not one of ${GUIDE_LOCALES.join(", ")}. ` +
        "Filming an unsupported language would produce a video of a fallback UI."
    );
  }
  return raw as GuideLocale;
}

export const LOCALE: GuideLocale = resolveLocale();

/** Arabic reads right to left; the caption bar and title cards follow. */
export const IS_RTL = LOCALE === "ar";

type Captions = Record<string, string>;

function loadCaptions(locale: GuideLocale): Captions {
  if (locale === "fr") return {};
  const file = path.resolve(__dirname, "..", "captions", `${locale}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing ${path.relative(process.cwd(), file)} — run ` +
        "`npx vitest run guide-captions` to see which lines are untranslated."
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as Captions;
}

const CAPTIONS = loadCaptions(LOCALE);

/**
 * Narration, keyed by its own French text.
 *
 * Keying on the sentence rather than on an invented identifier keeps the
 * chapters readable — you see what will be said, where it will be said — and
 * means editing a French line is caught immediately as a missing translation
 * instead of silently keeping the old wording on screen.
 */
export function narrate(fr: string): string {
  if (LOCALE === "fr") return fr;
  const line = CAPTIONS[fr];
  if (line === undefined) {
    // Falling back to French would put two languages in one video, which is
    // worse than not filming: it looks like a broken product rather than a
    // missing translation.
    throw new Error(`No ${LOCALE} caption for: ${JSON.stringify(fr)}`);
  }
  return line;
}
