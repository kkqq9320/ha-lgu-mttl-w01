// Dashboard and log page logic without DOM access, including the backend requests.
// dashboard.mjs and logview.mjs wire it to the pages; tests/js/*.test.mjs run it under Node.

/** Shown for any missing or unmeasured value, in both languages. */
export const NA = "N/A";

export const STRINGS = {
  en: {
    demo: "Demo",
    backend: "Backend {v}",
    online_count: "{n}/{total} devices online",
    server_online: "Server online",
    server_offline: "Server offline",
    server_checking: "Checking server",
    unlock: "Unlock",
    relock: "Lock",
    unlock_hint: "Controls are locked. Unlock to switch outlets and rename.",
    relock_hint: "Controls are live. Lock to prevent accidental presses.",
    settings: "Settings",
    logs: "Logs",
    theme: "Theme",
    theme_auto: "Auto",
    theme_dark: "Dark",
    theme_light: "Light",
    language: "Language",
    sum_mqtt: "Home Assistant MQTT",
    mqtt_connected: "Connected",
    mqtt_disconnected: "Disconnected",
    mqtt_off: "Off",
    unknown: "Unknown",
    mqtt_broker: "Broker",
    mqtt_topic: "Topic prefix",
    mqtt_discovery: "Discovery prefix",
    sum_fw: "Firmware",
    fw_target_label: "Target version",
    fw_pending_label: "Devices to update",
    fw_pending_count: "{n}",
    fw_ota_host: "OTA server",
    fw_badge_pending: "Update {n}",
    fw_badge_ok: "Up to date",
    open_settings: "Open settings",
    open_logs: "View logs",
    sum_app: "Android setup app",
    apk_download: "Download APK",
    pc_download: "Download PC tool",
    qr_label: "QR code for {url}",
    empty: "Waiting for an MTTL-W01 device.",
    online: "Online",
    offline: "Offline",
    offline_note: "Offline · last received values",
    total_power: "Total power",
    total_energy: "Energy",
    voltage: "Voltage",
    rssi: "RSSI",
    all_on: "All ON",
    all_off: "All OFF",
    refresh: "Refresh",
    outlet: "Outlet {n}",
    power: "Power",
    energy: "Energy",
    temp: "Temp",
    on: "ON",
    off: "OFF",
    rename: "Rename",
    hide_device: "Hide device",
    hide_confirm: "Confirm hide",
    hide_hint: "Removes the device from the dashboard and Home Assistant. Restore it in Settings.",
    hide_note: "Restore it later in Settings",
    lock: "Child lock",
    lock_all: "All",
    lock_pending: "Waiting for sync",
    lock_bit: "Lock {name}",
    fw_update: "Firmware update → {v}",
    fw_downgrade: "Firmware downgrade → {v}",
    fw_reflash: "Reinstall firmware {v}",
    action_failed: "Request failed: {msg}",
    log_title: "Backend log",
    log_note: "Memory keeps the latest 5,000 rows. DEBUG and above also go to backend.log (5 MB, 3 files).",
    log_back: "Dashboard",
    log_level: "Level",
    log_level_DEBUG: "DEBUG+ detailed",
    log_level_INFO: "INFO+ brief",
    log_level_WARNING: "WARNING+",
    log_level_ERROR: "ERROR",
    log_category: "Category",
    log_cat_all: "All",
    log_cat_ota: "OTA",
    log_cat_wire: "Wire TX/RX",
    log_cat_control: "Control",
    log_cat_childlock: "Child Lock",
    log_cat_ha: "Home Assistant",
    log_cat_connection: "Connection",
    log_cat_storage: "DB/backup",
    log_cat_other: "Other",
    log_view: "View",
    log_view_compact: "Compact",
    log_view_text: "Text",
    log_view_json: "JSON",
    log_limit: "Rows",
    log_auto: "Auto 2 s",
    log_refresh: "Refresh",
    log_copy: "Copy logs",
    log_copied: "Copied ({n} rows)",
    log_copy_failed: "Could not copy to the clipboard.",
    log_clear: "Clear buffer",
    log_clear_confirm: "Press again to clear",
    log_status: "{n} rows · {time}",
    log_error: "Error: {msg}",
    log_empty: "No log rows for this filter.",
  },
  ko: {
    sum_mqtt: "Home Assistant MQTT",
    mqtt_connected: "Connected",
    mqtt_disconnected: "Disconnected",
    mqtt_off: "Off",
    unknown: "Unknown",
    mqtt_broker: "Broker",
    mqtt_topic: "Topic prefix",
    mqtt_discovery: "Discovery prefix",
    sum_fw: "펌웨어",
    fw_target_label: "목표 버전",
    fw_pending_label: "업데이트 대상",
    fw_pending_count: "{n}대",
    fw_ota_host: "OTA server",
    fw_badge_pending: "Update {n}",
    fw_badge_ok: "Up to date",
    open_settings: "설정 열기",
    open_logs: "로그 보기",
    sum_app: "안드로이드 설정 앱",
    apk_download: "APK 내려받기",
    pc_download: "PC 도구 내려받기",
    qr_label: "{url} QR 코드",
    empty: "MTTL-W01 기기를 기다리는 중입니다.",
    online: "Online",
    offline: "Offline",
    offline_note: "Offline · 마지막으로 받은 값",
    total_power: "전체 전력",
    total_energy: "누적 사용량",
    voltage: "전압",
    all_on: "전체 켜기",
    all_off: "전체 끄기",
    refresh: "새로고침",
    outlet: "콘센트 {n}",
    power: "전력",
    energy: "누적",
    temp: "온도",
    on: "ON",
    off: "OFF",
    rename: "이름 바꾸기",
    hide_hint: "대시보드와 Home Assistant에서 빠집니다. 설정 화면에서 되살릴 수 있습니다.",
    hide_note: "설정 화면에서 되살릴 수 있음",
    lock_all: "전체",
    lock_pending: "동기화 대기",
    lock_bit: "{name} 잠금",
    action_failed: "요청 실패: {msg}",
    log_title: "Backend log",
    log_note: "메모리에 최근 5,000줄을 둡니다. DEBUG 이상은 backend.log 파일(5MB, 3개)에도 남습니다.",
    log_level: "Level",
    log_level_DEBUG: "DEBUG+ 상세",
    log_level_INFO: "INFO+ 간략",
    log_level_WARNING: "WARNING+",
    log_level_ERROR: "ERROR",
    log_category: "분류",
    log_cat_all: "전체",
    log_cat_ota: "OTA",
    log_cat_wire: "통신 TX/RX",
    log_cat_control: "제어",
    log_cat_childlock: "Child Lock",
    log_cat_ha: "Home Assistant",
    log_cat_connection: "연결",
    log_cat_storage: "DB/백업",
    log_cat_other: "기타",
    log_view: "보기",
    log_view_compact: "간략",
    log_view_text: "텍스트",
    log_view_json: "JSON",
    log_limit: "줄 수",
    log_auto: "자동 2초",
    log_refresh: "새로고침",
    log_copy: "현재 로그 복사",
    log_copied: "복사됨 ({n}줄)",
    log_copy_failed: "클립보드에 복사하지 못했습니다.",
    log_clear: "버퍼 지우기",
    log_clear_confirm: "한 번 더 누르면 지웁니다",
    log_status: "{n}줄 · {time}",
    log_error: "오류: {msg}",
    log_empty: "이 조건에 맞는 로그가 없습니다.",
  },
};

/** Shown in English in both languages: the top bar, the firmware update banner and some card labels. */
export const ENGLISH_ONLY = [
  "demo", "server_online", "server_offline", "server_checking", "backend", "online_count",
  "unlock", "relock", "settings", "logs", "theme", "theme_auto", "theme_dark", "theme_light",
  "language", "log_back", "unlock_hint", "relock_hint", "fw_update", "fw_downgrade", "fw_reflash",
  "rssi", "lock", "hide_device", "hide_confirm",
];
for (const key of ENGLISH_ONLY) STRINGS.ko[key] = STRINGS.en[key];

export function t(lang, key, vars = {}) {
  const text = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;

/**
 * Language of a rendered string by its script: "ko" when it has Hangul, else "en".
 * Pages set it as the element's lang so the same English looks the same in EN and KR.
 */
export function scriptLang(text) {
  return HANGUL.test(String(text ?? "")) ? "ko" : "en";
}

/**
 * Two-press confirm: the first press arms, a second press within `windowMs` confirms.
 * `armedAt` is the time of the arming press or null. Returns the next state.
 */
export function pressConfirm(armedAt, now, windowMs = 4000) {
  if (armedAt !== null && now - armedAt <= windowMs) return { armedAt: null, confirmed: true };
  return { armedAt: now, confirmed: false };
}

export function pickLang(saved, navigatorLanguage) {
  if (saved === "en" || saved === "ko") return saved;
  return String(navigatorLanguage ?? "").toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function resolveTheme(pref, haDark, osPrefersLight) {
  if (pref === "dark" || pref === "light") return pref;
  if (typeof haDark === "boolean") return haDark ? "dark" : "light";
  return osPrefersLight ? "light" : "dark";
}

export function normalizeMac(s) {
  if (typeof s !== "string") return null;
  const hex = s.trim().replace(/[:-]/g, "").toLowerCase();
  return /^[0-9a-f]{12}$/.test(hex) ? hex : null;
}

export function fmtMac(mac) {
  return (normalizeMac(mac) ?? "").toUpperCase().replace(/(..)(?!$)/g, "$1:");
}

// Backend values are numbers or null; anything else is shown as missing.
function num(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return NaN;
}

function fmtScaled(v, scale, digits, unit) {
  const n = num(v) / scale;
  return Number.isFinite(n) ? `${n.toFixed(digits)} ${unit}` : NA;
}

export function fmtWatts(mw) {
  return fmtScaled(mw, 1000, 1, "W");
}

export function fmtKwh(wh) {
  return fmtScaled(wh, 1000, 2, "kWh");
}

export function fmtVolt(mv) {
  return fmtScaled(mv, 1000, 1, "V");
}

export function fmtTemp(c) {
  const n = num(c);
  if (!Number.isFinite(n)) return NA;
  return `${Number.isInteger(n) ? n : n.toFixed(1)} °C`;
}

/** Whole seconds since `lastSeen` (epoch seconds), like Tuo's card; English in both languages. */
export function fmtAge(lastSeen, now) {
  const seen = num(lastSeen);
  if (!Number.isFinite(seen) || !Number.isFinite(now)) return NA;
  return `${Math.max(0, Math.floor(now - seen))} s ago`;
}

export function fmtRssi(dbm) {
  return fmtScaled(dbm, 1, 0, "dBm");
}

function sum(values) {
  let total = 0;
  let any = false;
  for (const v of values) {
    const n = num(v);
    if (Number.isFinite(n)) {
      total += n;
      any = true;
    }
  }
  return any ? total : NaN;
}

function text(v) {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function onState(v) {
  if (v === 1 || v === true) return true;
  if (v === 0 || v === false) return false;
  return null;
}

export const FW_ACTIONS = ["update", "downgrade", "reflash"];

/** Selector 1..4 → channel. Other selectors (0 is the whole strip) are ignored. */
function outletChannels(device) {
  const bySel = new Map();
  for (const ch of Array.isArray(device.channels) ? device.channels : []) {
    const n = Number(ch?.selector);
    if (Number.isInteger(n) && n >= 1 && n <= 4 && !bySel.has(n)) bySel.set(n, ch);
  }
  return bySel;
}

export function cardModel(device, { authenticated, unlocked, lang }) {
  const d = device ?? {};
  const admin = authenticated === true;
  const open = admin && unlocked === true;
  const online = d.online === true;
  const mac = String(d.mac ?? "");
  const channels = outletChannels(d);
  const outlets = [1, 2, 3, 4].map((n) => {
    const ch = channels.get(n) ?? {};
    return {
      n,
      name: text(ch.name) ?? t(lang, "outlet", { n }),
      on: onState(ch.on_state),
      // An offline strip's last power reading is stale; energy and temperature stay as last received.
      w: online ? fmtWatts(ch.power_mw) : NA,
      kwh: fmtKwh(ch.energy_lifetime_wh),
      temp: fmtTemp(ch.temperature_c),
    };
  });
  const rows = [...channels.values()];
  const diag = d.diagnostics ?? {};
  const mask = d.childlock_mask;
  const maskKnown = Number.isInteger(mask) && mask >= 0 && mask < 32;
  return {
    mac,
    title: text(d.alias) ?? `MTTL ${mac.slice(-6).toUpperCase()}`,
    firmware: d.firmware_version ?? null,
    online,
    lastSeen: Number.isFinite(num(d.last_seen)) ? num(d.last_seen) : null,
    ip: admin ? text(d.peer_ip) : null,
    totalW: online ? fmtWatts(sum(rows.map((ch) => ch.power_mw))) : NA,
    totalKwh: fmtKwh(sum(rows.map((ch) => ch.energy_lifetime_wh))),
    voltage: diag.voltage_enabled === true ? fmtVolt(diag.voltage_mv) : null,
    rssi: diag.rssi_enabled === true ? fmtRssi(diag.rssi_dbm) : null,
    outlets,
    lock: admin
      ? {
          supported: d.childlock_supported === true,
          synced: d.childlock_synced === true,
          bits: [0, 1, 2, 3, 4].map((bit) => maskKnown && (mask & (1 << bit)) !== 0),
        }
      : null,
    fwAction: admin && FW_ACTIONS.includes(d.firmware_action) ? d.firmware_action : null,
    fwTarget: admin ? text(d.firmware_target?.version) : null,
    editable: open,
    controls: open && online,
  };
}

/** Values for the top bar and the summary card row. */
export function summaryModel(resp, ha) {
  const devices = Array.isArray(resp?.devices) ? resp.devices : [];
  const admin = resp?.authenticated === true;
  const cfg = admin && ha ? ha : null;
  let mqtt = "unknown";
  if (cfg) mqtt = cfg.enabled !== true ? "off" : cfg.connected === true ? "connected" : "disconnected";
  const host = text(cfg?.host);
  return {
    version: text(resp?.backend_version),
    online: devices.filter((d) => d?.online === true).length,
    total: devices.length,
    admin,
    mqtt,
    broker: host ? (cfg.port ? `${host}:${cfg.port}` : host) : null,
    topic: text(cfg?.topic_prefix),
    discovery: text(cfg?.discovery_prefix),
    fwTarget: admin
      ? (devices.map((d) => text(d?.firmware_target?.version)).find(Boolean) ?? text(resp?.firmware?.target_profile))
      : null,
    fwPending: admin ? devices.filter((d) => FW_ACTIONS.includes(d?.firmware_action)).length : null,
    otaHost: admin ? text(resp?.firmware?.ota_host_ip) : null,
  };
}

// The multi-outlet strip's Android app is served on the backend's own port (host 18282 -> app 8080),
// which a phone can reach directly; the Ingress address needs a Home Assistant login.
const APK_PORT = 18282;
const APK_FILE = "provision-android.apk";
const INGRESS_PATH = /^\/api\/hassio_ingress\//;

/** APK address on a given host: the OTA host address from the backend, else `hostname`. */
export function apkUrlForHost(firmware, hostname) {
  const host = text(firmware?.ota_host_ip) ?? hostname;
  return `http://${host}:${APK_PORT}/${APK_FILE}`;
}

/** Address to put in the QR code. `loc` is window.location or an object with the same fields. */
export function apkUrl(firmware, loc) {
  if (!INGRESS_PATH.test(loc.pathname)) return new URL(APK_FILE, loc.href).href;
  return apkUrlForHost(firmware, loc.hostname);
}

// ---- Requests, polling and controls ----

/**
 * Headers of every POST and PUT. backend.py refuses a state-changing request without X-MTTL-Request:
 * a page on another site cannot add the header without a CORS preflight, which the backend never allows.
 */
export const SEND_HEADERS = Object.freeze({ "X-MTTL-Request": "1", "Content-Type": "application/json" });

async function jsonOf(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** GET a JSON answer: `{status, body}` (body null when it is not JSON), or `{error}` when the request fails. */
export async function apiGet(url) {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    return { status: res.status, body: await jsonOf(res) };
  } catch (err) {
    return { error: err?.message ?? String(err) };
  }
}

/** POST or PUT `body` as JSON. Resolves with the answer; rejects with the backend's error text. */
export async function apiSend(method, url, body = {}) {
  const res = await fetch(url, { method, headers: { ...SEND_HEADERS }, body: JSON.stringify(body), credentials: "same-origin" });
  const answer = (await jsonOf(res)) ?? {};
  if (!res.ok) throw new Error(String(answer.error || answer.reason || answer.state || `HTTP ${res.status}`));
  return answer;
}

/**
 * Next poll state after reading `api/devices`. `state` is `{devices, authenticated, stale, resp}`;
 * `result` is `{status, body}` or `{error}`. A 200 answer replaces everything; anything else keeps
 * the last devices on screen and marks them stale.
 */
export function reducePoll(state, result) {
  const body = result?.status === 200 ? result.body : null;
  if (!body || typeof body !== "object") return { ...state, stale: true };
  return {
    devices: Array.isArray(body.devices) ? body.devices : [],
    authenticated: body.authenticated === true,
    stale: false,
    resp: body,
  };
}

/**
 * Poll state with one device replaced by a fresh `api/devices/<mac>` answer, or dropped when
 * `device` is null or hidden. A device that is not in the list is not added; the next poll adds it.
 */
export function withDevice(state, mac, device) {
  const gone = !device || device.removed === true;
  const devices = [];
  for (const d of state.devices) {
    if (normalizeMac(d?.mac) !== mac) devices.push(d);
    else if (!gone) devices.push(device);
  }
  return { ...state, devices, resp: state.resp ? { ...state.resp, devices } : state.resp };
}

/** Cards to add and to remove when the device list changes from `prev` to `next` (MAC lists). */
export function diffMacs(prev, next) {
  const before = new Set(prev);
  const after = new Set(next);
  return {
    added: [...after].filter((mac) => !before.has(mac)),
    removed: [...before].filter((mac) => !after.has(mac)),
  };
}

/** Child Lock can change only from a mask read over the current connection (Tuo does the same). */
export function canToggleLock(device) {
  const mask = device?.childlock_mask;
  return device?.childlock_synced === true && Number.isInteger(mask) && mask >= 0 && mask < 32;
}

export function toggleMask(mask, bit, on) {
  return on ? mask | (1 << bit) : mask & ~(1 << bit);
}

/**
 * The device as the screen shows it while requests are out: each pending control
 * (`{kind: "power", n, on}` with n 0 for all, `{kind: "alias", value}`, `{kind: "outletName", n, value}`,
 * `{kind: "lock", mask}`) overrides the last answer. The answer itself is not changed.
 */
export function applyPending(device, ops) {
  if (!ops?.length) return device;
  const d = { ...device, channels: (Array.isArray(device.channels) ? device.channels : []).map((ch) => ({ ...ch })) };
  const channel = (n) => d.channels.find((ch) => Number(ch.selector) === n);
  for (const op of ops) {
    if (op.kind === "power") {
      for (const ch of d.channels) if (op.n === 0 || Number(ch.selector) === op.n) ch.on_state = op.on ? 1 : 0;
    } else if (op.kind === "alias") {
      d.alias = op.value;
    } else if (op.kind === "outletName") {
      const ch = channel(op.n);
      if (ch) ch.name = op.value;
    } else if (op.kind === "lock") {
      d.childlock_mask = op.mask;
    }
  }
  return d;
}

/**
 * What closing a name field does: "save" sends the name, "cancel" closes it without a request,
 * "keep" leaves it open. `how` is "enter", "blur", "escape" or "relock". Enter that ends a Korean
 * IME composition keeps the field open, and nothing is saved once the screen is locked again.
 */
export function nameEditOutcome({ how, composing = false, unlocked, value, current }) {
  if (how === "enter" && composing) return "keep";
  if (how === "enter" || how === "blur") {
    if (unlocked !== true) return "cancel";
    return String(value ?? "").trim() === String(current ?? "").trim() ? "cancel" : "save";
  }
  if (how === "escape" || how === "relock") return "cancel";
  return "keep";
}

// ---- Log page (logview.html) ----

export const LOG_LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR"];
export const LOG_CATEGORIES = ["all", "ota", "wire", "control", "childlock", "ha", "connection", "storage", "other"];
export const LOG_LIMITS = [100, 300, 500, 1000];
const LEVEL_NUMBER = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40, CRITICAL: 50 };

/** Filters for `api/logs`, clamped the way backend.py does it. */
export function logFilters({ level, category, limit }) {
  const lv = String(level ?? "").toUpperCase();
  const n = Number.parseInt(limit, 10);
  return {
    level: LOG_LEVELS.includes(lv) ? lv : "INFO",
    category: LOG_CATEGORIES.includes(category) ? category : "all",
    limit: Number.isFinite(n) ? Math.max(1, Math.min(1000, n)) : 300,
  };
}

/** Query string for `api/logs`. */
export function logQuery(filters) {
  const f = logFilters(filters);
  return new URLSearchParams({ level: f.level, category: f.category, limit: String(f.limit) }).toString();
}

/** Same selection as backend.py UILogHandler.snapshot: minimum level, category, newest `limit` rows. */
export function filterLogs(rows, filters) {
  const f = logFilters(filters);
  const min = LEVEL_NUMBER[f.level];
  const picked = rows.filter((r) => (LEVEL_NUMBER[r.level] ?? 0) >= min && (f.category === "all" || r.category === f.category));
  return picked.slice(-f.limit);
}

/** "YYYY-MM-DD HH:MM:SS.mmm" in the viewer's time zone (or `timeZone`). */
export function fmtLogTime(ts, timeZone) {
  const date = new Date(Number(ts) * 1000);
  if (Number.isNaN(date.getTime())) return NA;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "00";
  const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}.${ms}`;
}

/** One row as text, the same layout as Tuo's text view and copy. */
export function logLine(row, timeZone) {
  return `${fmtLogTime(row.ts, timeZone)} ${String(row.level ?? "").padEnd(7)} [${row.category || "other"}] ${row.message ?? ""}`;
}

/**
 * Identity of a log row across reads. backend.py numbers rows from 1 again after every start,
 * so `seq` alone would match a new row to a row of the previous run; the timestamp tells them apart.
 */
export function logRowKey(row) {
  return `${row.seq}|${row.ts}`;
}

/** The text a view shows and "copy" puts on the clipboard. */
export function logText(rows, view, timeZone) {
  if (view === "json") return JSON.stringify(rows, null, 2);
  return rows.map((r) => logLine(r, timeZone)).join("\n");
}

// ---- Demo data (`?demo`). Same keys as an administrator's `api/devices` response. ----

const DEMO_NOW = 1790682546.5;

function demoChannel(mac, selector, name, on, powerMw, tempC, lifetimeWh, seen = DEMO_NOW) {
  return {
    mac,
    selector,
    name,
    on_state: on ? 1 : 0,
    power_mw: powerMw,
    temperature_c: tempC,
    energy_raw_wh: lifetimeWh,
    energy_lifetime_wh: lifetimeWh,
    energy_highwater_wh: lifetimeWh,
    energy_epoch: 0,
    last_seen: seen,
  };
}

function demoTarget() {
  return { profile_id: "official-111", version: "1.0.111", label: "Official 1.0.111", kind: "official", ready: true };
}

function demoDevice(fields) {
  const fw = fields.firmware_version;
  const lockable = fw === "1.0.111";
  return {
    mac: fields.mac,
    peer_ip: fields.peer_ip,
    session_id: fields.online ? `demo-${fields.mac.slice(-4)}` : null,
    soft_version: fw,
    firmware_version: fw,
    online: fields.online,
    last_seen: fields.last_seen ?? DEMO_NOW,
    first_seen: DEMO_NOW - 86400 * 30,
    alias: fields.alias,
    removed_at: null,
    removed: false,
    channels: fields.channels,
    diagnostics: {
      voltage_enabled: false,
      rssi_enabled: false,
      poll_interval: 60,
      ...fields.diagnostics,
    },
    childlock_mask: lockable ? fields.childlock_mask : null,
    childlock_supported: lockable,
    childlock_verified: lockable && Number.isInteger(fields.childlock_mask),
    childlock_synced: lockable && fields.online && Number.isInteger(fields.childlock_mask),
    childlock_probe_safe: lockable,
    firmware_target: demoTarget(),
    firmware_current_normalized: fw,
    firmware_build_current: fw === "1.0.111",
    firmware_action: fw === "1.0.111" ? null : "update",
    ota_job: null,
    ota_applied: null,
  };
}

export function demoResponse() {
  const a = "0a1b2c3d4e5f";
  const b = "0a1b2c3d4e60";
  const c = "0a1b2c3d4e61";
  const d = "0a1b2c3d4e62";
  const away = DEMO_NOW - 3 * 3600;
  return {
    authenticated: true,
    backend_version: "0.2.11",
    devices: [
      demoDevice({
        mac: a, alias: "Living Room", firmware_version: "1.0.111", online: true, peer_ip: "192.0.2.21",
        childlock_mask: 0b00100,
        diagnostics: { voltage_enabled: true, rssi_enabled: true, voltage_mv: 221400, voltage_updated_at: DEMO_NOW - 20, rssi_dbm: -54, rssi_updated_at: DEMO_NOW - 20 },
        channels: [
          demoChannel(a, 1, "TV", true, 84300, 31, 48210),
          demoChannel(a, 2, "Soundbar", true, 12800, 29, 9340),
          demoChannel(a, 3, null, false, 0, 27, 1275),
          demoChannel(a, 4, "Router", true, 7100, 30, 22480),
        ],
      }),
      demoDevice({
        mac: b, alias: "Office Desk", firmware_version: "1.0.66", online: true, peer_ip: "192.0.2.22",
        channels: [
          demoChannel(b, 1, "Monitor", true, 23600, 30, 15320),
          demoChannel(b, 2, "PC", true, 118400, 33, 96150),
          demoChannel(b, 3, "Desk lamp", false, 0, 28, 2040),
          demoChannel(b, 4, "Charger", false, 0, 27, 610),
        ],
      }),
      demoDevice({
        mac: c, alias: null, firmware_version: "1.0.111", online: true, peer_ip: "192.0.2.23",
        childlock_mask: 0,
        channels: [
          demoChannel(c, 1, "Kettle", false, 0, 26, 30120),
          demoChannel(c, 2, "Toaster", false, 0, 26, 4410),
          demoChannel(c, 3, null, false, 0, 25, 0),
          demoChannel(c, 4, null, false, 0, 25, 0),
        ],
      }),
      demoDevice({
        mac: d, alias: "Garage", firmware_version: "1.0.111", online: false, peer_ip: "192.0.2.24",
        last_seen: away, childlock_mask: 0b00001,
        channels: [
          demoChannel(d, 1, "Freezer", true, 61200, 24, 187650, away),
          demoChannel(d, 2, "Heater", false, 0, 22, 35890, away),
          demoChannel(d, 3, null, false, 0, 22, 0, away),
          demoChannel(d, 4, null, false, 0, 22, 0, away),
        ],
      }),
    ],
    removed: [],
    firmware: {
      target_profile: "official-111",
      profiles: [],
      active: null,
      jobs: [],
      queue_depth: 0,
      ota_host_ip: "192.0.2.10",
      release: "1.0.111-canonical",
      release_status: "HARDWARE_OTA_BOOT_VERIFIED",
      ota_primary_port: 49217,
      ota_fallback_port: 80,
    },
  };
}

/** Demo answer for `api/ha`. */
export function demoHa() {
  return {
    enabled: true,
    host: "192.0.2.10",
    port: 1883,
    username: "mttl",
    tls: false,
    topic_prefix: "mttl",
    discovery_prefix: "homeassistant",
    birth_topic: "homeassistant/status",
    password_set: true,
    connected: true,
    last_error: null,
    connected_since: DEMO_NOW - 7200,
  };
}

const DEMO_LOG_ROWS = [
  ["INFO", "other", "backend version=0.2.11 console_level=INFO ui/file capture=DEBUG"],
  ["INFO", "other", "MTTL UP backend TCP 0.0.0.0:10086 / Web HTTP 0.0.0.0:8080 / OTA HTTP 0.0.0.0:10080 / poll=5s"],
  ["INFO", "ha", "mqtt connected host=192.0.2.10 port=1883"],
  ["INFO", "connection", "connect peer=192.0.2.21"],
  ["DEBUG", "wire", "RX 0a1b2c3d4e5f up:bootinfo:1.0.111"],
  ["INFO", "connection", "identified 0a1b2c3d4e5f peer=192.0.2.21 session=demo-4e5f removed=False"],
  ["INFO", "childlock", "TX childlock mac=0a1b2c3d4e5f wire=up:childlock"],
  ["INFO", "childlock", "RX childlock mac=0a1b2c3d4e5f wire=up:childlock:4"],
  ["INFO", "childlock", "childlock connect sync mac=0a1b2c3d4e5f result={'ok': True, 'mask': 4}"],
  ["INFO", "connection", "connect peer=192.0.2.22"],
  ["INFO", "connection", "identified 0a1b2c3d4e60 peer=192.0.2.22 session=demo-4e60 removed=False"],
  ["INFO", "connection", "connect peer=192.0.2.23"],
  ["INFO", "connection", "identified 0a1b2c3d4e61 peer=192.0.2.23 session=demo-4e61 removed=False"],
  ["DEBUG", "wire", "TX 0a1b2c3d4e5f up:getinfo"],
  ["DEBUG", "wire", "RX 0a1b2c3d4e5f up:getinfo:1:1:84300:31"],
  ["DEBUG", "other", "skip periodic poll; recent GETINFO mac=0a1b2c3d4e60"],
  ["INFO", "control", "control start tx=7 source=web mac=0a1b2c3d4e60 selector=2"],
  ["INFO", "control", "control confirmed tx=7 mac=0a1b2c3d4e60 selector=2 observed=1"],
  ["WARNING", "connection", "getinfo timeout mac=0a1b2c3d4e62; reconnecting to resync"],
  ["WARNING", "connection", "invalidate session mac=0a1b2c3d4e62 id=demo-4e62 reason=getinfo timeout abort=True"],
  ["INFO", "connection", "disconnect mac=0a1b2c3d4e62 peer=192.0.2.24"],
  ["INFO", "ota", "firmware prepared locally pid=official-111 source=stock file=official_1.0.111.fwr sha=3f9c1e"],
  ["INFO", "storage", "verified DB backup reason=firmware_target db_sha=9b2e41 buckets=3"],
  ["WARNING", "control", "control busy tx=8 source=ha mac=0a1b2c3d4e5f selector=3"],
  ["ERROR", "ha", "mqtt connection failed: [Errno 111] Connection refused"],
  ["INFO", "ha", "mqtt connected host=192.0.2.10 port=1883"],
  ["DEBUG", "other", "HTTP GET api/devices 200"],
  ["INFO", "control", "physical relay event mac=0a1b2c3d4e61 selector=1 state=0"],
];

/** Sample rows for `logview.html?demo`, shaped like `api/logs` rows. */
export function demoLogs() {
  return DEMO_LOG_ROWS.map(([level, category, message], i) => ({
    seq: i + 1,
    ts: DEMO_NOW - 600 + i * 17.25,
    level,
    logger: "mttl",
    category,
    message,
    thread: "MainThread",
  }));
}
