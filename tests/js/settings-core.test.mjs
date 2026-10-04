import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const staticFile = (name) => readFileSync(new URL(`../../mttl_w01/backend/static/${name}`, import.meta.url), "utf-8");
const backendFile = (name) => readFileSync(new URL(`../../mttl_w01/backend/${name}`, import.meta.url), "utf-8");

const core = await import(new URL("../../mttl_w01/backend/static/dashboard-core.mjs", import.meta.url));
const { JOB_STATES } = await import(new URL("../../mttl_w01/backend/static/firmware-core.mjs", import.meta.url));
const settings = await import(new URL("../../mttl_w01/backend/static/settings-core.mjs", import.meta.url));
const { STRINGS, ENGLISH_ONLY, NA, demoConfig, demoResponse, demoHa } = core;
const {
  POLL_CHOICES, POWER_THRESHOLDS, REPORT_INTERVALS, ENERGY_THRESHOLDS, MQTT_FIELDS, JOB_ROW_LIMIT,
  isIPv4, validateFirmware, validateMqtt, dirtyKeys, mergeDraft, mqttPayload, mqttTestPayload, mqttNeedsConfirm, targetDirty,
  mqttDraft, firmwareDraft, firmwareChangedKeys, firmwareControls, mqttControls, pollCanSave,
  fmtBytes, shortSha, deviceLabel, profileTitle, profileRows, jobRows,
} = settings;

test("isIPv4 rejects leading zeros, IPv6 and garbage", () => {
  for (const ok of ["192.0.2.10", "0.0.0.0", "255.255.255.255"]) assert.equal(isIPv4(ok), true);
  for (const bad of ["192.0.02.10", "192.0.2", "256.0.0.1", "::1", "", "host.local", "192.0.2.10 ", "1.2.3.4.5", "1.2.3.-4"]) {
    assert.equal(isIPv4(bad), false, JSON.stringify(bad));
  }
  assert.equal(isIPv4(undefined), false);
  assert.equal(isIPv4(null), false);
});

test("validateFirmware lets a blank host keep the stored one", () => {
  assert.deepEqual(validateFirmware({ ota_host_ip: "" }), {});
  assert.deepEqual(validateFirmware({ ota_host_ip: "   " }), {});
  assert.deepEqual(validateFirmware({ ota_host_ip: "192.0.02.1" }), { ota_host_ip: "err_ipv4" });
  assert.deepEqual(validateFirmware({ ota_host_ip: "192.0.2.10" }), {});
  // The backend strips the address before it checks it.
  assert.deepEqual(validateFirmware({ ota_host_ip: " 192.0.2.10 " }), {});
  assert.deepEqual(validateFirmware({ ota_host_ip: "::1" }), { ota_host_ip: "err_ipv4" });
});

test("validateMqtt", () => {
  const ok = { enabled: true, host: "core-mosquitto", port: 1883, topic_prefix: "mttl", discovery_prefix: "homeassistant", birth_topic: "homeassistant/status" };
  assert.deepEqual(validateMqtt(ok), {});
  assert.deepEqual(validateMqtt({ ...ok, host: "" }), { host: "err_required" });
  assert.deepEqual(validateMqtt({ ...ok, host: "  " }), { host: "err_required" });
  assert.deepEqual(validateMqtt({ ...ok, enabled: false, host: "" }), {});
  assert.deepEqual(validateMqtt({ ...ok, port: 70000 }), { port: "err_port" });
  assert.deepEqual(validateMqtt({ ...ok, topic_prefix: "/" }), { topic_prefix: "err_topic" });
  assert.deepEqual(validateMqtt({ ...ok, discovery_prefix: "home/#" }), { discovery_prefix: "err_topic" });
  assert.deepEqual(validateMqtt({ ...ok, birth_topic: "a/+/b" }), { birth_topic: "err_topic" });
  assert.deepEqual(validateMqtt({ ...ok, birth_topic: "" }), { birth_topic: "err_topic" });
  assert.deepEqual(validateMqtt({ ...ok, topic_prefix: "a\u0000b" }), { topic_prefix: "err_topic" });
  // The backend strips slashes at both ends, so a nested topic is fine and a wrapped one is the same topic.
  assert.deepEqual(validateMqtt({ ...ok, topic_prefix: "/home/mttl/" }), {});
  // A port typed into a text field arrives as a string.
  assert.deepEqual(validateMqtt({ ...ok, port: "8883" }), {});
  for (const port of [0, 65536, 1.5, "", "abc", "12 3", "-1", "1e3", null, undefined, NaN]) {
    assert.deepEqual(validateMqtt({ ...ok, port }), { port: "err_port" }, String(port));
  }
  assert.deepEqual(validateMqtt({ ...ok, port: 1 }), {});
  assert.deepEqual(validateMqtt({ ...ok, port: 65535 }), {});
  // An invalid port is reported even while the integration is off.
  assert.deepEqual(validateMqtt({ ...ok, enabled: false, port: 0 }), { port: "err_port" });
  // Several faults are all reported.
  assert.deepEqual(validateMqtt({ ...ok, host: "", port: 0, topic_prefix: "#" }), { host: "err_required", port: "err_port", topic_prefix: "err_topic" });
});

test("mergeDraft keeps what the user is editing through a poll", () => {
  const next = mergeDraft({ ota_host_ip: "192.0.2.10", profile: "official-111" }, { ota_host_ip: "192.0.2.4", profile: "official-110" }, ["ota_host_ip"]);
  assert.deepEqual(next, { ota_host_ip: "192.0.2.4", profile: "official-111" });
  // Nothing edited: the refreshed values win. The inputs are not modified.
  const saved = { a: 1, b: 2 };
  const draft = { a: 9, b: 8 };
  assert.deepEqual(mergeDraft(saved, draft, []), { a: 1, b: 2 });
  assert.deepEqual(saved, { a: 1, b: 2 });
  assert.deepEqual(draft, { a: 9, b: 8 });
  // A key the refresh dropped but the user edited stays.
  assert.deepEqual(mergeDraft({ a: 1 }, { a: 1, password: "x" }, ["password"]), { a: 1, password: "x" });
});

test("dirtyKeys", () => {
  const saved = { host: "core-mosquitto", port: 1883, password: "" };
  assert.deepEqual(dirtyKeys(saved, saved), []);
  assert.deepEqual(dirtyKeys(saved, { ...saved, host: "192.0.2.9" }), ["host"]);
  // A blank password means "keep"; anything typed is a change.
  assert.deepEqual(dirtyKeys(saved, { ...saved, password: "" }), []);
  assert.deepEqual(dirtyKeys(saved, { ...saved, password: "x" }), ["password"]);
  assert.deepEqual(dirtyKeys({ ...saved, password: "old" }, { ...saved, password: "" }), []);
  // The same number typed as text is not a change; a different one is.
  assert.deepEqual(dirtyKeys(saved, { ...saved, port: "1883" }), []);
  assert.deepEqual(dirtyKeys(saved, { ...saved, port: "1884" }), ["port"]);
  assert.deepEqual(dirtyKeys(saved, { ...saved, port: "" }), ["port"]);
  assert.deepEqual(dirtyKeys(saved, { ...saved, port: "abc" }), ["port"]);
  // Spaces around a host and slashes around a topic do not make a different value.
  assert.deepEqual(dirtyKeys({ host: "a", topic_prefix: "mttl" }, { host: " a ", topic_prefix: "/mttl/" }), []);
  assert.deepEqual(dirtyKeys({ ota_host_ip: "192.0.2.10" }, { ota_host_ip: " 192.0.2.10" }), []);
  // Booleans.
  assert.deepEqual(dirtyKeys({ enabled: true, tls: false }, { enabled: false, tls: false }), ["enabled"]);
  // A key the saved side has never seen is a change.
  assert.deepEqual(dirtyKeys({}, { host: "x" }), ["host"]);
  assert.deepEqual(dirtyKeys(null, { host: "x" }), ["host"]);
});

test("mqttPayload sends only changed keys and never a blank password", () => {
  const saved = { enabled: true, host: "core-mosquitto", port: 1883, power_threshold_w: 0.1, password: "" };
  assert.deepEqual(mqttPayload(saved, { ...saved, power_threshold_w: 0.5 }), { power_threshold_w: 0.5 });
  assert.deepEqual(mqttPayload(saved, { ...saved, password: "s3cret" }), { password: "s3cret" });
  assert.deepEqual(mqttPayload(saved, { ...saved }), {});
  // Values go out the way the backend wants them: a number for the port, no stray spaces or slashes.
  const body = mqttPayload(
    { ...saved, topic_prefix: "mttl", username: "a" },
    { ...saved, host: " 192.0.2.9 ", port: "8883", topic_prefix: "/mttl2/", username: "b", enabled: false },
  );
  assert.deepEqual(body, { enabled: false, host: "192.0.2.9", port: 8883, topic_prefix: "mttl2", username: "b" });
  // A password is passed on as typed.
  assert.deepEqual(mqttPayload(saved, { ...saved, password: " p w " }), { password: " p w " });
  // Keys that are not MQTT settings never go out.
  assert.deepEqual(mqttPayload(saved, { ...saved, profile: "official-110", power_threshold_w: 1 }), { power_threshold_w: 1 });
});

test("mqttTestPayload sends every field so the backend tests what is on screen", () => {
  const draft = mqttDraft(demoHa());
  assert.deepEqual(Object.keys(mqttTestPayload(draft)).sort(), MQTT_FIELDS.filter((k) => k !== "password").sort());
  assert.deepEqual(mqttTestPayload({ ...draft, password: "x", port: "8883" }).password, "x");
  assert.equal(mqttTestPayload({ ...draft, port: "8883" }).port, 8883);
  assert.equal("password" in mqttTestPayload(draft), false);
});

test("mqttNeedsConfirm only for endpoint changes or disabling", () => {
  const saved = { enabled: true, host: "core-mosquitto", port: 1883, topic_prefix: "mttl", discovery_prefix: "homeassistant", birth_topic: "homeassistant/status", power_interval_s: 30 };
  assert.equal(mqttNeedsConfirm(saved, { ...saved, power_interval_s: 60 }), false);
  assert.equal(mqttNeedsConfirm(saved, { ...saved, host: "192.0.2.9" }), true);
  assert.equal(mqttNeedsConfirm(saved, { ...saved, enabled: false }), true);
  assert.equal(mqttNeedsConfirm({ ...saved, enabled: false }, { ...saved, enabled: false, host: "x" }), false);
  for (const change of [{ port: "1884" }, { topic_prefix: "other" }, { discovery_prefix: "ha" }, { birth_topic: "ha/up" }]) {
    assert.equal(mqttNeedsConfirm(saved, { ...saved, ...change }), true, JSON.stringify(change));
  }
  // The password, the user name, TLS and the thresholds never need a confirmation.
  for (const change of [{ password: "x" }, { username: "u" }, { tls: true }, { power_threshold_w: 1 }, { energy_interval_s: 300 }]) {
    assert.equal(mqttNeedsConfirm(saved, { ...saved, ...change }), false, JSON.stringify(change));
  }
  // Turning the integration on creates nothing to delete.
  assert.equal(mqttNeedsConfirm({ ...saved, enabled: false }, { ...saved, enabled: true, host: "x" }), false);
  // The same endpoint written with spaces or slashes is not a move.
  assert.equal(mqttNeedsConfirm(saved, { ...saved, host: " core-mosquitto ", topic_prefix: "/mttl/", port: "1883" }), false);
});

test("targetDirty", () => {
  assert.equal(targetDirty("official-111", "official-111"), false);
  assert.equal(targetDirty("official-111", "official-110"), true);
  assert.equal(targetDirty("", ""), false);
  assert.equal(targetDirty(undefined, undefined), false);
});

test("choices are the values the backend accepts", () => {
  assert.deepEqual([...POLL_CHOICES], [10, 15, 30, 60, 120, 300]);
  assert.deepEqual([...POWER_THRESHOLDS], [0.1, 0.2, 0.3, 0.5, 1]);
  assert.deepEqual([...REPORT_INTERVALS], [15, 30, 60, 120, 300, 600, 1800]);
  assert.deepEqual([...ENERGY_THRESHOLDS], [1, 2, 5, 10, 20]);
  const backend = backendFile("backend.py");
  const bridge = backendFile("ha_bridge.py");
  const numbers = (text) => text.split(",").map((s) => Number(s.trim()));
  assert.deepEqual(numbers(backend.match(/^ALLOWED_POLL=\(([^)]*)\)/m)[1]), [...POLL_CHOICES]);
  assert.deepEqual(numbers(bridge.match(/if pth not in \{([^}]*)\}/)[1]), [...POWER_THRESHOLDS]);
  assert.deepEqual(numbers(bridge.match(/if pint not in \{([^}]*)\}/)[1]), [...REPORT_INTERVALS]);
  assert.deepEqual(numbers(bridge.match(/if eth not in \{([^}]*)\}/)[1]), [...ENERGY_THRESHOLDS]);
  assert.deepEqual([...MQTT_FIELDS].sort(), [
    "birth_topic", "discovery_prefix", "enabled", "energy_interval_s", "energy_threshold_wh", "host", "password", "port",
    "power_interval_s", "power_threshold_w", "tls", "topic_prefix", "username",
  ]);
  assert.equal(JOB_ROW_LIMIT, 20);
});

test("mqttDraft fills what api/ha leaves out and never holds a password", () => {
  const blank = mqttDraft(null);
  assert.deepEqual(Object.keys(blank).sort(), [...MQTT_FIELDS].sort());
  assert.deepEqual(blank, {
    enabled: false, host: "", port: 1883, username: "", password: "", tls: false,
    topic_prefix: "mttl", discovery_prefix: "homeassistant", birth_topic: "homeassistant/status",
    power_threshold_w: 0.1, power_interval_s: 30, energy_threshold_wh: 1, energy_interval_s: 60,
  });
  const draft = mqttDraft({ ...demoHa(), password_set: true, password: "ignored" });
  assert.equal(draft.password, "");
  assert.equal(draft.host, "192.0.2.10");
  assert.equal(draft.enabled, true);
  assert.deepEqual(mqttDraft({ port: "oops", topic_prefix: "", power_threshold_w: "x" }).port, 1883);
  assert.equal(mqttDraft({ topic_prefix: "" }).topic_prefix, "mttl");
  assert.equal(mqttDraft({ power_threshold_w: "x" }).power_threshold_w, 0.1);
});

test("firmwareDraft and firmwareChangedKeys", () => {
  assert.deepEqual(firmwareDraft({ target_profile: "official-110", ota_host_ip: "192.0.2.10", jobs: [] }), { profile: "official-110", ota_host_ip: "192.0.2.10" });
  assert.deepEqual(firmwareDraft(null), { profile: "", ota_host_ip: "" });
  const saved = { profile: "official-111", ota_host_ip: "192.0.2.10" };
  assert.deepEqual(firmwareChangedKeys(saved, saved), []);
  assert.deepEqual(firmwareChangedKeys(saved, { ...saved, profile: "official-110" }), ["profile"]);
  assert.deepEqual(firmwareChangedKeys(saved, { ...saved, ota_host_ip: "192.0.2.4" }), ["ota_host_ip"]);
  // A blank address is "keep the stored one": there is nothing to save for it.
  assert.deepEqual(firmwareChangedKeys(saved, { ...saved, ota_host_ip: "" }), []);
  assert.deepEqual(firmwareChangedKeys(saved, { profile: "official-110", ota_host_ip: " " }), ["profile"]);
});

const profiles = () => demoResponse().firmware.profiles;
const devices = () => demoResponse().devices;

test("firmwareControls: Save needs a change and a valid address", () => {
  const saved = firmwareDraft(demoResponse().firmware);
  const base = { saved, draft: saved, profiles: profiles(), devices: devices(), viewOnly: false, busy: false };
  const idle = firmwareControls(base);
  assert.equal(idle.canSave, false);
  assert.deepEqual(idle.errors, {});
  const changed = firmwareControls({ ...base, draft: { ...saved, profile: "official-110" } });
  assert.equal(changed.canSave, true);
  const badHost = firmwareControls({ ...base, draft: { ...saved, ota_host_ip: "192.0.02.1" } });
  assert.deepEqual(badHost.errors, { ota_host_ip: "err_ipv4" });
  assert.equal(badHost.canSave, false);
  // A wrong address blocks a target change as well: Tuo would store the target and then fail on the address.
  const both = firmwareControls({ ...base, draft: { profile: "official-110", ota_host_ip: "nope" } });
  assert.equal(both.canSave, false);
  // Blank address only: nothing to save.
  assert.equal(firmwareControls({ ...base, draft: { ...saved, ota_host_ip: "" } }).canSave, false);
  assert.equal(firmwareControls({ ...base, draft: { profile: "official-110", ota_host_ip: "" } }).canSave, true);
  // Everything is off while viewing only or while a request is out.
  const draft = { ...saved, profile: "official-110" };
  assert.equal(firmwareControls({ ...base, draft, viewOnly: true }).canSave, false);
  assert.equal(firmwareControls({ ...base, draft, busy: true }).canSave, false);
});

test("firmwareControls: update buttons wait for a saved target", () => {
  const saved = firmwareDraft(demoResponse().firmware);
  const base = { saved, draft: saved, profiles: profiles(), devices: devices(), viewOnly: false, busy: false };
  const ready = firmwareControls(base);
  assert.equal(ready.unsaved, false);
  assert.equal(ready.canUpdateAll, true);
  assert.deepEqual(ready.targets.map((x) => x.name), ["Office Desk"]);
  // Target changed, not saved: the saved target would be used, so the button is off and the page says why.
  const dirty = firmwareControls({ ...base, draft: { ...saved, profile: "official-110" } });
  assert.equal(dirty.unsaved, true);
  assert.equal(dirty.canUpdateAll, false);
  // An unsaved server address would also be ignored by the update.
  const host = firmwareControls({ ...base, draft: { ...saved, ota_host_ip: "192.0.2.4" } });
  assert.equal(host.unsaved, true);
  assert.equal(host.canUpdateAll, false);
  // A blank address changes nothing.
  assert.equal(firmwareControls({ ...base, draft: { ...saved, ota_host_ip: "" } }).canUpdateAll, true);
  // Nothing to update, view only, a running request: off.
  assert.equal(firmwareControls({ ...base, devices: [] }).canUpdateAll, false);
  assert.equal(firmwareControls({ ...base, viewOnly: true }).canUpdateAll, false);
  assert.equal(firmwareControls({ ...base, busy: true }).canUpdateAll, false);
  // A custom target whose file is not ready cannot be installed.
  const custom = profiles().find((p) => p.kind === "custom");
  const brokenProfiles = profiles().map((p) => (p.id === custom.id ? { ...p, ready: false } : p));
  const onCustom = { saved: { ...saved, profile: custom.id }, draft: { ...saved, profile: custom.id } };
  assert.equal(firmwareControls({ ...base, ...onCustom, profiles: brokenProfiles }).canUpdateAll, false);
  assert.equal(firmwareControls({ ...base, ...onCustom }).canUpdateAll, true);
});

test("firmwareControls: only an official profile is prepared", () => {
  const saved = firmwareDraft(demoResponse().firmware);
  const base = { saved, draft: saved, profiles: profiles(), devices: devices(), viewOnly: false, busy: false };
  assert.equal(firmwareControls(base).canPrepare, true);
  assert.equal(firmwareControls({ ...base, draft: { ...saved, profile: "official-66" } }).canPrepare, true);
  const custom = profiles().find((p) => p.kind === "custom");
  assert.equal(firmwareControls({ ...base, draft: { ...saved, profile: custom.id } }).canPrepare, false);
  assert.equal(firmwareControls({ ...base, draft: { ...saved, profile: "gone" } }).canPrepare, false);
  assert.equal(firmwareControls({ ...base, viewOnly: true }).canPrepare, false);
  assert.equal(firmwareControls({ ...base, busy: true }).canPrepare, false);
  // Preparing does not depend on the saved target.
  assert.equal(firmwareControls({ ...base, draft: { ...saved, profile: "official-110" } }).canPrepare, true);
});

test("mqttControls", () => {
  const saved = mqttDraft(demoHa());
  const base = { saved, draft: saved, viewOnly: false, busy: false };
  const idle = mqttControls(base);
  assert.deepEqual({ ...idle }, {
    errors: {}, dirty: [], canSave: false, canTest: true, canSync: true, needsConfirm: false,
  });
  const edited = mqttControls({ ...base, draft: { ...saved, power_threshold_w: 0.5 } });
  assert.equal(edited.canSave, true);
  assert.equal(edited.needsConfirm, false);
  assert.deepEqual(edited.dirty, ["power_threshold_w"]);
  const moved = mqttControls({ ...base, draft: { ...saved, host: "192.0.2.9" } });
  assert.equal(moved.needsConfirm, true);
  const invalid = mqttControls({ ...base, draft: { ...saved, port: "0" } });
  assert.equal(invalid.canSave, false);
  assert.equal(invalid.canTest, false);
  assert.deepEqual(invalid.errors, { port: "err_port" });
  // The test needs a broker even when the integration is off.
  const off = { ...saved, enabled: false, host: "" };
  const offControls = mqttControls({ ...base, saved: off, draft: off });
  assert.deepEqual(offControls.errors, {});
  assert.equal(offControls.canTest, false);
  assert.equal(offControls.canSync, false);
  assert.equal(mqttControls({ ...base, saved: off, draft: { ...off, host: "x" } }).canTest, true);
  // Typing a password alone is a change; the field can be saved.
  assert.equal(mqttControls({ ...base, draft: { ...saved, password: "x" } }).canSave, true);
  // View only and busy switch everything off.
  for (const flags of [{ viewOnly: true }, { busy: true }]) {
    const c = mqttControls({ ...base, draft: { ...saved, power_threshold_w: 0.5 }, ...flags });
    assert.deepEqual([c.canSave, c.canTest, c.canSync], [false, false, false], JSON.stringify(flags));
  }
});

test("pollCanSave", () => {
  const base = { saved: { poll_interval: 15 }, draft: { poll_interval: 15 }, allowed: [...POLL_CHOICES], viewOnly: false, busy: false };
  assert.equal(pollCanSave(base), false);
  assert.equal(pollCanSave({ ...base, draft: { poll_interval: 30 } }), true);
  assert.equal(pollCanSave({ ...base, draft: { poll_interval: "30" } }), true);
  assert.equal(pollCanSave({ ...base, draft: { poll_interval: 45 } }), false);
  assert.equal(pollCanSave({ ...base, draft: { poll_interval: 30 }, viewOnly: true }), false);
  assert.equal(pollCanSave({ ...base, draft: { poll_interval: 30 }, busy: true }), false);
});

test("every polling and report interval has a unit text in both languages", () => {
  for (const n of [...POLL_CHOICES, ...REPORT_INTERVALS]) {
    for (const lang of ["en", "ko"]) assert.ok(STRINGS[lang][core.intervalUnit(n).key], `${lang} ${n}`);
  }
});

test("fmtBytes and shortSha", () => {
  assert.equal(fmtBytes(327944), "327,944 B");
  assert.equal(fmtBytes("327944"), "327,944 B");
  assert.equal(fmtBytes(0), "0 B");
  for (const bad of [null, undefined, "", "x", NaN, -1]) assert.equal(fmtBytes(bad), NA, String(bad));
  assert.equal(shortSha("3f9c1e0a5b2d7c8e91f4a6b3d0e2c5f7a1b4d6e8c0f2a4b6d8e0c2f4a6b8d0e2"), "3f9c1e0a5b2d");
  assert.equal(shortSha("abc"), "abc");
  for (const bad of [null, undefined, "", 5]) assert.equal(shortSha(bad), NA, String(bad));
});

test("deviceLabel names a device like its card does", () => {
  const list = devices();
  assert.equal(deviceLabel("0a1b2c3d4e5f", list), "Living Room");
  assert.equal(deviceLabel("0A:1B:2C:3D:4E:5F", list), "Living Room");
  // No alias: MTTL and the last six digits.
  assert.equal(deviceLabel("0a1b2c3d4e61", list), "MTTL 3D4E61");
  // A device the list does not have yet is still named.
  assert.equal(deviceLabel("0a1b2c3d4e99", list), "MTTL 3D4E99");
  assert.equal(deviceLabel("0a1b2c3d4e99", null), "MTTL 3D4E99");
  assert.equal(deviceLabel(undefined, list), "MTTL");
});

test("profileTitle and profileRows describe each firmware file", () => {
  const list = profiles();
  const [official, notReady, stock, custom] = list;
  assert.deepEqual(profileTitle(official), { text: "UP + Child Lock · 1.0.111" });
  // A custom file is named by us, not by the backend's Korean label.
  assert.deepEqual(profileTitle(custom), { key: "fw_custom", vars: { v: "1.0.112" } });
  assert.deepEqual(profileTitle({ id: "official-9" }), { text: "official-9" });
  assert.deepEqual(profileTitle(null), { text: "" });
  assert.ok(STRINGS.en.fw_custom.includes("{v}"));
  assert.ok(STRINGS.ko.fw_custom.includes("{v}"));

  const rows = profileRows(list);
  assert.deepEqual(rows.map((r) => r.id), list.map((p) => p.id));
  const first = rows[0];
  assert.deepEqual(
    { id: first.id, version: first.version, ready: first.ready, selected: first.selected, custom: first.custom, canDownload: first.canDownload, canDelete: first.canDelete, sha: first.sha, size: first.size },
    { id: "official-111", version: "1.0.111", ready: true, selected: true, custom: false, canDownload: true, canDelete: false, sha: shortSha(official.sha256), size: "327,944 B" },
  );
  assert.equal(first.file, "official_1.0.111.fwr");
  assert.equal(rows[1].ready, false);
  assert.equal(rows[1].canDownload, false, "a file that is not prepared cannot be downloaded");
  assert.equal(rows[1].file, null);
  assert.equal(rows[2].ready, false);
  assert.equal(stock.id, "official-66");
  assert.equal(notReady.id, "official-110");
  const last = rows[3];
  assert.equal(last.custom, true);
  assert.equal(last.canDelete, true);
  assert.equal(last.canDownload, true);
  assert.equal(last.file, custom.original_filename);
  assert.deepEqual(profileRows(null), []);
  assert.deepEqual(profileRows([{ id: "x" }])[0].sha, NA);
});

test("jobRows put running jobs first, name devices and keep unknown states as sent", () => {
  const now = 2_000_000;
  const list = devices();
  const jobs = [
    { id: "a", mac: "0a1b2c3d4e5f", state: "SUCCESS", from_version: "1.0.110", target_version: "1.0.111", queued_at: now - 90000, updated_at: now - 89900, detail: "done" },
    { id: "b", mac: "0a1b2c3d4e62", state: "RECONNECTING", from_version: "1.0.66", target_version: "1.0.111", queued_at: now - 200, updated_at: now - 8, detail: null },
    { id: "c", mac: "0a1b2c3d4e60", state: "FAILED_DOWNLOAD", from_version: "1.0.66", target_version: "1.0.111", queued_at: now - 10000, updated_at: now - 9990, detail: "no request" },
    { id: "d", mac: "0a1b2c3d4e5f", state: "SOMETHING_NEW", queued_at: now - 100, updated_at: now - 3 },
  ];
  const rows = jobRows(jobs, list, now);
  // Running jobs first (the unknown state counts as running), newest queue time first; then the finished ones.
  assert.deepEqual(rows.map((r) => r.id), ["d", "b", "c", "a"]);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual(
    { name: byId.b.name, stateKey: byId.b.stateKey, state: byId.b.state, tone: byId.b.tone, active: byId.b.active, from: byId.b.from, to: byId.b.to, age: byId.b.age, detail: byId.b.detail },
    { name: "Garage", stateKey: "job_reconnecting", state: "RECONNECTING", tone: "warn", active: true, from: "1.0.66", to: "1.0.111", age: "8 s ago", detail: null },
  );
  assert.equal(byId.c.tone, "bad");
  assert.equal(byId.c.active, false);
  assert.equal(byId.a.tone, "ok");
  assert.equal(byId.a.name, "Living Room");
  assert.equal(byId.a.age, "1 d ago");
  // A state the page does not know has no text key: the screen shows the state itself.
  assert.equal(byId.d.stateKey, null);
  assert.equal(byId.d.state, "SOMETHING_NEW");
  assert.equal(byId.d.from, null);
  assert.equal(byId.d.to, null);
  // At most 20 rows; the newest finished ones stay.
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `j${i}`, mac: "0a1b2c3d4e5f", state: "SUCCESS", queued_at: i, updated_at: i }));
  const limited = jobRows(many, list, 100);
  assert.equal(limited.length, 20);
  assert.equal(limited[0].id, "j29");
  assert.deepEqual(jobRows(null, list, now), []);
  // A job without an id still gets a stable key.
  const noId = jobRows([{ mac: "0a1b2c3d4e5f", state: "QUEUED", queued_at: 5, updated_at: 5 }], list, now);
  assert.match(noId[0].id, /0a1b2c3d4e5f/);
});

test("every job state has a text for the jobs list in both languages", () => {
  const now = 1000;
  const rows = jobRows(JOB_STATES.map((state, i) => ({ id: `s${i}`, mac: "0a1b2c3d4e5f", state, queued_at: i, updated_at: i })), devices(), now);
  assert.equal(rows.length, JOB_STATES.length);
  for (const row of rows) {
    assert.ok(row.stateKey, row.state);
    for (const lang of ["en", "ko"]) assert.ok(STRINGS[lang][row.stateKey], `${lang}.${row.stateKey}`);
  }
});

test("demo data covers the settings page", () => {
  const cfg = demoConfig();
  assert.deepEqual(cfg, {
    version: "0.2.11", poll_interval: 15, allowed: [10, 15, 30, 60, 120, 300], diagnostic_allowed: [30, 60, 120, 300, 600, 1800],
  });
  assert.deepEqual(cfg.allowed, [...POLL_CHOICES]);
  // Each call returns a copy, so a demo save cannot leak into the next page.
  cfg.allowed.push(1);
  assert.deepEqual(demoConfig().allowed, [...POLL_CHOICES]);

  const demo = demoResponse();
  const fw = demo.firmware;
  assert.equal(fw.profiles.length, 4);
  assert.deepEqual(fw.profiles.map((p) => [p.id, p.kind, p.ready]), [
    ["official-111", "official", true],
    ["official-110", "official", false],
    ["official-66", "official", false],
    [fw.profiles[3].id, "custom", true],
  ]);
  assert.match(fw.profiles[3].id, /^custom-[0-9a-f]{16}$/);
  assert.equal(fw.profiles.filter((p) => p.kind === "custom").length, 1);
  assert.equal(fw.target_profile, "official-111");
  assert.deepEqual(fw.profiles.filter((p) => p.selected).map((p) => p.id), ["official-111"]);
  for (const p of fw.profiles) {
    for (const key of ["id", "kind", "version", "label", "sha256", "size", "model", "filename", "original_filename", "created_at", "updated_at", "ready", "selected"]) {
      assert.ok(key in p, `${p.id}.${key}`);
    }
    assert.match(p.sha256, /^[0-9a-f]{64}$/);
    assert.equal(p.size, 327944);
  }
  // Jobs: one running, one finished, one failed download; the states are ones the page knows.
  assert.equal(fw.jobs.length, 3);
  const states = fw.jobs.map((j) => j.state);
  assert.ok(states.includes("SUCCESS"));
  assert.ok(states.includes("FAILED_DOWNLOAD"));
  assert.equal(states.filter((s) => !["SUCCESS", "FAILED_DOWNLOAD"].includes(s)).length, 1);
  for (const j of fw.jobs) {
    assert.ok(JOB_STATES.includes(j.state), j.state);
    for (const key of ["id", "mac", "from_version", "profile_id", "target_version", "state", "detail", "queued_at", "updated_at"]) assert.ok(key in j, `${j.id}.${key}`);
    assert.ok(demo.devices.some((d) => d.mac === j.mac), j.mac);
  }
  // Every job and every file is told apart by its id and hash.
  assert.equal(new Set(fw.jobs.map((j) => j.id)).size, fw.jobs.length);
  assert.equal(new Set(fw.profiles.map((p) => p.sha256)).size, fw.profiles.length);
  for (const j of fw.jobs) assert.match(j.id, /^[0-9a-f]{32}$/);
  // One hidden device with its preserved energy.
  assert.equal(demo.removed.length, 1);
  const hidden = demo.removed[0];
  assert.equal(hidden.removed, true);
  assert.ok(hidden.removed_at > 0);
  assert.ok(hidden.channels.some((ch) => ch.energy_lifetime_wh > 0));
  assert.ok(!demo.devices.some((d) => d.mac === hidden.mac));
  // Office waits for its update; Garage is still on 1.0.66 while its update runs (it is offline, so "update all" skips it).
  assert.deepEqual(demo.devices.filter((d) => d.firmware_action).map((d) => d.mac), ["0a1b2c3d4e60", "0a1b2c3d4e62"]);

  const ha = demoHa();
  assert.deepEqual(
    [ha.power_threshold_w, ha.power_interval_s, ha.energy_threshold_wh, ha.energy_interval_s],
    [0.1, 30, 1, 60],
  );
  assert.ok(POWER_THRESHOLDS.includes(ha.power_threshold_w));
  assert.ok(REPORT_INTERVALS.includes(ha.power_interval_s));
  assert.ok(ENERGY_THRESHOLDS.includes(ha.energy_threshold_wh));
  assert.ok(REPORT_INTERVALS.includes(ha.energy_interval_s));
  assert.equal(ha.password_set, true);
  assert.equal(ha.last_error, null);
  for (const key of MQTT_FIELDS.filter((k) => k !== "password")) assert.ok(key in ha, key);
});

// ---- Texts ----

const settingsHtml = () => staticFile("settings.html");
const settingsMjs = () => staticFile("settings.mjs");
const SETTINGS_CORE = () => staticFile("settings-core.mjs");

test("every text the settings page uses exists in EN and KR", () => {
  const keys = new Set();
  for (const m of settingsHtml().matchAll(/data-i18n(?:-title|-ph)?="([^"]+)"/g)) keys.add(m[1]);
  for (const m of settingsMjs().matchAll(/\bt\(\s*(?:page\.lang|lang),\s*"([a-z0-9_]+)"/g)) keys.add(m[1]);
  for (const m of settingsMjs().matchAll(/\bkey: "([a-z0-9_]+)"/g)) keys.add(m[1]);
  for (const m of SETTINGS_CORE().matchAll(/"(err_[a-z0-9_]+|fw_custom)"/g)) keys.add(m[1]);
  // intervalUnit, which the page shares with the device window, is in dashboard-core.mjs.
  for (const m of staticFile("dashboard-core.mjs").matchAll(/"(unit_[a-z]+)"/g)) keys.add(m[1]);
  assert.ok(keys.size > 40, `scan found ${keys.size} keys`);
  for (const must of ["card_fw", "card_mqtt", "err_ipv4", "err_required", "err_port", "err_topic", "unit_s", "unit_min", "fw_custom"]) {
    assert.ok(keys.has(must), `scan found ${must}`);
  }
  for (const key of keys) {
    for (const lang of ["en", "ko"]) assert.ok(typeof STRINGS[lang][key] === "string" && STRINGS[lang][key] !== "", `${lang}.${key}`);
  }
});

test("card titles and the top bar read the same in EN and KR", () => {
  const titles = { card_fw: "Firmware", card_files: "Firmware files", card_jobs: "Firmware jobs", card_poll: "Polling", card_mqtt: "Home Assistant MQTT" };
  for (const [key, want] of Object.entries(titles)) {
    assert.ok(ENGLISH_ONLY.includes(key), key);
    assert.equal(STRINGS.en[key], want, key);
    assert.equal(STRINGS.ko[key], want, key);
  }
  for (const key of ["nav_dashboard"]) {
    assert.ok(ENGLISH_ONLY.includes(key), key);
    assert.equal(STRINGS.ko[key], STRINGS.en[key], key);
  }
  // The texts a person reads to decide something are translated.
  for (const key of ["err_ipv4", "err_required", "err_port", "err_topic", "fw_all_warn", "mqtt_save_warn", "fw_delete_warn", "fw_save_first"]) {
    assert.ok(!ENGLISH_ONLY.includes(key), key);
    assert.match(STRINGS.ko[key], /\p{Script=Hangul}/u, key);
    assert.notEqual(STRINGS.ko[key], STRINGS.en[key], key);
  }
});

test("the settings page links back with the demo flag and holds no markup sinks", () => {
  const html = settingsHtml();
  assert.match(html, /<a class="tool" href="\.\/" data-demo-href="dashboard\.html\?demo"/);
  assert.match(html, /<a class="tool" href="logs\.html" data-demo-href="logview\.html\?demo"/);
  for (const name of ["settings.mjs", "settings-core.mjs"]) {
    const src = staticFile(name);
    for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"]) assert.ok(!src.includes(sink), `${name} ${sink}`);
  }
  assert.ok(!settingsMjs().includes("fetch("), "requests go through the shared request functions");
  assert.match(settingsMjs(), /\bisViewOnly\(\{/);
  assert.match(html, /id="firmware"/);
  assert.match(html, /id="mqtt"/);
});

test("every field and button the page code names exists in the page, and every button has a handler", () => {
  const html = settingsHtml();
  const code = settingsMjs();
  const fields = new Set([...html.matchAll(/data-f="([A-Za-z_]+)"/g)].map((m) => m[1]));
  const used = new Set([...code.matchAll(/\bf\.([A-Za-z_]+)/g)].map((m) => m[1]));
  for (const key of MQTT_FIELDS) used.add(key); // read as f[key]
  for (const key of ["host", "port", "topic_prefix", "discovery_prefix", "birth_topic"]) used.add(`err_${key}`); // read as f[`err_${key}`]
  assert.ok(used.size > 30, `scan found ${used.size} fields`);
  for (const name of used) assert.ok(fields.has(name), `settings.html has no data-f="${name}"`);
  const acts = [...html.matchAll(/data-act="([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(acts.length >= 10, `scan found ${acts.length} buttons`);
  for (const act of acts) assert.ok(code.includes(`case "${act}"`), `no handler for ${act}`);
  // The page code picks cards by these ids.
  for (const id of ["firmware", "firmware-files", "firmware-jobs", "polling", "mqtt"]) assert.ok(html.includes(`id="${id}"`), id);
});

// ---- Request and reading flow ----

const { settleRequest, refreshReads } = settings;

test("settleRequest reads again after a request that worked", async () => {
  const seen = [];
  const out = await settleRequest(async () => "answer", async () => { seen.push("reload"); return true; });
  assert.deepEqual(out, { ok: true, answer: "answer", failure: null, reloaded: true });
  assert.deepEqual(seen, ["reload"]);
});

test("settleRequest reads again after a request that failed, because Tuo stores the target before it checks the address", async () => {
  let reloads = 0;
  const out = await settleRequest(async () => { throw new Error("OTA server IP must be a valid IPv4 address"); }, async () => { reloads++; return true; });
  assert.equal(out.ok, false);
  assert.equal(out.failure.message, "OTA server IP must be a valid IPv4 address");
  assert.equal(out.answer, null);
  assert.equal(out.reloaded, true);
  assert.equal(reloads, 1);
});

test("settleRequest reports a reading that failed instead of letting it pass as done", async () => {
  // A reading says "false" when the backend did not answer; one that throws counts the same. Neither makes settleRequest reject.
  assert.equal((await settleRequest(async () => 1, async () => false)).reloaded, false);
  const thrown = await settleRequest(async () => 1, async () => { throw new Error("offline"); });
  assert.deepEqual([thrown.ok, thrown.reloaded], [true, false], "the request itself worked");
  const both = await settleRequest(async () => { throw new Error("nope"); }, async () => { throw new Error("offline"); });
  assert.deepEqual([both.ok, both.reloaded, both.failure.message], [false, false, "nope"]);
  // A reading that returns nothing is a reading that worked; so is no reading at all.
  assert.equal((await settleRequest(async () => 1, async () => undefined)).reloaded, true);
  let called = false;
  assert.equal((await settleRequest(async () => { called = true; return 1; })).reloaded, true);
  assert.equal(called, true);
});

test("settleRequest turns anything thrown into an Error, even a falsy value", async () => {
  for (const [thrown, message] of [["boom", "boom"], [undefined, "request failed"], [null, "request failed"], [0, "0"]]) {
    const out = await settleRequest(async () => { throw thrown; });
    assert.equal(out.ok, false, String(thrown));
    assert.ok(out.failure instanceof Error);
    assert.equal(out.failure.message, message);
  }
  const err = new TypeError("x");
  assert.equal((await settleRequest(async () => { throw err; })).failure, err, "an Error is passed on as it is");
});

test("settleRequest waits for the request before it reads", async () => {
  const order = [];
  await settleRequest(async () => { await new Promise((r) => setTimeout(r, 5)); order.push("work"); }, async () => { order.push("reload"); });
  assert.deepEqual(order, ["work", "reload"]);
});

test("refreshReads: the device list every time; config and HA status when they are missing or the last reading failed", () => {
  assert.deepEqual(refreshReads({ stale: false, hasConfig: true, hasHa: true }), ["devices"]);
  assert.deepEqual(refreshReads({ stale: false, hasConfig: false, hasHa: true }), ["devices", "config"]);
  assert.deepEqual(refreshReads({ stale: false, hasConfig: true, hasHa: false }), ["devices", "ha"]);
  assert.deepEqual(refreshReads({ stale: false, hasConfig: false, hasHa: false }), ["devices", "config", "ha"]);
  // After a failure everything is read again, so the form shows what the backend holds once it answers.
  assert.deepEqual(refreshReads({ stale: true, hasConfig: true, hasHa: true }), ["devices", "config", "ha"]);
});

test("the page reads from the live source unless it runs as a demo", () => {
  const code = settingsMjs();
  assert.match(code, /state\.source = demo \? createDemoSource\(\) : createSettingsApi\(\);/);
  assert.ok(!/state\.source = demo \? createDemoSource\(\) : null/.test(code), "a null source would leave the page empty");
});

test("the file chooser and the upload button stay off until the page has loaded, like every other card", () => {
  const code = settingsMjs();
  const fn = (name) => code.slice(code.indexOf(`function ${name}(`), code.indexOf("\n}\n", code.indexOf(`function ${name}(`)));
  const render = fn("renderFiles");
  assert.match(render, /const lock = state\.viewOnly \|\| busy \|\| !state\.loaded;/);
  assert.match(render, /setDisabled\(f\.choose, lock\)/);
  assert.match(render, /id: "files-upload", label: "fw_upload", can: state\.file !== null && !lock/);
  assert.match(fn("updateFileRow"), /const lock = state\.viewOnly \|\| filesBusy \|\| !state\.loaded;/);
});

test("run() frees the card in a finally block and takes the saved values into the form only after a successful reading", () => {
  const code = settingsMjs();
  const start = code.indexOf("async function run(");
  const body = code.slice(start, code.indexOf("\n}\n", start));
  assert.ok(start > 0 && body.includes("settleRequest("), "run() sends through settleRequest");
  const tail = body.slice(body.indexOf("finally"));
  assert.ok(body.includes("finally"), "run() has a finally block");
  assert.ok(tail.includes("state.busy.delete(id)") && tail.includes("render()"), "the card is freed and drawn again in it");
  assert.match(body, /if \(!settled\.reloaded\) state\.stale = true;/, "a failed reading turns the server badge offline");
  assert.match(body, /if \(settled\.reloaded\) reset\?\.\(\);/, "the form keeps the user's values when the reading failed");
});

test("start() and the MQTT recheck cannot be stopped by a failed reading", () => {
  const code = settingsMjs();
  const start = code.slice(code.indexOf("async function start("), code.indexOf("function init()"));
  assert.ok(start.indexOf("readAll()") !== -1 && start.indexOf("setInterval(") > start.indexOf("readAll()"));
  assert.ok(!/await Promise\.all\(\[readDevices\(\), readConfig\(\), readHa\(\)\]\)/.test(start), "no bare Promise.all of readings");
  // The reading functions answer false on failure; none of them throws.
  for (const name of ["readDevices", "readConfig", "readHa"]) {
    const at = code.indexOf(`async function ${name}(`);
    const fn = code.slice(at, code.indexOf("\n}\n", at));
    assert.ok(/catch/.test(fn) && /return false;/.test(fn) && /return true;/.test(fn), `${name} answers true or false`);
  }
  const recheck = code.slice(code.indexOf("state.haTimer = setTimeout"), code.indexOf("function testMqtt"));
  assert.match(recheck, /if \(!await readHa\(\)\) state\.stale = true;/);
});
