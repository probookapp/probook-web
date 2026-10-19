"use client";

/**
 * Stamps the light/dark class on <html> before the first paint, from the
 * visitor's stored choice or their system setting.
 *
 * It only ever has to run once, from the server's HTML, so it is rendered on
 * the server only. When React builds the root layout in the browser instead of
 * hydrating it — which Next does for a `notFound()` page — a <script> created
 * there never executes and React warns "Encountered a script tag while
 * rendering React component". Rendering nothing on the client avoids that, and
 * hydration does not mind: React 19 skips extra tags it finds in <head>.
 *
 * `nonce` comes from src/proxy.ts and is what lets this inline script run under
 * the strict production CSP.
 */
const CODE = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('probook_theme');var dark=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme:dark)').matches);d.classList.remove('light','dark');d.classList.add(dark?'dark':'light')}catch(e){}})()`;

export function ThemeBootstrapScript({ nonce }: { nonce?: string }) {
  if (typeof window !== "undefined") return null;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: CODE }} />;
}
