import type { CDPSession, Page } from "@playwright/test";

/**
 * The guide's camera: Chrome's own pinch-zoom, filmed as it happens.
 *
 * Zooming the finished video would enlarge 1080p pixels — Playwright records at
 * CSS resolution whatever the device scale factor, so a 1.6x crop came out
 * soft. A pinch makes Chrome re-raster the page at the new scale instead, and
 * the text stays sharp at any zoom.
 *
 * What it costs, and how the Tour pays it:
 *  - Playwright's ordinary click and hover scroll the target "into view", which
 *    under a pinch snaps the zoomed view back to the page's corner — a jump-cut
 *    on film. While zoomed, the Tour clicks with `force` after checking the
 *    target itself; fill, selectOption and the keyboard leave the view alone.
 *  - Nothing outside the zoomed frame can be clicked, so the camera frames each
 *    target before it is acted on, and goes wide for anything it cannot frame.
 *
 * Pinch coordinates are in the *visual* viewport (what is on screen now), box
 * coordinates in the layout viewport (the page) — the maths below converts.
 */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Visual {
  scale: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Never closer than this: past it a form loses its context. */
const MAX_SCALE = 1.7;
/** Not worth a camera move below this. */
const MIN_SCALE = 1.12;
/** Room left around a framed region, in page pixels. */
const MARGIN = 36;

export class Camera {
  private cdp: CDPSession | null = null;
  /** The region currently framed, in page coordinates, or null when wide. */
  private framed: Box | null = null;
  /** Whether that region is a dialog, and which page it was framed on. */
  private framedDialog = false;
  private framedUrl = "";

  constructor(
    private readonly page: Page,
    private readonly fast: boolean
  ) {}

  get zoomed(): boolean {
    return this.framed !== null;
  }

  private async session(): Promise<CDPSession> {
    if (!this.cdp) this.cdp = await this.page.context().newCDPSession(this.page);
    return this.cdp;
  }

  private async visual(): Promise<Visual> {
    return this.page.evaluate(() => {
      const v = window.visualViewport!;
      return { scale: v.scale, x: v.offsetLeft, y: v.offsetTop, w: v.width, h: v.height };
    });
  }

  private viewport() {
    return this.page.viewportSize() ?? { width: 1920, height: 1080 };
  }

  /** Pinch speed: brisk in verification runs, a deliberate glide on film. */
  private speed(fromScale: number, toScale: number) {
    if (this.fast) return 6000;
    // relativeSpeed is finger travel in px/s; a bigger change travels further.
    // An integer: the protocol rejects a fractional speed as "Invalid parameters".
    return Math.round(380 + 260 * Math.abs(Math.log(toScale / fromScale)));
  }

  private async pinch(x: number, y: number, factor: number, fromScale: number) {
    // A mouse pinch is delivered as ctrl+wheel, and a focused number field
    // under it takes the wheel as "step up": a quantity of 3 was filmed as
    // 3.05. Nothing needs the focus across a camera move — the next action
    // clicks its own target.
    await this.page
      .evaluate(() => {
        const el = document.activeElement;
        if (el instanceof HTMLElement && el !== document.body) el.blur();
      })
      .catch(() => {});
    const cdp = await this.session();
    await cdp.send("Input.synthesizePinchGesture", {
      x,
      y,
      scaleFactor: factor,
      relativeSpeed: this.speed(fromScale, fromScale * factor),
      gestureSourceType: "mouse",
    });
  }

  /**
   * Go wide when what was framed is gone: the dialog closed, or the app moved
   * to another page (a client-side navigation keeps the zoom, so the next page
   * would open cropped). Called after every action.
   */
  async settle() {
    if (!this.framed) return;
    const v = await this.visual().catch(() => null);
    if (!v || v.scale <= 1.01) {
      this.framed = null;
      return;
    }
    if (this.page.url() !== this.framedUrl) return this.wide();
    if (this.framedDialog) {
      const open = await this.page.locator('[role="dialog"]').filter({ visible: true }).count();
      if (open === 0) await this.wide();
    }
  }

  /** Back to the whole page. */
  async wide() {
    if (!this.framed) return;
    this.framed = null;
    const v = await this.visual().catch(() => null);
    if (!v || v.scale <= 1.01) return;
    await this.pinch(v.w / 2, v.h / 2, 1 / v.scale, v.scale).catch(() => {});
    // A pinch can leave a sliver of scale behind; settle it exactly.
    const cdp = await this.session();
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 }).catch(() => {});
    if (!this.fast) await this.page.waitForTimeout(120);
  }

  /** Whether a page-space box is entirely inside what is on screen now. */
  async shows(box: Box): Promise<boolean> {
    if (!this.framed) return true;
    const v = await this.visual();
    return (
      box.x >= v.x - 1 &&
      box.y >= v.y - 1 &&
      box.x + box.width <= v.x + v.w + 1 &&
      box.y + box.height <= v.y + v.h + 1
    );
  }

  /**
   * Frame a region of the page. Goes wide first when something else is framed,
   * so every move reads as "step back, then lean in" rather than a slide that
   * would need a pan Chrome cannot animate.
   */
  async frame(region: Box, opts: { dialog?: boolean } = {}) {
    const vp = this.viewport();
    const padded = {
      x: region.x - MARGIN,
      y: region.y - MARGIN,
      width: region.width + MARGIN * 2,
      height: region.height + MARGIN * 2,
    };
    const scale = Math.min(MAX_SCALE, vp.width / padded.width, vp.height / padded.height);
    if (scale < MIN_SCALE) {
      await this.wide();
      return;
    }
    if (this.framed && sameRegion(this.framed, region)) return;
    await this.wide();

    // Where the zoomed view's top-left should land so the region is centred,
    // kept inside the page.
    const viewW = vp.width / scale;
    const viewH = vp.height / scale;
    const cx = padded.x + padded.width / 2;
    const cy = padded.y + padded.height / 2;
    const ox = clamp(cx - viewW / 2, 0, vp.width - viewW);
    const oy = clamp(cy - viewH / 2, 0, vp.height - viewH);
    // A pinch keeps its anchor still on screen: anchoring at a = o / (1 - 1/s)
    // puts the view's corner at o.
    const k = 1 - 1 / scale;
    const ax = clamp(ox / k, 1, vp.width - 1);
    const ay = clamp(oy / k, 1, vp.height - 1);
    await this.pinch(ax, ay, scale, 1);
    this.framed = region;
    this.framedDialog = !!opts.dialog;
    this.framedUrl = this.page.url();
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function sameRegion(a: Box, b: Box) {
  return (
    Math.abs(a.x - b.x) < 4 &&
    Math.abs(a.y - b.y) < 4 &&
    Math.abs(a.width - b.width) < 4 &&
    Math.abs(a.height - b.height) < 4
  );
}
