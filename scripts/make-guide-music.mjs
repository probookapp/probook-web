#!/usr/bin/env node
/**
 * A background bed for the guide videos, synthesized from scratch.
 *
 *   node scripts/make-guide-music.mjs   -> guide-output/music/bed.wav
 *
 * Made here rather than downloaded so it carries no licence and no Content ID
 * claim. It is meant to sit under a voice, so it stays out of the voice's way:
 * warm pads, a round bass and a soft plucked arpeggio, no melody and nothing
 * percussive in the speech band. A track dropped at e2e-guide/assets/music.mp3
 * (e.g. from YouTube's Audio Library) takes precedence over it at build time.
 *
 * Six minutes, longer than any chapter, so the mix never needs to loop it.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "guide-output", "music", "bed.wav");

const RATE = 44100;
const BPM = 84;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const SECONDS = 360;
const N = Math.round(SECONDS * RATE);

// Fmaj9 – Am7 – Cadd9 – G6sus: unresolved, calm, loops on itself.
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [
  { root: 41, notes: [53, 57, 60, 64, 67] },
  { root: 45, notes: [52, 55, 57, 60, 64] },
  { root: 48, notes: [52, 55, 60, 62, 67] },
  { root: 43, notes: [50, 55, 59, 62, 64] },
];
const BARS_PER_CHORD = 2;

const left = new Float32Array(N);
const right = new Float32Array(N);

/** Deterministic noise, so the file is the same on every run. */
let seed = 12345;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

function envelope(t, length, attack, release) {
  if (t < 0 || t > length + release) return 0;
  const a = Math.min(1, t / attack);
  const r = t > length ? 1 - (t - length) / release : 1;
  return a * a * (3 - 2 * a) * Math.max(0, r);
}

/** Section gain over time: pads alone, then the arpeggio comes and goes. */
const arpLevel = (t) => {
  const bar = Math.floor(t / BAR);
  const phase = bar % 32;
  if (bar < 8) return 0;
  return phase < 24 ? 1 : 0.35;
};

const chordLen = BAR * BARS_PER_CHORD;
const chordCount = Math.ceil(SECONDS / chordLen) + 1;

for (let c = 0; c < chordCount; c++) {
  const chord = CHORDS[c % CHORDS.length];
  const start = c * chordLen;
  const s0 = Math.floor(start * RATE);

  // ─── pad: a few detuned partials per note, slow swell ───
  for (const [ni, note] of chord.notes.entries()) {
    const f = midi(note);
    // In cents: enough to shimmer like an ensemble, not enough to sound out of tune.
    const detunes = [-9, 0, 11];
    const pan = 0.5 + (ni - 2) * 0.12;
    const len = chordLen;
    const rel = 1.6;
    const end = Math.min(N, s0 + Math.floor((len + rel) * RATE));
    for (let i = s0; i < end; i++) {
      const t = (i - s0) / RATE;
      const env = envelope(t, len, 1.4, rel) * 0.05;
      if (env === 0) continue;
      let v = 0;
      for (const d of detunes) {
        const ff = f * Math.pow(2, d / 1200);
        const ph = 2 * Math.PI * ff * (i / RATE);
        // Soft, slightly hollow tone: fundamental plus a little 2nd and 3rd.
        v += Math.sin(ph) + 0.25 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph);
      }
      v *= env / detunes.length;
      left[i] += v * (1 - pan);
      right[i] += v * pan;
    }
  }

  // ─── bass: one round note per chord ───
  {
    const f = midi(chord.root);
    const len = chordLen * 0.92;
    const end = Math.min(N, s0 + Math.floor((len + 0.8) * RATE));
    for (let i = s0; i < end; i++) {
      const t = (i - s0) / RATE;
      const env = envelope(t, len, 0.25, 0.8) * 0.03;
      const v = Math.sin(2 * Math.PI * f * t) * env;
      left[i] += v;
      right[i] += v;
    }
  }

  // ─── arpeggio: Karplus–Strong plucks, eighth notes, ping-pong ───
  const steps = BARS_PER_CHORD * 8;
  const pattern = [0, 2, 1, 3, 4, 3, 1, 2];
  for (let s = 0; s < steps; s++) {
    const t0 = start + s * (BEAT / 2);
    const level = arpLevel(t0);
    if (level === 0 || t0 >= SECONDS) continue;
    const note = chord.notes[pattern[s % pattern.length]] + 12;
    const f = midi(note);
    const period = Math.max(2, Math.round(RATE / f));
    const buf = new Float32Array(period).map(() => rand() * 0.5);
    const len = Math.floor(1.6 * RATE);
    const i0 = Math.floor(t0 * RATE);
    const pan = s % 2 ? 0.3 : 0.7;
    let idx = 0;
    for (let k = 0; k < len && i0 + k < N; k++) {
      const next = (idx + 1) % period;
      const v = buf[idx];
      buf[idx] = 0.4985 * (buf[idx] + buf[next]);
      idx = next;
      const out = v * 0.06 * level * Math.exp(-k / (0.55 * RATE));
      left[i0 + k] += out * (1 - pan);
      right[i0 + k] += out * pan;
      // A quiet echo a dotted eighth later, on the other side.
      const e = i0 + k + Math.floor(BEAT * 0.75 * RATE);
      if (e < N) {
        left[e] += out * 0.35 * pan;
        right[e] += out * 0.35 * (1 - pan);
      }
    }
  }
}

// ─── gentle low-pass, fade in/out, normalise ───
let lpL = 0;
let lpR = 0;
// ~4 kHz: takes the edge off without dulling the pads.
const alpha = 0.45;
let peak = 0;
for (let i = 0; i < N; i++) {
  lpL += alpha * (left[i] - lpL);
  lpR += alpha * (right[i] - lpR);
  const t = i / RATE;
  const fade = Math.min(1, t / 3, (SECONDS - t) / 4);
  left[i] = lpL * fade;
  right[i] = lpR * fade;
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
const gain = 0.7 / peak;

const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i] * gain)) * 32767), i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i] * gain)) * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([header, data]));
console.log(`wrote ${path.relative(ROOT, OUT)} (${SECONDS}s)`);
