import express from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { Pool } from "pg";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { env } from "../config/env.js";
import { logInfo, logWarn } from "../services/logger.js";
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
  handleWishlistAdd,
  handleWishlistDelete,
  handleAvatarUpload,
  handleAvatarDelete,
  handleHostCredentialsUpdate,
} from "./donations.js";
import {
  handleDonatePage,
  handleDonateCreate,
  handleDonateStatus,
  handleDonateAvatar,
  handleDonateSupporters,
  handleOverlayPage,
  handleOverlayEvents,
  handleOverlayAudio,
  handleOverlayAvatar,
  handleLeaderboardPage,
  handleLeaderboardData,
  handleWishlistPage,
  handleWishlistData,
  handleVideoPage,
  handleChatPage,
  handleGiftPage,
  handleLiveEvents,
  handleLikesPage,
  handleFollowersPage,
  handleJarPage,
} from "./donatePublic.js";
import { requireHostAuth, handleHostLoginPage, handleHostLogin, handleHostLogout } from "./hostAuth.js";
import {
  handleHostHomePage,
  handleHostWishlistPage,
  handleHostWishlistAdd,
  handleHostWishlistDelete,
  handleHostMessagesPage,
  handleHostAppearancePage,
  handleHostAppearanceUpdate,
  handleHostAvatarUpload,
  handleHostAvatarDelete,
  handleHostSettingsPage,
  handleHostSettingsUpdate,
  handleHostRegenerateToken,
  handleHostPasswordUpdate,
  handleHostReplayDonation,
  handleHostTiktokFollowers,
  handleHostTestLiveEvent,
} from "./hostDashboard.js";

const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const __dirname = dirname(fileURLToPath(import.meta.url));

export function startAdminServer() {
  const app = express();
  // Railway sits in front as a reverse proxy — trust its X-Forwarded-* headers
  // so req.protocol/req.get("host") reflect the public https:// URL, used to
  // build shareable patungan/overlay links.
  app.set("trust proxy", 1);
  app.use(express.urlencoded({ extended: false }));
  app.use("/overlay/assets", express.static(join(__dirname, "assets")));

  // Postgres-backed session store so admin/host logins survive a process
  // restart (redeploy, crash, dev reload) instead of the default in-memory
  // store, which silently drops every logged-in session when the process dies.
  let sessionStore;
  if (env.supabaseDbUrl) {
    const PgSessionStore = pgSession(session);
    sessionStore = new PgSessionStore({
      pool: new Pool({ connectionString: env.supabaseDbUrl }),
      tableName: "session",
      createTableIfMissing: true,
    });
  } else {
    logWarn("SUPABASE_DB_URL not set — falling back to in-memory sessions, which won't survive a restart.");
  }

  app.use(
    session({
      store: sessionStore,
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
  // Wrapped (not passed directly) because Express always invokes route handlers
  // with a 3rd "next" argument, and handleDonationSettingsPage's 3rd param is
  // an optional error *message*, so passing it directly leaked Express's own
  // next() function into that param, which then got rendered as its source.
  app.get("/guilds/:guildId/donations", requireAuth, (req, res) => handleDonationSettingsPage(req, res));
  app.post("/guilds/:guildId/donations", requireAuth, handleDonationSettingsUpdate);
  app.post("/guilds/:guildId/donations/regenerate-token", requireAuth, handleRegenerateOverlayToken);
  app.post("/guilds/:guildId/donations/test-alert", requireAuth, handleTestAlert);
  app.post("/guilds/:guildId/donations/replay/:trxId", requireAuth, handleReplayDonation);
  app.post("/guilds/:guildId/donations/wishlist", requireAuth, handleWishlistAdd);
  app.post("/guilds/:guildId/donations/wishlist/:id/delete", requireAuth, handleWishlistDelete);
  app.post("/guilds/:guildId/donations/avatar", requireAuth, avatarUpload.single("avatar"), handleAvatarUpload);
  app.post("/guilds/:guildId/donations/avatar/delete", requireAuth, handleAvatarDelete);
  app.post("/guilds/:guildId/donations/host-credentials", requireAuth, handleHostCredentialsUpdate);

  // Public — no auth. OBS/TikTok Live Studio overlay sources.
  app.get("/overlay/:token", handleOverlayPage);
  app.get("/overlay/:token/events", handleOverlayEvents);
  app.get("/overlay/audio/:id", handleOverlayAudio);
  app.get("/overlay/:token/avatar", handleOverlayAvatar);
  app.get("/overlay/:token/leaderboard", handleLeaderboardPage);
  app.get("/overlay/:token/leaderboard/data", handleLeaderboardData);
  app.get("/overlay/:token/wishlist", handleWishlistPage);
  app.get("/overlay/:token/wishlist/data", handleWishlistData);
  app.get("/overlay/:token/video", handleVideoPage);
  // Real TikTok LIVE chat/gift widgets — separate from the donation SSE hub above
  // (handleOverlayEvents) so opening the alert/leaderboard/wishlist/video widgets
  // never opens a live TikTok connection; only these two do, and only on demand.
  app.get("/overlay/:token/chat", handleChatPage);
  app.get("/overlay/:token/gift", handleGiftPage);
  app.get("/overlay/:token/likes", handleLikesPage);
  app.get("/overlay/:token/followers", handleFollowersPage);
  app.get("/overlay/:token/jar", handleJarPage);
  app.get("/overlay/:token/live-events", handleLiveEvents);

  // Self-service host dashboard — separate login from the bot-owner admin panel above,
  // scoped per guild via username/password set by the admin on the Patungan settings page.
  // Wrapped for the same reason as handleDonationSettingsPage above — Express
  // always passes a 3rd "next" argument, which would otherwise leak into
  // handleHostLoginPage's optional error-message param and get rendered as
  // next()'s own source code in the error box.
  app.get("/host/:identifier/login", (req, res) => handleHostLoginPage(req, res));
  app.post("/host/:identifier/login", handleHostLogin);
  app.post("/host/:identifier/logout", handleHostLogout);
  app.get("/host/:identifier", requireHostAuth, handleHostHomePage);
  app.get("/host/:identifier/tiktok-followers", requireHostAuth, handleHostTiktokFollowers);
  app.get("/host/:identifier/wishlist", requireHostAuth, (req, res) => handleHostWishlistPage(req, res));
  app.post("/host/:identifier/wishlist", requireHostAuth, handleHostWishlistAdd);
  app.post("/host/:identifier/wishlist/:id/delete", requireHostAuth, handleHostWishlistDelete);
  app.get("/host/:identifier/pesan", requireHostAuth, handleHostMessagesPage);
  app.post("/host/:identifier/replay/:trxId", requireHostAuth, handleHostReplayDonation);
  app.post("/host/:identifier/pengaturan/test-live-event", requireHostAuth, handleHostTestLiveEvent);
  app.get("/host/:identifier/tampilan", requireHostAuth, (req, res) => handleHostAppearancePage(req, res));
  app.post("/host/:identifier/tampilan", requireHostAuth, handleHostAppearanceUpdate);
  app.post("/host/:identifier/tampilan/avatar", requireHostAuth, avatarUpload.single("avatar"), handleHostAvatarUpload);
  app.post("/host/:identifier/tampilan/avatar/delete", requireHostAuth, handleHostAvatarDelete);
  app.get("/host/:identifier/pengaturan", requireHostAuth, (req, res) => handleHostSettingsPage(req, res));
  app.post("/host/:identifier/pengaturan", requireHostAuth, handleHostSettingsUpdate);
  app.post("/host/:identifier/pengaturan/regenerate-token", requireHostAuth, handleHostRegenerateToken);
  app.post("/host/:identifier/pengaturan/password", requireHostAuth, handleHostPasswordUpdate);

  // Public — no auth. Donor-facing checkout, at the domain root (patungan.my.id/:identifier)
  // now that the domain itself carries the "patungan" name — registered last so every
  // reserved word above (login, guilds, settings, scan-operators, overlay, status) always
  // wins first; :identifier is either a custom slug or a raw guild ID (see
  // db.getDonationSettingsByIdentifier, and RESERVED_SLUGS in admin/donations.js).
  app.get("/status/:trxId", handleDonateStatus);
  app.get("/:identifier/avatar", handleDonateAvatar);
  app.get("/:identifier/supporters", handleDonateSupporters);
  app.get("/:identifier", handleDonatePage);
  app.post("/:identifier", handleDonateCreate);

  app.listen(env.adminPort, () => {
    logInfo(`Admin dashboard listening on port ${env.adminPort}`);
  });
}
