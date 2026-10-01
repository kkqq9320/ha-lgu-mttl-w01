// Settings page logic without DOM access: input checks, what the user has changed, and which buttons are on.
// Texts live in dashboard-core.mjs STRINGS; the functions here return their keys.
// settings.mjs wires it to the page; tests/js/settings-core.test.mjs runs it under Node.

import { NA, normalizeMac, fmtAgo } from "./dashboard-core.mjs";
import { isJobActive, jobTone, jobStateKey, updateAllTargets } from "./firmware-core.mjs";

/** Polling choices in seconds: backend.py ALLOWED_POLL. */
export const POLL_CHOICES = Object.freeze([10, 15, 30, 60, 120, 300]);
/** Smallest power change in W that is reported: ha_bridge.py save(). */
export const POWER_THRESHOLDS = Object.freeze([0.1, 0.2, 0.3, 0.5, 1]);
/** Report intervals in seconds, for power and for energy: ha_bridge.py save(). */
export const REPORT_INTERVALS = Object.freeze([15, 30, 60, 120, 300, 600, 1800]);
/** Smallest energy change in Wh that is reported: ha_bridge.py save(). */
export const ENERGY_THRESHOLDS = Object.freeze([1, 2, 5, 10, 20]);

/** The settings of `PUT api/ha`. `password` is only ever sent when the user typed one. */
export const MQTT_FIELDS = Object.freeze([
  "enabled", "host", "port", "username", "password", "tls", "topic_prefix", "discovery_prefix", "birth_topic",
  "power_threshold_w", "power_interval_s", "energy_threshold_wh", "energy_interval_s",
]);

/** The jobs list shows this many rows. */
export const JOB_ROW_LIMIT = 20;

const BOOLEAN_FIELDS = new Set(["enabled", "tls"]);
const NUMBER_FIELDS = new Set(["port", "power_threshold_w", "power_interval_s", "energy_threshold_wh", "energy_interval_s"]);
const TOPIC_FIELDS = ["topic_prefix", "discovery_prefix", "birth_topic"];
const TRIMMED_FIELDS = new Set(["host", "ota_host_ip"]);
// Changing one of these moves the integration to another broker or namespace.
const ENDPOINT_FIELDS = ["host", "port", ...TOPIC_FIELDS];

function text(v) {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function str(v) {
  return typeof v === "string" ? v : "";
}

function num(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return NaN;
}

function finiteOr(v, fallback) {
  const n = num(v);
  return Number.isFinite(n) ? n : fallback;
}

function stripSlashes(s) {
  return s.replace(/^\/+|\/+$/g, "");
}

/** A field's value the way the backend reads it, so "1883" and 1883 or " host " and "host" count as the same. */
function normal(key, value) {
  if (BOOLEAN_FIELDS.has(key)) return value === true;
  if (NUMBER_FIELDS.has(key)) {
    const v = typeof value === "string" ? value.trim() : value;
    return v === "" || v === null || v === undefined ? "" : Number(v); // NaN for text: never equal, so it counts as a change
  }
  if (TOPIC_FIELDS.includes(key)) return stripSlashes(String(value ?? "").trim());
  if (TRIMMED_FIELDS.has(key)) return String(value ?? "").trim();
  return value;
}

function sameValue(key, a, b) {
  return normal(key, a) === normal(key, b);
}

// ---- Input checks ----

const IPV4_PART = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = new RegExp(`^(?:${IPV4_PART}\\.){3}${IPV4_PART}$`);

/** Four dotted numbers 0-255 without a leading zero: the same rule as run.py and config.yaml for host_ip. */
export function isIPv4(s) {
  return typeof s === "string" && IPV4.test(s);
}

/**
 * Faults of the firmware card, keyed by field. A blank address passes: Tuo does not store a blank
 * address and keeps the one it has. The backend strips the address before it checks it, so does this.
 */
export function validateFirmware({ ota_host_ip: host }) {
  const value = String(host ?? "").trim();
  return value === "" || isIPv4(value) ? {} : { ota_host_ip: "err_ipv4" };
}

function validPort(v) {
  if (typeof v === "number") return Number.isInteger(v) && v >= 1 && v <= 65535;
  if (typeof v !== "string" || !/^\d{1,5}$/.test(v.trim())) return false;
  const n = Number(v.trim());
  return n >= 1 && n <= 65535;
}

function validTopic(v) {
  const s = stripSlashes(String(v ?? "").trim());
  return s !== "" && !/[+#\u0000]/.test(s);
}

/** Faults of the MQTT card, keyed by field: ha_bridge.py save() refuses the same values. */
export function validateMqtt(draft) {
  const errors = {};
  if (draft?.enabled === true && String(draft.host ?? "").trim() === "") errors.host = "err_required";
  if (!validPort(draft?.port)) errors.port = "err_port";
  for (const key of TOPIC_FIELDS) if (!validTopic(draft?.[key])) errors[key] = "err_topic";
  return errors;
}

// ---- What the user has changed ----

/**
 * Keys of `draft` the user has changed from `saved`. A blank password means "keep the stored one", so
 * only a typed password counts. Numbers typed as text, spaces around a host and slashes around a topic
 * do not make a different value.
 */
export function dirtyKeys(saved, draft) {
  const keys = [];
  for (const key of Object.keys(draft ?? {})) {
    if (key === "password") {
      if (str(draft.password) !== "") keys.push(key);
    } else if (!sameValue(key, saved?.[key], draft[key])) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * The draft after a refresh: the refreshed `saved` values, except the `dirty` keys, which keep what
 * the user typed. A poll therefore never overwrites a field that is being edited.
 */
export function mergeDraft(saved, draft, dirty) {
  const next = { ...saved };
  for (const key of dirty) if (key in draft) next[key] = draft[key];
  return next;
}

/** The value of one setting in the form `PUT api/ha` takes. */
function payloadValue(key, value) {
  if (key === "password" || key === "username") return String(value ?? "");
  return normal(key, value);
}

/** Body of `PUT api/ha`: only the changed settings (the backend keeps the rest), and a password only when typed. */
export function mqttPayload(saved, draft) {
  const body = {};
  for (const key of dirtyKeys(saved, draft)) {
    if (MQTT_FIELDS.includes(key)) body[key] = payloadValue(key, draft[key]);
  }
  return body;
}

/** Body of `POST api/ha/test`: every setting on screen, so the broker is tested as it is typed. */
export function mqttTestPayload(draft) {
  const body = {};
  for (const key of MQTT_FIELDS) {
    if (key === "password" && str(draft?.password) === "") continue;
    body[key] = payloadValue(key, draft?.[key]);
  }
  return body;
}

/**
 * True when saving would delete the Home Assistant entities of the broker in use: ha_bridge.py clears the
 * retained topics when a running integration is turned off or moved to another broker, port or topic.
 */
export function mqttNeedsConfirm(saved, draft) {
  if (saved?.enabled !== true) return false;
  if (draft?.enabled !== true) return true;
  return ENDPOINT_FIELDS.some((key) => !sameValue(key, saved[key], draft[key]));
}

/** True while the chosen target firmware is not the saved one. */
export function targetDirty(savedProfileId, draftProfileId) {
  return String(savedProfileId ?? "") !== String(draftProfileId ?? "");
}

/** The MQTT form as `api/ha` answers it, with the backend's defaults for what is missing. The password is never held. */
export function mqttDraft(ha) {
  const h = ha && typeof ha === "object" ? ha : {};
  const port = num(h.port);
  return {
    enabled: h.enabled === true,
    host: str(h.host),
    port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 1883,
    username: str(h.username),
    password: "",
    tls: h.tls === true,
    topic_prefix: str(h.topic_prefix) || "mttl",
    discovery_prefix: str(h.discovery_prefix) || "homeassistant",
    birth_topic: str(h.birth_topic) || "homeassistant/status",
    power_threshold_w: finiteOr(h.power_threshold_w, 0.1),
    power_interval_s: finiteOr(h.power_interval_s, 30),
    energy_threshold_wh: finiteOr(h.energy_threshold_wh, 1),
    energy_interval_s: finiteOr(h.energy_interval_s, 60),
  };
}

/** The firmware form from the `firmware` object of `api/devices`. */
export function firmwareDraft(firmware) {
  return { profile: str(firmware?.target_profile), ota_host_ip: str(firmware?.ota_host_ip) };
}

/** Keys of the firmware form worth saving. A blank address is "keep the stored one": nothing to save. */
export function firmwareChangedKeys(saved, draft) {
  return dirtyKeys(saved, draft).filter((key) => !(key === "ota_host_ip" && normal(key, draft.ota_host_ip) === ""));
}

// ---- Which buttons are on ----

/**
 * State of the firmware card. `saved` and `draft` are firmwareDraft() forms, `profiles` and `devices` come from
 * `api/devices`, `busy` is true while a request is out. The update button uses the saved target and server
 * address, so it stays off while either is changed and not saved.
 */
export function firmwareControls({ saved, draft, profiles, devices, viewOnly, busy }) {
  const errors = validateFirmware(draft ?? {});
  const changed = firmwareChangedKeys(saved, draft);
  const unsaved = targetDirty(saved?.profile, draft?.profile) || changed.includes("ota_host_ip");
  const list = Array.isArray(profiles) ? profiles : [];
  const chosen = list.find((p) => p?.id === draft?.profile) ?? null;
  const target = list.find((p) => p?.id === saved?.profile) ?? null;
  const off = viewOnly === true || busy === true;
  const targets = updateAllTargets(devices);
  // A custom file that is no longer ready cannot be installed; an official one is built when the update starts.
  const targetBroken = target?.kind === "custom" && target.ready !== true;
  return {
    errors,
    changed,
    unsaved,
    canSave: !off && changed.length > 0 && Object.keys(errors).length === 0,
    canPrepare: !off && chosen?.kind === "official",
    targets,
    canUpdateAll: !off && !unsaved && !targetBroken && targets.length > 0,
  };
}

/** State of the MQTT card: faults, changed keys and which buttons are on. */
export function mqttControls({ saved, draft, viewOnly, busy }) {
  const errors = validateMqtt(draft);
  const dirty = dirtyKeys(saved, draft).filter((key) => MQTT_FIELDS.includes(key));
  const off = viewOnly === true || busy === true;
  return {
    errors,
    dirty,
    canSave: !off && dirty.length > 0 && Object.keys(errors).length === 0,
    // The test needs a broker even while the integration is off.
    canTest: !off && String(draft?.host ?? "").trim() !== "" && !errors.port,
    canSync: !off && saved?.enabled === true,
    needsConfirm: mqttNeedsConfirm(saved, draft),
  };
}

/** True when the polling choice is another allowed value than the saved one. */
export function pollCanSave({ saved, draft, allowed, viewOnly, busy }) {
  if (viewOnly === true || busy === true) return false;
  const n = num(draft?.poll_interval);
  return (allowed ?? POLL_CHOICES).includes(n) && n !== num(saved?.poll_interval);
}

// ---- Values for display ----

/** Size with a thousands separator, e.g. "327,944 B". */
export function fmtBytes(n) {
  const v = num(n);
  return Number.isFinite(v) && v >= 0 ? `${Math.round(v).toLocaleString("en-US")} B` : NA;
}

/** First 12 characters of a SHA-256, enough to tell files apart. */
export function shortSha(sha) {
  return typeof sha === "string" && sha !== "" ? sha.slice(0, 12) : NA;
}

/** A device's name as its card shows it: the alias, else MTTL and the last six digits of the MAC. */
export function deviceLabel(mac, devices) {
  const want = normalizeMac(mac);
  const device = want && Array.isArray(devices) ? devices.find((d) => normalizeMac(d?.mac) === want) : null;
  const alias = text(device?.alias);
  if (alias) return alias;
  return `MTTL ${(want ?? String(mac ?? "")).slice(-6).toUpperCase()}`.trim();
}

/** Name of a firmware profile: `{key, vars}` of a STRINGS entry for a custom file, else `{text}` as the backend names it. */
export function profileTitle(profile) {
  if (profile?.kind === "custom") return { key: "fw_custom", vars: { v: text(profile.version) ?? "" } };
  return { text: text(profile?.label) ?? text(profile?.id) ?? "" };
}

/** Rows of the firmware files list, in the backend's order. */
export function profileRows(profiles) {
  const rows = [];
  for (const p of Array.isArray(profiles) ? profiles : []) {
    if (!p || typeof p !== "object") continue;
    const ready = p.ready === true;
    rows.push({
      id: String(p.id ?? ""),
      title: profileTitle(p),
      version: text(p.version),
      custom: p.kind === "custom",
      ready,
      selected: p.selected === true,
      sha: shortSha(p.sha256),
      size: fmtBytes(p.size),
      // A file that is not prepared does not exist yet, so it has no name and nothing to download.
      file: ready ? (text(p.original_filename) ?? text(p.filename)) : null,
      canDownload: ready,
      canDelete: p.kind === "custom",
    });
  }
  return rows;
}

function when(v) {
  const n = num(v);
  return Number.isFinite(n) ? n : -Infinity;
}

function newerFirst(a, b) {
  return a === b ? 0 : a > b ? -1 : 1;
}

/**
 * Rows of the jobs list: running jobs first, then the most recently queued, at most JOB_ROW_LIMIT.
 * `stateKey` is null for a state this page does not know; the screen then shows `state` as sent.
 */
export function jobRows(jobs, devices, now) {
  const entries = (Array.isArray(jobs) ? jobs : []).filter((j) => j && typeof j === "object").map((job, index) => ({
    index,
    queued: when(job.queued_at),
    updated: when(job.updated_at),
    row: {
      id: text(job.id) ?? `${normalizeMac(job.mac) ?? job.mac}:${job.queued_at}`,
      mac: String(job.mac ?? ""),
      name: deviceLabel(job.mac, devices),
      stateKey: jobStateKey(job.state),
      state: String(job.state ?? ""),
      tone: jobTone(job),
      active: isJobActive(job),
      from: job.from_version ?? null,
      to: job.target_version ?? null,
      age: fmtAgo(job.updated_at, now),
      detail: text(job.detail),
    },
  }));
  entries.sort((a, b) =>
    (Number(b.row.active) - Number(a.row.active))
    || newerFirst(a.queued, b.queued)
    || newerFirst(a.updated, b.updated)
    || a.index - b.index);
  return entries.slice(0, JOB_ROW_LIMIT).map((e) => e.row);
}
