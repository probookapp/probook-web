import { useEffect } from "react";

/**
 * Names the browser tab after the section on screen ("Factures | Probook").
 * The back office's pages render on the client and declare no metadata, so
 * every tab read the site's English default, whatever the language.
 */
export function useSectionTitle(section: string | undefined) {
  useEffect(() => {
    if (section) document.title = `${section} | Probook`;
  }, [section]);
}
