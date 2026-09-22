import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { logError } from "./logger.js";

// Baked into the Docker image (see Dockerfile) so narration never depends on an
// external API's quota or the viewer's browser having any voices installed.
const PIPER_BIN = process.env.PIPER_BIN || "/opt/piper/piper";
const PIPER_MODEL = process.env.PIPER_MODEL || "/opt/piper-voices/id_ID/id_ID-news_tts-medium.onnx";

/** Local, offline neural TTS (Piper, Indonesian voice). Returns a WAV Buffer, or null if it's unavailable/fails. */
export async function synthesizeSpeechLocal(text) {
  const outPath = join(tmpdir(), `piper-${randomUUID()}.wav`);
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(PIPER_BIN, ["--model", PIPER_MODEL, "--output_file", outPath]);
      let stderr = "";
      proc.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      proc.on("error", reject);
      proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`piper exited ${code}: ${stderr}`))));
      proc.stdin.write(text);
      proc.stdin.end();
    });
    return await readFile(outPath);
  } catch (err) {
    logError("Local Piper TTS failed:", err);
    return null;
  } finally {
    unlink(outPath).catch(() => {});
  }
}
