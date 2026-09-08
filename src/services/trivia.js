import { resolveAiConfig, chatCompletion } from "./geminiClient.js";
import { logError } from "./logger.js";

export const OPTION_LABELS = ["A", "B", "C", "D"];
export const TRIVIA_TIMEOUT_MS = 60_000;

// One active round per channel at a time.
const active = new Map(); // channelId -> { question, options, correctIndex, timeout }

export function getActiveTrivia(channelId) {
  return active.get(channelId) || null;
}

export function setActiveTrivia(channelId, state) {
  active.set(channelId, state);
}

export function clearActiveTrivia(channelId) {
  const state = active.get(channelId);
  if (state?.timeout) clearTimeout(state.timeout);
  active.delete(channelId);
}

/** Parses the AI's trivia response, tolerating markdown code fences. Returns null if malformed. */
export function parseTriviaResponse(raw) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (
    typeof data.question !== "string" ||
    !Array.isArray(data.options) ||
    data.options.length !== 4 ||
    !data.options.every((o) => typeof o === "string") ||
    !Number.isInteger(data.correctIndex) ||
    data.correctIndex < 0 ||
    data.correctIndex > 3
  ) {
    return null;
  }

  return { question: data.question, options: data.options, correctIndex: data.correctIndex };
}

const TRIVIA_PROMPT =
  'Generate one multiple-choice trivia question. Respond with ONLY raw JSON, no markdown, in the exact shape: {"question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0}. correctIndex is the 0-based index of the correct option in the options array.';

export async function generateTriviaQuestion() {
  const { model, baseUrl, apiKey } = await resolveAiConfig();
  const raw = await chatCompletion({
    baseUrl,
    apiKey,
    model,
    messages: [{ role: "user", content: TRIVIA_PROMPT }],
  });
  const parsed = parseTriviaResponse(raw);
  if (!parsed) throw new Error("AI returned an unparseable trivia question");
  return parsed;
}

/** Handles a click on a trivia_answer:<index> button. */
export async function handleTriviaAnswer(interaction) {
  const state = getActiveTrivia(interaction.channelId);
  if (!state) {
    await interaction.reply({ content: "This trivia round has ended.", ephemeral: true });
    return;
  }

  const chosenIndex = Number(interaction.customId.split(":")[1]);

  if (chosenIndex === state.correctIndex) {
    clearActiveTrivia(interaction.channelId);
    try {
      await interaction.update({
        content: `🎉 ${interaction.user} got it right! The answer was **${OPTION_LABELS[state.correctIndex]}. ${state.options[state.correctIndex]}**.`,
        components: [],
      });
    } catch (err) {
      logError("trivia answer update failed:", err);
    }
    return;
  }

  await interaction.reply({ content: "❌ Wrong answer, try again!", ephemeral: true });
}
