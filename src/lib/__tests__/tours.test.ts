import { describe, expect, it } from "vitest";
import { parseToursCompleted, tourCompleteSchema } from "../tours";

describe("parseToursCompleted", () => {
  it("reads nothing from an empty or malformed column", () => {
    expect(parseToursCompleted(null)).toEqual([]);
    expect(parseToursCompleted({ office: true })).toEqual([]);
    expect(parseToursCompleted("office")).toEqual([]);
  });

  it("keeps known keys only, once each, in a stable order", () => {
    expect(parseToursCompleted(["pos", "retired", "office", "pos", 3])).toEqual(["office", "pos"]);
  });
});

describe("tourCompleteSchema", () => {
  it("accepts the three tours and nothing else", () => {
    expect(tourCompleteSchema.safeParse({ tour: "checklist" }).success).toBe(true);
    expect(tourCompleteSchema.safeParse({ tour: "admin" }).success).toBe(false);
  });
});
