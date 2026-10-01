import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fw = await import(new URL("../../mttl_w01/backend/static/firmware-core.mjs", import.meta.url));
const {
  FWR_SIZE, JOB_STATES, TERMINAL_STATES,
  jobStateKey, isJobActive, jobTone, latestJobFor, deviceFirmware, updateAllTargets, profileHintKey, checkFwrFile,
} = fw;

const MAC = "0a1b2c3d4e60";
const device = (extra = {}) => ({
  mac: MAC, alias: "Office Desk", online: true, removed: false, firmware_version: "1.0.66", firmware_action: "update",
  firmware_target: { profile_id: "official-111", version: "1.0.111", kind: "official", ready: false },
  ...extra,
});

test("FWR_SIZE is the size of a LG firmware file", () => {
  assert.equal(FWR_SIZE, 327944);
});

test("JOB_STATES lists every state and TERMINAL_STATES matches the backend", () => {
  assert.equal(new Set(JOB_STATES).size, JOB_STATES.length);
  for (const state of ["QUEUED", "DOWNLOADING", "VERIFYING", "SUCCESS", "RESULT_UNKNOWN", "FAILED_INTERNAL"]) {
    assert.ok(JOB_STATES.includes(state), state);
  }
  for (const state of TERMINAL_STATES) assert.ok(JOB_STATES.includes(state), state);
  // backend.py OTA_TERMINAL_STATES is the source of truth for "finished".
  const backend = readFileSync(new URL("../../mttl_w01/backend/backend.py", import.meta.url), "utf-8");
  const list = backend.match(/^OTA_TERMINAL_STATES=\(([^)]*)\)/m)[1];
  const fromBackend = [...list.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
  assert.ok(fromBackend.length > 0);
  assert.deepEqual([...TERMINAL_STATES].sort(), fromBackend.sort());
  // Everything that is not finished is in progress.
  assert.deepEqual(
    JOB_STATES.filter((s) => !TERMINAL_STATES.includes(s)),
    ["QUEUED", "PREPARING", "COMMAND_SENT", "ACKED", "DOWNLOADING", "TRANSFERRED", "RECONNECTING", "VERIFYING"],
  );
});

test("jobStateKey maps known states and leaves unknown ones", () => {
  assert.equal(jobStateKey("DOWNLOADING"), "job_downloading");
  assert.equal(jobStateKey("FAILED_VERSION"), "job_failed_version");
  assert.equal(jobStateKey("SOMETHING_NEW"), null);
  assert.equal(jobStateKey("downloading"), null);
  assert.equal(jobStateKey(undefined), null);
  assert.equal(jobStateKey(null), null);
  for (const state of JOB_STATES) assert.equal(jobStateKey(state), `job_${state.toLowerCase()}`, state);
});

test("isJobActive and jobTone", () => {
  assert.equal(isJobActive({ state: "VERIFYING" }), true);
  assert.equal(isJobActive({ state: "SUCCESS" }), false);
  assert.equal(isJobActive(null), false);
  assert.equal(isJobActive(undefined), false);
  assert.equal(isJobActive({}), false);
  // The backend counts any state it does not list as finished as running, so a new state blocks too.
  assert.equal(isJobActive({ state: "SOMETHING_NEW" }), true);
  for (const state of TERMINAL_STATES) assert.equal(isJobActive({ state }), false, state);
  assert.equal(jobTone({ state: "SUCCESS" }), "ok");
  assert.equal(jobTone({ state: "DELAYED_SUCCESS" }), "ok");
  assert.equal(jobTone({ state: "RESULT_UNKNOWN" }), "bad");
  assert.equal(jobTone({ state: "FAILED_ACK" }), "bad");
  assert.equal(jobTone({ state: "FAILED_INTERNAL" }), "bad");
  assert.equal(jobTone({ state: "QUEUED" }), "warn");
  assert.equal(jobTone({ state: "CANCELLED_RESTART" }), "warn");
  assert.equal(jobTone({ state: "SOMETHING_NEW" }), "warn");
  assert.equal(jobTone(null), "warn");
});

test("deviceFirmware blocks offline, busy and unready custom targets only", () => {
  const dev = device();
  const r = deviceFirmware(dev, { jobs: [] });
  assert.equal(r.canUpdate, true);
  assert.equal(r.block, null);
  assert.equal(r.current, "1.0.66");
  assert.equal(r.target, "1.0.111");
  assert.equal(r.action, "update");
  assert.equal(r.job, null);
  assert.equal(r.active, false);
  assert.equal(deviceFirmware({ ...dev, online: false }, { jobs: [] }).block, "offline");
  assert.equal(deviceFirmware({ ...dev, online: false }, { jobs: [] }).canUpdate, false);
  const busy = deviceFirmware(dev, { jobs: [{ mac: dev.mac, state: "DOWNLOADING", updated_at: 5 }] });
  assert.equal(busy.block, "busy");
  assert.equal(busy.active, true);
  assert.equal(busy.canUpdate, false);
  assert.equal(busy.job.state, "DOWNLOADING");
  const custom = { ...dev, firmware_target: { ...dev.firmware_target, kind: "custom", ready: false } };
  assert.equal(deviceFirmware(custom, { jobs: [] }).block, "not_ready");
  assert.equal(deviceFirmware(custom, { jobs: [] }).canUpdate, false);
  // A custom file is registered only after it passed validation, so a ready one updates at once.
  assert.equal(deviceFirmware({ ...custom, firmware_target: { ...custom.firmware_target, ready: true } }, { jobs: [] }).canUpdate, true);
  // An official target that is not prepared yet is built by Tuo when the update starts.
  assert.equal(deviceFirmware(dev, { jobs: [] }).block, null);
  assert.equal(deviceFirmware({ ...dev, firmware_action: null }, { jobs: [] }).canUpdate, false);
  assert.equal(deviceFirmware({ ...dev, firmware_action: null }, { jobs: [] }).action, null);
});

test("deviceFirmware keeps the newest finished job and tolerates missing data", () => {
  const dev = device();
  const done = deviceFirmware(dev, { jobs: [{ mac: dev.mac, state: "FAILED_ACK", updated_at: 7 }] });
  assert.equal(done.job.state, "FAILED_ACK");
  assert.equal(done.active, false);
  assert.equal(done.canUpdate, true);
  const bare = deviceFirmware({ mac: MAC }, null);
  assert.deepEqual(
    { ...bare },
    { current: null, target: null, action: null, job: null, active: false, canUpdate: false, block: "offline" },
  );
  // An action name the screen does not know is no action.
  assert.equal(deviceFirmware(device({ firmware_action: "teleport" }), { jobs: [] }).action, null);
});

test("latestJobFor picks the newest job of that device", () => {
  const jobs = [
    { mac: MAC, state: "SUCCESS", updated_at: 3 },
    { mac: MAC, state: "FAILED_ACK", updated_at: 9 },
    { mac: "0a1b2c3d4e5f", state: "QUEUED", updated_at: 20 },
    { mac: MAC, state: "FAILED_BUSY", updated_at: 4 },
  ];
  assert.equal(latestJobFor(jobs, MAC).state, "FAILED_ACK");
  assert.equal(latestJobFor(jobs, "0a1b2c3d4e5f").state, "QUEUED");
  assert.equal(latestJobFor(jobs, "0a1b2c3d4e99"), null);
  assert.equal(latestJobFor([], MAC), null);
  assert.equal(latestJobFor(null, MAC), null);
  assert.equal(latestJobFor(jobs, "not a mac"), null);
  // MAC spelling does not matter.
  assert.equal(latestJobFor(jobs, "0A:1B:2C:3D:4E:60").state, "FAILED_ACK");
  assert.equal(latestJobFor([{ mac: "0A:1B:2C:3D:4E:60", state: "SUCCESS", updated_at: 1 }], MAC).state, "SUCCESS");
  // Equal update times fall back to the queue time.
  const tied = [
    { mac: MAC, state: "FAILED_ACK", updated_at: 5, queued_at: 1 },
    { mac: MAC, state: "SUCCESS", updated_at: 5, queued_at: 2 },
  ];
  assert.equal(latestJobFor(tied, MAC).state, "SUCCESS");
  assert.equal(latestJobFor([...tied].reverse(), MAC).state, "SUCCESS");
  // A job without a time never beats one with a time.
  assert.equal(latestJobFor([{ mac: MAC, state: "QUEUED" }, { mac: MAC, state: "SUCCESS", updated_at: 1 }], MAC).state, "SUCCESS");
});

test("updateAllTargets lists online, visible devices with an action", () => {
  const list = [
    device({ mac: "0a1b2c3d4e5f", alias: "Living Room", firmware_version: "1.0.110" }),
    device({ mac: "0a1b2c3d4e60", online: false }),
    device({ mac: "0a1b2c3d4e61", removed: true }),
    device({ mac: "0a1b2c3d4e62", firmware_action: null, firmware_version: "1.0.111" }),
    device({ mac: "0a1b2c3d4e63", alias: null, firmware_action: "reflash", firmware_version: "1.0.111" }),
    device({ mac: "0a1b2c3d4e64", alias: "Garage", firmware_action: "downgrade", firmware_version: "1.0.112",
      firmware_target: { profile_id: "official-111", version: "1.0.111", kind: "official", ready: true } }),
  ];
  assert.deepEqual(updateAllTargets(list), [
    { mac: "0a1b2c3d4e5f", name: "Living Room", from: "1.0.110", to: "1.0.111" },
    { mac: "0a1b2c3d4e63", name: "MTTL 3D4E63", from: "1.0.111", to: "1.0.111" },
    { mac: "0a1b2c3d4e64", name: "Garage", from: "1.0.112", to: "1.0.111" },
  ]);
  assert.deepEqual(updateAllTargets([]), []);
  assert.deepEqual(updateAllTargets(null), []);
});

test("profileHintKey", () => {
  assert.equal(profileHintKey({ id: "official-111", kind: "official" }), "hint_111");
  assert.equal(profileHintKey({ id: "official-110", kind: "official" }), "hint_110");
  assert.equal(profileHintKey({ id: "official-66", kind: "official" }), "hint_66");
  assert.equal(profileHintKey({ kind: "custom" }), "hint_custom");
  assert.equal(profileHintKey({ id: "custom-ab12cd34", kind: "custom" }), "hint_custom");
  // A profile the screen has no text for gets none.
  assert.equal(profileHintKey({ id: "official-200", kind: "official" }), null);
  assert.equal(profileHintKey(null), null);
  assert.equal(profileHintKey({}), null);
});

test("checkFwrFile", () => {
  assert.equal(checkFwrFile({ name: "a.FWR", size: 327944 }), null);
  assert.equal(checkFwrFile({ name: "a.bin", size: 327944 }), "fwr_ext");
  assert.equal(checkFwrFile({ name: "a.fwr", size: 1000 }), "fwr_size");
  assert.equal(checkFwrFile({ name: "a.fwr.txt", size: 327944 }), "fwr_ext");
  assert.equal(checkFwrFile({ name: "fwr", size: 327944 }), "fwr_ext");
  assert.equal(checkFwrFile({ name: "거실.Fwr", size: FWR_SIZE }), null);
  // The extension is checked first: a wrong type is the first thing to fix.
  assert.equal(checkFwrFile({ name: "a.bin", size: 1 }), "fwr_ext");
  assert.equal(checkFwrFile({ name: undefined, size: FWR_SIZE }), "fwr_ext");
  assert.equal(checkFwrFile({ name: "a.fwr", size: FWR_SIZE + 1 }), "fwr_size");
});
