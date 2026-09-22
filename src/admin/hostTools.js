import * as db from "../services/db.js";
import { spinWheel, resetLikeathon, startPointsDrop } from "../services/donationTools.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

function baseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function wheelConfigToText(config) {
  return (config || []).map((o) => `${o.label},${o.weight}`).join("\n");
}

function parseWheelConfigText(text) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.lastIndexOf(",");
      if (idx === -1) return null;
      const label = line.slice(0, idx).trim();
      const weight = Number(line.slice(idx + 1).trim());
      return label && Number.isFinite(weight) && weight > 0 ? { label, weight } : null;
    })
    .filter(Boolean);
}

export async function handleHostToolsPage(req, res, notice) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const commandsConfig = { help: "!help", score: "!score", send: "!send", get: "!get", spin: "!spin", play: "!play", ...(settings.chat_commands_config || {}) };
  const eventApiUrl = `${baseUrl(req)}/event-api/${settings.overlay_token}/trigger`;

  const body = `
    <div class="topbar"><div><h1>Tools</h1><p>Perintah chat, Wheel of Fortune, Likeathon, Points Drop, dan Event API.</p></div></div>
    ${notice ? `<p class="hint" style="color:var(--success)">${escapeHtml(notice)}</p>` : ""}
    ${!settings.tiktok_url ? `<p class="hint" style="color:var(--warning)">Perintah chat &amp; Likeathon butuh username TikTok — isi dulu di halaman <a href="/host/${identifier}/tampilan" style="color:inherit">Tampilan</a>.</p>` : ""}

    <form class="panel" method="post" action="/host/${identifier}/tools/perintah">
      <h2>Perintah Chat</h2>
      <p class="hint">Karena TikTok gak nyediain cara buat bot balas langsung di chat live, hasil perintah ditampilin di widget "Command Response" (bukan di chat TikTok-nya sendiri).</p>
      <label class="checkbox-row"><input type="checkbox" name="commandsEnabled" ${settings.chat_commands_enabled ? "checked" : ""} /> Aktifin perintah chat</label>
      <div class="grid grid-2">
        <div><label for="cmdHelp">Bantuan</label><input id="cmdHelp" type="text" name="cmdHelp" value="${escapeHtml(commandsConfig.help)}" /></div>
        <div><label for="cmdScore">Cek poin</label><input id="cmdScore" type="text" name="cmdScore" value="${escapeHtml(commandsConfig.score)}" /></div>
        <div><label for="cmdSend">Kirim poin</label><input id="cmdSend" type="text" name="cmdSend" value="${escapeHtml(commandsConfig.send)}" /></div>
        <div><label for="cmdGet">Klaim Points Drop</label><input id="cmdGet" type="text" name="cmdGet" value="${escapeHtml(commandsConfig.get)}" /></div>
        <div><label for="cmdSpin">Putar Wheel</label><input id="cmdSpin" type="text" name="cmdSpin" value="${escapeHtml(commandsConfig.spin)}" /></div>
        <div><label for="cmdPlay">Request lagu</label><input id="cmdPlay" type="text" name="cmdPlay" value="${escapeHtml(commandsConfig.play)}" /></div>
      </div>
      <p class="hint">Perintah "${escapeHtml(commandsConfig.play)}" nyambung ke player musik Discord bot ini (Lavalink) — bot musiknya harus udah gabung voice channel dulu.</p>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Link widget Command Response</h2>
      <div class="widget-card">
        <h3>Command Response</h3>
        <div class="widget-url-row">
          <input class="url-box" type="text" readonly value="${escapeHtml(`${baseUrl(req)}/overlay/${settings.overlay_token}/commands`)}" onclick="this.select()" />
        </div>
      </div>
    </div>

    <form class="panel" method="post" action="/host/${identifier}/tools/wheel" style="margin-top:1.25rem">
      <h2>Wheel of Fortune</h2>
      <label for="wheelConfig">Daftar hadiah (satu baris satu hadiah, format: <code>Nama,bobot</code>)</label>
      <textarea id="wheelConfig" name="wheelConfig" rows="5" placeholder="Rp5.000,10&#10;Rp10.000,5&#10;Bonus 50 Poin,1">${escapeHtml(wheelConfigToText(settings.wheel_config))}</textarea>
      <p class="hint">Bobot lebih besar = makin sering kepilih. Dipicu lewat perintah chat "${escapeHtml(commandsConfig.spin)}" atau tombol di bawah.</p>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan daftar hadiah</button>
    </form>
    <div class="panel" style="margin-top:1.25rem">
      <div class="widget-card">
        <h3>Wheel of Fortune</h3>
        <div class="widget-url-row">
          <input class="url-box" type="text" readonly value="${escapeHtml(`${baseUrl(req)}/overlay/${settings.overlay_token}/wheel`)}" onclick="this.select()" />
          <form method="post" action="/host/${identifier}/tools/wheel/spin" style="display:inline">
            <button type="submit" class="widget-btn">Putar sekarang</button>
          </form>
        </div>
      </div>
    </div>

    <form class="panel" method="post" action="/host/${identifier}/tools/likeathon" style="margin-top:1.25rem">
      <h2>Likeathon</h2>
      <p class="hint">Ranking like real-time. Aktifin pengurangan otomatis biar posisi teratas harus terus dipertahankan.</p>
      <label class="checkbox-row"><input type="checkbox" name="reductionEnabled" ${settings.likeathon_reduction_enabled ? "checked" : ""} /> Aktifin pengurangan otomatis</label>
      <label for="reductionPercent">Kurangi (%) tiap 10 detik</label>
      <input id="reductionPercent" type="number" min="1" max="100" name="reductionPercent" value="${settings.likeathon_reduction_percent}" />
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>
    <div class="panel" style="margin-top:1.25rem">
      <div class="widget-card">
        <h3>Likeathon</h3>
        <div class="widget-url-row">
          <input class="url-box" type="text" readonly value="${escapeHtml(`${baseUrl(req)}/overlay/${settings.overlay_token}/likeathon`)}" onclick="this.select()" />
          <form method="post" action="/host/${identifier}/tools/likeathon/reset" style="display:inline">
            <button type="submit" class="widget-btn">Reset ranking</button>
          </form>
        </div>
      </div>
    </div>

    <form class="panel" method="post" action="/host/${identifier}/tools/points-drop" style="margin-top:1.25rem">
      <h2>Points Drop</h2>
      <p class="hint">Buka jendela waktu di mana viewer bisa klaim bonus poin lewat perintah "${escapeHtml(commandsConfig.get)}".</p>
      <div class="grid grid-2">
        <div><label for="dropBonus">Bonus poin</label><input id="dropBonus" type="number" min="1" name="dropBonus" value="${settings.points_drop_bonus}" /></div>
        <div><label for="dropDuration">Durasi (detik)</label><input id="dropDuration" type="number" min="5" name="dropDuration" value="${settings.points_drop_duration_seconds}" /></div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>
    <div class="panel" style="margin-top:1.25rem">
      <form method="post" action="/host/${identifier}/tools/points-drop/trigger">
        <button type="submit" class="btn btn-primary">Mulai Points Drop sekarang</button>
      </form>
    </div>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Event API</h2>
      <p class="hint">Webhook buat trigger Aksi/Sound Alert dari luar (mis. tombol Stream Deck kustom). Kirim POST JSON <code>{"type":"gift","payload":{"giftName":"Rose"}}</code> dengan header <code>x-api-key</code>.</p>
      <div class="widget-card">
        <div class="widget-url-row">
          <input class="url-box" type="text" readonly value="${escapeHtml(eventApiUrl)}" onclick="this.select()" />
        </div>
        <div class="widget-url-row" style="margin-top:.6rem">
          <input class="url-box" type="text" readonly value="${escapeHtml(settings.event_api_key || "")}" onclick="this.select()" />
          <form method="post" action="/host/${identifier}/tools/event-api/regenerate" style="display:inline">
            <button type="submit" class="widget-btn">Buat ulang key</button>
          </form>
        </div>
      </div>
    </div>`;

  res.send(hostLayout(body, { active: "tools", identifier, title: settings.display_name, avatarUrl: settings.avatar_data ? `/${identifier}/avatar` : null }));
}

export async function handleHostToolsCommandsUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    chat_commands_enabled: req.body.commandsEnabled === "on",
    chat_commands_config: {
      help: req.body.cmdHelp?.trim() || "!help",
      score: req.body.cmdScore?.trim() || "!score",
      send: req.body.cmdSend?.trim() || "!send",
      get: req.body.cmdGet?.trim() || "!get",
      spin: req.body.cmdSpin?.trim() || "!spin",
      play: req.body.cmdPlay?.trim() || "!play",
    },
  });
  res.redirect(`/host/${req.params.identifier}/tools`);
}

export async function handleHostToolsWheelUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, { wheel_config: parseWheelConfigText(req.body.wheelConfig) });
  res.redirect(`/host/${req.params.identifier}/tools`);
}

export async function handleHostToolsWheelSpin(req, res) {
  const settings = req.donationSettings;
  spinWheel(settings.overlay_token, settings.wheel_config);
  res.redirect(`/host/${req.params.identifier}/tools`);
}

export async function handleHostToolsLikeathonUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    likeathon_reduction_enabled: req.body.reductionEnabled === "on",
    likeathon_reduction_percent: Number(req.body.reductionPercent) || 10,
  });
  res.redirect(`/host/${req.params.identifier}/tools`);
}

export async function handleHostToolsLikeathonReset(req, res) {
  const settings = req.donationSettings;
  resetLikeathon(settings.overlay_token);
  res.redirect(`/host/${req.params.identifier}/tools`);
}

export async function handleHostToolsPointsDropUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    points_drop_bonus: Number(req.body.dropBonus) || 50,
    points_drop_duration_seconds: Number(req.body.dropDuration) || 30,
  });
  res.redirect(`/host/${req.params.identifier}/tools`);
}

export async function handleHostToolsPointsDropTrigger(req, res) {
  const settings = req.donationSettings;
  startPointsDrop(settings.overlay_token, settings.points_drop_bonus, settings.points_drop_duration_seconds);
  res.redirect(`/host/${req.params.identifier}/tools`);
}

export async function handleHostToolsEventApiRegenerate(req, res) {
  const settings = req.donationSettings;
  await db.regenerateEventApiKey(settings.guild_id);
  res.redirect(`/host/${req.params.identifier}/tools`);
}
