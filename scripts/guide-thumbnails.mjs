/**
 * YouTube thumbnails for the guide: one 1280x720 PNG per chapter.
 *
 * A frame from the chapter itself (the app doing the thing the video is about)
 * set in the brand's frame, with the chapter's title in type large enough to
 * read at the size YouTube shows a thumbnail in a list. Rendered by Chromium
 * from HTML so the type and the colours match the product.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** A still from the finished chapter, at `atS` seconds. */
function still(video, atS, file) {
  execFileSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-ss", atS.toFixed(2), "-i", video, "-frames:v", "1", "-q:v", "2", file],
    { stdio: "ignore" }
  );
}

function html({ kicker, title, image, portrait }) {
  // Never mirrored for Arabic, like the product: the copy is translated, the
  // layout stays put.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1280px;height:720px;overflow:hidden;font-family:"Segoe UI",system-ui,sans-serif;
    background:radial-gradient(circle at 25% 30%,#1c5f68,#131211 75%);color:#faf9f7;position:relative}
  .shot{position:absolute;right:-60px;top:70px;width:${portrait ? 330 : 820}px;
    ${portrait ? "height:620px;" : ""}border-radius:18px;overflow:hidden;
    box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 2px rgba(255,255,255,.08);transform:rotate(-3deg)}
  .shot img{display:block;width:100%;${portrait ? "height:100%;object-fit:cover;object-position:top;" : ""}}
  .text{position:absolute;left:64px;top:0;bottom:0;width:${portrait ? 760 : 520}px;
    display:flex;flex-direction:column;justify-content:center;gap:18px}
  .brand{font-weight:700;font-size:30px;letter-spacing:.5px;color:#a8d3d5}
  .kicker{display:inline-block;align-self:flex-start;background:#facc15;color:#131211;
    font-weight:800;font-size:28px;padding:6px 16px;border-radius:10px}
  .title{font-weight:800;font-size:${portrait ? 76 : 70}px;line-height:1.02;letter-spacing:-1.5px;
    text-shadow:0 4px 24px rgba(0,0,0,.4)}
</style></head><body>
  <div class="shot"><img src="${image}"></div>
  <div class="text">
    <div class="brand">Probook</div>
    <div class="kicker">${escapeHtml(kicker)}</div>
    <div class="title">${escapeHtml(title)}</div>
  </div>
</body></html>`;
}

/**
 * `items`: [{ video, out, kicker, title, atS, portrait }].
 */
export async function makeThumbnails(root, items) {
  if (!items.length) return;
  const { chromium } = require(require.resolve("@playwright/test", { paths: [root] }));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    for (const item of items) {
      const frame = item.out.replace(/\.png$/, ".still.jpg");
      still(item.video, item.atS, frame);
      const page_html = item.out.replace(/\.png$/, ".html");
      fs.writeFileSync(
        page_html,
        html({ ...item, image: pathToFileURL(frame).href }),
        "utf8"
      );
      await page.goto(pathToFileURL(page_html).href);
      await page.waitForLoadState("load");
      await page.screenshot({ path: item.out });
      fs.rmSync(page_html);
      fs.rmSync(frame);
    }
  } finally {
    await browser.close();
  }
}

