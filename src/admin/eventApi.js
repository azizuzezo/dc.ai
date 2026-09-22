/** TikFinity-style "Event API" webhook — lets an external tool (a Stream Deck
 * plugin, a custom script, etc.) trigger the same Actions & Events / overlay
 * broadcasts a real TikTok LIVE event would, authenticated by a per-guild key
 * the host can regenerate from the Tools dashboard page. */

import * as db from "../services/db.js";
import { broadcast } from "../services/donationOverlay.js";
import { evaluateEvent } from "../services/actionsEngine.js";

const ALLOWED_TYPES = new Set(["gift", "follow", "share", "chat", "likes"]);

export async function handleEventApiTrigger(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).json({ error: "not_found" });

  const apiKey = req.get("x-api-key");
  if (!settings.event_api_key || apiKey !== settings.event_api_key) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { type, payload } = req.body || {};
  if (!ALLOWED_TYPES.has(type) || typeof payload !== "object" || !payload) {
    return res.status(400).json({ error: "invalid_request" });
  }

  broadcast(token, type, payload);
  await evaluateEvent(token, settings.guild_id, type, payload);
  res.status(204).end();
}
