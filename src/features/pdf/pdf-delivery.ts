import * as Sentry from "@sentry/nextjs";

/**
 * Getting a finished PDF to the reader: saved where the browser can save, shown
 * where it cannot. No @react-pdf/renderer here, so a list page can import it
 * without pulling the renderer into its chunk.
 */

/**
 * Put the finished document in the tab that was claimed for it.
 *
 * Not by pointing the tab at the blob: browsers refuse a top-level navigation to
 * a blob URL that another page created — Chromium leaves the tab blank, with no
 * error to catch. A frame may load it, so the tab gets a page of its own holding
 * the document, and a plain link above it for the case where even the frame is
 * refused: tapping that link is the reader's own gesture, which nothing blocks.
 */
export function showInTab(tab: Window | null, url: string, fileName: string, openLabel: string) {
  if (!tab) {
    // Popups refused altogether: show the document here rather than nowhere.
    window.location.href = url;
    return;
  }
  const escape = (value: string) =>
    value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  tab.document.write(
    `<!doctype html><html><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${escape(fileName)}</title>` +
      `<style>html,body{margin:0;height:100%;font:16px/1.4 system-ui,sans-serif;background:#f5f4f1}` +
      `a{display:block;padding:14px 16px;color:#12333a;font-weight:600;text-decoration:none}` +
      `iframe{border:0;width:100%;height:calc(100% - 48px);display:block}</style></head><body>` +
      `<a href="${url}" download="${escape(fileName)}">${escape(openLabel)}</a>` +
      `<iframe src="${url}" title="${escape(fileName)}"></iframe></body></html>`
  );
  tab.document.close();
}

/**
 * What went wrong, said out loud.
 *
 * A PDF that fails says so in a toast, and until now that was all anyone knew —
 * a customer on Firefox could only report "an error appears", which is not
 * something to debug from. The reason now rides in the message and goes to
 * Sentry with the browser attached, so the next occurrence names itself.
 */
export function reportPdfFailure(err: unknown, what: "preview" | "download", fallback: string): string {
  Sentry.captureException(err, {
    tags: { feature: "pdf", action: what },
    extra: { userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent },
  });
  console.error(`PDF ${what} failed`, err);
  const reason = err instanceof Error ? err.message : String(err ?? "");
  return reason ? `${fallback} (${reason.slice(0, 120)})` : fallback;
}

/**
 * Whether a link with `download` actually saves a file here.
 *
 * iOS ignores the attribute for blob: URLs — the tap does nothing at all, which
 * is what a customer reports as "the PDF doesn't work". iPadOS reports itself
 * as a Mac, so the touch count is what tells them apart.
 */
export function canDownloadFiles(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return !(/iPhone|iPad|iPod/.test(ua) || iPadOS);
}

/**
 * Claim the tab a download will need, *before* any await: a tab opened once an
 * await has resolved is no longer attributed to the tap that asked for it, and
 * Safari blocks it as a popup. Only iOS needs one; elsewhere this is null.
 */
export function claimDownloadTab(): Window | null {
  return canDownloadFiles() ? null : window.open("", "_blank");
}

/** Save the blob as a file — or, on iOS, show it in the claimed tab. */
export function deliverPdf(blob: Blob, fileName: string, tab: Window | null, openLabel: string) {
  const url = URL.createObjectURL(blob);
  if (tab) {
    // iOS ignores the download attribute on a blob: the file is shown
    // instead, and "Share → Save to Files" is how it gets saved there.
    showInTab(tab, url, fileName, openLabel);
  } else {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  // Not revoked on the next line: Firefox and Safari read the blob after
  // the click returns, and revoking it there cancelled the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
