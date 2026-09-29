// Page wiring for dashboard.html. Values reach the page only through textContent,
// attributes and data-* states; see dashboard-core.mjs for the logic.
import {
  NA, t, normalizeMac, fmtMac,
  cardModel, summaryModel, apkUrl, apkUrlForHost, demoResponse, demoHa,
} from "./dashboard-core.mjs";
import { page, applyTheme, applyStrings, initPage, useDemoLinks } from "./page.mjs";
import { encodeQr } from "./qr.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  source: null,
  resp: null,
  ha: null,
  stale: false, // the last load failed; the real API source sets this
  unlocked: false, // every page load starts locked; never stored
  busy: new Set(), // "<mac>" for the whole card, "<mac>:<n>" for one outlet, "<mac>:lock"
  editing: null, // "<mac>" or "<mac>:<n>" while a name field is open
  cancelEdit: null,
  qrUrl: null,
};

// ---- Data sources ----
// A source answers load() with {status, body} (the `api/devices` response), ha() with the
// `api/ha` answer, and performs controls. Demo mode keeps its data in memory.

function createDemoSource() {
  const data = demoResponse();
  const lastPower = new Map();
  const device = (mac) => {
    const d = data.devices.find((x) => x.mac === mac);
    if (!d) throw new Error("device not found");
    return d;
  };
  const channel = (mac, n) => device(mac).channels.find((ch) => ch.selector === n);
  return {
    demo: true,
    async load() {
      return { status: 200, body: structuredClone(data) };
    },
    async ha() {
      return demoHa();
    },
    async power(mac, n, on) {
      const d = device(mac);
      if (!d.online) throw new Error("device offline");
      for (const ch of d.channels) {
        if (n !== 0 && ch.selector !== n) continue;
        const key = `${mac}:${ch.selector}`;
        if (on && !ch.on_state) ch.power_mw = lastPower.get(key) ?? 0;
        if (!on && ch.on_state) {
          lastPower.set(key, ch.power_mw);
          ch.power_mw = 0;
        }
        ch.on_state = on ? 1 : 0;
      }
    },
    async rename(mac, alias) {
      device(mac).alias = alias.trim() || null;
    },
    async renameOutlet(mac, n, name) {
      channel(mac, n).name = name.trim() || null;
    },
    async lock(mac, mask) {
      device(mac).childlock_mask = mask;
    },
  };
}

// ---- Small DOM helpers that only write when the value changed ----

function setText(el, value) {
  if (el.textContent !== value) el.textContent = value;
}

function setData(el, name, value) {
  if (el.dataset[name] !== value) el.dataset[name] = value;
}

function setHidden(el, hidden) {
  if (el.hidden !== hidden) el.hidden = hidden;
}

function setDisabled(el, disabled) {
  if (el.disabled !== disabled) el.disabled = disabled;
}

function setAttr(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** Value cell that shows a muted placeholder when there is no value. */
function setValue(el, value, placeholder = NA) {
  setText(el, value ?? placeholder);
  setData(el, "empty", value === null || value === undefined ? "yes" : "no");
}

function fieldMap(root) {
  const f = {};
  for (const el of root.querySelectorAll("[data-f]")) f[el.dataset.f] = el;
  return f;
}

// ---- QR code ----

function drawQr(container, text) {
  let modules;
  try {
    modules = encodeQr(text);
  } catch {
    container.replaceChildren();
    return;
  }
  const quiet = 4;
  const dim = modules.length + 2 * quiet;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${dim} ${dim}`);
  svg.setAttribute("width", String(dim * 3));
  svg.setAttribute("height", String(dim * 3));
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("aria-hidden", "true");
  const rect = (x, y, w, h, fill) => {
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", String(x));
    r.setAttribute("y", String(y));
    r.setAttribute("width", String(w));
    r.setAttribute("height", String(h));
    r.setAttribute("fill", fill);
    svg.append(r);
  };
  rect(0, 0, dim, dim, "#ffffff");
  modules.forEach((row, y) => {
    // One rect per horizontal run of dark modules.
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let end = x;
      while (end + 1 < row.length && row[end + 1]) end++;
      rect(x + quiet, y + quiet, end - x + 1, 1, "#000000");
      x = end;
    }
  });
  container.replaceChildren(svg);
}

// ---- Cards ----

const cards = new Map(); // mac -> {root, f, outlets: [{root, f}], lockBits: HTMLButtonElement[], raw}

function createCard(mac) {
  const root = $("#card-tpl").content.firstElementChild.cloneNode(true);
  root.dataset.mac = mac;
  root.id = `device-${mac}`;
  const f = fieldMap(root);
  const outlets = [1, 2, 3, 4].map((n) => {
    const el = $("#outlet-tpl").content.firstElementChild.cloneNode(true);
    el.dataset.n = String(n);
    f.outlets.append(el);
    return { root: el, f: fieldMap(el) };
  });
  applyStrings(root);
  return { root, f, outlets, lockBits: [...root.querySelectorAll("[data-act=lock]")] };
}

function updateCard(card, m, raw) {
  const { f, root } = card;
  const lang = page.lang;
  const cardBusy = state.busy.has(m.mac);

  setData(root, "online", m.online ? "on" : "off");
  // "locked": only the screen lock holds the buttons back; "off": the device cannot be controlled.
  setData(root, "controls", m.controls ? "live" : m.online && !state.unlocked ? "locked" : "off");
  if (state.editing !== m.mac) setText(f.title, m.title);
  setAttr(f.titleInput, "placeholder", `MTTL ${m.mac.slice(-6).toUpperCase()}`);
  setHidden(f.renameBtn, !m.editable);
  setData(f.status, "state", m.online ? "ok" : "idle");
  setText(f.statusText, t(lang, m.online ? "online" : "offline"));
  setText(f.mac, fmtMac(m.mac));
  setText(f.fw, m.firmware ?? NA);
  setText(f.ip, m.ip ?? "");

  // One reserved slot: offline notice first (an update cannot run offline), then the firmware link.
  setData(f.notice, "kind", !m.online ? "offline" : m.fwAction ? "fw" : "none");
  setText(f.fwUpdate, m.fwAction ? t(lang, `fw_${m.fwAction}`, { v: m.fwTarget ?? NA }) : "");
  setAttr(f.fwUpdate, "href", `tuo.html#device=${m.mac}`);

  setValue(f.totalW, m.totalW);
  setValue(f.totalKwh, m.totalKwh);
  setValue(f.voltage, m.voltage);
  setValue(f.rssi, m.rssi);

  setDisabled(f.allOn, !m.controls || cardBusy);
  setDisabled(f.allOff, !m.controls || cardBusy);

  // The lock area keeps its height on every card; devices without 1.0.111 leave it blank.
  const lock = m.lock?.supported ? m.lock : null;
  const synced = lock?.synced === true;
  const lockBusy = state.busy.has(`${m.mac}:lock`);
  setData(f.lock, "supported", lock ? "yes" : "no");
  setData(f.lock, "synced", synced ? "yes" : "no");
  setText(f.lockState, lock && !synced ? t(lang, "lock_pending") : "");
  card.lockBits.forEach((b, bit) => {
    // Bits from an unverified mask are not shown as active (Tuo keeps the last value but does not trust it).
    setAttr(b, "aria-pressed", String(synced && lock.bits[bit]));
    setDisabled(b, !m.controls || !synced || lockBusy);
    const name = bit === 0 ? t(lang, "lock_all") : m.outlets[bit - 1].name;
    setAttr(b, "title", t(lang, "lock_bit", { name }));
  });

  m.outlets.forEach((o, i) => {
    const key = `${m.mac}:${o.n}`;
    const { root: el, f: of } = card.outlets[i];
    const busy = cardBusy || state.busy.has(key);
    if (!busy) setData(el, "state", o.on === null ? "unknown" : o.on ? "on" : "off");
    setData(el, "busy", busy ? "yes" : "no");
    if (state.editing !== key) setText(of.name, o.name);
    setAttr(of.nameInput, "placeholder", t(lang, "outlet", { n: o.n }));
    setHidden(of.renameBtn, !m.editable);
    setText(of.w, o.w);
    setText(of.kwh, o.kwh);
    setText(of.temp, o.temp);
    setHidden(of.lockMark, !(synced && lock.bits[o.n]));
    if (!busy) setText(of.toggle, o.on === null ? NA : t(lang, o.on ? "on" : "off"));
    setDisabled(of.toggle, !m.controls || o.on === null || busy);
  });
  card.raw = raw;
}

function renderCards() {
  const list = $("#devices");
  const resp = state.resp;
  const devices = Array.isArray(resp?.devices) ? resp.devices : [];
  const opts = { authenticated: resp?.authenticated === true, unlocked: state.unlocked, lang: page.lang };
  const seen = new Set();
  let prev = null;
  for (const raw of devices) {
    const m = cardModel(raw, opts);
    if (!m.mac || seen.has(m.mac)) continue;
    seen.add(m.mac);
    let card = cards.get(m.mac);
    if (!card) {
      card = createCard(m.mac);
      cards.set(m.mac, card);
    }
    updateCard(card, m, raw);
    const want = prev ? prev.nextElementSibling : list.firstElementChild;
    if (want !== card.root) list.insertBefore(card.root, want);
    prev = card.root;
  }
  for (const [mac, card] of cards) {
    if (!seen.has(mac)) {
      card.root.remove();
      cards.delete(mac);
    }
  }
  setHidden($("#empty"), resp === null || seen.size > 0);
}

const MQTT_BADGE = { connected: "ok", disconnected: "bad", off: "idle", unknown: "idle" };

function renderHeader() {
  const s = summaryModel(state.resp, state.ha);
  const lang = page.lang;

  const server = $("#server-badge");
  const serverState = state.stale ? "bad" : state.resp === null ? "idle" : "ok";
  setData(server, "state", serverState);
  setText($("[data-f=text]", server), t(lang, { ok: "server_online", bad: "server_offline", idle: "server_checking" }[serverState]));
  setText($("#backend-version"), s.version ? t(lang, "backend", { v: s.version }) : "");
  setText($("#online-count"), state.resp === null ? "" : t(lang, "online_count", { n: s.online, total: s.total }));

  const lockBtn = $("#lock-btn");
  setData(lockBtn, "state", state.unlocked ? "unlocked" : "locked");
  setAttr(lockBtn, "aria-pressed", String(state.unlocked));
  setAttr(lockBtn, "title", t(lang, state.unlocked ? "relock_hint" : "unlock_hint"));
  setText($("[data-f=label]", lockBtn), t(lang, state.unlocked ? "relock" : "unlock"));

  const mqtt = fieldMap($("#sum-mqtt"));
  setData(mqtt.badge, "state", MQTT_BADGE[s.mqtt]);
  setText(mqtt.badgeText, t(lang, s.mqtt === "unknown" ? "unknown" : `mqtt_${s.mqtt}`));
  setValue(mqtt.broker, s.broker);
  setValue(mqtt.topic, s.topic);
  setValue(mqtt.discovery, s.discovery);

  const fw = fieldMap($("#sum-fw"));
  const pending = s.fwPending;
  setData(fw.badge, "state", pending === null ? "idle" : pending > 0 ? "warn" : "ok");
  setText(fw.badgeText, pending === null ? t(lang, "unknown") : pending > 0 ? t(lang, "fw_badge_pending", { n: pending }) : t(lang, "fw_badge_ok"));
  setValue(fw.target, s.fwTarget);
  setValue(fw.pending, pending === null ? null : t(lang, "fw_pending_count", { n: pending }));
  setValue(fw.otaHost, s.otaHost);

  const app = fieldMap($("#sum-app"));
  // Demo mode is usually served from a plain local web server; it shows the address a phone
  // would get under Home Assistant Ingress (the OTA host address) so the mockup stays the same.
  const url = state.resp === null
    ? ""
    : state.source?.demo
      ? apkUrlForHost(state.resp.firmware, location.hostname)
      : apkUrl(state.resp.firmware, location);
  setText(app.url, url);
  setAttr(app.qr, "aria-label", url ? t(lang, "qr_label", { url }) : "");
  if (url !== state.qrUrl) {
    state.qrUrl = url;
    if (url) drawQr(app.qr, url);
    else app.qr.replaceChildren();
  }
}

function render() {
  renderHeader();
  renderCards();
}

// ---- Loading and controls ----

async function refresh() {
  if (!state.source) return;
  const result = await state.source.load();
  if (result.status === 200) state.resp = result.body;
  state.ha = await state.source.ha();
  applyTheme(); // HA's dark mode may have changed since the last load.
  render();
  focusHashDevice();
}

function showError(err) {
  const el = $("#action-error");
  el.textContent = t(page.lang, "action_failed", { msg: err?.message ?? String(err) });
  el.hidden = false;
  clearTimeout(showError.timer);
  showError.timer = setTimeout(() => {
    el.hidden = true;
  }, 5000);
}

async function run(key, action) {
  // A locked screen never sends a control request.
  if (!state.unlocked || state.busy.has(key)) return;
  state.busy.add(key);
  render();
  try {
    await action();
  } catch (err) {
    showError(err);
  } finally {
    state.busy.delete(key);
    await refresh();
  }
}

function currentMask(raw) {
  return raw?.childlock_synced === true && Number.isInteger(raw.childlock_mask) ? raw.childlock_mask : null;
}

function onDeviceClick(event) {
  const btn = event.target.closest("[data-act]");
  if (!btn || btn.disabled || !state.unlocked) return;
  const cardEl = btn.closest(".card");
  const mac = cardEl?.dataset.mac;
  const card = cards.get(mac);
  if (!card || !state.source) return;
  const act = btn.dataset.act;
  if (act === "all") {
    const on = btn.dataset.on === "1";
    run(mac, () => state.source.power(mac, 0, on));
  } else if (act === "power") {
    const outletEl = btn.closest(".outlet");
    const n = Number(outletEl.dataset.n);
    const on = outletEl.dataset.state !== "on";
    // Show the requested state at once; the next load confirms or corrects it.
    setData(outletEl, "state", on ? "on" : "off");
    setText(btn, t(page.lang, on ? "on" : "off"));
    run(`${mac}:${n}`, () => state.source.power(mac, n, on));
  } else if (act === "lock") {
    const mask = currentMask(card.raw);
    if (mask === null) return;
    const bit = Number(btn.dataset.bit);
    const next = mask & (1 << bit) ? mask & ~(1 << bit) : mask | (1 << bit);
    run(`${mac}:lock`, () => state.source.lock(mac, next));
  } else if (act === "rename") {
    startEdit(mac, card.f.title, card.f.titleInput, card.raw?.alias ?? "", (v) => state.source.rename(mac, v));
  } else if (act === "rename-outlet") {
    const n = Number(btn.closest(".outlet").dataset.n);
    const o = card.outlets[n - 1];
    const ch = (card.raw?.channels ?? []).find((c) => Number(c.selector) === n);
    startEdit(`${mac}:${n}`, o.f.name, o.f.nameInput, ch?.name ?? "", (v) => state.source.renameOutlet(mac, n, v));
  }
}

function startEdit(key, label, input, current, save) {
  if (state.editing || !state.unlocked) return;
  state.editing = key;
  input.value = current;
  label.hidden = true;
  input.hidden = false;
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    input.removeEventListener("keydown", onKey);
    input.removeEventListener("blur", onBlur);
    input.hidden = true;
    label.hidden = false;
    state.editing = null;
    state.cancelEdit = null;
    const value = input.value;
    if (commit && value.trim() !== String(current).trim()) run(key, () => save(value));
    else render();
  };
  const onKey = (e) => {
    // Enter that confirms a Korean IME composition must not save the name yet.
    if (e.key === "Enter" && !e.isComposing) finish(true);
    else if (e.key === "Escape") finish(false);
  };
  const onBlur = () => finish(true);
  input.addEventListener("keydown", onKey);
  input.addEventListener("blur", onBlur);
  state.cancelEdit = () => finish(false);
}

function toggleScreenLock() {
  state.unlocked = !state.unlocked;
  if (!state.unlocked) state.cancelEdit?.();
  render();
}

// Pressing the lock button moves focus away from an open name field, and that blur would save it.
// Cancel the edit first, on pointerdown, which comes before the blur.
function cancelEditBeforeLock() {
  if (state.unlocked) state.cancelEdit?.();
}

// ---- #device=<mac> ----

let focusedHash = "";

function focusHashDevice() {
  const match = location.hash.match(/^#device=(.+)$/);
  let mac = null;
  try {
    mac = match ? normalizeMac(decodeURIComponent(match[1])) : null;
  } catch {
    mac = null; // malformed escape in the hash
  }
  if (!mac || focusedHash === location.hash) return;
  const card = cards.get(mac);
  if (!card) return;
  focusedHash = location.hash;
  card.root.classList.add("is-target");
  card.root.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => card.root.classList.remove("is-target"), 3200);
}

// ---- Start ----

function init() {
  const params = new URLSearchParams(location.search);
  state.source = params.has("demo") ? createDemoSource() : null;
  $("#demo-badge").hidden = !state.source?.demo;
  if (state.source?.demo) useDemoLinks();

  initPage({ onLangChange: render });
  $("#lock-btn").addEventListener("pointerdown", cancelEditBeforeLock);
  $("#lock-btn").addEventListener("click", toggleScreenLock);
  $("#devices").addEventListener("click", onDeviceClick);
  window.addEventListener("hashchange", () => {
    focusedHash = "";
    focusHashDevice();
  });

  render();
  refresh();
}

init();
