import express from "express";
import session from "express-session";
import { env } from "../config/env.js";
import { logInfo } from "../services/logger.js";
import { requireAuth, handleLoginPage, handleLogin, handleLogout } from "./auth.js";
import { handleGuildsPage } from "./guilds.js";
import { handleSettingsPage, handleSettingsUpdate } from "./settings.js";
import { handleAllowlistPage, handleAllowlistUpdate } from "./allowlist.js";
import { handleFeaturesPage, handleFeaturesUpdate } from "./features.js";
import { handleKnowledgePage, handleKnowledgeAdd, handleKnowledgeDelete } from "./knowledge.js";
import { handleConversationsPage, handleConversationDetailPage } from "./conversations.js";

export function startAdminServer() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
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

  app.listen(env.adminPort, () => {
    logInfo(`Admin dashboard listening on port ${env.adminPort}`);
  });
}
