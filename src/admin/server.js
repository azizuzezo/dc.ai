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
  handleSharePage,
  handleJarPage,
  handlePointsLeaderboardPage,
  handlePointsLeaderboardData,
  handleSoundAlertPage,
  handleActionsScreenPage,
  handleWheelPage,
  handleLikeathonPage,
  handleCommandResponsePage,
  handlePointsDropPage,
  handleLinkPreviewPage,
  handleMediaServe,
} from "./donatePublic.js";
import { requireHostAuth, handleHostLoginPage, handleHostLogin, handleHostLogout } from "./hostAuth.js";
import {
  handleHostHomePage,
  handleHostWishlistPage,
  handleHostWishlistAdd,
  handleHostWishlistEdit,
  handleHostWishlistDelete,
  handleHostMessagesPage,
  handleHostAppearancePage,
  handleHostAppearanceUpdate,
  handleHostAvatarUpload,
  handleHostAvatarDelete,
  handleHostSettingsPage,
  handleHostSettingsUpdate,
  handleHostThemeUpdate,
  handleHostRegenerateToken,
  handleHostPasswordUpdate,
  handleHostReplayDonation,
  handleHostTiktokFollowers,
  handleHostTestLiveEvent,
} from "./hostDashboard.js";
import { handleHostPointsPage, handleHostPointsSettingsUpdate, handleHostPointsAdjust, handleHostPointsHalving } from "./hostPoints.js";
import { handleHostSoundAlertsPage, handleHostSoundAlertsUpdate, handleHostVolumeUpdate } from "./hostSoundAlerts.js";
import { handleHostModerationPage, handleHostModerationUpdate } from "./hostModeration.js";
import { handleHostWidgetHubPage } from "./hostWidgetHub.js";
import {
  handleHostAlertAppearancePage,
  handleHostChatBubbleUpdate,
  handleHostAlertTierAdd,
  handleHostAlertTierDelete,
  handleHostAlertTierSimulate,
} from "./hostAlertAppearance.js";
import {
  handleHostToolsPage,
  handleHostToolsCommandsUpdate,
  handleHostToolsWheelUpdate,
  handleHostToolsWheelSpin,
  handleHostToolsLikeathonUpdate,
  handleHostToolsLikeathonReset,
  handleHostToolsPointsDropUpdate,
  handleHostToolsPointsDropTrigger,
  handleHostToolsEventApiRegenerate,
} from "./hostTools.js";
import {
  handleHostActionsPage,
  handleHostActionAdd,
  handleHostActionDelete,
  handleHostEventAdd,
  handleHostEventDelete,
  handleHostTimerAdd,
  handleHostTimerDelete,
  handleHostActionsSimulate,
  handleHostMediaUpload,
  handleHostMediaDelete,
} from "./hostActions.js";
import { handleEventApiTrigger } from "./eventApi.js";

const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const mediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const __dirname = dirname(fileURLToPath(import.meta.url));

export function startAdminServer() {
  const app = express();

  // Express 4 doesn't catch a rejected promise returned by an async route
  // handler — it becomes an unhandled rejection, and Node 22 terminates the
  // whole process on those by default. That took the entire bot (not just
  // the admin dashboard) down whenever a single request hit a DB error, e.g.
  // deleting a wishlist item still referenced by a donation. Wrapping every
  // get/post handler here forwards that rejection to Express's error handler
  // (a 500 response) instead of crashing the process.
  for (const method of ["get", "post"]) {
    const original = app[method].bind(app);
    app[method] = (path, ...handlers) =>
      original(
        path,
        ...handlers.map((h) =>
          typeof h !== "function"
            ? h
            : (req, res, next) => {
                try {
                  Promise.resolve(h(req, res, next)).catch(next);
                } catch (err) {
                  next(err);
                }
              }
        )
      );
  }

  // Railway sits in front as a reverse proxy — trust its X-Forwarded-* headers
  // so req.protocol/req.get("host") reflect the public https:// URL, used to
  // build shareable patungan/overlay links.
  app.set("trust proxy", 1);
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
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
  app.get("/overlay/:token/share", handleSharePage);
  app.get("/overlay/:token/jar", handleJarPage);
  app.get("/overlay/:token/live-events", handleLiveEvents);
  // TikFinity-style feature widgets — Points, Sound Alerts, Actions & Events,
  // Wheel of Fortune, Likeathon, Command Response, Points Drop.
  app.get("/overlay/:token/points-leaderboard", handlePointsLeaderboardPage);
  app.get("/overlay/:token/points-leaderboard/data", handlePointsLeaderboardData);
  app.get("/overlay/:token/sound-alerts", handleSoundAlertPage);
  app.get("/overlay/:token/actions", handleActionsScreenPage);
  app.get("/overlay/:token/wheel", handleWheelPage);
  app.get("/overlay/:token/likeathon", handleLikeathonPage);
  app.get("/overlay/:token/commands", handleCommandResponsePage);
  app.get("/overlay/:token/points-drop", handlePointsDropPage);
  app.get("/overlay/:token/link-preview", handleLinkPreviewPage);
  app.get("/overlay/:token/media/:id", handleMediaServe);
  app.post("/event-api/:token/trigger", handleEventApiTrigger);

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
  app.get("/host/:identifier/widget", requireHostAuth, handleHostWidgetHubPage);
  app.get("/host/:identifier/tiktok-followers", requireHostAuth, handleHostTiktokFollowers);
  app.get("/host/:identifier/wishlist", requireHostAuth, (req, res) => handleHostWishlistPage(req, res));
  app.post("/host/:identifier/wishlist", requireHostAuth, handleHostWishlistAdd);
  app.post("/host/:identifier/wishlist/:id/edit", requireHostAuth, handleHostWishlistEdit);
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
  app.post("/host/:identifier/pengaturan/tema", requireHostAuth, handleHostThemeUpdate);
  app.post("/host/:identifier/pengaturan/regenerate-token", requireHostAuth, handleHostRegenerateToken);
  app.post("/host/:identifier/pengaturan/password", requireHostAuth, handleHostPasswordUpdate);

  app.get("/host/:identifier/poin", requireHostAuth, (req, res) => handleHostPointsPage(req, res));
  app.post("/host/:identifier/poin/pengaturan", requireHostAuth, handleHostPointsSettingsUpdate);
  app.post("/host/:identifier/poin/adjust", requireHostAuth, handleHostPointsAdjust);
  app.post("/host/:identifier/poin/halving", requireHostAuth, handleHostPointsHalving);

  app.get("/host/:identifier/suara", requireHostAuth, (req, res) => handleHostSoundAlertsPage(req, res));
  app.post("/host/:identifier/suara", requireHostAuth, handleHostSoundAlertsUpdate);
  app.post("/host/:identifier/suara/volume", requireHostAuth, handleHostVolumeUpdate);

  app.get("/host/:identifier/tools", requireHostAuth, (req, res) => handleHostToolsPage(req, res));
  app.post("/host/:identifier/tools/perintah", requireHostAuth, handleHostToolsCommandsUpdate);
  app.post("/host/:identifier/tools/wheel", requireHostAuth, handleHostToolsWheelUpdate);
  app.post("/host/:identifier/tools/wheel/spin", requireHostAuth, handleHostToolsWheelSpin);
  app.post("/host/:identifier/tools/likeathon", requireHostAuth, handleHostToolsLikeathonUpdate);
  app.post("/host/:identifier/tools/likeathon/reset", requireHostAuth, handleHostToolsLikeathonReset);
  app.post("/host/:identifier/tools/points-drop", requireHostAuth, handleHostToolsPointsDropUpdate);
  app.post("/host/:identifier/tools/points-drop/trigger", requireHostAuth, handleHostToolsPointsDropTrigger);
  app.post("/host/:identifier/tools/event-api/regenerate", requireHostAuth, handleHostToolsEventApiRegenerate);

  app.get("/host/:identifier/aksi", requireHostAuth, (req, res) => handleHostActionsPage(req, res));
  app.post("/host/:identifier/aksi/actions", requireHostAuth, handleHostActionAdd);
  app.post("/host/:identifier/aksi/actions/:id/delete", requireHostAuth, handleHostActionDelete);
  app.post("/host/:identifier/aksi/events", requireHostAuth, handleHostEventAdd);
  app.post("/host/:identifier/aksi/events/:id/delete", requireHostAuth, handleHostEventDelete);
  app.post("/host/:identifier/aksi/timers", requireHostAuth, handleHostTimerAdd);
  app.post("/host/:identifier/aksi/timers/:id/delete", requireHostAuth, handleHostTimerDelete);
  app.post("/host/:identifier/aksi/simulate", requireHostAuth, handleHostActionsSimulate);
  app.post("/host/:identifier/aksi/media", requireHostAuth, mediaUpload.single("mediaFile"), handleHostMediaUpload);
  app.post("/host/:identifier/aksi/media/:id/delete", requireHostAuth, handleHostMediaDelete);

  app.get("/host/:identifier/moderasi", requireHostAuth, (req, res) => handleHostModerationPage(req, res));
  app.post("/host/:identifier/moderasi", requireHostAuth, handleHostModerationUpdate);

  app.get("/host/:identifier/tampilan-alert", requireHostAuth, (req, res) => handleHostAlertAppearancePage(req, res));
  app.post("/host/:identifier/tampilan-alert/chat-bubble", requireHostAuth, handleHostChatBubbleUpdate);
  app.post("/host/:identifier/tampilan-alert/tiers", requireHostAuth, mediaUpload.single("imageFile"), handleHostAlertTierAdd);
  app.post("/host/:identifier/tampilan-alert/tiers/:id/delete", requireHostAuth, handleHostAlertTierDelete);
  app.post("/host/:identifier/tampilan-alert/simulate-donation", requireHostAuth, handleHostAlertTierSimulate);

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
