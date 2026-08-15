import fs from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";

/**
 * Documents rendered in Node rather than in the browser.
 *
 * The browser cannot embed a font here. `fontkit` — the engine react-pdf parses
 * faces with — is compiled to WebAssembly and fetches it through a `data:` URL,
 * which this application's Content-Security-Policy refuses; production's
 * `script-src` carries no `wasm-unsafe-eval` either. Both would have to be
 * loosened, and even with `connect-src data:` allowed the render never finished.
 *
 * None of that applies in Node: no CSP, faces read straight off the disk,
 * fontkit running natively.
 *
 * One caveat decided where this lives. An **App Router** route handler resolves
 * `react` to Next's server build, whose `createContext` does not exist — and
 * @react-pdf calls it on import, so every such attempt answered
 * "createContext is not a function" before a byte was written. A **Pages
 * Router** handler gets the real react from node_modules. That is why the route
 * that uses this module sits under src/pages/api.
 */
const FONT_DIR = path.join(process.cwd(), "public", "fonts");

interface Family {
  family: string;
  faces: { file: string; fontWeight: number; fontStyle?: "italic" }[];
}

/**
 * The same typeface as the interface. Helvetica — one of the fourteen every
 * reader carries — was the safe choice while fonts could not be embedded at
 * all; it also has no Arabic glyphs, and pdfkit prints a truncated byte rather
 * than refusing, which is how an Arabic invoice came out as Latin nonsense.
 */
const FAMILIES: Family[] = [
  {
    family: "IBM Plex Sans",
    faces: [
      { file: "plex-sans-400.ttf", fontWeight: 400 },
      { file: "plex-sans-600.ttf", fontWeight: 600 },
      // The styles ask for "bold" (700). With a custom family that weight has
      // to exist, or rendering hangs with no error at all.
      { file: "plex-sans-600.ttf", fontWeight: 700 },
      // The legal wording ("Arrêté à la somme de …") is italic. A weight or
      // style a document asks for and the family does not carry is not a
      // fallback in react-pdf — it throws, and the render returns nothing.
      { file: "plex-sans-400i.ttf", fontWeight: 400, fontStyle: "italic" },
      { file: "plex-sans-600i.ttf", fontWeight: 600, fontStyle: "italic" },
      { file: "plex-sans-600i.ttf", fontWeight: 700, fontStyle: "italic" },
    ],
  },
  {
    family: "IBM Plex Sans Arabic",
    faces: [
      { file: "plex-arabic-400.ttf", fontWeight: 400 },
      { file: "plex-arabic-600.ttf", fontWeight: 600 },
      { file: "plex-arabic-600.ttf", fontWeight: 700 },
      // Arabic has no italic: the script is already cursive, and slanting it is
      // a Latin habit, not a typographic form. The upright face answers for it.
      { file: "plex-arabic-400.ttf", fontWeight: 400, fontStyle: "italic" },
      { file: "plex-arabic-600.ttf", fontWeight: 600, fontStyle: "italic" },
      { file: "plex-arabic-600.ttf", fontWeight: 700, fontStyle: "italic" },
    ],
  },
];

let registered = false;

/** Which families are actually on disk, so a thin checkout still prints. */
export function availableFamilies(): string[] {
  return FAMILIES.filter(({ faces }) =>
    faces.every((f) => fs.existsSync(path.join(FONT_DIR, f.file)))
  ).map((f) => f.family);
}

/**
 * Imported at call time, not at module scope: a static import drags the package
 * into the importing module's graph, which is what made this fail from the App
 * Router in the first place.
 */
const reactPdf = () => import("@react-pdf/renderer");

async function registerFonts() {
  if (registered) return;
  registered = true;
  const { Font } = await reactPdf();
  for (const { family, faces } of FAMILIES) {
    const present = faces
      .map((f) => ({ ...f, src: path.join(FONT_DIR, f.file) }))
      .filter((f) => fs.existsSync(f.src));
    if (present.length !== faces.length) continue;
    Font.register({
      family,
      fonts: present.map(({ src, fontWeight, fontStyle }) => ({
        src,
        fontWeight,
        ...(fontStyle ? { fontStyle } : {}),
      })),
    });
  }
}

/** A document as bytes. The caller builds the element. */
export async function renderDocument(element: ReactElement): Promise<Buffer> {
  await registerFonts();
  const { renderToBuffer } = await reactPdf();
  return renderToBuffer(element as never);
}
