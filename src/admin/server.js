import express from "express";
import session from "express-session";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { env } from "../config/env.js";
import { logInfo } from "../services/logger.js";
import { requireAuth, handleLoginPage, handleLogin, handleLogout } from "./auth.js";
import { handleGuildsPage } from "./guilds.js";
import { handleSettingsPage, handleSettingsUpdate } from "./settings.js";
import { handleAllowlistPage, handleAllowlistUpdate } from "./allowlist.js";
import { handleFeaturesPage, handleFeaturesUpdate } from "./features.js";
import { handleKnowledgePage, handleKnowledgeAdd, handleKnowledgeDelete } from "./knowledge.js";
import { handleConversationsPage, handleConversationDetailPage } from "./conversations.js";
import { handleScanOperatorsPage, handleScanOperatorsAdd, handleScanOperatorsDelete } from "./scanOperators.js";
import {
  handleDonationSettingsPage,
  handleDonationSettingsUpdate,
  handleRegenerateOverlayToken,
  handleTestAlert,
  handleReplayDonation,
} from "./donations.js";
import {
  handleDonatePage,
  handleDonateCreate,
  handleDonateStatus,
  handleOverlayPage,
  handleOverlayEvents,
  handleLeaderboardPage,
  handleLeaderboardData,
} from "./donatePublic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function startAdminServer() {
  const app = express();
  // Railway sits in front as a reverse proxy — trust its X-Forwarded-* headers
  // so req.protocol/req.get("host") reflect the public https:// URL, used to
  // build shareable donate/overlay links.
  app.set("trust proxy", 1);
  app.use(express.urlencoded({ extended: false }));
  app.use("/overlay/assets", express.static(join(__dirname, "assets")));
  app.use(
    session({
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 1000 * 60 * 60 * 8 },
    })
  );

  app.get("/login", handleLoginPage);
  app.post("/login", handleLogin);
  app.post("/logout", handleLogout);

  app.get("/", requireAuth, (req, res) => res.redirect("/guilds"));
  app.get("/guilds", requireAuth, handleGuildsPage);
  app.get("/settings", requireAuth, handleSettingsPage);
  app.post("/settings", requireAuth, handleSettingsUpdate);
  app.get("/guilds/:guildId/allowlist", requireAuth, handleAllowlistPage);
  app.post("/guilds/:guildId/allowlist", requireAuth, handleAllowlistUpdate);
  app.get("/guilds/:guildId/features", requireAuth, handleFeaturesPage);
  app.post("/guilds/:guildId/features", requireAuth, handleFeaturesUpdate);
  app.get("/guilds/:guildId/knowledge", requireAuth, handleKnowledgePage);
  app.post("/guilds/:guildId/knowledge", requireAuth, handleKnowledgeAdd);
  app.post("/guilds/:guildId/knowledge/:id/delete", requireAuth, handleKnowledgeDelete);
  app.get("/guilds/:guildId/conversations", requireAuth, handleConversationsPage);
  app.get("/guilds/:guildId/conversations/:channelId", requireAuth, handleConversationDetailPage);
  app.get("/scan-operators", requireAuth, handleScanOperatorsPage);
  app.post("/scan-operators", requireAuth, handleScanOperatorsAdd);
  app.post("/scan-operators/:discordUserId/delete", requireAuth, handleScanOperatorsDelete);
  app.get("/guilds/:guildId/donations", requireAuth, handleDonationSettingsPage);
  app.post("/guilds/:guildId/donations", requireAuth, handleDonationSettingsUpdate);
  app.post("/guilds/:guildId/donations/regenerate-token", requireAuth, handleRegenerateOverlayToken);
  app.post("/guilds/:guildId/donations/test-alert", requireAuth, handleTestAlert);
  app.post("/guilds/:guildId/donations/replay/:trxId", requireAuth, handleReplayDonation);

  // Public — no auth. Donor-facing checkout + OBS/TikTok Live Studio overlay sources.
  // :identifier is either a custom slug or a raw guild ID (see db.getDonationSettingsByIdentifier).
  app.get("/donate/:identifier", handleDonatePage);
  app.post("/donate/:identifier", handleDonateCreate);
  app.get("/donate/status/:trxId", handleDonateStatus);
  app.get("/overlay/:token", handleOverlayPage);
  app.get("/overlay/:token/events", handleOverlayEvents);
  app.get("/overlay/:token/leaderboard", handleLeaderboardPage);
  app.get("/overlay/:token/leaderboard/data", handleLeaderboardData);

  app.listen(env.adminPort, () => {
    logInfo(`Admin dashboard listening on port ${env.adminPort}`);
  });
}
