// Page wiring for dashboard.html. Values reach the page only through textContent,
// attributes and data-* states; see dashboard-core.mjs for the logic.
import {
  NA, t, normalizeMac, fmtMac, fmtAge, pressConfirm, scriptLang,
  cardModel, summaryModel, apkUrl, apkUrlForHost, demoResponse, demoHa,
  apiGet, apiSend, reducePoll, withDevice, diffMacs, canToggleLock, toggleMask, applyPending, nameEditOutcome,
} from "./dashboard-core.mjs";
import { page, applyTheme, applyStrings, initPage, setText, useDemoLinks } from "./page.mjs";
import { encodeQr } from "./qr.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const POLL_MS = 5000;
const HIDE_CONFIRM_MS = 4000;
const AGE_TICK_MS = 1000;

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  source: null,
  poll: { devices: [], authenticated: false, stale: false, resp: null }, // see reducePoll
  ha: null,
  polling: false,
  answers: 0, // device answers taken in after controls; a poll read out at the same time is dropped
  unlocked: false, // every page load starts locked; never stored
  // Requests out: "<mac>" for the whole card, "<mac>:<n>" for one outlet (switch and name),
  // "<mac>:alias" for the device name, "<mac>:lock" for Child Lock.
  busy: new Set(),
  pending: new Map(), // mac -> controls sent but not answered yet, shown over the last answer (applyPending)
  editing: null, // "<mac>:alias" or "<mac>:<n>" while a name field is open
  cancelEdit: null,
  qrUrl: null,
  hideArmed: new Map(), // mac -> {at, timer} after the first press of "Hide device"
};

// ---- Data sources ----
// A source reads load() -> {status, body} (`api/devices`), device(mac) -> {status, body}
// (`api/devices/<mac>`) and ha() -> the `api/ha` answer or null. Controls resolve once the backend
// has answered and reject with its message: power(mac, n, on) with n 0 for all outlets, rename(mac, alias),
// renameOutlet(mac, n, name), lock(mac, mask), refresh(mac), hide(mac).

function createApiSource() {
  const dev = (mac) => `api/devices/${mac}`;
  return {
    demo: false,
    load: () => apiGet("api/devices"),
    device: (mac) => apiGet(dev(mac)),
    async ha() {
      const result = await apiGet("api/ha");
      return result.status === 200 ? result.body : null;
    },
    power: (mac, n, on) => apiSend("POST", `${dev(mac)}/outlets/${n}/power`, { on }),
    rename: (mac, alias) => apiSend("PUT", dev(mac), { alias }),
    renameOutlet: (mac, n, name) => apiSend("PUT", `${dev(mac)}/outlets/${n}`, { name }),
    lock: (mac, mask) => apiSend("PUT", `${dev(mac)}/childlock`, { mask }),
    refresh: (mac) => apiSend("POST", `${dev(mac)}/refresh`),
    hide: (mac) => apiSend("POST", `${dev(mac)}/remove`),
  };
}

// Demo mode keeps its data in memory; controls change only that copy.
function createDemoSource() {
  const data = demoResponse();
  // The sample data is fixed in time; move it to now so "N s ago" looks like a live backend.
  const shift = Date.now() / 1000 - Math.max(...data.devices.map((d) => d.last_seen));
  for (const d of data.devices) {
    d.last_seen += shift;
    for (const ch of d.channels) ch.last_seen += shift;
  }
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
    async device(mac) {
      const d = data.devices.find((x) => x.mac === mac);
      return d ? { status: 200, body: structuredClone(d) } : { status: 404, body: { error: "not found" } };
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
    async refresh(mac) {
      const d = device(mac);
      if (!d.online) throw new Error("device offline");
      d.last_seen = Date.now() / 1000;
      for (const ch of d.channels) ch.last_seen = d.last_seen;
    },
    async hide(mac) {
      const d = device(mac);
      data.devices = data.devices.filter((x) => x !== d);
      data.removed.push({ ...d, removed: true, removed_at: Date.now() / 1000 });
    },
  };
}

// ---- Small DOM helpers that only write when the value changed ----

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

// mac -> {mac, root, f, outlets: [{root, f}], lockBits: HTMLButtonElement[], raw (the device as shown), seenOf}
const cards = new Map();

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
  return { mac, root, f, outlets, lockBits: [...root.querySelectorAll("[data-act=lock]")] };
}

/** True while any request for this device is out. */
function deviceBusy(mac) {
  for (const key of state.busy) if (key === mac || key.startsWith(`${mac}:`)) return true;
  return false;
}

function updateCard(card, raw) {
  const { f, root, mac } = card;
  const lang = page.lang;
  // Controls still out show what was asked for; the next answer for the device replaces them.
  const shown = applyPending(raw, state.pending.get(mac));
  const m = cardModel(shown, { authenticated: state.poll.authenticated, unlocked: state.unlocked, lang });
  const cardBusy = state.busy.has(mac);
  const anyBusy = deviceBusy(mac);

  setData(root, "online", m.online ? "on" : "off");
  // "locked": only the screen lock holds the buttons back; "off": the device cannot be controlled.
  setData(root, "controls", m.controls ? "live" : m.online && !state.unlocked ? "locked" : "off");
  if (state.editing !== `${mac}:alias`) setText(f.title, m.title);
  setAttr(f.titleInput, "placeholder", `MTTL ${mac.slice(-6).toUpperCase()}`);
  setHidden(f.renameBtn, !m.editable);
  setDisabled(f.renameBtn, cardBusy || state.busy.has(`${mac}:alias`));
  setData(f.status, "state", m.online ? "ok" : "idle");
  setText(f.statusText, t(lang, m.online ? "online" : "offline"));
  setText(f.mac, fmtMac(m.mac));
  setText(f.fw, m.firmware ?? NA);
  card.seenOf = { ip: m.ip, lastSeen: m.lastSeen };
  setText(f.seen, seenText(card.seenOf));

  // One reserved slot: offline notice first (an update cannot run offline), then the firmware link.
  setData(f.notice, "kind", !m.online ? "offline" : m.fwAction ? "fw" : "none");
  setText(f.fwText, m.fwAction ? t(lang, `fw_${m.fwAction}`, { v: m.fwTarget ?? NA }) : "");
  setAttr(f.fwUpdate, "href", `tuo.html#device=${mac}`);

  setValue(f.totalW, m.totalW);
  setValue(f.totalKwh, m.totalKwh);
  setValue(f.voltage, m.voltage);
  setValue(f.rssi, m.rssi);

  setDisabled(f.allOn, !m.controls || anyBusy);
  setDisabled(f.allOff, !m.controls || anyBusy);
  setDisabled(f.refreshBtn, !m.controls || anyBusy);

  // The lock area keeps its height on every card; devices without 1.0.111 leave it blank.
  const lock = m.lock?.supported ? m.lock : null;
  const synced = lock?.synced === true;
  const lockBusy = cardBusy || state.busy.has(`${mac}:lock`);
  setData(f.lock, "supported", lock ? "yes" : "no");
  setData(f.lock, "synced", synced ? "yes" : "no");
  setData(f.lock, "active", synced && lock.bits.some(Boolean) ? "yes" : "no");
  setText(f.lockState, lock && !synced ? t(lang, "lock_pending") : "");
  card.lockBits.forEach((b, bit) => {
    // Bits from an unverified mask are not shown as active (Tuo keeps the last value but does not trust it).
    setAttr(b, "aria-pressed", String(synced && lock.bits[bit]));
    setDisabled(b, !m.controls || !lock || !canToggleLock(shown) || lockBusy);
    const name = bit === 0 ? t(lang, "lock_all") : m.outlets[bit - 1].name;
    setAttr(b, "title", t(lang, "lock_bit", { name }));
  });

  const hideArmed = state.hideArmed.has(mac);
  setData(f.hideBtn, "state", hideArmed ? "armed" : "idle");
  setText(f.hideBtn, t(lang, hideArmed ? "hide_confirm" : "hide_device"));
  setAttr(f.hideBtn, "title", t(lang, "hide_hint"));
  setDisabled(f.hideBtn, !m.editable || anyBusy);
  setText(f.hideNote, hideArmed ? t(lang, "hide_note") : "");

  m.outlets.forEach((o, i) => {
    const key = `${mac}:${o.n}`;
    const { root: el, f: of } = card.outlets[i];
    const busy = cardBusy || state.busy.has(key);
    setData(el, "state", o.on === null ? "unknown" : o.on ? "on" : "off");
    setData(el, "busy", busy ? "yes" : "no");
    if (state.editing !== key) setText(of.name, o.name);
    setAttr(of.nameInput, "placeholder", t(lang, "outlet", { n: o.n }));
    setHidden(of.renameBtn, !m.editable);
    setDisabled(of.renameBtn, busy);
    setText(of.w, o.w);
    setText(of.kwh, o.kwh);
    setText(of.temp, o.temp);
    setHidden(of.lockMark, !(synced && lock.bits[o.n]));
    setText(of.toggle, o.on === null ? NA : t(lang, o.on ? "on" : "off"));
    setDisabled(of.toggle, !m.controls || o.on === null || busy);
  });
  card.raw = shown;
}

/** "IP · N s ago" (admin) or "N s ago"; the age counts up between loads. */
function seenText({ ip, lastSeen }) {
  const age = fmtAge(lastSeen, Date.now() / 1000);
  return ip ? `${ip} · ${age}` : age;
}

function updateAges() {
  for (const card of cards.values()) if (card.seenOf) setText(card.f.seen, seenText(card.seenOf));
}

function renderCards() {
  const list = $("#devices");
  const rows = new Map(); // mac -> device, in the backend's order
  for (const raw of state.poll.devices) {
    const mac = normalizeMac(raw?.mac);
    if (mac && !rows.has(mac)) rows.set(mac, raw);
  }
  const { added, removed } = diffMacs([...cards.keys()], [...rows.keys()]);
  for (const mac of removed) dropCard(mac);
  for (const mac of added) cards.set(mac, createCard(mac));
  let prev = null;
  for (const [mac, raw] of rows) {
    const card = cards.get(mac);
    updateCard(card, raw);
    const want = prev ? prev.nextElementSibling : list.firstElementChild;
    if (want !== card.root) list.insertBefore(card.root, want);
    prev = card.root;
  }
  setHidden($("#empty"), state.poll.resp === null || rows.size > 0);
}

function dropCard(mac) {
  // A removed input fires no blur, so close its name field here; the card is gone, so no redraw.
  if (state.editing?.startsWith(`${mac}:`)) state.cancelEdit?.("escape", false);
  cards.get(mac).root.remove();
  cards.delete(mac);
  disarmHide(mac);
}

/** Redraws one card after its control was answered, and the counts in the top bar and summary. */
function renderDevice(mac) {
  const raw = state.poll.devices.find((d) => normalizeMac(d?.mac) === mac);
  const card = cards.get(mac);
  if (raw && card) updateCard(card, raw);
  else renderCards();
  renderTopbar();
  renderSummary();
}

const MQTT_BADGE = { connected: "ok", disconnected: "bad", off: "idle", unknown: "idle" };

function renderTopbar() {
  const { resp, stale } = state.poll;
  const s = summaryModel(resp, state.ha);
  const lang = page.lang;

  const server = $("#server-badge");
  const serverState = stale ? "bad" : resp === null ? "idle" : "ok";
  setData(server, "state", serverState);
  setText($("[data-f=text]", server), t(lang, { ok: "server_online", bad: "server_offline", idle: "server_checking" }[serverState]));
  setText($("#backend-version"), s.version ? t(lang, "backend", { v: s.version }) : "");
  setText($("#online-count"), resp === null ? "" : t(lang, "online_count", { n: s.online, total: s.total }));

  const lockBtn = $("#lock-btn");
  setData(lockBtn, "state", state.unlocked ? "unlocked" : "locked");
  setAttr(lockBtn, "aria-pressed", String(state.unlocked));
  setAttr(lockBtn, "title", t(lang, state.unlocked ? "relock_hint" : "unlock_hint"));
}

/** Text with a line-break opportunity after every slash, so a long address wraps between its parts. */
function setUrlText(el, url) {
  if (el.dataset.url === url) return;
  el.dataset.url = url;
  const parts = url.match(/[^\/]*\/|[^\/]+$/g) ?? [];
  el.replaceChildren();
  parts.forEach((part, i) => {
    if (i > 0) el.append(document.createElement("wbr"));
    const span = document.createElement("span"); // no-wrap: breaks only at the <wbr>, not at "-"
    span.textContent = part;
    el.append(span);
  });
  el.lang = scriptLang(url);
}

function renderSummary() {
  const { resp } = state.poll;
  const s = summaryModel(resp, state.ha);
  const lang = page.lang;

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
  const url = resp === null
    ? ""
    : state.source?.demo
      ? apkUrlForHost(resp.firmware, location.hostname)
      : apkUrl(resp.firmware, location);
  setUrlText(app.url, url);
  setAttr(app.qr, "aria-label", url ? t(lang, "qr_label", { url }) : "");
  if (url !== state.qrUrl) {
    state.qrUrl = url;
    if (url) drawQr(app.qr, url);
    else app.qr.replaceChildren();
  }
}

function render() {
  renderTopbar();
  renderSummary();
  renderCards();
}

// ---- Loading and controls ----

async function poll() {
  if (!state.source || state.polling) return;
  state.polling = true;
  const answers = state.answers;
  let result;
  let ha = null;
  try {
    [result, ha] = await Promise.all([state.source.load(), state.source.ha()]);
  } catch (err) {
    result = { error: err?.message ?? String(err) };
  } finally {
    state.polling = false;
  }
  // A control's answer for one device came in while this read was out; it is newer, so keep it
  // and let the next poll read everything again.
  if (answers !== state.answers) return;
  state.poll = reducePoll(state.poll, result);
  if (ha) state.ha = ha;
  applyTheme(); // HA's dark mode may have changed since the last load.
  render();
  focusHashDevice();
}

/** Reads one device again after a control; a 404 means it is gone. */
async function reloadDevice(mac) {
  let result = null;
  try {
    result = await state.source.device(mac);
  } catch {
    result = null;
  }
  if (result?.status === 200 && result.body) state.poll = withDevice(state.poll, mac, result.body);
  else if (result?.status === 404) state.poll = withDevice(state.poll, mac, null);
  else return; // no answer: the next poll shows what happened
  state.answers++;
}

function showError(err) {
  const el = $("#action-error");
  setText(el, t(page.lang, "action_failed", { msg: err?.message ?? String(err) }));
  el.hidden = false;
  clearTimeout(showError.timer);
  showError.timer = setTimeout(() => {
    el.hidden = true;
  }, 5000);
}

/**
 * Sends one control. `key` is its slot in state.busy; `op` is what the card shows until the answer
 * (see applyPending), or null. Then the device is read again and only its card is redrawn, which
 * also takes back a change that failed; the error bar says why.
 */
async function run(key, mac, op, action) {
  // A locked screen never sends a control request.
  if (!state.unlocked || state.busy.has(key)) return;
  state.busy.add(key);
  if (op) state.pending.set(mac, [...(state.pending.get(mac) ?? []), op]);
  renderDevice(mac);
  let error = null;
  try {
    await action();
  } catch (err) {
    error = err;
  }
  await reloadDevice(mac);
  if (op) {
    const rest = (state.pending.get(mac) ?? []).filter((x) => x !== op);
    if (rest.length) state.pending.set(mac, rest);
    else state.pending.delete(mac);
  }
  state.busy.delete(key);
  if (error) showError(error);
  renderDevice(mac);
}

function onDeviceClick(event) {
  const btn = event.target.closest("[data-act]");
  if (!btn || btn.disabled || !state.unlocked) return;
  const mac = btn.closest(".card")?.dataset.mac;
  const card = cards.get(mac);
  const source = state.source;
  if (!card || !source) return;
  const act = btn.dataset.act;
  if (act === "all") {
    const on = btn.dataset.on === "1";
    run(mac, mac, { kind: "power", n: 0, on }, () => source.power(mac, 0, on));
  } else if (act === "power") {
    const n = Number(btn.closest(".outlet").dataset.n);
    const on = card.outlets[n - 1].root.dataset.state !== "on";
    run(`${mac}:${n}`, mac, { kind: "power", n, on }, () => source.power(mac, n, on));
  } else if (act === "lock") {
    const shown = card.raw;
    if (!canToggleLock(shown)) return;
    const bit = Number(btn.dataset.bit);
    const mask = toggleMask(shown.childlock_mask, bit, (shown.childlock_mask & (1 << bit)) === 0);
    run(`${mac}:lock`, mac, { kind: "lock", mask }, () => source.lock(mac, mask));
  } else if (act === "refresh") {
    run(mac, mac, null, () => source.refresh(mac));
  } else if (act === "hide") {
    pressHide(mac);
  } else if (act === "rename") {
    startEdit(`${mac}:alias`, mac, card.f.title, card.f.titleInput, card.raw?.alias ?? "",
      (value) => ({ kind: "alias", value }), (value) => source.rename(mac, value));
  } else if (act === "rename-outlet") {
    const n = Number(btn.closest(".outlet").dataset.n);
    const o = card.outlets[n - 1];
    const ch = (card.raw?.channels ?? []).find((c) => Number(c.selector) === n);
    startEdit(`${mac}:${n}`, mac, o.f.name, o.f.nameInput, ch?.name ?? "",
      (value) => ({ kind: "outletName", n, value }), (value) => source.renameOutlet(mac, n, value));
  }
}

/** Opens a name field. `makeOp(name)` is what the card shows while `save(name)` is out. */
function startEdit(key, mac, label, input, current, makeOp, save) {
  if (state.editing || !state.unlocked || state.busy.has(key)) return;
  state.editing = key;
  input.value = current;
  label.hidden = true;
  input.hidden = false;
  input.focus();
  input.select();
  let done = false;
  // `how`: "enter", "blur", "escape" or "relock"; nameEditOutcome decides whether it saves.
  const finish = (how, { composing = false, redraw = true } = {}) => {
    if (done) return;
    const outcome = nameEditOutcome({ how, composing, unlocked: state.unlocked, value: input.value, current });
    if (outcome === "keep") return;
    done = true;
    input.removeEventListener("keydown", onKey);
    input.removeEventListener("blur", onBlur);
    input.hidden = true;
    label.hidden = false;
    state.editing = null;
    state.cancelEdit = null;
    const value = input.value.trim();
    if (outcome === "save") run(key, mac, makeOp(value), () => save(value));
    else if (redraw) renderDevice(mac);
  };
  const onKey = (e) => {
    // keyCode 229: Safari reports the Enter that ends an IME composition this way.
    if (e.key === "Enter") finish("enter", { composing: e.isComposing || e.keyCode === 229 });
    else if (e.key === "Escape") finish("escape");
  };
  const onBlur = () => finish("blur");
  input.addEventListener("keydown", onKey);
  input.addEventListener("blur", onBlur);
  state.cancelEdit = (how = "relock", redraw = true) => finish(how, { redraw });
}

function disarmHide(mac) {
  clearTimeout(state.hideArmed.get(mac)?.timer);
  state.hideArmed.delete(mac);
}

// Hiding needs a second press within HIDE_CONFIRM_MS; the label says what the second press does.
function pressHide(mac) {
  const armed = state.hideArmed.get(mac);
  const next = pressConfirm(armed?.at ?? null, Date.now(), HIDE_CONFIRM_MS);
  disarmHide(mac);
  if (next.confirmed) {
    run(mac, mac, null, () => state.source.hide(mac));
    return;
  }
  const timer = setTimeout(() => {
    state.hideArmed.delete(mac);
    render();
  }, HIDE_CONFIRM_MS);
  state.hideArmed.set(mac, { at: next.armedAt, timer });
  render();
}

// Locking and unlocking change only the screen; no request goes to the backend.
function toggleScreenLock() {
  state.unlocked = !state.unlocked;
  if (!state.unlocked) {
    state.cancelEdit?.("relock");
    for (const mac of [...state.hideArmed.keys()]) disarmHide(mac);
  }
  render();
}

// Pressing the lock button moves focus away from an open name field, and that blur would save it.
// Cancel the edit first, on pointerdown, which comes before the blur.
function cancelEditBeforeLock() {
  if (state.unlocked) state.cancelEdit?.("relock");
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
  const demo = new URLSearchParams(location.search).has("demo");
  state.source = demo ? createDemoSource() : createApiSource();
  $("#demo-badge").hidden = !demo;
  if (demo) useDemoLinks();

  initPage({ onLangChange: render });
  $("#lock-btn").addEventListener("pointerdown", cancelEditBeforeLock);
  $("#lock-btn").addEventListener("click", toggleScreenLock);
  $("#devices").addEventListener("click", onDeviceClick);
  window.addEventListener("hashchange", () => {
    focusedHash = "";
    focusHashDevice();
  });

  render();
  poll();
  // Demo data changes only through the demo controls; the backend is read again every 5 s.
  if (!demo) setInterval(poll, POLL_MS);
  setInterval(updateAges, AGE_TICK_MS);
}

init();
