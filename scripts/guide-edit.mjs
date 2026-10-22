/**
 * The edit of one guide take: from Playwright's raw recording and the timeline
 * the chapter wrote beside it, a finished chapter.
 *
 *  - Sync. The timeline counts from when the page was created, which is close
 *    to — not exactly — when the video starts. The chapter's title card is a
 *    hard cut on screen, so its frame in the video pins the offset exactly.
 *  - Trim. Everything before the title card is the account loading and the
 *    first page settling: it is cut.
 *  - Sound. Each sentence's clip is laid where the chapter said it; the music
 *    runs underneath and ducks whenever the voice speaks; the mix is
 *    normalised to the loudness YouTube plays at (-14 LUFS).
 *  - Subtitles. Styled, burned in for the many who watch muted, and the same
 *    cues as an .srt for YouTube's own caption track.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
}

/** Seconds at which the first title card appears in the raw video. */
function findCard(video, expectedS) {
  // The scene changes close to where the timeline says the card went up. The
  // card fades in over 0.6 s, so the threshold is low enough to catch the fade.
  // showinfo reports on stderr, not stdout.
  const from = Math.max(0, expectedS - 4);
  const res = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-ss", String(from), "-t", "8", "-i", video, "-vf", "select='gt(scene,0.12)',showinfo", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  const times = [...String(res.stderr ?? "").matchAll(/pts_time:([\d.]+)/g)].map((m) => from + Number(m[1]));
  // The closest one: the page settling also changes the picture a second or
  // two before the card, and the first change found is often that.
  const near = times.filter((t) => Math.abs(t - expectedS) <= 1.5);
  if (!near.length) return null;
  return near.reduce((best, t) => (Math.abs(t - expectedS) < Math.abs(best - expectedS) ? t : best));
}

const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, "0");
const srtTime = (s) => `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)},${pad((s % 1) * 1000, 3)}`;
const assTime = (s) => `${Math.floor(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}.${pad((s % 1) * 100)}`;

/** Narration cues on the edited timeline: [{ start, end, text }]. */
function cues(events, offsetS, trimS) {
  const says = events.filter((e) => e.type === "say");
  const cards = events.filter((e) => e.type === "card");
  return says.map((e, i) => {
    const start = e.t / 1000 + offsetS - trimS;
    const spoken = e.ms ? e.ms / 1000 : Math.min(5.2, 0.85 + e.text.length * 0.042);
    const nextT = [says[i + 1]?.t, cards.find((c) => c.t > e.t)?.t].filter((x) => x != null);
    const next = nextT.length ? Math.min(...nextT) / 1000 + offsetS - trimS : Infinity;
    // On screen while it is said, plus a beat — never over the next line.
    const end = Math.min(next - 0.05, start + spoken + 0.5);
    return { start, end, text: e.text };
  });
}

function writeSrt(file, list) {
  fs.writeFileSync(
    file,
    list.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n"),
    "utf8"
  );
}

function writeAss(file, list, frame) {
  const portrait = frame.h > frame.w;
  const size = portrait ? 34 : 44;
  const marginV = portrait ? 120 : 54;
  const marginLR = portrait ? 40 : 260;
  // Opaque box (BorderStyle 3) in the product's ink colour, 80% opaque; the
  // Outline sets the box's padding. Colours are &HAABBGGRR.
  const style =
    `Style: Default,Segoe UI Semibold,${size},&H00FFFFFF,&H00FFFFFF,&H33111213,&H33111213,` +
    `0,0,0,0,100,100,0,0,3,${portrait ? 10 : 13},0,2,${marginLR},${marginLR},${marginV},1`;
  const esc = (t) => t.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
  const lines = list.map(
    (c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,{\\fad(140,140)}${esc(c.text)}`
  );
  fs.writeFileSync(
    file,
    [
      "[Script Info]",
      "ScriptType: v4.00+",
      `PlayResX: ${frame.w}`,
      `PlayResY: ${frame.h}`,
      "WrapStyle: 0",
      "ScaledBorderAndShadow: yes",
      "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      style,
      "",
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
      ...lines,
      "",
    ].join("\n"),
    "utf8"
  );
}

/**
 * Edit one take into `out` (.mp4), with `out` minus extension + .srt beside it.
 * `music` is an audio file or null; `frame` the output size.
 */
export function editTake({ video, timelineFile, out, music, frame }) {
  const { events } = JSON.parse(fs.readFileSync(timelineFile, "utf8"));
  const firstCard = events.find((e) => e.type === "card");
  const endEvent = events.find((e) => e.type === "end");
  if (!firstCard || !endEvent) throw new Error(`${timelineFile}: no title card or no end`);

  const seen = findCard(video, firstCard.t / 1000);
  const offsetS = seen != null ? seen - firstCard.t / 1000 : 0;
  // Keep a few frames before the card's fade so it opens on the card itself.
  const trimS = Math.max(0, firstCard.t / 1000 + offsetS - 0.1);
  const endS = endEvent.t / 1000 + offsetS;
  const duration = endS - trimS;

  const list = cues(events, offsetS, trimS).filter((c) => c.start < duration);
  const base = out.replace(/\.mp4$/, "");
  writeSrt(`${base}.srt`, list);
  const work = path.dirname(timelineFile);
  writeAss(path.join(work, "captions.ass"), list, frame);

  const clips = events.filter((e) => e.type === "say" && e.clip && fs.existsSync(e.clip));
  const inputs = ["-i", video];
  const filters = [];
  let next = 1;

  let musicLabel = null;
  if (music) {
    inputs.push("-stream_loop", "-1", "-i", music);
    const m = next++;
    musicLabel = "mus";
    filters.push(
      `[${m}:a]aresample=48000,atrim=0:${duration.toFixed(3)},asetpts=N/SR/TB,volume=0.30,` +
        `afade=t=in:d=1.2,afade=t=out:st=${Math.max(0, duration - 2.5).toFixed(3)}:d=2.5[mus]`
    );
  }

  let voiceLabel = null;
  if (clips.length) {
    const labels = [];
    for (const c of clips) {
      inputs.push("-i", c.clip);
      const i = next++;
      const delay = Math.max(0, Math.round((c.t / 1000 + offsetS - trimS) * 1000));
      filters.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${delay}|${delay}[c${i}]`);
      labels.push(`[c${i}]`);
    }
    filters.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0,apad[voice]`);
    voiceLabel = "voice";
  }

  let audioOut = null;
  if (voiceLabel && musicLabel) {
    filters.push(
      "[voice]asplit=2[vo][sc]",
      // The music steps back under the voice and comes up between sentences.
      "[mus][sc]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=450[duck]",
      // Music first: it has the take's length, the padded voice has none.
      "[duck][vo]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11[aout]"
    );
    audioOut = "aout";
  } else if (voiceLabel || musicLabel) {
    filters.push(`[${voiceLabel ?? musicLabel}]loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);
    audioOut = "aout";
  }

  filters.push(
    `[0:v]trim=start=${trimS.toFixed(3)}:end=${endS.toFixed(3)},setpts=PTS-STARTPTS,fps=30,` +
      `scale=${frame.w}:${frame.h}:force_original_aspect_ratio=decrease,` +
      `pad=${frame.w}:${frame.h}:(ow-iw)/2:(oh-ih)/2,subtitles=captions.ass[vout]`
  );

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[vout]",
    ...(audioOut ? ["-map", `[${audioOut}]`, "-c:a", "aac", "-b:a", "192k", "-ar", "48000"] : ["-an"]),
    "-t",
    duration.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "19",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    path.resolve(out),
  ];
  // Run from the take's folder: the subtitles filter takes a path inside a
  // filter graph, where a Windows drive letter would need escaping twice.
  execFileSync("ffmpeg", args, { cwd: work, stdio: ["ignore", "inherit", "inherit"] });
  return { offsetS, trimS, duration, cues: list.length, clips: clips.length };
}
