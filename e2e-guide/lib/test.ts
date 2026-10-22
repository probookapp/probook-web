import { test as base, expect } from "@playwright/test";
import { inspectorFor } from "./inspector";
import { markVideoStart, tourFor } from "./tour";

/**
 * The chapters' `test`, with the inspector's verdict attached.
 *
 * A chapter that clicks through a broken step still passes if nothing asserts
 * on it — which is how a cash movement stayed refused for weeks while its
 * chapter went green. Here the walk itself is the assertion: anything the
 * application reported as a failure while the chapter ran fails the chapter.
 *
 * An automatic fixture, not top-level beforeEach/afterEach hooks. Hooks called
 * at a shared module's top level are registered once, when the first chapter
 * imports it, and attach to that file only: in a run of twelve chapters the
 * inspector's verdict — and the take's timeline — applied to the first alone.
 */
export const test = base.extend<{ guideTake: void }>({
  guideTake: [
    async ({ page }, use, testInfo) => {
      // The page exists, so its video has just started: the timeline counts
      // from here.
      markVideoStart(page);

      await use();

      // The closing line has no next caption to wait for it, and the recording
      // stops with the page — so it would otherwise be cut mid-sentence. Then
      // the closing card, and the timeline the build script cuts the video by.
      // Loud, not swallowed: a take without its timeline is edited the old
      // way, with no voice and no subtitles, and nothing else would say why.
      await tourFor(page)
        ?.finish(testInfo)
        .catch((err) => console.warn(`[guide] could not close the take: ${err}`));

      const inspector = inspectorFor(page);
      if (!inspector) return;

      // One last look: the closing step's notice has no later caption to catch it.
      await inspector.sweepToasts().catch(() => {});
      await inspector.sweepMissingKeys().catch(() => {});

      expect(
        inspector.anomalies,
        `The application reported failures while this chapter ran:\n${inspector.report()}`
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
