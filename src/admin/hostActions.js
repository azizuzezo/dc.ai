import * as db from "../services/db.js";
import { broadcast } from "../services/donationOverlay.js";
import { evaluateEvent, invalidateGuildCache } from "../services/actionsEngine.js";
import { resolveGiftIconUrl, listGiftIcons } from "../services/giftIcons.js";
import { SOUND_LIBRARY } from "../services/soundLibrary.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

const TRIGGER_LABELS = {
  any_gift: "Gift apa aja",
  specific_gift: "Gift tertentu",
  follow: "Follow baru",
  share: "Share",
  like_milestone: "Milestone like",
  chat_keyword: "Kata kunci chat",
};

export async function handleHostActionsPage(req, res, notice) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const [actions, events, timers] = await Promise.all([
    db.listDonationActions(settings.guild_id),
    db.listDonationEvents(settings.guild_id),
    db.listDonationTimers(settings.guild_id),
  ]);
  const actionsById = new Map(actions.map((a) => [a.id, a]));
  const giftIcons = listGiftIcons();

  const body = `
    <div class="topbar"><div><h1>Aksi &amp; Event</h1><p>Bikin alert kustom: siapin media (gambar/gif/video/ikon gift) sebagai Aksi, lalu hubungin ke trigger (gift, follow, share, milestone like, kata kunci chat) sebagai Event.</p></div></div>
    ${notice ? `<p class="hint" style="color:var(--success)">${escapeHtml(notice)}</p>` : ""}
    ${!settings.tiktok_url ? `<p class="hint" style="color:var(--warning)">Fitur ini butuh username TikTok — isi dulu di halaman <a href="/host/${identifier}/tampilan" style="color:inherit">Tampilan</a>.</p>` : ""}

    <div class="panel">
      <h2>Aksi (${actions.length})</h2>
      ${
        actions.length
          ? actions
              .map(
                (a) => `<div class="widget-card">
          <h3>${escapeHtml(a.name)}</h3>
          <p class="hint" style="margin:-.4rem 0 .5rem">${escapeHtml(a.media_type)}${a.sound_url ? " + suara" : ""} · tampil ${a.duration_ms}ms</p>
          <form method="post" action="/host/${identifier}/aksi/actions/${a.id}/delete">
            <button type="submit" class="btn btn-danger btn-sm">Hapus</button>
          </form>
        </div>`
              )
              .join("")
          : `<p class="empty">Belum ada Aksi.</p>`
      }
    </div>
    <form class="panel" method="post" action="/host/${identifier}/aksi/actions" style="margin-top:1.25rem">
      <h2>Tambah Aksi</h2>
      <label for="actionName">Nama</label>
      <input id="actionName" type="text" name="name" required maxlength="60" />
      <label for="mediaType">Jenis media</label>
      <select id="mediaType" name="mediaType" onchange="document.getElementById('giftIconRow').style.display=this.value==='gift_icon'?'block':'none';document.getElementById('mediaUrlRow').style.display=this.value==='gift_icon'?'none':'block'">
        <option value="image">Gambar</option>
        <option value="gif">GIF</option>
        <option value="video">Video</option>
        <option value="gift_icon">Ikon gift (dari koleksi 820 ikon)</option>
      </select>
      <div id="mediaUrlRow">
        <label for="mediaUrl">URL media</label>
        <input id="mediaUrl" type="text" name="mediaUrl" placeholder="https://..." />
      </div>
      <div id="giftIconRow" style="display:none">
        <label for="giftIconKey">Pilih ikon gift</label>
        <select id="giftIconKey" name="giftIconKey">
          ${giftIcons.map((g) => `<option value="${escapeHtml(g.key)}">${escapeHtml(g.label)}</option>`).join("")}
        </select>
      </div>
      <label for="soundUrl">Suara (opsional)</label>
      <div style="display:flex;gap:.5rem;align-items:center">
        <select id="soundUrl" name="soundUrl" style="flex:1">
          <option value="">Tanpa suara</option>
          ${SOUND_LIBRARY.map((s) => `<option value="${escapeHtml(s.url)}">${escapeHtml(s.label)}</option>`).join("")}
        </select>
        <button type="button" class="btn btn-sm" onclick="const v=document.getElementById('soundUrl').value; if(v) new Audio(v).play()">▶ Coba</button>
      </div>
      <label for="durationMs">Durasi tampil (ms)</label>
      <input id="durationMs" type="number" name="durationMs" value="4000" min="500" step="500" />
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Tambah Aksi</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Event (${events.length})</h2>
      ${
        events.length
          ? `<table><thead><tr><th>Trigger</th><th>Nilai</th><th>Aksi</th><th>Layar</th><th></th></tr></thead><tbody>
          ${events
            .map(
              (e) => `<tr>
            <td>${TRIGGER_LABELS[e.trigger_type] || e.trigger_type}</td>
            <td>${escapeHtml(e.trigger_value || "-")}</td>
            <td>${escapeHtml(actionsById.get(e.action_id)?.name || "(dihapus)")}</td>
            <td>${e.screen}</td>
            <td><form method="post" action="/host/${identifier}/aksi/events/${e.id}/delete"><button type="submit" class="btn btn-danger btn-sm">Hapus</button></form></td>
          </tr>`
            )
            .join("")}
          </tbody></table>`
          : `<p class="empty">Belum ada Event.</p>`
      }
    </div>
    <form class="panel" method="post" action="/host/${identifier}/aksi/events" style="margin-top:1.25rem">
      <h2>Tambah Event</h2>
      <label for="eventActionId">Aksi yang dipicu</label>
      <select id="eventActionId" name="actionId" required>
        ${actions.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("")}
      </select>
      <label for="triggerType">Trigger</label>
      <select id="triggerType" name="triggerType">
        ${Object.entries(TRIGGER_LABELS).map(([k, label]) => `<option value="${k}">${label}</option>`).join("")}
      </select>
      <label for="triggerValue">Nilai trigger (nama gift persis / angka milestone like / kata kunci chat — kosongkan buat "Gift apa aja"/"Follow"/"Share")</label>
      <input id="triggerValue" type="text" name="triggerValue" />
      <label for="eventScreen">Layar overlay (1, 2, 3, dst — biar bisa pisah beberapa Browser Source)</label>
      <input id="eventScreen" type="number" name="screen" value="1" min="1" />
      <button type="submit" class="btn btn-primary" style="margin-top:16px"${actions.length ? "" : " disabled"}>Tambah Event</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Timer (${timers.length})</h2>
      ${
        timers.length
          ? `<table><thead><tr><th>Aksi</th><th>Interval</th><th>Layar</th><th></th></tr></thead><tbody>
          ${timers
            .map(
              (t) => `<tr>
            <td>${escapeHtml(actionsById.get(t.action_id)?.name || "(dihapus)")}</td>
            <td>${t.interval_minutes} menit</td>
            <td>${t.screen}</td>
            <td><form method="post" action="/host/${identifier}/aksi/timers/${t.id}/delete"><button type="submit" class="btn btn-danger btn-sm">Hapus</button></form></td>
          </tr>`
            )
            .join("")}
          </tbody></table>`
          : `<p class="empty">Belum ada Timer.</p>`
      }
    </div>
    <form class="panel" method="post" action="/host/${identifier}/aksi/timers" style="margin-top:1.25rem">
      <h2>Tambah Timer</h2>
      <p class="hint">Munculin sebuah Aksi otomatis tiap interval waktu tertentu, selama kamu live.</p>
      <label for="timerActionId">Aksi</label>
      <select id="timerActionId" name="actionId" required>
        ${actions.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("")}
      </select>
      <label for="intervalMinutes">Interval (menit)</label>
      <input id="intervalMinutes" type="number" name="intervalMinutes" value="10" min="1" />
      <label for="timerScreen">Layar overlay</label>
      <input id="timerScreen" type="number" name="screen" value="1" min="1" />
      <button type="submit" class="btn btn-primary" style="margin-top:16px"${actions.length ? "" : " disabled"}>Tambah Timer</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Link widget layar overlay</h2>
      <p class="hint">Setiap Event/Timer di atas nunjuk ke satu nomor layar — tambahin satu Browser Source per nomor layar yang kamu pakai.</p>
      <div class="widget-card">
        <h3>Aksi &amp; Event — Layar 1</h3>
        <div class="widget-url-row">
          <input class="url-box" type="text" readonly value="${escapeHtml(`${req.protocol}://${req.get("host")}/overlay/${settings.overlay_token}/actions?screen=1`)}" onclick="this.select()" />
        </div>
        <p class="hint" style="margin-top:.5rem">Ganti <code>?screen=1</code> jadi <code>?screen=2</code>, dst buat layar lain.</p>
      </div>
    </div>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Simulasi Event</h2>
      <p class="hint">Coba Event kamu tanpa perlu live beneran — buka widget layar di atas dulu, terus pencet salah satu di bawah.</p>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <form method="post" action="/host/${identifier}/aksi/simulate"><input type="hidden" name="type" value="follow" /><button type="submit" class="btn btn-sm">Simulasi Follow</button></form>
        <form method="post" action="/host/${identifier}/aksi/simulate"><input type="hidden" name="type" value="share" /><button type="submit" class="btn btn-sm">Simulasi Share</button></form>
        <form method="post" action="/host/${identifier}/aksi/simulate"><input type="hidden" name="type" value="likes" /><button type="submit" class="btn btn-sm">Simulasi 15 Like</button></form>
      </div>
      <form method="post" action="/host/${identifier}/aksi/simulate" style="margin-top:.75rem;display:flex;gap:.5rem;align-items:flex-end;flex-wrap:wrap">
        <input type="hidden" name="type" value="gift" />
        <div style="flex:1;min-width:12rem"><label for="simGift">Nama gift</label><input id="simGift" type="text" name="value" placeholder="Rose" /></div>
        <button type="submit" class="btn btn-sm">Simulasi Gift</button>
      </form>
      <form method="post" action="/host/${identifier}/aksi/simulate" style="margin-top:.75rem;display:flex;gap:.5rem;align-items:flex-end;flex-wrap:wrap">
        <input type="hidden" name="type" value="chat" />
        <div style="flex:1;min-width:12rem"><label for="simChat">Pesan chat</label><input id="simChat" type="text" name="value" placeholder="halo kak" /></div>
        <button type="submit" class="btn btn-sm">Simulasi Chat</button>
      </form>
    </div>`;

  res.send(hostLayout(body, { active: "aksi", identifier, title: settings.display_name, avatarUrl: settings.avatar_data ? `/${identifier}/avatar` : null }));
}

export async function handleHostActionAdd(req, res) {
  const settings = req.donationSettings;
  const name = req.body.name?.trim().slice(0, 60);
  if (name) {
    await db.addDonationAction(settings.guild_id, {
      name,
      mediaType: req.body.mediaType,
      mediaUrl: req.body.mediaUrl?.trim() || null,
      giftIconKey: req.body.giftIconKey || null,
      soundUrl: req.body.soundUrl?.trim() || null,
      durationMs: Number(req.body.durationMs) || 4000,
    });
    invalidateGuildCache(settings.guild_id);
  }
  res.redirect(`/host/${req.params.identifier}/aksi`);
}

export async function handleHostActionDelete(req, res) {
  const settings = req.donationSettings;
  await db.deleteDonationAction(settings.guild_id, req.params.id);
  invalidateGuildCache(settings.guild_id);
  res.redirect(`/host/${req.params.identifier}/aksi`);
}

export async function handleHostEventAdd(req, res) {
  const settings = req.donationSettings;
  if (req.body.actionId) {
    await db.addDonationEvent(settings.guild_id, {
      actionId: req.body.actionId,
      triggerType: req.body.triggerType,
      triggerValue: req.body.triggerValue?.trim() || null,
      screen: req.body.screen,
    });
    invalidateGuildCache(settings.guild_id);
  }
  res.redirect(`/host/${req.params.identifier}/aksi`);
}

export async function handleHostEventDelete(req, res) {
  const settings = req.donationSettings;
  await db.deleteDonationEvent(settings.guild_id, req.params.id);
  invalidateGuildCache(settings.guild_id);
  res.redirect(`/host/${req.params.identifier}/aksi`);
}

export async function handleHostTimerAdd(req, res) {
  const settings = req.donationSettings;
  if (req.body.actionId) {
    await db.addDonationTimer(settings.guild_id, {
      actionId: req.body.actionId,
      intervalMinutes: req.body.intervalMinutes,
      screen: req.body.screen,
    });
  }
  res.redirect(`/host/${req.params.identifier}/aksi`);
}

export async function handleHostTimerDelete(req, res) {
  const settings = req.donationSettings;
  await db.deleteDonationTimer(settings.guild_id, req.params.id);
  res.redirect(`/host/${req.params.identifier}/aksi`);
}

/** Fires a fake follow/share/likes/gift/chat event straight at the Actions &
 * Events matcher (and the raw overlay SSE stream) — same "no real TikTok LIVE
 * needed" idea as hostDashboard.js's own Test/Mode Demo buttons. */
export async function handleHostActionsSimulate(req, res) {
  const settings = req.donationSettings;
  const token = settings.overlay_token;
  const guildId = settings.guild_id;
  const type = req.body.type;
  const value = req.body.value?.trim();

  let eventName = null;
  let payload = null;
  if (type === "follow") {
    eventName = "follow";
    payload = { total: 1, user: "TestUser" };
  } else if (type === "share") {
    eventName = "share";
    payload = { user: "TestUser" };
  } else if (type === "likes") {
    eventName = "likes";
    payload = { total: 15 };
  } else if (type === "gift") {
    const giftName = value || "Rose";
    eventName = "gift";
    payload = { user: "TestUser", giftName, giftImage: resolveGiftIconUrl(giftName), repeatCount: 1 };
  } else if (type === "chat") {
    eventName = "chat";
    payload = { user: "TestUser", message: value || "halo kak" };
  }

  if (eventName) {
    broadcast(token, eventName, payload);
    await evaluateEvent(token, guildId, eventName, payload);
  }
  res.redirect(`/host/${req.params.identifier}/aksi`);
}
