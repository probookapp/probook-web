/**
 * The guide's voice-over: one WAV per spoken caption, made before filming.
 *
 * The narration is synthesized ahead of time, never during a take — a network
 * call between two steps would be dead air in the video. The chapters then
 * read each clip's length from this cache and hold every step exactly as long
 * as its sentence is spoken (e2e-guide/lib/tour.ts), and the build script lays
 * the clips on the soundtrack at the moments the timeline recorded.
 *
 *   GUIDE_VOICE=azure   Azure Neural TTS (AZURE_SPEECH_KEY + AZURE_SPEECH_REGION)
 *   GUIDE_VOICE=sapi    the Windows voices — robotic, for working on the
 *                       pipeline without a key; Arabic has none, so its clips
 *                       are silences of the length the sentence would take
 *   GUIDE_VOICE=off     no voice: steps are paced on reading time, as before
 *
 * A clip is keyed on everything that changes how it sounds (provider, voice,
 * rate, text after the pronunciation fixes), so editing one sentence
 * re-synthesizes that sentence only.
 *
 * Plain .mjs: the generator script and the Playwright chapters both load it.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

/**
 * Voices per language and gender. Azure names; change one here and every clip
 * in that language is re-made on the next `npm run guide:voice`.
 */
export const VOICES = {
  azure: {
    fr: { female: "fr-FR-DeniseNeural", male: "fr-FR-HenriNeural" },
    en: { female: "en-US-AvaNeural", male: "en-US-AndrewNeural" },
    ar: { female: "ar-DZ-AminaNeural", male: "ar-DZ-IsmaelNeural" },
  },
  sapi: {
    fr: { female: "Microsoft Hortense Desktop", male: "Microsoft Hortense Desktop" },
    en: { female: "Microsoft Zira Desktop", male: "Microsoft Zira Desktop" },
    ar: { female: null, male: null },
  },
};

const XML_LANG = { fr: "fr-FR", en: "en-US", ar: "ar-DZ" };

/**
 * Words a voice gets wrong, said the way they should sound. Applied as SSML
 * <sub alias> for Azure, as a plain substitution for the Windows voices.
 */
export const PRONUNCIATIONS = {
  fr: { Probook: "Probouk", NIF: "N.I.F.", NIS: "N.I.S." },
  en: {},
  ar: { Probook: "بروبوك" },
};

/** Bump to re-make every clip after a change to how SSML is built. */
const SSML_VERSION = 1;

export function voiceSettings(env = process.env) {
  const provider = (env.GUIDE_VOICE || (env.AZURE_SPEECH_KEY ? "azure" : "off")).toLowerCase();
  const gender = (env.GUIDE_VOICE_GENDER || "female").toLowerCase();
  const rate = env.GUIDE_VOICE_RATE || "+0%";
  return { provider, gender, rate };
}

export function voiceName(locale, settings = voiceSettings()) {
  if (settings.provider === "off") return null;
  return VOICES[settings.provider]?.[locale]?.[settings.gender] ?? null;
}

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
}

function withPronunciations(text, locale, asSsml) {
  let out = asSsml ? escapeXml(text) : text;
  for (const [word, said] of Object.entries(PRONUNCIATIONS[locale] ?? {})) {
    const re = new RegExp(`\\b${word}\\b`, "g");
    out = out.replace(re, asSsml ? `<sub alias="${escapeXml(said)}">${word}</sub>` : said);
  }
  return out;
}

export function ssmlFor(text, locale, settings = voiceSettings()) {
  const voice = voiceName(locale, settings);
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${XML_LANG[locale]}">` +
    `<voice name="${voice}"><prosody rate="${settings.rate}">${withPronunciations(text, locale, true)}</prosody></voice>` +
    `</speak>`
  );
}

/** Where a sentence's clip lives, whether or not it has been made yet. */
export function clipPath(root, locale, text, settings = voiceSettings()) {
  const voice = voiceName(locale, settings) ?? "silence";
  const key = crypto
    .createHash("sha1")
    .update(JSON.stringify([SSML_VERSION, settings.provider, voice, settings.rate, text]))
    .digest("hex")
    .slice(0, 16);
  return path.join(root, "guide-output", "voice", locale, `${settings.provider}-${key}.wav`);
}

/** Length of a PCM WAV, read from its header. */
export function wavDurationMs(file) {
  const buf = fs.readFileSync(file);
  // Walk the RIFF chunks: "fmt " gives the byte rate, "data" the length.
  let byteRate = 0;
  for (let i = 12; i + 8 <= buf.length; ) {
    const id = buf.toString("ascii", i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    if (id === "fmt ") byteRate = buf.readUInt32LE(i + 16);
    if (id === "data" && byteRate) return Math.round((Math.min(size, buf.length - i - 8) / byteRate) * 1000);
    i += 8 + size + (size % 2);
  }
  throw new Error(`Not a PCM WAV: ${file}`);
}

/** The clip for a sentence, if it has been made: path and length. */
export function cachedClip(root, locale, text, settings = voiceSettings()) {
  if (settings.provider === "off") return null;
  const file = clipPath(root, locale, text, settings);
  if (!fs.existsSync(file)) return null;
  return { file, durationMs: wavDurationMs(file) };
}

/** A silent WAV of a given length (24 kHz, 16-bit, mono). */
function writeSilence(file, ms) {
  const rate = 24000;
  const samples = Math.round((rate * ms) / 1000);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples * 2, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples * 2, 40);
  fs.writeFileSync(file, Buffer.concat([header, Buffer.alloc(samples * 2)]));
}

async function synthesizeAzure(text, locale, settings, file, env) {
  const key = env.AZURE_SPEECH_KEY;
  const region = env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error("AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be set (in .env.test)");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
        "User-Agent": "probook-guide",
      },
      body: ssmlFor(text, locale, settings),
    });
    if (res.ok) {
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return;
    }
    // The free tier allows a few requests per second; back off and retry.
    if (res.status === 429 && attempt < 6) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`Azure TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

function synthesizeSapi(text, locale, settings, file) {
  const voice = voiceName(locale, settings);
  if (!voice) {
    // No Windows voice for this language: as long as reading it would take.
    writeSilence(file, Math.min(9000, Math.max(1200, 700 + text.length * 55)));
    return;
  }
  const said = withPronunciations(text, locale, false).replace(/'/g, "''");
  const script =
    "Add-Type -AssemblyName System.Speech;" +
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;" +
    `$s.SelectVoice('${voice}');` +
    "$f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono);" +
    `$s.SetOutputToWaveFile('${file.replace(/'/g, "''")}', $f);` +
    `$s.Speak('${said}');$s.Dispose()`;
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: "ignore" });
}

/** Make every clip of `lines` that is missing. Returns how many were made. */
export async function synthesizeMissing(root, locale, lines, settings = voiceSettings(), env = process.env, log = () => {}) {
  if (settings.provider === "off") return 0;
  let made = 0;
  for (const text of lines) {
    const file = clipPath(root, locale, text, settings);
    if (fs.existsSync(file)) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (settings.provider === "azure") await synthesizeAzure(text, locale, settings, file, env);
    else if (settings.provider === "sapi") synthesizeSapi(text, locale, settings, file);
    else throw new Error(`Unknown GUIDE_VOICE "${settings.provider}"`);
    made++;
    log(`${locale} ${made}: ${text.slice(0, 70)}`);
  }
  return made;
}
