import { describe, expect, it } from "vitest";
import { DEFAULT_REMINDER_STEPS, isNextReminderDue, parseReminderSteps } from "../reminder-sweep";

describe("reminder steps", () => {
  it("reads a list of days, sorted, without repeats or nonsense", () => {
    expect(parseReminderSteps("15, 1;30 15")).toEqual([1, 15, 30]);
    expect(parseReminderSteps("0, -3, abc, 400, 7")).toEqual([7]);
    expect(parseReminderSteps("")).toEqual(DEFAULT_REMINDER_STEPS);
    expect(parseReminderSteps(null)).toEqual(DEFAULT_REMINDER_STEPS);
  });

  it("waits for each step, and stops after the last", () => {
    const steps = [1, 15, 30];
    expect(isNextReminderDue(0, 0, steps)).toBe(false);
    expect(isNextReminderDue(1, 0, steps)).toBe(true);
    // One sent: the next waits until 15 days late, not tomorrow.
    expect(isNextReminderDue(2, 1, steps)).toBe(false);
    expect(isNextReminderDue(15, 1, steps)).toBe(true);
    expect(isNextReminderDue(40, 2, steps)).toBe(true);
    expect(isNextReminderDue(90, 3, steps)).toBe(false);
  });
});
