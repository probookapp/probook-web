import type { Tag } from "@/types";

const now = "2026-03-01T09:00:00.000Z";

/**
 * The labels the demo business gave itself.
 *
 * Deliberately the three kinds a real shop invents — a site, a priority, a
 * thing to come back to — because the point of the demo is to answer "can I
 * add my own statuses?" with "you can add your own words, and they do not
 * disturb the states that drive your relances".
 */
export const DEMO_TAGS: Tag[] = [
  { id: "demo-tag-001", name: "Chantier Hydra", color: "blue", created_at: now, updated_at: now },
  { id: "demo-tag-002", name: "Prioritaire", color: "red", created_at: now, updated_at: now },
  { id: "demo-tag-003", name: "À relancer", color: "amber", created_at: now, updated_at: now },
];
