import { test } from "node:test";
import assert from "node:assert/strict";
import { pcmToWav } from "../src/services/geminiTts.js";

test("pcmToWav produces a valid RIFF/WAVE header sized to the PCM payload", () => {
  const pcm = Buffer.from([1, 2, 3, 4, 5, 6]);
  const wav = pcmToWav(pcm, 24000);

  assert.equal(wav.length, 44 + pcm.length);
  assert.equal(wav.subarray(0, 4).toString(), "RIFF");
  assert.equal(wav.readUInt32LE(4), 36 + pcm.length);
  assert.equal(wav.subarray(8, 12).toString(), "WAVE");
  assert.equal(wav.subarray(36, 40).toString(), "data");
  assert.equal(wav.readUInt32LE(40), pcm.length);
  assert.equal(wav.readUInt32LE(24), 24000); // sample rate
  assert.equal(wav.readUInt16LE(22), 1); // mono
  assert.equal(wav.readUInt16LE(34), 16); // bits per sample
  assert.deepEqual(wav.subarray(44), pcm);
});
