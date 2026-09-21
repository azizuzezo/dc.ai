import { env } from "../config/env.js";
import { logError } from "./logger.js";

// Flash, not Pro: Pro is noticeably slower and this is read out live on stream.
const MODEL = "gemini-2.5-flash-preview-tts";
const VOICE = "Kore";
// Generation alone measured 4.8-6.8s from a dev machine, but Railway's own
// network path to Gemini has been observed exceeding even 12s and aborting
// (production logs), so this leaves real headroom rather than the minimum.
const TIMEOUT_MS = 25000;

export function pcmToWav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate (16-bit mono)
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function requestSpeech(baseUrl, apiKey, text) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        },
      }),
    });
    if (res.status === 429) throw Object.assign(new Error("Gemini TTS quota exceeded"), { quota: true });
    if (!res.ok) throw new Error(`Gemini TTS returned ${res.status}: ${await res.text()}`);

    const body = await res.json();
    const part = body?.candidates?.[0]?.content?.parts?.[0];
    const base64 = part?.inlineData?.data;
    if (!base64) throw new Error("Gemini TTS response had no audio data");
    const rateMatch = /rate=(\d+)/.exec(part.inlineData.mimeType || "");
    return pcmToWav(Buffer.from(base64, "base64"), rateMatch ? Number(rateMatch[1]) : 24000);
  } finally {
    clearTimeout(timeout);
  }
}

/** Tries each configured key in order, moving to the next on quota errors. Returns a WAV Buffer, or null if unconfigured/all keys failed. */
export async function synthesizeSpeech(text, { baseUrl = "https://generativelanguage.googleapis.com" } = {}) {
  const keys = env.geminiTtsApiKeys;
  if (!keys.length) return null;

  let lastErr;
  for (const key of keys) {
    try {
      return await requestSpeech(baseUrl, key, text);
    } catch (err) {
      lastErr = err;
      if (!err.quota) break; // a real (non-quota) failure won't be fixed by trying another key
    }
  }
  logError("Gemini TTS failed for all configured keys:", lastErr);
  return null;
}
