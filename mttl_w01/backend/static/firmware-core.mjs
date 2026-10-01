// Firmware logic shared by the settings page and the device window, without DOM access.
// Texts live in dashboard-core.mjs STRINGS; the functions here return their keys.

import { FW_ACTIONS, normalizeMac } from "./dashboard-core.mjs";

/** Size in bytes of a LG U+ firmware file (.fwr). */
export const FWR_SIZE = 327944;

/** Every state of an OTA job in backend.py, in the order a job moves through them. */
export const JOB_STATES = Object.freeze([
  "QUEUED", "PREPARING", "COMMAND_SENT", "ACKED", "DOWNLOADING", "TRANSFERRED", "RECONNECTING", "VERIFYING",
  "SUCCESS", "DELAYED_SUCCESS", "CANCELLED_RESTART", "RESULT_UNKNOWN",
  "FAILED_PREPARE", "FAILED_CONFIG", "FAILED_OFFLINE", "FAILED_BUSY", "FAILED_ACK", "FAILED_DOWNLOAD", "FAILED_VERSION", "FAILED_INTERNAL",
]);

/** States of a finished job: backend.py OTA_TERMINAL_STATES. */
export const TERMINAL_STATES = Object.freeze([
  "SUCCESS", "DELAYED_SUCCESS", "CANCELLED_RESTART", "RESULT_UNKNOWN",
  "FAILED_PREPARE", "FAILED_CONFIG", "FAILED_OFFLINE", "FAILED_BUSY", "FAILED_ACK", "FAILED_DOWNLOAD", "FAILED_VERSION", "FAILED_INTERNAL",
]);

function text(v) {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** Key of the STRINGS entry for a job state, or null for a state this page does not know (show it as sent). */
export function jobStateKey(state) {
  return JOB_STATES.includes(state) ? `job_${state.toLowerCase()}` : null;
}

/**
 * True while the job is not finished. Like backend.py, any state that is not listed as finished
 * counts as running, so a state added later still blocks a second update.
 */
export function isJobActive(job) {
  return typeof job?.state === "string" && job.state !== "" && !TERMINAL_STATES.includes(job.state);
}

/** "ok" for a successful job, "bad" for a failed or unknown result, "warn" for everything else. */
export function jobTone(job) {
  const state = job?.state;
  if (state === "SUCCESS" || state === "DELAYED_SUCCESS") return "ok";
  if (state === "RESULT_UNKNOWN" || (typeof state === "string" && state.startsWith("FAILED_"))) return "bad";
  return "warn";
}

function time(v) {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? n : -Infinity;
}

function isNewer(a, b) {
  const [ua, ub] = [time(a.updated_at), time(b.updated_at)];
  if (ua !== ub) return ua > ub;
  return time(a.queued_at) > time(b.queued_at);
}

/** The most recently updated job of the device with this MAC, or null. */
export function latestJobFor(jobs, mac) {
  const want = normalizeMac(mac);
  if (!want || !Array.isArray(jobs)) return null;
  let best = null;
  for (const job of jobs) {
    if (normalizeMac(job?.mac) !== want) continue;
    if (best === null || isNewer(job, best)) best = job;
  }
  return best;
}

/**
 * What the screen needs to decide a firmware button for one device. `firmware` is the backend's
 * `firmware` object (`jobs`). `block` is why no update can start: the device is offline or busy with a
 * job, or its target is a custom file that is not ready. An official target that is not prepared yet
 * is no block; Tuo builds it when the update starts.
 */
export function deviceFirmware(device, firmware) {
  const action = FW_ACTIONS.includes(device?.firmware_action) ? device.firmware_action : null;
  const target = device?.firmware_target;
  const job = latestJobFor(firmware?.jobs, device?.mac);
  const active = isJobActive(job);
  let block = null;
  if (device?.online !== true) block = "offline";
  else if (active) block = "busy";
  else if (target?.kind === "custom" && target.ready !== true) block = "not_ready";
  return {
    current: device?.firmware_version ?? null,
    target: text(target?.version),
    action,
    job,
    active,
    canUpdate: action !== null && block === null,
    block,
  };
}

/** Devices the "update all" button works through: online, not hidden, with an update to do. */
export function updateAllTargets(devices) {
  const out = [];
  for (const d of Array.isArray(devices) ? devices : []) {
    if (d?.online !== true || d.removed === true || !FW_ACTIONS.includes(d.firmware_action)) continue;
    const mac = String(d.mac ?? "");
    out.push({
      mac,
      name: text(d.alias) ?? `MTTL ${mac.slice(-6).toUpperCase()}`,
      from: d.firmware_version ?? null,
      to: text(d.firmware_target?.version),
    });
  }
  return out;
}

const OFFICIAL_HINTS = new Map([["official-111", "hint_111"], ["official-110", "hint_110"], ["official-66", "hint_66"]]);

/** Key of the STRINGS entry that describes a firmware profile, or null when there is no text for it. */
export function profileHintKey(profile) {
  if (profile?.kind === "custom") return "hint_custom";
  return OFFICIAL_HINTS.get(profile?.id) ?? null;
}

/** Why a chosen file cannot be a firmware file: "fwr_ext" (not .fwr), "fwr_size" (wrong size), or null. */
export function checkFwrFile({ name, size }) {
  if (typeof name !== "string" || !name.toLowerCase().endsWith(".fwr")) return "fwr_ext";
  if (size !== FWR_SIZE) return "fwr_size";
  return null;
}
