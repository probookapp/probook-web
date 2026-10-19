export type NarratingCall = { kind: "say" | "titleCard" | "open"; lines: string[] };
export type Transcript = { fr: string[]; en: string[]; ar: string[] };

export function chapterNarration(file: string): NarratingCall[];
export function chapterFiles(root: string): string[];
export function readCaptions(root: string, locale: "en" | "ar"): Record<string, string>;
export function buildTranscripts(root: string): Record<string, Transcript>;
