import * as db from "../services/db.js";
import { broadcast } from "../services/donationOverlay.js";
import { SOUND_LIBRARY } from "../services/soundLibrary.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

const TRIGGERS = [
  { key: "gift", label: "Ada gift masuk" },
  { key: "follow", label: "Ada follower baru" },
  { key: "share", label: "Ada yang share live kamu" },
];

export async function handleHostSoundAlertsPage(req, res, notice) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const map = settings.sound_alert_map || {};

  const body = `
    <div class="topbar"><div><h1>Efek Suara</h1><p>Bunyi otomatis di widget "Sound Alert" tiap ada trigger tertentu selama live TikTok kamu.</p></div></div>
    ${notice ? `<p class="hint" style="color:var(--success)">${escapeHtml(notice)}</p>` : ""}
    ${!settings.tiktok_url ? `<p class="hint" style="color:var(--warning)">Butuh username TikTok — isi dulu di halaman <a href="/host/${identifier}/tampilan" style="color:inherit">Tampilan</a>.</p>` : ""}

    <form class="panel" method="post" action="/host/${identifier}/suara/volume">
      <h2>Volume media</h2>
      <p class="hint">Ngatur volume Sound Alert &amp; media Aksi &amp; Event — langsung ngaruh ke widget yang lagi kebuka di OBS, gak perlu reload.</p>
      <input type="range" name="volume" min="0" max="100" value="${settings.media_volume ?? 100}" style="width:100%"
        oninput="document.getElementById('volumeLabel').textContent = this.value + '%'" />
      <div class="hint" id="volumeLabel" style="text-align:right;font-weight:700;color:var(--ink)">${settings.media_volume ?? 100}%</div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Terapkan</button>
    </form>

    <form class="panel" method="post" action="/host/${identifier}/suara" style="margin-top:1.25rem">
      <h2>Trigger</h2>
      ${TRIGGERS.map((t) => {
        const cfg = map[t.key] || {};
        return `<div style="padding:.85rem 0;border-top:1px solid var(--rule)">
          <label class="checkbox-row" style="margin-top:0"><input type="checkbox" name="${t.key}Enabled" ${cfg.enabled ? "checked" : ""} /> ${t.label}</label>
          <label for="${t.key}Sound">Suara</label>
          <div style="display:flex;gap:.5rem;align-items:center">
            <select id="${t.key}Sound" name="${t.key}Sound" style="flex:1">
              ${SOUND_LIBRARY.map((s) => `<option value="${escapeHtml(s.url)}" ${(cfg.soundUrl || SOUND_LIBRARY[0].url) === s.url ? "selected" : ""}>${escapeHtml(s.label)}</option>`).join("")}
            </select>
            <button type="button" class="btn btn-sm" onclick="new Audio(document.getElementById('${t.key}Sound').value).play()">▶ Coba</button>
          </div>
        </div>`;
      }).join("")}
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Link widget</h2>
      <p class="hint">Tambahin sebagai Browser Source terpisah di OBS/TikTok Live Studio — gak nampilin apa-apa secara visual, cuma mainin suara.</p>
      <div class="widget-card">
        <h3>Sound Alert</h3>
        <div class="widget-url-row">
          <input class="url-box" type="text" readonly value="${escapeHtml(`${req.protocol}://${req.get("host")}/overlay/${settings.overlay_token}/sound-alerts`)}" onclick="this.select()" />
        </div>
      </div>
    </div>`;

  res.send(hostLayout(body, { active: "suara", identifier, settings }));
}

export async function handleHostVolumeUpdate(req, res) {
  const settings = req.donationSettings;
  const volume = Math.min(100, Math.max(0, Number(req.body.volume) || 0));
  await db.updateDonationSettings(settings.guild_id, { media_volume: volume });
  broadcast(settings.overlay_token, "volume-change", { volume });
  res.redirect(`/host/${req.params.identifier}/suara`);
}

export async function handleHostSoundAlertsUpdate(req, res) {
  const settings = req.donationSettings;
  const map = {};
  for (const t of TRIGGERS) {
    map[t.key] = {
      enabled: req.body[`${t.key}Enabled`] === "on",
      soundUrl: req.body[`${t.key}Sound`]?.trim() || null,
    };
  }
  await db.updateDonationSettings(settings.guild_id, { sound_alert_map: map });
  res.redirect(`/host/${req.params.identifier}/suara`);
}
