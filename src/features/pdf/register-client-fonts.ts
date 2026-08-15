import { Font } from "@react-pdf/renderer";

/**
 * The same faces as the server, registered in the browser.
 *
 * Two things had to be true for this to work at all, and only one of them was
 * the Content-Security-Policy. fontkit is compiled to WebAssembly and fetches
 * it through a `data:` URL, so `connect-src` must allow `data:` and
 * `script-src` must allow `'wasm-unsafe-eval'` — WebAssembly compilation only,
 * not `eval()` of JavaScript.
 *
 * The other was subtler and cost far more time: **every weight and style the
 * documents ask for must be registered**. A missing one is not a fallback in
 * react-pdf — the render simply never settles, with no error anywhere. The
 * legal line is italic, which is what silently swallowed an earlier attempt.
 */
let done = false;

export function registerClientFonts() {
  if (done || typeof window === "undefined") return;
  done = true;

  Font.register({
    family: "IBM Plex Sans",
    fonts: [
      { src: "/fonts/plex-sans-400.ttf", fontWeight: 400 },
      { src: "/fonts/plex-sans-600.ttf", fontWeight: 600 },
      { src: "/fonts/plex-sans-600.ttf", fontWeight: 700 },
      { src: "/fonts/plex-sans-400i.ttf", fontWeight: 400, fontStyle: "italic" },
      { src: "/fonts/plex-sans-600i.ttf", fontWeight: 600, fontStyle: "italic" },
      { src: "/fonts/plex-sans-600i.ttf", fontWeight: 700, fontStyle: "italic" },
    ],
  });

  Font.register({
    family: "IBM Plex Sans Arabic",
    fonts: [
      { src: "/fonts/plex-arabic-400.ttf", fontWeight: 400 },
      { src: "/fonts/plex-arabic-600.ttf", fontWeight: 600 },
      { src: "/fonts/plex-arabic-600.ttf", fontWeight: 700 },
      // Arabic has no italic: the script is already cursive, and slanting it is
      // a Latin habit rather than a typographic form.
      { src: "/fonts/plex-arabic-400.ttf", fontWeight: 400, fontStyle: "italic" },
      { src: "/fonts/plex-arabic-600.ttf", fontWeight: 600, fontStyle: "italic" },
      { src: "/fonts/plex-arabic-600.ttf", fontWeight: 700, fontStyle: "italic" },
    ],
  });
}
