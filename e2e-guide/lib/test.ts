import { test as base, expect } from "@playwright/test";
import { inspectorFor } from "./inspector";
import { tourFor } from "./tour";

/**
 * The chapters' `test`, with the inspector's verdict attached.
 *
 * A chapter that clicks through a broken step still passes if nothing asserts
 * on it — which is how a cash movement stayed refused for weeks while its
 * chapter went green. Here the walk itself is the assertion: anything the
 * application reported as a failure while the chapter ran fails the chapter.
 */
export const test = base;

test.afterEach(async ({ page }) => {
  // The closing line has no next caption to wait for it, and the recording
  // stops with the page — so it would otherwise be cut mid-sentence.
  await tourFor(page)?.holdCaption().catch(() => {});

  const inspector = inspectorFor(page);
  if (!inspector) return;

  // One last look: the closing step's notice has no later caption to catch it.
  await inspector.sweepToasts().catch(() => {});

  expect(
    inspector.anomalies,
    `The application reported failures while this chapter ran:\n${inspector.report()}`
  ).toEqual([]);
});

export { expect };
