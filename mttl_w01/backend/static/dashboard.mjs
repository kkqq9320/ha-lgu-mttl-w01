// Page wiring for dashboard.html. Values reach the page only through textContent,
// attributes and data-* states; see dashboard-core.mjs for the logic.
import {
  DASH, t, pickLang, resolveTheme, normalizeMac, fmtMac,
  cardModel, summaryModel, guestView, demoResponse, demoHa,
} from "./dashboard-core.mjs";

const THEME_KEY = "mttl.theme";
const LANG_KEY = "mttl.lang";

const $ = (sel, root = document) => root.querySelector(sel);

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked inside the HA frame; the choice then lasts for this page only.
  }
}

const savedTheme = storageGet(THEME_KEY);
const state = {
  source: null,
  resp: null,
  ha: null,
  lang: pickLang(storageGet(LANG_KEY), navigator.language),
  theme: ["auto", "dark", "light"].includes(savedTheme) ? savedTheme : "auto",
  busy: new Set(), // "<mac>" for the whole card, "<mac>:<n>" for one outlet, "<mac>:lock"
  editing: null, // "<mac>" or "<mac>:<n>" while a name field is open
};

// ---- Data sources ----
// A source answers load() with {status, body} (the `api/devices` response) and performs controls.
// Demo mode keeps its data in memory; the real API source is added separately.

function createDemoSource() {
  const data = demoResponse();
  const lastPower = new Map();
  let authenticated = true;
  const device = (mac) => {
    const d = data.devices.find((x) => x.mac === mac);
    if (!d) throw new Error("device not found");
    return d;
  };
  const channel = (mac, n) => device(mac).channels.find((ch) => ch.selector === n);
  const requireAdmin = () => {
    if (!authenticated) throw new Error("login required");
  };
  return {
    demo: true,
    async load() {
      const body = structuredClone({ ...data, authenticated });
      return { status: 200, body: authenticated ? body : guestView(body) };
    },
    async ha() {
      return authenticated ? demoHa() : null;
    },
    async power(mac, n, on) {
      requireAdmin();
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
      requireAdmin();
      device(mac).alias = alias.trim() || null;
    },
    async renameOutlet(mac, n, name) {
      requireAdmin();
      channel(mac, n).name = name.trim() || null;
    },
    async lock(mac, mask) {
      requireAdmin();
      device(mac).childlock_mask = mask;
    },
    async login() {
      authenticated = true;
      return true;
    },
    async logout() {
      authenticated = false;
    },
  };
}

// ---- Theme and language ----

function haDarkMode() {
  try {
    if (window.parent === window) return undefined;
    const dark = window.parent.document.querySelector("home-assistant")?.hass?.themes?.darkMode;
    return typeof dark === "boolean" ? dark : undefined;
  } catch {
    return undefined;
  }
}

const lightQuery = window.matchMedia("(prefers-color-scheme: light)");

function applyTheme() {
  document.documentElement.dataset.theme = resolveTheme(state.theme, haDarkMode(), lightQuery.matches);
  $("#theme-select").value = state.theme;
}

function applyStrings(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(state.lang, el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-title]")) {
    const label = t(state.lang, el.dataset.i18nTitle);
    el.title = label;
    el.setAttribute("aria-label", label);
  }
}

function applyLang() {
  document.documentElement.lang = state.lang;
  for (const b of document.querySelectorAll("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang));
  $("#lang-group").setAttribute("aria-label", t(state.lang, "language"));
  $("#theme-select").closest("label").title = t(state.lang, "theme");
  applyStrings();
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

function fieldMap(root) {
  const f = {};
  for (const el of root.querySelectorAll("[data-f]")) f[el.dataset.f] = el;
  return f;
}

// ---- Cards ----

const cards = new Map(); // mac -> {root, f, outlets: [{root, f}], lockBits: HTMLButtonElement[]}

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
  const lang = state.lang;
  const cardBusy = state.busy.has(m.mac);

  setData(root, "online", m.online ? "on" : "off");
  if (state.editing !== m.mac) setText(f.title, m.title);
  setAttr(f.titleInput, "placeholder", `MTTL ${m.mac.slice(-6).toUpperCase()}`);
  setHidden(f.renameBtn, !m.editable);
  setText(f.mac, fmtMac(m.mac));
  setText(f.fw, m.firmware ?? DASH);
  setHidden(f.ip, m.ip === null);
  setText(f.ip, m.ip ?? "");
  setText(f.status, t(lang, m.online ? "online" : "offline"));

  setHidden(f.fwUpdate, m.fwAction === null);
  if (m.fwAction !== null) {
    setText(f.fwUpdate, t(lang, `fw_${m.fwAction}`, { v: m.fwTarget ?? DASH }));
    f.fwUpdate.href = `tuo.html#device=${m.mac}`;
  }

  setText(f.totalW, m.totalW);
  setText(f.totalKwh, m.totalKwh);
  setHidden(f.voltageRow, m.voltage === null);
  setText(f.voltage, m.voltage ?? "");
  setHidden(f.rssiRow, m.rssi === null);
  setText(f.rssi, m.rssi ?? "");
  setHidden(f.note, m.online);

  setDisabled(f.allOn, !m.controls || cardBusy);
  setDisabled(f.allOff, !m.controls || cardBusy);

  const lock = m.lock?.supported ? m.lock : null;
  const lockBusy = state.busy.has(`${m.mac}:lock`);
  const synced = lock?.synced === true;
  setHidden(f.lock, lock === null);
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
    if (!busy) setText(of.toggle, o.on === null ? DASH : t(lang, o.on ? "on" : "off"));
    setDisabled(of.toggle, !m.controls || o.on === null || busy);
  });
  card.raw = raw;
}

function renderCards() {
  const list = $("#devices");
  const resp = state.resp;
  const devices = Array.isArray(resp?.devices) ? resp.devices : [];
  const opts = { authenticated: resp?.authenticated === true, lang: state.lang };
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

function renderHeader() {
  const s = summaryModel(state.resp, state.ha);
  const lang = state.lang;
  setText($("#backend-version"), s.version ? t(lang, "backend", { v: s.version }) : "");
  setText($("#online-count"), state.resp === null ? "" : t(lang, "online_count", { n: s.online, total: s.total }));
  setText($("#auth-btn"), t(lang, s.admin ? "logout" : "login"));
  setHidden($("#guest-banner"), state.resp === null || s.admin);

  const mqtt = $("#sum-mqtt");
  setData(mqtt, "state", s.mqtt);
  setText($("[data-f=value]", mqtt), t(lang, s.mqtt === "login" ? "login_required" : `mqtt_${s.mqtt}`));

  const fw = $("#sum-fw");
  if (!s.admin) {
    setData(fw, "state", "login");
    setText($("[data-f=value]", fw), t(lang, "login_required"));
    setText($("[data-f=sub]", fw), "");
  } else {
    setData(fw, "state", s.fwPending > 0 ? "pending" : "ok");
    setText($("[data-f=value]", fw), t(lang, "fw_target", { v: s.fwTarget ?? DASH }));
    setText($("[data-f=sub]", fw), s.fwPending > 0 ? t(lang, "fw_pending", { n: s.fwPending }) : t(lang, "fw_none"));
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
  state.ha = state.resp?.authenticated ? await state.source.ha() : null;
  applyTheme(); // HA's dark mode may have changed since the last load.
  render();
  focusHashDevice();
}

function showError(err) {
  const el = $("#action-error");
  el.textContent = t(state.lang, "action_failed", { msg: err?.message ?? String(err) });
  el.hidden = false;
  clearTimeout(showError.timer);
  showError.timer = setTimeout(() => {
    el.hidden = true;
  }, 5000);
}

async function run(key, action) {
  if (state.busy.has(key)) return;
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
  if (!btn || btn.disabled) return;
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
    setText(btn, t(state.lang, on ? "on" : "off"));
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
  if (state.editing) return;
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
    const value = input.value;
    if (commit && value.trim() !== String(current).trim()) run(key, () => save(value));
    else render();
  };
  const onKey = (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  };
  const onBlur = () => finish(true);
  input.addEventListener("keydown", onKey);
  input.addEventListener("blur", onBlur);
}

// ---- #device=<mac> ----

let focusedHash = "";

function focusHashDevice() {
  const match = location.hash.match(/^#device=(.+)$/);
  const mac = match ? normalizeMac(decodeURIComponent(match[1])) : null;
  if (!mac || focusedHash === location.hash) return;
  const card = cards.get(mac);
  if (!card) return;
  focusedHash = location.hash;
  card.root.classList.add("is-target");
  card.root.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => card.root.classList.remove("is-target"), 3200);
}

// ---- Login ----

function openLogin() {
  const dialog = $("#login-dialog");
  $("#login-error").hidden = true;
  $("#login-demo-note").hidden = !state.source?.demo;
  dialog.showModal();
  $("#login-form").elements.password.focus();
}

async function submitLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const password = form.elements.password.value;
  form.elements.password.value = "";
  let ok = false;
  try {
    ok = await state.source.login(password);
  } catch {
    ok = false;
  }
  if (!ok) {
    const err = $("#login-error");
    err.textContent = t(state.lang, "login_failed");
    err.hidden = false;
    return;
  }
  $("#login-dialog").close();
  await refresh();
}

async function onAuthClick() {
  if (!state.source) return;
  if (state.resp?.authenticated) {
    await state.source.logout();
    await refresh();
  } else {
    openLogin();
  }
}

// ---- Start ----

function init() {
  const params = new URLSearchParams(location.search);
  state.source = params.has("demo") ? createDemoSource() : null;
  $("#demo-badge").hidden = !state.source?.demo;

  applyTheme();
  applyLang();
  lightQuery.addEventListener("change", applyTheme);
  $("#theme-select").addEventListener("change", (e) => {
    state.theme = e.target.value;
    storageSet(THEME_KEY, state.theme);
    applyTheme();
  });
  $("#lang-group").addEventListener("click", (e) => {
    const lang = e.target.closest("[data-lang]")?.dataset.lang;
    if (!lang || lang === state.lang) return;
    state.lang = lang;
    storageSet(LANG_KEY, lang);
    applyLang();
    render();
  });
  $("#auth-btn").addEventListener("click", onAuthClick);
  $("#login-form").addEventListener("submit", submitLogin);
  $("#login-cancel").addEventListener("click", () => $("#login-dialog").close());
  $("#devices").addEventListener("click", onDeviceClick);
  window.addEventListener("hashchange", () => {
    focusedHash = "";
    focusHashDevice();
  });

  render();
  refresh();
}

init();
