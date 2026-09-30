// Page wiring for logview.html, the backend log. Rows reach the page only through textContent;
// filtering and formatting live in dashboard-core.mjs.
import {
  t, logFilters, logQuery, filterLogs, fmtLogTime, logText, logRowKey, pressConfirm, demoLogs, apiGet, apiSend, isViewOnly,
} from "./dashboard-core.mjs";
import { page, applyTheme, initPage, setText, useDemoLinks } from "./page.mjs";

const AUTO_MS = 2000;
const DEMO_BUFFER = 5000;
const CLEAR_CONFIRM_MS = 4000;

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  source: null,
  rows: [],
  version: null,
  loaded: false,
  stale: false,
  loading: false,
  status: null, // {key, vars} so a language switch can redraw it
  timer: null,
  clearArmedAt: null, // time of the first "Clear buffer" press, see pressConfirm
  clearTimer: null,
  copyTimer: null,
  viewOnly: false, // opened outside the HA sidebar: the backend refuses "Clear buffer", so it is not shown
};

// ---- Data sources ----
// A source answers load(filters) with {status, body} shaped like `api/logs`
// ({version, level, category, rows}) or {error}, and empties the buffer with clear().

function createApiLogSource() {
  return {
    demo: false,
    load: (filters) => apiGet(`api/logs?${logQuery(filters)}`),
    clear: () => apiSend("POST", "api/logs/clear"),
  };
}

function createDemoLogSource() {
  let rows = demoLogs();
  let last = rows[rows.length - 1];
  const live = [
    ["DEBUG", "wire", "TX 0a1b2c3d4e5f up:getinfo"],
    ["DEBUG", "wire", "RX 0a1b2c3d4e5f up:getinfo:1:1:84300:31"],
    ["INFO", "control", "physical relay event mac=0a1b2c3d4e60 selector=3 state=1"],
  ];
  let reads = 0;
  const add = (level, category, message) => {
    last = { seq: last.seq + 1, ts: last.ts + 2, level, logger: "mttl", category, message, thread: "MainThread" };
    rows.push(last);
    if (rows.length > DEMO_BUFFER) rows.shift();
  };
  return {
    demo: true,
    async load(filters) {
      // Each later read brings one new line so auto refresh has something to show.
      if (reads++ > 0) add(...live[reads % live.length]);
      const f = logFilters(filters);
      return { status: 200, body: { version: "0.2.11", level: f.level, category: f.category, rows: filterLogs(rows, f) } };
    },
    async clear() {
      rows = [];
      add("INFO", "other", "web log buffer cleared by administrator");
    },
  };
}

function setHidden(el, hidden) {
  if (el.hidden !== hidden) el.hidden = hidden;
}

// ---- Rendering ----

const rowEls = new Map(); // logRowKey(row) -> row element; a row's content never changes under its key

function createRow(r) {
  const el = $("#log-row-tpl").content.firstElementChild.cloneNode(true);
  el.dataset.level = String(r.level ?? "");
  const f = {};
  for (const x of el.querySelectorAll("[data-f]")) f[x.dataset.f] = x;
  setText(f.time, fmtLogTime(r.ts));
  setText(f.level, r.level ?? "");
  setText(f.cat, r.category || "other");
  setText(f.msg, r.message ?? "");
  return el;
}

function renderRows() {
  const list = $("#log-rows");
  const seen = new Set();
  let prev = null;
  for (const r of state.rows) {
    const key = logRowKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    let el = rowEls.get(key);
    if (!el) {
      el = createRow(r);
      rowEls.set(key, el);
    }
    const want = prev ? prev.nextElementSibling : list.firstElementChild;
    if (want !== el) list.insertBefore(el, want);
    prev = el;
  }
  for (const [key, el] of rowEls) {
    if (!seen.has(key)) {
      el.remove();
      rowEls.delete(key);
    }
  }
}

function renderTopbar() {
  const server = $("#server-badge");
  const serverState = state.stale ? "bad" : state.loaded ? "ok" : "idle";
  if (server.dataset.state !== serverState) server.dataset.state = serverState;
  setText($("[data-f=text]", server), t(page.lang, { ok: "server_online", bad: "server_offline", idle: "server_checking" }[serverState]));
  setText($("#backend-version"), state.version ? t(page.lang, "backend", { v: state.version }) : "");
}

function renderStatus() {
  setText($("#log-status"), state.status ? t(page.lang, state.status.key, state.status.vars) : "");
}

function renderChrome() {
  renderTopbar();
  renderStatus();
}

function nearBottom() {
  return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 140;
}

/** Where the reader is looking, so new rows do not move it. */
function captureAnchor() {
  if (nearBottom()) return { bottom: true };
  if ($("#log-view").value === "compact") {
    for (const el of $("#log-rows").children) {
      const box = el.getBoundingClientRect();
      if (box.bottom >= 0) return { el, top: box.top };
    }
  }
  return { y: window.scrollY };
}

function restoreAnchor(anchor) {
  requestAnimationFrame(() => {
    if (anchor.bottom) window.scrollTo(0, document.documentElement.scrollHeight);
    else if (anchor.el?.isConnected) window.scrollBy(0, anchor.el.getBoundingClientRect().top - anchor.top);
    else if (Number.isFinite(anchor.y)) window.scrollTo(0, anchor.y);
  });
}

function render(anchor = captureAnchor()) {
  const view = $("#log-view").value;
  setHidden($("#log-rows"), view !== "compact");
  setHidden($("#log-text"), view !== "text");
  setHidden($("#log-json"), view !== "json");
  setHidden($("#log-empty"), !(view === "compact" && state.loaded && state.rows.length === 0));
  if (view === "compact") renderRows();
  else setText($(`#log-${view}`), logText(state.rows, view));
  renderChrome();
  restoreAnchor(anchor);
}

// ---- Loading and actions ----

function currentFilters() {
  return { level: $("#log-level").value, category: $("#log-category").value, limit: $("#log-limit").value };
}

function nowText() {
  return fmtLogTime(Date.now() / 1000).slice(11, 19);
}

async function load() {
  if (!state.source || state.loading) return;
  state.loading = true;
  const anchor = captureAnchor();
  try {
    const result = await state.source.load(currentFilters());
    if (result.status === 200) {
      state.rows = Array.isArray(result.body?.rows) ? result.body.rows : [];
      state.version = result.body?.version ?? state.version;
      state.loaded = true;
      state.stale = false;
      state.status = { key: "log_status", vars: { n: state.rows.length, time: nowText() } };
    } else {
      state.stale = true;
      state.status = { key: "log_error", vars: { msg: result.error ?? result.body?.error ?? `HTTP ${result.status}` } };
    }
  } catch (err) {
    state.stale = true;
    state.status = { key: "log_error", vars: { msg: err?.message ?? String(err) } };
  } finally {
    state.loading = false;
  }
  applyTheme(); // HA's dark mode may have changed since the last load.
  render(anchor);
}

function setAuto() {
  clearInterval(state.timer);
  state.timer = null;
  if ($("#log-auto").checked) {
    state.timer = setInterval(() => {
      if (!document.hidden) load();
    }, AUTO_MS);
  }
}

function copyFallback(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

async function copyLogs() {
  const view = $("#log-view").value;
  const text = logText(state.rows, view === "json" ? "json" : "text");
  let ok = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    ok = copyFallback(text);
  }
  if (!ok) {
    state.status = { key: "log_copy_failed", vars: {} };
    renderChrome();
    return;
  }
  const btn = $("#log-copy");
  setText(btn, t(page.lang, "log_copied", { n: state.rows.length }));
  clearTimeout(state.copyTimer);
  state.copyTimer = setTimeout(() => {
    setText(btn, t(page.lang, "log_copy"));
  }, 1400);
}

function disarmClear() {
  const btn = $("#log-clear");
  clearTimeout(state.clearTimer);
  state.clearArmedAt = null;
  btn.dataset.state = "idle";
  setText(btn, t(page.lang, "log_clear"));
}

// Clearing needs a second press within CLEAR_CONFIRM_MS instead of a browser confirm() dialog.
async function onClear() {
  const btn = $("#log-clear");
  if (!state.source || state.viewOnly) return;
  const next = pressConfirm(state.clearArmedAt, Date.now(), CLEAR_CONFIRM_MS);
  if (!next.confirmed) {
    clearTimeout(state.clearTimer);
    state.clearArmedAt = next.armedAt;
    btn.dataset.state = "armed";
    setText(btn, t(page.lang, "log_clear_confirm"));
    state.clearTimer = setTimeout(disarmClear, CLEAR_CONFIRM_MS);
    return;
  }
  disarmClear();
  try {
    await state.source.clear();
  } catch (err) {
    state.status = { key: "log_error", vars: { msg: err?.message ?? String(err) } };
    renderChrome();
    return;
  }
  await load();
}

// ---- Start ----

function init() {
  const demo = new URLSearchParams(location.search).has("demo");
  state.source = demo ? createDemoLogSource() : createApiLogSource();
  state.viewOnly = isViewOnly({ pathname: location.pathname, demo });
  $("#demo-badge").hidden = !demo;
  $("#log-clear").hidden = state.viewOnly;
  if (demo) useDemoLinks();

  initPage({
    onLangChange: () => {
      disarmClear();
      renderChrome();
    },
  });
  for (const id of ["#log-level", "#log-category", "#log-limit"]) $(id).addEventListener("change", load);
  $("#log-view").addEventListener("change", () => render());
  $("#log-auto").addEventListener("change", setAuto);
  $("#log-refresh").addEventListener("click", load);
  $("#log-copy").addEventListener("click", copyLogs);
  $("#log-clear").addEventListener("click", onClear);

  renderChrome();
  load();
  setAuto();
}

init();
