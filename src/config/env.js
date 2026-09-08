import "dotenv/config";

export const env = {
  discordToken: process.env.DISCORD_TOKEN,
  discordClientId: process.env.DISCORD_CLIENT_ID,

  aiBaseUrl: process.env.AI_BASE_URL,
  aiApiKey: process.env.AI_API_KEY,
  aiModel: process.env.AI_MODEL || "gemini-2.5-flash",

  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseDbUrl: process.env.SUPABASE_DB_URL,

  aiHistoryLimit: Number(process.env.AI_HISTORY_LIMIT) || 10,
  aiCooldownMs: Number(process.env.AI_COOLDOWN_MS) || 8000,
  floodLimit: Number(process.env.FLOOD_LIMIT) || 6,
  floodWindowMs: Number(process.env.FLOOD_WINDOW_MS) || 10000,

  adminUsername: process.env.ADMIN_USERNAME,
  adminPassword: process.env.ADMIN_PASSWORD,
  adminPort: Number(process.env.ADMIN_PORT) || 3001,
  sessionSecret: process.env.SESSION_SECRET || "dev-insecure-secret-change-me",

  ownerDiscordId: process.env.OWNER_DISCORD_ID,
  strixLlmModel: process.env.STRIX_LLM_MODEL,
  strixGeminiApiKey: process.env.STRIX_GEMINI_API_KEY,
  strixMaxBudgetUsd: Number(process.env.STRIX_MAX_BUDGET_USD) || 5,
  strixMaxTurns: Number(process.env.STRIX_MAX_TURNS) || 20,
  strixScanTimeoutMs: Number(process.env.STRIX_SCAN_TIMEOUT_MS) || 1200000,
};

export function assertRequiredEnv() {
  const missing = [];
  if (!env.discordToken) missing.push("DISCORD_TOKEN");
  if (!env.discordClientId) missing.push("DISCORD_CLIENT_ID");
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}
