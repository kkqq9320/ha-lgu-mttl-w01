// Page wiring for dashboard.html. Values reach the page only through textContent,
// attributes and data-* states; see dashboard-core.mjs for the logic.
import {
  NA, DIAG_INTERVALS, t, normalizeMac, fmtMac, fmtAge, fmtAgo, pressConfirm, scriptLang, intervalUnit,
  cardModel, cardNotice, summaryModel, apkUrl, apkUrlForHost, isViewOnly,
  deviceTitle, deviceWindowModel, measureForm, measurePayload, hiddenModel, deleteWordOk, lockErrorKey, otaWarnKeys, fwNoteKey, jobLabel, pickAlert,
  apiGet, apiSend, createDeviceAdminApi, reducePoll, withDevice, diffMacs, canToggleLock, toggleMask, applyPending, nameEditOutcome,
  demoResponse, demoHa, demoShiftFirmwareTimes, demoAdvanceJob, demoQueueJob, demoSetDiagnostics, demoRereadLock, demoRestore, demoPurge,
} from "./dashboard-core.mjs";
import { jobTone } from "./firmware-core.mjs";
import {
  page, applyTheme, applyStrings, initPage, setText, useDemoLinks, setData, setHidden, setDisabled, setAttr, fieldMap,
  syncOptions, syncList, paintButton,
} from "./page.mjs";
import { encodeQr } from "./qr.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const POLL_MS = 5000;
const CONFIRM_MS = 4000;
const AGE_TICK_MS = 1000;

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  source: null,
  poll: { devices: [], authenticated: false, stale: false, resp: null }, // see reducePoll
  ha: null,
  polling: false,
  answers: 0, // device answers taken in after controls; a poll read out at the same time is dropped
  unlocked: false, // every page load starts locked; never stored
  viewOnly: false, // opened outside the HA sidebar: the backend refuses changes, so the screen never unlocks
  // Requests out: "<mac>" for the whole card, "<mac>:<n>" for one outlet (switch and name),
  // "<mac>:alias" for the device name, "<mac>:lock" for Child Lock.
  busy: new Set(),
  pending: new Map(), // mac -> controls sent but not answered yet, shown over the last answer (applyPending)
  editing: null, // "<mac>:alias" or "<mac>:<n>" while a name field is open
  cancelEdit: null,
  qrUrl: null,
  win: null, // the open device window: {mac, edits (fields the user changed), alerts, busy}
  purge: null, // {mac, typing}: the hidden device whose history is about to be deleted; `typing` once the word box is open
  hiddenBusy: new Set(), // "<mac>:restore" or "<mac>:purge" while the request is out
  hiddenAlert: null, // {kind, keys, vars} shown under the hidden devices
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Two-press buttons: the first press arms a key for CONFIRM_MS, a second press in time confirms.
// `onExpire` draws the page again when the time runs out.
function createArming(onExpire) {
  const armed = new Map(); // key -> {at, timer}
  const disarm = (key) => {
    clearTimeout(armed.get(key)?.timer);
    armed.delete(key);
  };
  return {
    has: (key) => armed.has(key),
    disarm,
    clear: () => [...armed.keys()].forEach(disarm),
    /** True when this press confirms; otherwise it arms `key` and returns false. */
    press(key) {
      const next = pressConfirm(armed.get(key)?.at ?? null, Date.now(), CONFIRM_MS);
      disarm(key);
      if (next.confirmed) return true;
      const timer = setTimeout(() => {
        armed.delete(key);
        onExpire();
      }, CONFIRM_MS);
      armed.set(key, { at: next.armedAt, timer });
      return false;
    },
  };
}

const hideArming = createArming(() => render()); // "Hide device" on a card, by MAC
const otaArming = createArming(() => renderWindow()); // the update button of the device window
const purgeArming = createArming(() => {
  if (state.purge && !state.purge.typing) state.purge = null;
  renderHidden();
}); // "Delete history" of a hidden device, by MAC

// ---- Data sources ----
// A source reads load() -> {status, body} (`api/devices`, with the hidden devices in `removed` and the
// firmware state in `firmware`), device(mac) -> {status, body} (`api/devices/<mac>`) and ha() -> the `api/ha`
// answer or null. Controls resolve once the backend has answered and reject with its message (an Error with the
// backend's `state` when it sent one): power(mac, n, on) with n 0 for all outlets, rename(mac, alias),
// renameOutlet(mac, n, name), lock(mac, mask), refresh(mac), hide(mac), and for the device window and the hidden
// devices ota(mac, profileId), diagnostics(mac, {voltage_enabled, rssi_enabled, poll_interval}), rereadLock(mac),
// restore(mac) and purge(mac).

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
    ...createDeviceAdminApi(), // ota, diagnostics, rereadLock, restore, purge
  };
}

// Demo mode keeps its data in memory; controls change only that copy.
function createDemoSource() {
  const data = demoResponse();
  const now = () => Date.now() / 1000;
  // The sample data is fixed in time; move it to now so "N s ago" looks like a live backend.
  const shift = now() - Math.max(...data.devices.map((d) => d.last_seen));
  for (const d of data.devices) {
    d.last_seen += shift;
    for (const ch of d.channels) ch.last_seen += shift;
  }
  demoShiftFirmwareTimes(data, shift);
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
      demoAdvanceJob(data, now()); // an update started in this page moves on with every read
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
      data.removed.push({ ...d, removed: true, removed_at: now() });
    },
    async ota(mac, profileId) {
      await wait(300);
      return { ok: true, job: demoQueueJob(data, mac, profileId, now()) };
    },
    async diagnostics(mac, body) {
      await wait(300);
      return demoSetDiagnostics(data, mac, body, now());
    },
    async rereadLock(mac) {
      await wait(500);
      return demoRereadLock(data, mac);
    },
    async restore(mac) {
      await wait(300);
      return demoRestore(data, mac);
    },
    async purge(mac) {
      await wait(300);
      return demoPurge(data, mac);
    },
  };
}

// ---- Value cell ----

/** Value cell that shows a muted placeholder when there is no value. */
function setValue(el, value, placeholder = NA) {
  setText(el, value ?? placeholder);
  setData(el, "empty", value === null || value === undefined ? "yes" : "no");
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

  // One reserved slot: a running OTA job, else the offline note, else the firmware update; both open the device window.
  const notice = cardNotice(shown, state.poll.resp?.firmware, { authenticated: state.poll.authenticated, lang });
  setData(f.notice, "kind", notice.kind);
  setData(f.notice, "live", notice.live ? "yes" : "no");
  setText(f.fwText, notice.text);

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

  setHidden(f.settingsBtn, !state.poll.authenticated); // DEVICE SETTINGS opens even while the screen is locked
  const hideArmed = hideArming.has(mac);
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
  hideArming.disarm(mac);
}

/** Redraws one card after its control was answered, and the counts in the top bar and summary. */
function renderDevice(mac) {
  const raw = state.poll.devices.find((d) => normalizeMac(d?.mac) === mac);
  const card = cards.get(mac);
  if (raw && card) updateCard(card, raw);
  else renderCards();
  renderTopbar();
  renderSummary();
  renderWindow();
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
  const lockState = state.viewOnly ? "view" : state.unlocked ? "unlocked" : "locked";
  setData(lockBtn, "state", lockState);
  setAttr(lockBtn, "aria-disabled", String(state.viewOnly));
  if (state.viewOnly) lockBtn.removeAttribute("aria-pressed");
  else setAttr(lockBtn, "aria-pressed", String(state.unlocked));
  setAttr(lockBtn, "title", t(lang, { view: "view_only_hint", unlocked: "relock_hint", locked: "unlock_hint" }[lockState]));
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
  renderHidden();
  renderWindow();
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

/** Reads everything again after a change. A read that was already out may predate it, so wait for that one first. */
async function reread() {
  for (let i = 0; i < 150 && state.polling; i++) await wait(40);
  await poll();
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
  if (!btn || btn.disabled) return;
  const mac = btn.closest(".card")?.dataset.mac;
  // The device window opens while the screen is locked; only the controls inside it follow the lock.
  if (btn.dataset.act === "open-window") {
    if (cards.has(mac)) openWindow(mac);
    return;
  }
  if (!state.unlocked) return;
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

// Hiding needs a second press within CONFIRM_MS; the label says what the second press does.
function pressHide(mac) {
  if (hideArming.press(mac)) {
    // The hidden device shows up in the section below once everything is read again.
    run(mac, mac, null, () => state.source.hide(mac)).then(reread);
    return;
  }
  render();
}

// Locking and unlocking change only the screen; no request goes to the backend.
function toggleScreenLock() {
  if (state.viewOnly) return;
  state.unlocked = !state.unlocked;
  if (!state.unlocked) {
    state.cancelEdit?.("relock");
    hideArming.clear();
    purgeArming.clear();
    state.purge = null;
    state.hiddenAlert = null;
  }
  render();
}

// Pressing the lock button moves focus away from an open name field, and that blur would save it.
// Cancel the edit first, on pointerdown, which comes before the blur.
function cancelEditBeforeLock() {
  if (state.unlocked) state.cancelEdit?.("relock");
}

// ---- Device window ----

let dw = null; // {root, f}: the dialog and its fields, found in init()

/** The device the window shows as the last poll read it, or null when it is gone. */
function windowDevice() {
  const mac = state.win?.mac;
  return mac ? (state.poll.devices.find((d) => normalizeMac(d?.mac) === mac) ?? null) : null;
}

function windowModel(raw) {
  return deviceWindowModel(raw, state.poll.resp?.firmware, { unlocked: state.unlocked, viewOnly: state.viewOnly });
}

function unitText(seconds) {
  const unit = intervalUnit(seconds);
  return t(page.lang, unit.key, { n: unit.n });
}

function showWindowAlert(section, alert) {
  const line = dw.f[`${section}Alert`];
  const text = dw.f[`${section}AlertText`];
  setData(line, "kind", alert?.kind ?? "none");
  setText(text, alert ? alert.keys.map((key) => t(page.lang, key, alert.vars)).join(" ") : "");
  setHidden(text, !alert);
}

function failure(err) {
  return { kind: "bad", keys: ["action_failed"], vars: { msg: err?.message ?? String(err) } };
}

function renderWindow() {
  const win = state.win;
  if (!win) return;
  const raw = windowDevice();
  if (!raw) {
    closeWindow(); // hidden or gone while the window was open
    return;
  }
  const { f } = dw;
  const lang = page.lang;
  const m = windowModel(raw);
  const { fw, lock, controls } = m;

  setText(f.name, deviceTitle(raw));
  setText(f.mac, fmtMac(win.mac));
  setData(f.status, "state", raw.online === true ? "ok" : "idle");
  setText(f.statusText, t(lang, raw.online === true ? "online" : "offline"));
  const why = state.viewOnly ? "view_only_hint" : !state.unlocked ? "dw_locked" : raw.online !== true ? "dw_offline" : null;
  setText(f.state, why ? t(lang, why) : "");
  setHidden(f.state, why === null);

  // FIRMWARE
  setValue(f.fwCurrent, fw.current);
  setValue(f.fwTarget, fw.target);
  const target = raw.firmware_target;
  const noteKey = fwNoteKey(fw, target, m.pcTool);
  setText(f.fwNote, noteKey ? t(lang, noteKey) : "");
  setHidden(f.fwNote, noteKey === null);
  // Below 1.0.111 a strip listens for firmware on TCP 80 only, which the app does not open; deviceFirmware turns the update button off.
  setText(f.fwPort, m.pcTool ? t(lang, "dw_port80") : "");
  setHidden(f.fwPort, !m.pcTool);
  const job = fw.job;
  setHidden(f.job, !job);
  if (job) {
    const tone = jobTone(job);
    setData(f.job, "tone", tone);
    setData(f.job, "active", fw.active ? "yes" : "no");
    setData(f.jobBadge, "state", tone);
    setData(f.jobBadge, "live", fw.active ? "yes" : "no");
    setText(f.jobText, jobLabel(lang, job.state));
    setText(f.jobMeta, `${job.from_version ?? NA} → ${job.target_version ?? NA} · ${fmtAgo(job.updated_at, Date.now() / 1000)}`);
    const detail = typeof job.detail === "string" ? job.detail.trim() : "";
    setText(f.jobDetail, detail);
    setHidden(f.jobDetail, detail === "");
  }
  setHidden(f.otaRow, fw.action === null);
  if (fw.action !== null) {
    const can = controls && fw.canUpdate;
    if (otaArming.has("ota") && !can) otaArming.disarm("ota"); // what it would do is no longer possible
    paintButton(f.ota, {
      label: `fw_${fw.action}`, vars: { v: fw.target ?? NA }, can, armed: otaArming.has("ota"), busy: win.busy.has("ota"),
    });
  }
  const warn = otaArming.has("ota")
    ? { kind: "warn", keys: otaWarnKeys(fw.action, target), vars: { from: fw.current ?? NA, to: fw.target ?? NA } }
    : null;
  showWindowAlert("fw", pickAlert(warn, win.alerts.fw));

  // MEASUREMENT
  const form = measureForm(m.measure, win.edits);
  const measureBusy = win.busy.has("measure");
  if (f.voltage.checked !== form.voltage) f.voltage.checked = form.voltage;
  if (f.rssi.checked !== form.rssi) f.rssi.checked = form.rssi;
  const intervals = DIAG_INTERVALS.includes(form.interval) ? [...DIAG_INTERVALS] : [...DIAG_INTERVALS, form.interval].sort((a, b) => a - b);
  syncOptions(f.interval, intervals.map((n) => ({ value: String(n), text: unitText(n) })), form.interval);
  for (const field of [f.voltage, f.rssi, f.interval]) setDisabled(field, !controls || measureBusy);
  paintButton(f.apply, { label: "dw_apply", can: controls && form.dirty, busy: measureBusy });
  showWindowAlert("measure", win.alerts.measure);

  // CHILD LOCK (1.0.111 only)
  setHidden(f.lockSection, lock === null);
  if (lock) {
    const known = lock.mask !== null;
    setText(f.lockState, lock.synced && known ? t(lang, "lock_mask", { n: lock.mask }) : t(lang, "lock_pending"));
    const stale = !lock.synced && known;
    setText(f.lockStale, stale ? t(lang, "lock_stale", { n: lock.mask }) : "");
    setHidden(f.lockStale, !stale);
    paintButton(f.reread, { label: "lock_reread", can: controls && lock.canReread, busy: win.busy.has("lock") });
    showWindowAlert("lock", win.alerts.lock);
  }
}

function openWindow(mac) {
  // The dialog says whether a window is open: its close event can come late, and Esc closes it without us.
  if (dw.root.open || !state.poll.devices.some((d) => normalizeMac(d?.mac) === mac)) return;
  otaArming.clear();
  state.win = { mac, edits: {}, alerts: { fw: null, measure: null, lock: null }, busy: new Set() };
  renderWindow();
  dw.root.showModal();
}

function closeWindow() {
  state.win = null;
  otaArming.clear();
  if (dw.root.open) dw.root.close();
}

/**
 * Sends one request of the window. `id` is its slot in win.busy and `section` the line that shows the result.
 * Everything is read again afterwards, also after a failure, so the window shows what the backend now holds.
 */
async function runWindow(id, section, work, ok, fail = failure) {
  const win = state.win;
  if (!win || !state.unlocked || win.busy.has(id)) return;
  otaArming.clear();
  win.busy.add(id);
  win.alerts[section] = null;
  renderWindow();
  let answer;
  let error = null;
  try {
    answer = await work();
  } catch (err) {
    error = err;
  }
  await reread();
  win.busy.delete(id);
  win.alerts[section] = error ? fail(error) : ok(answer);
  if (state.win === win) renderWindow();
}

// The update uses the target the device reports, which the settings page saved; the first press shows the warning.
function pressOta() {
  const win = state.win;
  const raw = windowDevice();
  if (!win || !raw) return;
  const { controls, fw } = windowModel(raw);
  const profileId = raw.firmware_target?.profile_id;
  if (!controls || !fw.canUpdate || !profileId) return;
  if (!otaArming.press("ota")) {
    win.alerts.fw = null;
    renderWindow();
    return;
  }
  runWindow("ota", "fw", () => state.source.ota(win.mac, profileId), () => ({ kind: "ok", keys: ["dw_ota_queued"] }));
}

function applyMeasure() {
  const win = state.win;
  const raw = windowDevice();
  if (!win || !raw) return;
  const m = windowModel(raw);
  const form = measureForm(m.measure, win.edits);
  if (!m.controls || !form.dirty) return;
  runWindow("measure", "measure", () => state.source.diagnostics(win.mac, measurePayload(form)), () => {
    win.edits = {};
    return { kind: "ok", keys: ["saved"] };
  });
}

function rereadLock() {
  const win = state.win;
  const raw = windowDevice();
  if (!win || !raw) return;
  const m = windowModel(raw);
  if (!m.controls || !m.lock?.canReread) return;
  runWindow(
    "lock", "lock", () => state.source.rereadLock(win.mac),
    (answer) => ({ kind: "ok", keys: ["lock_reread_ok"], vars: { n: answer?.mask ?? NA } }),
    (err) => {
      const key = lockErrorKey(err?.state);
      return key ? { kind: "bad", keys: [key] } : failure(err); // a state this page does not know shows the backend's text
    },
  );
}

function onWindowClick(event) {
  if (event.target === dw.root) {
    closeWindow(); // a click on the backdrop
    return;
  }
  const btn = event.target.closest("[data-act]");
  if (!btn || btn.disabled || !state.win) return;
  switch (btn.dataset.act) {
    case "dw-close": closeWindow(); break;
    case "dw-ota": pressOta(); break;
    case "dw-apply": applyMeasure(); break;
    case "dw-reread": rereadLock(); break;
    default: break;
  }
}

/** A changed measurement field goes into win.edits, which a poll never overwrites. */
function onWindowEdit(event) {
  const win = state.win;
  const field = event.target.dataset?.f;
  const raw = windowDevice();
  if (!win || !raw || !["voltage", "rssi", "interval"].includes(field)) return;
  const value = field === "interval" ? Number(event.target.value) : event.target.checked;
  if (value === windowModel(raw).measure[field]) delete win.edits[field]; // back to what the device holds: no change
  else win.edits[field] = value;
  win.alerts.measure = null;
  renderWindow();
}

// ---- Hidden devices ----

let hiddenUi = null; // {root, f}: the section and its fields, found in init()

function createHiddenRow() {
  const el = $("#hidden-row-tpl").content.firstElementChild.cloneNode(true);
  applyStrings(el);
  return el;
}

function updateHiddenRow(el, r) {
  const f = fieldMap(el);
  const live = state.unlocked;
  const mine = (act) => state.hiddenBusy.has(`${r.mac}:${act}`);
  const anyBusy = mine("restore") || mine("purge");
  const typing = state.purge?.mac === r.mac && state.purge.typing;
  el.dataset.mac = r.mac;
  setText(f.name, r.name);
  setText(f.meta, `${r.macText} · ${t(page.lang, "hidden_kept", { kwh: r.kwh })}`);
  paintButton(f.restore, { label: "restore", can: live && !anyBusy && !typing, busy: mine("restore") });
  paintButton(f.purge, { label: "purge", can: live && !anyBusy && !typing, armed: purgeArming.has(r.mac) });
  setHidden(f.box, !typing);
  if (!typing && f.word.value !== "") f.word.value = ""; // the word is typed again for every delete
  setDisabled(f.word, !live || anyBusy);
  paintButton(f.purgeDo, { label: "purge_do", can: live && typing && deleteWordOk(f.word.value), busy: mine("purge") });
}

function showHiddenAlert(alert) {
  const { f } = hiddenUi;
  setData(f.alert, "kind", alert?.kind ?? "none");
  setText(f.alertText, alert ? alert.keys.map((key) => t(page.lang, key, alert.vars)).join(" ") : "");
  setHidden(f.alertText, !alert);
}

function renderHidden() {
  const { root, f } = hiddenUi;
  const rows = hiddenModel(state.poll.resp?.removed);
  setHidden(root, rows.length === 0);
  setText(f.title, `${t(page.lang, "hidden_title")} (${rows.length})`);
  setData(root, "controls", state.unlocked ? "live" : "locked");
  if (state.purge && !rows.some((r) => r.mac === state.purge.mac)) state.purge = null; // restored or deleted elsewhere
  syncList(f.list, rows, (r) => r.mac, createHiddenRow, updateHiddenRow);
  const target = state.purge ? rows.find((r) => r.mac === state.purge.mac) : null;
  const warn = target ? { kind: "warn", keys: ["purge_warn"], vars: { name: target.name } } : null;
  showHiddenAlert(pickAlert(warn, state.hiddenAlert));
}

/** Sends one request for a hidden device, reads everything again and shows `okAlert`, or the failure. */
async function runHidden(mac, act, work, okAlert) {
  const key = `${mac}:${act}`;
  if (!state.unlocked || state.hiddenBusy.has(key)) return;
  state.hiddenBusy.add(key);
  state.hiddenAlert = null;
  renderHidden();
  let error = null;
  try {
    await work();
  } catch (err) {
    error = err;
  }
  await reread();
  state.hiddenBusy.delete(key);
  if (act === "purge" && !error) state.purge = null;
  state.hiddenAlert = error ? failure(error) : okAlert;
  render(); // a device that was shown again is a card now
}

// Deleting a history takes two presses, then the word DELETE.
function pressPurge(mac) {
  if (state.purge && state.purge.mac !== mac) purgeArming.clear(); // another row starts over
  if (purgeArming.press(mac)) {
    state.purge = { mac, typing: true };
    renderHidden();
    hiddenUi.f.list.querySelector(`[data-mac="${mac}"] [data-f=word]`)?.focus();
    return;
  }
  state.purge = { mac, typing: false };
  state.hiddenAlert = null;
  renderHidden();
}

function onHiddenClick(event) {
  const btn = event.target.closest("[data-act]");
  if (!btn || btn.disabled || !state.unlocked) return;
  const rowEl = btn.closest(".hidden-row");
  const row = hiddenModel(state.poll.resp?.removed).find((r) => r.mac === rowEl?.dataset.mac);
  if (!row) return;
  const { mac, name } = row;
  switch (btn.dataset.act) {
    case "restore":
      runHidden(mac, "restore", () => state.source.restore(mac), { kind: "ok", keys: ["restore_done"], vars: { name } });
      break;
    case "purge":
      pressPurge(mac);
      break;
    case "purge-do":
      if (state.purge?.typing && state.purge.mac === mac && deleteWordOk(rowEl.querySelector("[data-f=word]").value)) {
        runHidden(mac, "purge", () => state.source.purge(mac), { kind: "ok", keys: ["purge_done"], vars: { name } });
      }
      break;
    case "purge-cancel":
      state.purge = null;
      state.hiddenAlert = null;
      purgeArming.clear();
      renderHidden();
      break;
    default:
      break;
  }
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
  state.viewOnly = isViewOnly({ pathname: location.pathname, demo });
  $("#demo-badge").hidden = !demo;
  if (demo) useDemoLinks();

  initPage({ onLangChange: render });
  $("#lock-btn").addEventListener("pointerdown", cancelEditBeforeLock);
  $("#lock-btn").addEventListener("click", toggleScreenLock);
  $("#devices").addEventListener("click", onDeviceClick);
  dw = { root: $("#device-dialog"), f: fieldMap($("#device-dialog")) };
  dw.root.addEventListener("click", onWindowClick);
  dw.root.addEventListener("change", onWindowEdit);
  dw.root.addEventListener("close", () => {
    state.win = null;
    otaArming.clear();
  });
  hiddenUi = { root: $("#hidden-section"), f: fieldMap($("#hidden-section")) };
  hiddenUi.root.addEventListener("click", onHiddenClick);
  hiddenUi.root.addEventListener("input", (e) => {
    if (e.target.dataset?.f === "word") renderHidden(); // the delete button follows what is typed
  });
  window.addEventListener("hashchange", () => {
    focusedHash = "";
    focusHashDevice();
  });

  render();
  poll();
  // The backend is read again every 5 s; the demo data changes through its controls, and a demo update moves on with each read.
  setInterval(poll, POLL_MS);
  setInterval(updateAges, AGE_TICK_MS);
}

init();
