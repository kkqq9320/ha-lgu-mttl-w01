// Page wiring for settings.html. Values reach the page only through textContent, attributes and
// data-* states; the logic is in settings-core.mjs and firmware-core.mjs.
import {
  NA, FW_ACTIONS, t, pressConfirm, isViewOnly, intervalUnit, demoResponse, demoHa, demoConfig, demoHex, demoProfileOf,
  demoSetTarget, demoQueueJob, demoAdvanceJob, demoShiftFirmwareTimes,
} from "./dashboard-core.mjs";
import { FWR_SIZE, profileHintKey } from "./firmware-core.mjs";
import {
  POLL_CHOICES, POWER_THRESHOLDS, REPORT_INTERVALS, ENERGY_THRESHOLDS, MQTT_FIELDS,
  isIPv4, dirtyKeys, mergeDraft, mqttPayload, mqttTestPayload, mqttDraft, firmwareDraft,
  firmwareControls, mqttControls, pollCanSave, fmtBytes, profileTitle, profileRows, jobRows, fileChoice, updateAllRows,
  createSettingsApi, settleRequest, refreshReads,
} from "./settings-core.mjs";
import {
  page, applyTheme, applyStrings, initPage, setText, useDemoLinks, setData, setHidden, setDisabled, setAttr, fieldMap,
  setInput, syncOptions, syncList, paintButton,
} from "./page.mjs";

const POLL_MS = 5000;
const CONFIRM_MS = 4000;
const HA_RECHECK_MS = 2500;
const TARGET_MS = 3200;

const $ = (sel, root = document) => root.querySelector(sel);

// ---- Data sources ----
// A source reads load() -> {status, body} (`api/devices`), config() -> the `api/config` answer or null and
// ha() -> the `api/ha` answer or null. It writes with savePoll(seconds), saveTarget(profileId, host),
// prepare(profileId), otaAll(profileId), uploadFwr(bytes, name), deleteFwr(profileId), saveMqtt(body),
// testMqtt(body) and syncMqtt(). A write resolves once the backend has answered and rejects with its
// error text. Demo mode keeps everything in memory; the live source is createSettingsApi() in settings-core.mjs.

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createDemoSource() {
  const data = demoResponse();
  const config = demoConfig();
  const ha = demoHa();
  const now = () => Date.now() / 1000;
  // The sample data is fixed in time; move it to now so "N s ago" looks like a live backend.
  demoShiftFirmwareTimes(data, now() - Math.max(...data.devices.map((d) => d.last_seen)));

  return {
    demo: true,
    async load() {
      demoAdvanceJob(data, now()); // an update started in this page moves on with every read
      return { status: 200, body: structuredClone(data) };
    },
    async config() {
      return structuredClone(config);
    },
    async ha() {
      return structuredClone(ha);
    },
    async savePoll(seconds) {
      await wait(250);
      if (!config.allowed.includes(seconds)) throw new Error("poll_interval must be one of 10,15,30,60,120,300");
      config.poll_interval = seconds;
    },
    async saveTarget(profileId, host) {
      await wait(300);
      demoSetTarget(data, profileId);
      if (host.trim() !== "") {
        if (!isIPv4(host.trim())) throw new Error("OTA server IP must be a valid IPv4 address");
        data.firmware.ota_host_ip = host.trim();
      }
    },
    async prepare(profileId) {
      await wait(1600);
      const p = demoProfileOf(data, profileId);
      if (p.kind !== "official") throw new Error("only official firmware can be prepared");
      p.ready = true;
      p.filename = `official_${p.version}.fwr`;
      p.updated_at = now();
      demoSetTarget(data, data.firmware.target_profile);
    },
    async otaAll(profileId) {
      await wait(300);
      demoProfileOf(data, profileId);
      const jobs = data.devices
        .filter((d) => d.online === true && FW_ACTIONS.includes(d.firmware_action))
        .map((d) => demoQueueJob(data, d.mac, profileId, now()));
      return { ok: true, jobs };
    },
    async uploadFwr(bytes, name) {
      await wait(700);
      if (bytes.byteLength !== FWR_SIZE) throw new Error(`FWR validation failed: the size is ${bytes.byteLength}`);
      const sha = demoHex(`${name}-${now()}`, 64);
      const id = `custom-${sha.slice(0, 16)}`;
      data.firmware.profiles.push({
        id, kind: "custom", version: "1.0.113", label: "사용자 지정 1.0.113", sha256: sha, size: FWR_SIZE, model: "LGU+-TAP-HW002",
        filename: `${id}.fwr`, original_filename: name, created_at: now(), updated_at: now(), ready: true, selected: false,
      });
      return { ok: true };
    },
    async deleteFwr(profileId) {
      await wait(300);
      if (demoProfileOf(data, profileId).kind !== "custom") throw new Error("official firmware cannot be deleted");
      const wasTarget = data.firmware.target_profile === profileId;
      data.firmware.profiles = data.firmware.profiles.filter((p) => p.id !== profileId);
      demoSetTarget(data, wasTarget ? "official-111" : data.firmware.target_profile);
    },
    async saveMqtt(body) {
      await wait(450);
      for (const [key, value] of Object.entries(body)) {
        if (key === "password") ha.password_set = true;
        else ha[key] = value;
      }
      if (ha.enabled && String(ha.host).trim() === "") throw new Error("HA MQTT broker address is required");
      ha.connected = ha.enabled === true;
      ha.last_error = null;
    },
    async testMqtt(body) {
      await wait(700);
      const host = String(body.host ?? "").trim();
      if (host === "") throw new Error("HA MQTT broker address is required");
      if (host.endsWith(".invalid")) throw new Error("[Errno 111] Connection refused");
    },
    async syncMqtt() {
      await wait(400);
      if (ha.connected !== true) throw new Error("HA MQTT disconnected");
    },
  };
}

// ---- State ----

const CARD_IDS = { fw: "firmware", files: "firmware-files", jobs: "firmware-jobs", poll: "polling", mqtt: "mqtt" };
const CARD_OF = { firmware: "fw", "firmware-files": "files", polling: "poll", mqtt: "mqtt" };
const MQTT_ERROR_FIELDS = ["host", "port", "topic_prefix", "discovery_prefix", "birth_topic"];
const MQTT_ADVANCED = ["topic_prefix", "discovery_prefix", "birth_topic"];
const MQTT_BADGE = { connected: "ok", disconnected: "bad", off: "idle", unknown: "idle" };

const state = {
  source: null,
  viewOnly: false, // opened outside the HA sidebar: the backend refuses changes, so every input is off
  devices: [],
  firmware: null,
  version: null,
  loaded: false,
  stale: false,
  refreshing: false,
  config: null,
  ha: null,
  // What the backend holds and what the user is editing, per card; a refresh never overwrites a changed field.
  saved: { fw: firmwareDraft(null), poll: { poll_interval: 15 }, mqtt: mqttDraft(null) },
  draft: { fw: firmwareDraft(null), poll: { poll_interval: 15 }, mqtt: mqttDraft(null) },
  busy: new Set(), // requests out: "fw-save", "files-delete:<id>", ...
  alerts: { fw: null, files: null, poll: null, mqtt: null }, // {kind, key, vars} shown in the card's line
  armed: null, // {id, card, at, timer} after the first press of a button that needs a second one
  file: null, // the .fwr file chosen for upload
  haTimer: null,
  hashDone: false,
};

const cards = {}; // name -> {root, f}

// ---- Small DOM helpers ----

function titleText(title) {
  return title.key ? t(page.lang, title.key, title.vars) : title.text;
}

function unitText(seconds) {
  const unit = intervalUnit(seconds);
  return t(page.lang, unit.key, { n: unit.n });
}

function isBusy(prefix) {
  for (const id of state.busy) if (id.startsWith(prefix)) return true;
  return false;
}

// ---- Confirmation by a second press ----

function disarm() {
  clearTimeout(state.armed?.timer);
  state.armed = null;
}

/** The first press arms the button and shows its warning; a second press within CONFIRM_MS runs `action`. */
function press(id, card, action) {
  const armed = state.armed?.id === id ? state.armed : null;
  const next = pressConfirm(armed?.at ?? null, Date.now(), CONFIRM_MS);
  disarm();
  if (next.confirmed) {
    action();
    return;
  }
  const timer = setTimeout(() => {
    if (state.armed?.id !== id) return;
    state.armed = null;
    render();
  }, CONFIRM_MS);
  state.armed = { id, card, at: next.armedAt, timer };
  state.alerts[card] = null; // the warning replaces an earlier result and does not bring it back
  render();
}

// ---- Rendering ----

/** A button: its label, whether it is armed or busy, and whether it can be pressed. */
function setButton(btn, { id, label, vars, can }) {
  if (state.armed?.id === id && !can) disarm(); // what it would do is no longer possible
  paintButton(btn, { label, vars, can, armed: state.armed?.id === id, busy: state.busy.has(id) });
}

function showFieldError(input, errEl, errorKey) {
  // While the field is being typed in, the fault waits until the cursor leaves.
  const show = Boolean(errorKey) && document.activeElement !== input;
  setHidden(errEl, !show);
  setText(errEl, show ? t(page.lang, errorKey) : "");
  const field = input.closest(".field");
  if (field) setData(field, "invalid", show ? "yes" : "no");
}

function showAlert(card, alert) {
  const { f } = cards[card];
  setData(f.alert, "kind", alert?.kind ?? "none");
  setText(f.alertText, alert ? [alert.key, alert.after].filter(Boolean).map((key) => t(page.lang, key, alert.vars)).join(" ") : "");
  setHidden(f.alertText, !alert);
  const items = alert?.items ?? [];
  setHidden(f.alertItems, items.length === 0);
  const signature = items.join("\n");
  if (f.alertItems.dataset.signature !== signature) {
    f.alertItems.dataset.signature = signature;
    f.alertItems.replaceChildren(...items.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }));
  }
}

function armedAlert(id, controls) {
  if (id === "fw-all") {
    return {
      kind: "warn",
      key: "fw_all_warn",
      after: controls.returnNeedsPcTool ? "pc_return" : null,
      items: updateAllRows(controls.targets).map((r) => (r.mark ? `${r.text} · ${t(page.lang, r.mark)}` : r.text)),
    };
  }
  if (id === "mqtt-save") return { kind: "warn", key: "mqtt_save_warn" };
  if (id.startsWith("files-delete:")) return { kind: "warn", key: "fw_delete_warn" };
  return null;
}

function renderTopbar() {
  const server = $("#server-badge");
  const serverState = state.stale ? "bad" : state.loaded ? "ok" : "idle";
  setData(server, "state", serverState);
  setText($("[data-f=text]", server), t(page.lang, { ok: "server_online", bad: "server_offline", idle: "server_checking" }[serverState]));
  setText($("#backend-version"), state.version ? t(page.lang, "backend", { v: state.version }) : "");
}

function renderFirmware() {
  const { f } = cards.fw;
  const profiles = Array.isArray(state.firmware?.profiles) ? state.firmware.profiles : [];
  const draft = state.draft.fw;
  const busy = isBusy("fw-");
  const c = firmwareControls({
    saved: state.saved.fw, draft, profiles, devices: state.devices, viewOnly: state.viewOnly, busy,
  });
  const lock = state.viewOnly || busy || !state.loaded;

  const pending = state.devices.filter((d) => FW_ACTIONS.includes(d?.firmware_action)).length;
  setData(f.badge, "state", !state.loaded ? "idle" : pending > 0 ? "warn" : "ok");
  setText(f.badgeText, !state.loaded ? t(page.lang, "unknown") : pending > 0 ? t(page.lang, "fw_badge_pending", { n: pending }) : t(page.lang, "fw_badge_ok"));

  syncOptions(f.profile, profiles.map((p) => ({ value: p.id, text: titleText(profileTitle(p)) })), draft.profile);
  setDisabled(f.profile, lock || profiles.length === 0);
  const hintKey = profileHintKey(profiles.find((p) => p.id === draft.profile));
  setText(f.hint, hintKey ? t(page.lang, hintKey) : "");

  setInput(f.host, draft.ota_host_ip);
  setDisabled(f.host, lock);
  showFieldError(f.host, f.hostErr, c.errors.ota_host_ip);

  setButton(f.save, { id: "fw-save", label: "btn_save", can: c.canSave });
  setButton(f.prepare, { id: "fw-prepare", label: "fw_prepare", can: c.canPrepare });
  setButton(f.all, { id: "fw-all", label: "fw_update_all", vars: { n: c.targets.length }, can: c.canUpdateAll });

  const armed = state.armed?.card === "fw" ? armedAlert(state.armed.id, c) : null;
  showAlert("fw", armed ?? state.alerts.fw ?? (c.unsaved ? { kind: "warn", key: "fw_save_first" } : null));
  return c;
}

function createFileRow() {
  const el = $("#file-row-tpl").content.firstElementChild.cloneNode(true);
  applyStrings(el);
  return el;
}

function updateFileRow(el, r) {
  const f = fieldMap(el);
  const lang = page.lang;
  const filesBusy = isBusy("files-");
  const lock = state.viewOnly || filesBusy || !state.loaded;
  el.dataset.id = r.id;
  setText(f.title, titleText(r.title));
  setHidden(f.mark, r.id !== state.saved.fw.profile);
  setData(f.badge, "state", r.ready ? "ok" : "warn");
  setText(f.badgeText, t(lang, r.ready ? "fw_ready" : "fw_not_ready"));
  setText(f.sha, `SHA ${r.sha}`);
  setText(f.size, r.size);
  setHidden(f.origWrap, r.file === null);
  setText(f.orig, r.file ?? "");
  setHidden(f.download, !r.canDownload);
  setAttr(f.download, "href", `api/firmware/download/${encodeURIComponent(r.id)}`);
  // Downloading is a GET and stays available outside the sidebar; deleting is not.
  const id = `files-delete:${r.id}`;
  setHidden(f.delete, !r.canDelete);
  setButton(f.delete, { id, label: "fw_delete", can: r.canDelete && !lock });
  setHidden(f.actions, !r.canDownload && !r.canDelete);
}

function renderFiles() {
  const { f } = cards.files;
  const rows = profileRows(state.firmware?.profiles);
  syncList(f.files, rows, (r) => r.id, createFileRow, updateFileRow);
  const busy = isBusy("files-");
  const lock = state.viewOnly || busy || !state.loaded;
  setDisabled(f.choose, lock);
  setText(f.fileName, state.file ? `${state.file.name} · ${fmtBytes(state.file.size)}` : t(page.lang, "fw_no_file"));
  setButton(f.upload, { id: "files-upload", label: "fw_upload", can: state.file !== null && !lock });
  const armed = state.armed?.card === "files" ? armedAlert(state.armed.id, null) : null;
  showAlert("files", armed ?? state.alerts.files);
}

function createJobRow() {
  return $("#job-row-tpl").content.firstElementChild.cloneNode(true);
}

function updateJobRow(el, r) {
  const f = fieldMap(el);
  setData(el, "tone", r.tone);
  setData(el, "active", r.active ? "yes" : "no");
  setText(f.name, r.name);
  setData(f.badge, "state", r.tone);
  setData(f.badge, "live", r.active ? "yes" : "no");
  setText(f.badgeText, r.stateKey ? t(page.lang, r.stateKey) : (r.state || NA)); // a state this page does not know is shown as sent
  setText(f.versions, `${r.from ?? NA} → ${r.to ?? NA}`);
  setText(f.age, r.age);
  setText(f.detail, r.detail ?? "");
  setHidden(f.detail, r.detail === null);
}

function renderJobs() {
  const { f } = cards.jobs;
  const rows = jobRows(state.firmware?.jobs, state.devices, Date.now() / 1000);
  syncList(f.jobs, rows, (r) => r.id, createJobRow, updateJobRow);
  setHidden(f.empty, !state.loaded || rows.length > 0);
}

function allowedPolls() {
  return Array.isArray(state.config?.allowed) ? state.config.allowed : [...POLL_CHOICES];
}

function renderPoll() {
  const { f } = cards.poll;
  const draft = state.draft.poll;
  const allowed = allowedPolls();
  const busy = isBusy("poll-");
  const choices = allowed.includes(draft.poll_interval) ? allowed : [...allowed, draft.poll_interval];
  syncOptions(f.poll, choices.map((n) => ({ value: String(n), text: unitText(n) })), draft.poll_interval);
  setDisabled(f.poll, state.viewOnly || busy || state.config === null);
  const can = pollCanSave({ saved: state.saved.poll, draft, allowed, viewOnly: state.viewOnly, busy });
  setButton(f.save, { id: "poll-save", label: "btn_save", can });
  showAlert("poll", state.alerts.poll);
}

/** The options of a reporting choice: the backend's values, plus the current one if the backend holds another. */
function choiceOptions(list, current, text) {
  const values = list.includes(current) ? list : [...list, current].sort((a, b) => a - b);
  return values.map((v) => ({ value: String(v), text: text(v) }));
}

function renderMqtt() {
  const { f } = cards.mqtt;
  const draft = state.draft.mqtt;
  const busy = isBusy("mqtt-");
  const c = mqttControls({ saved: state.saved.mqtt, draft, viewOnly: state.viewOnly, busy });
  const lock = state.viewOnly || busy || state.ha === null;
  const ha = state.ha;
  const lang = page.lang;

  const mode = !ha ? "unknown" : ha.enabled !== true ? "off" : ha.connected === true ? "connected" : "disconnected";
  setData(f.badge, "state", MQTT_BADGE[mode]);
  setText(f.badgeText, t(lang, mode === "unknown" ? "unknown" : `mqtt_${mode}`));
  setText(f.pwState, ha ? t(lang, ha.password_set ? "mqtt_pw_set" : "mqtt_pw_unset") : NA);
  const error = ha?.last_error ? String(ha.last_error) : null;
  setText(f.lastError, ha ? (error ?? t(lang, "mqtt_no_error")) : NA);
  setData(f.lastError, "empty", error ? "no" : "yes");

  for (const key of MQTT_FIELDS) {
    const el = f[key];
    if (el.type === "checkbox") {
      if (el.checked !== draft[key]) el.checked = draft[key];
    } else if (el.tagName !== "SELECT") {
      setInput(el, draft[key]);
    }
    setDisabled(el, lock);
  }
  setAttr(f.password, "placeholder", ha?.password_set ? t(lang, "mqtt_password_ph") : "");
  syncOptions(f.power_threshold_w, choiceOptions(POWER_THRESHOLDS, draft.power_threshold_w, (v) => `${v} W`), draft.power_threshold_w);
  syncOptions(f.power_interval_s, choiceOptions(REPORT_INTERVALS, draft.power_interval_s, unitText), draft.power_interval_s);
  syncOptions(f.energy_threshold_wh, choiceOptions(ENERGY_THRESHOLDS, draft.energy_threshold_wh, (v) => `${v} Wh`), draft.energy_threshold_wh);
  syncOptions(f.energy_interval_s, choiceOptions(REPORT_INTERVALS, draft.energy_interval_s, unitText), draft.energy_interval_s);

  for (const key of MQTT_ERROR_FIELDS) showFieldError(f[key], f[`err_${key}`], c.errors[key]);
  // A fault inside the folded section would otherwise keep Save off with no reason in sight.
  if (MQTT_ADVANCED.some((key) => c.errors[key]) && !f.advanced.open) f.advanced.open = true;

  setButton(f.save, { id: "mqtt-save", label: "btn_save", can: c.canSave });
  setButton(f.test, { id: "mqtt-test", label: "mqtt_test", can: c.canTest });
  setButton(f.sync, { id: "mqtt-sync", label: "mqtt_sync", can: c.canSync });

  const armed = state.armed?.card === "mqtt" ? armedAlert(state.armed.id, null) : null;
  showAlert("mqtt", armed ?? state.alerts.mqtt);
  return c;
}

function render() {
  renderTopbar();
  renderFirmware();
  renderFiles();
  renderJobs();
  renderPoll();
  renderMqtt();
}

// ---- Reading ----

/** Takes in fresh backend values; what the user has changed since the last values stays as typed. */
function takeSaved(kind, next) {
  const dirty = dirtyKeys(state.saved[kind], state.draft[kind]);
  state.draft[kind] = mergeDraft(next, state.draft[kind], dirty);
  state.saved[kind] = next;
}

function resetDraft(kind) {
  state.draft[kind] = { ...state.saved[kind] };
}

// The three readings answer true when the backend answered and false when it did not (or the answer was unusable).
// None of them throws, so a failed reading cannot stop the first drawing or the 5 s refresh.

async function readDevices() {
  try {
    const result = state.source ? await state.source.load() : { error: "no data source" };
    const body = result?.status === 200 && result.body && typeof result.body === "object" ? result.body : null;
    if (!body) return false;
    state.loaded = true;
    state.devices = Array.isArray(body.devices) ? body.devices : [];
    state.firmware = body.firmware && typeof body.firmware === "object" ? body.firmware : null;
    state.version = body.backend_version ?? state.version;
    takeSaved("fw", firmwareDraft(state.firmware));
    // The chosen firmware was deleted somewhere else: fall back to the saved target.
    const profiles = Array.isArray(state.firmware?.profiles) ? state.firmware.profiles : [];
    if (profiles.length > 0 && !profiles.some((p) => p.id === state.draft.fw.profile)) state.draft.fw.profile = state.saved.fw.profile;
    return true;
  } catch {
    return false;
  }
}

async function readConfig() {
  try {
    const config = state.source ? await state.source.config() : null;
    if (!config) return false;
    state.config = config;
    takeSaved("poll", { poll_interval: Number(config.poll_interval) });
    return true;
  } catch {
    return false;
  }
}

async function readHa() {
  try {
    const ha = state.source ? await state.source.ha() : null;
    if (!ha) return false;
    state.ha = ha;
    takeSaved("mqtt", mqttDraft(ha));
    return true;
  } catch {
    return false;
  }
}

const READINGS = { devices: readDevices, config: readConfig, ha: readHa };

/** Reads the named parts; the server badge is offline while any reading fails. True when all of them worked. */
async function readParts(parts) {
  const results = await Promise.all(parts.map((part) => READINGS[part]()));
  state.stale = results.includes(false);
  return !state.stale;
}

const readAll = () => readParts(["devices", "config", "ha"]);

async function refresh() {
  if (state.refreshing) return;
  state.refreshing = true;
  try {
    await readParts(refreshReads({ stale: state.stale, hasConfig: state.config !== null, hasHa: state.ha !== null }));
  } finally {
    state.refreshing = false;
  }
  applyTheme(); // HA's dark mode may have changed since the last load.
  render();
}

// ---- Actions ----

/**
 * Sends one request. `id` is its slot in state.busy and `card` the card whose line shows the result.
 * `reload` reads the values again (also after a failure: Tuo stores the target before it checks the address),
 * `reset` takes the saved values back into the form once that reading worked and `ok(answer)` is the line shown on success.
 * When the reading failed, the form keeps what the user typed and the server badge goes offline; the next refresh reads again.
 */
async function run(id, card, work, { reload, reset, ok, fail = "action_failed" } = {}) {
  if (!state.source || state.viewOnly || state.busy.has(id)) return;
  disarm();
  state.busy.add(id);
  state.alerts[card] = null;
  render();
  try {
    const settled = await settleRequest(work, reload);
    if (!settled.reloaded) state.stale = true;
    if (settled.ok) {
      if (settled.reloaded) reset?.();
      state.alerts[card] = ok?.(settled.answer) ?? null;
    } else {
      state.alerts[card] = { kind: "bad", key: fail, vars: { msg: settled.failure.message } };
    }
  } finally {
    state.busy.delete(id);
    render();
  }
}

function saveFirmware() {
  const draft = state.draft.fw;
  run("fw-save", "fw", () => state.source.saveTarget(draft.profile, String(draft.ota_host_ip ?? "").trim()), {
    reload: readDevices,
    reset: () => resetDraft("fw"),
    ok: () => ({ kind: "ok", key: "saved" }),
  });
}

function prepareFirmware() {
  run("fw-prepare", "fw", () => state.source.prepare(state.draft.fw.profile), {
    reload: readDevices,
    ok: () => ({ kind: "ok", key: "fw_prepared" }),
  });
}

// The update uses the saved target, never the one still being chosen.
function updateAll() {
  run("fw-all", "fw", () => state.source.otaAll(state.saved.fw.profile), {
    reload: readDevices,
    ok: (answer) => ({
      kind: "ok",
      key: "fw_all_started",
      vars: { n: Array.isArray(answer?.jobs) ? answer.jobs.filter((j) => !j.error).length : 0 },
    }),
  });
}

function deleteFile(profileId) {
  run(`files-delete:${profileId}`, "files", () => state.source.deleteFwr(profileId), {
    reload: readDevices,
    ok: () => ({ kind: "ok", key: "fw_deleted" }),
  });
}

function clearFile() {
  state.file = null;
  cards.files.f.file.value = "";
}

function chooseFile(event) {
  const file = event.target.files?.[0] ?? null;
  const { handle, fault } = fileChoice(event.type, file);
  if (!handle) return;
  if (fault) {
    clearFile();
    disarm();
    state.alerts.files = { kind: "bad", key: fault };
  } else {
    state.file = file;
    state.alerts.files = null;
  }
  render();
}

function uploadFile() {
  const file = state.file;
  if (!file) return;
  run("files-upload", "files", async () => state.source.uploadFwr(new Uint8Array(await file.arrayBuffer()), file.name), {
    reload: readDevices,
    reset: clearFile,
    ok: () => ({ kind: "ok", key: "fw_uploaded", vars: { name: file.name } }),
  });
}

function savePoll() {
  run("poll-save", "poll", () => state.source.savePoll(Number(state.draft.poll.poll_interval)), {
    reload: readConfig,
    reset: () => resetDraft("poll"),
    ok: () => ({ kind: "ok", key: "saved" }),
  });
}

function saveMqtt() {
  const body = mqttPayload(state.saved.mqtt, state.draft.mqtt);
  run("mqtt-save", "mqtt", () => state.source.saveMqtt(body), {
    reload: readHa,
    reset: () => resetDraft("mqtt"),
    ok: () => ({ kind: "ok", key: "saved" }),
  });
  // The broker connects a moment after the save; read the status once more when it has had time to.
  clearTimeout(state.haTimer);
  state.haTimer = setTimeout(async () => {
    if (!await readHa()) state.stale = true;
    render();
  }, HA_RECHECK_MS);
}

function testMqtt() {
  run("mqtt-test", "mqtt", () => state.source.testMqtt(mqttTestPayload(state.draft.mqtt)), {
    ok: () => ({ kind: "ok", key: "mqtt_test_ok" }),
    fail: "mqtt_test_failed",
  });
}

function syncMqtt() {
  run("mqtt-sync", "mqtt", () => state.source.syncMqtt(), {
    reload: readHa,
    ok: () => ({ kind: "ok", key: "mqtt_synced" }),
  });
}

// ---- Events ----

function onClick(event) {
  const link = event.target.closest("a[data-f=download]");
  if (link && state.source?.demo) {
    event.preventDefault(); // a static demo has no file to serve
    state.alerts.files = { kind: "warn", key: "fw_demo_download" };
    render();
    return;
  }
  const btn = event.target.closest("[data-act]");
  if (!btn || btn.disabled || state.viewOnly) return;
  switch (btn.dataset.act) {
    case "fw-save": saveFirmware(); break;
    case "fw-prepare": prepareFirmware(); break;
    case "fw-all": press("fw-all", "fw", updateAll); break;
    case "fw-choose": cards.files.f.file.click(); break;
    case "fw-upload": uploadFile(); break;
    case "fw-delete": {
      const id = btn.closest(".file-row")?.dataset.id;
      if (id) press(`files-delete:${id}`, "files", () => deleteFile(id));
      break;
    }
    case "poll-save": savePoll(); break;
    case "mqtt-save": {
      const c = mqttControls({ saved: state.saved.mqtt, draft: state.draft.mqtt, viewOnly: false, busy: false });
      if (c.needsConfirm) press("mqtt-save", "mqtt", saveMqtt);
      else saveMqtt();
      break;
    }
    case "mqtt-test": testMqtt(); break;
    case "mqtt-sync": syncMqtt(); break;
    default: break;
  }
}

function readField(el) {
  if (el.type === "checkbox") return el.checked;
  if (el.tagName === "SELECT") return Number(el.value);
  return el.value;
}

/** Every edit goes into the card's draft first; the screen is then drawn from the draft. */
function onEdit(event) {
  const el = event.target;
  const name = CARD_OF[el.closest(".set-card")?.id];
  const field = el.dataset?.f;
  if (!name || !field) return;
  if (el.type === "file") {
    chooseFile(event);
    return;
  }
  if (name === "fw") {
    if (field === "profile") state.draft.fw.profile = el.value;
    else if (field === "host") state.draft.fw.ota_host_ip = el.value;
    else return;
  } else if (name === "poll") {
    if (field !== "poll") return;
    state.draft.poll.poll_interval = Number(el.value);
  } else if (name === "mqtt") {
    if (!MQTT_FIELDS.includes(field)) return;
    state.draft.mqtt[field] = readField(el);
  } else {
    return;
  }
  // The result or warning of an earlier press no longer matches what is on screen.
  state.alerts[name] = null;
  if (state.armed?.card === name) disarm();
  render();
}

// ---- #firmware, #mqtt ----

function focusHash() {
  const id = location.hash.slice(1);
  const name = CARD_OF[id];
  if (!name || state.hashDone === id) return;
  state.hashDone = id;
  const root = cards[name].root;
  root.classList.add("is-target");
  root.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => root.classList.remove("is-target"), TARGET_MS);
}

// ---- Start ----

async function start() {
  await readAll();
  for (const kind of ["fw", "poll", "mqtt"]) resetDraft(kind);
  render();
  focusHash();
  setInterval(() => {
    if (!document.hidden) refresh();
  }, POLL_MS);
}

function init() {
  const demo = new URLSearchParams(location.search).has("demo");
  state.source = demo ? createDemoSource() : createSettingsApi();
  state.viewOnly = isViewOnly({ pathname: location.pathname, demo });
  $("#demo-badge").hidden = !demo;
  $("#view-badge").hidden = !state.viewOnly;
  if (demo) useDemoLinks();
  for (const [name, id] of Object.entries(CARD_IDS)) {
    const root = document.getElementById(id);
    cards[name] = { root, f: fieldMap(root) };
  }

  initPage({ onLangChange: render });
  const main = $("main");
  main.addEventListener("click", onClick);
  main.addEventListener("input", onEdit);
  main.addEventListener("change", onEdit);
  // A fault in a field waits until the cursor leaves it, so draw again then.
  main.addEventListener("focusout", () => render());
  window.addEventListener("hashchange", () => {
    state.hashDone = false;
    focusHash();
  });
  render();
  start();
}

init();
