import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const staticFile = (name) => readFileSync(new URL(`../../mttl_w01/backend/static/${name}`, import.meta.url), "utf-8");

const core = await import(new URL("../../mttl_w01/backend/static/dashboard-core.mjs", import.meta.url));
const { DIAG_INTERVALS, demoResponse, demoSetDiagnostics, demoRereadLock, demoRestore, demoPurge } = core;

const LIVING = "0a1b2c3d4e5f"; // online, 1.0.111, Child Lock mask 4 in sync, voltage and RSSI on
const OFFICE = "0a1b2c3d4e60"; // online, 1.0.66, no Child Lock
const GARAGE = "0a1b2c3d4e62"; // offline, 1.0.66, an update is running
const HIDDEN = "0a1b2c3d4e63";

const device = (data, mac) => data.devices.find((d) => d.mac === mac);

test("demoSetDiagnostics stores the three settings, like PUT api/devices/<mac>/diagnostics", () => {
  const data = demoResponse();
  demoSetDiagnostics(data, OFFICE, { voltage_enabled: true, rssi_enabled: false, poll_interval: 300 }, 1000);
  const diag = device(data, OFFICE).diagnostics;
  assert.deepEqual([diag.voltage_enabled, diag.rssi_enabled, diag.poll_interval], [true, false, 300]);
  // A measurement that is turned on has a value to show; one that stays off has none.
  assert.equal(typeof diag.voltage_mv, "number");
  assert.equal(diag.voltage_updated_at, 1000);
  assert.ok(!("rssi_dbm" in diag));
  // The same call gives the same sample, so a rerun looks the same.
  const again = demoResponse();
  demoSetDiagnostics(again, OFFICE, { voltage_enabled: true, rssi_enabled: false, poll_interval: 300 }, 1000);
  assert.deepEqual(device(again, OFFICE).diagnostics, diag);
  // Turning one off takes its value away, as the backend does; the other keeps its value.
  demoSetDiagnostics(data, LIVING, { voltage_enabled: false, rssi_enabled: true, poll_interval: 60 }, 2000);
  const living = device(data, LIVING).diagnostics;
  assert.ok(!("voltage_mv" in living) && !("voltage_updated_at" in living));
  assert.equal(living.rssi_dbm, -54);
  // A key that is left out keeps its value.
  demoSetDiagnostics(data, OFFICE, { poll_interval: 30 }, 3000);
  assert.deepEqual([device(data, OFFICE).diagnostics.voltage_enabled, device(data, OFFICE).diagnostics.poll_interval], [true, 30]);
});

test("demoSetDiagnostics refuses what the backend refuses and leaves the data alone", () => {
  const data = demoResponse();
  const before = structuredClone(data);
  assert.throws(() => demoSetDiagnostics(data, OFFICE, { voltage_enabled: true, rssi_enabled: true, poll_interval: 45 }, 1), /poll_interval must be one of 30,60,120,300,600,1800/);
  assert.throws(() => demoSetDiagnostics(data, OFFICE, { voltage_enabled: "yes", rssi_enabled: true, poll_interval: 60 }, 1), /must be boolean/);
  assert.throws(() => demoSetDiagnostics(data, "0a1b2c3d4e99", { voltage_enabled: true, rssi_enabled: true, poll_interval: 60 }, 1), /device not found/);
  assert.throws(() => demoSetDiagnostics(data, HIDDEN, { voltage_enabled: true, rssi_enabled: true, poll_interval: 60 }, 1), /device not found/);
  assert.deepEqual(data, before);
  for (const n of DIAG_INTERVALS) demoSetDiagnostics(data, OFFICE, { voltage_enabled: false, rssi_enabled: false, poll_interval: n }, 1);
});

test("demoRereadLock puts a strip's Child Lock back in sync", () => {
  const data = demoResponse();
  const living = device(data, LIVING);
  living.childlock_synced = false;
  assert.deepEqual(demoRereadLock(data, LIVING), { ok: true, state: "confirmed", mask: 4 });
  assert.equal(living.childlock_synced, true);
  assert.equal(living.childlock_mask, 4);
});

test("demoRereadLock refuses what the backend refuses", () => {
  const data = demoResponse();
  device(data, LIVING).online = false; // a 1.0.111 strip that is offline
  const before = structuredClone(data);
  assert.throws(() => demoRereadLock(data, LIVING), /device offline/);
  assert.throws(() => demoRereadLock(data, OFFICE), /requires firmware 1\.0\.111/);
  assert.throws(() => demoRereadLock(data, GARAGE), /requires firmware 1\.0\.111/);
  assert.throws(() => demoRereadLock(data, "0a1b2c3d4e99"), /device not found/);
  assert.throws(() => demoRereadLock(data, HIDDEN), /device not found/);
  assert.deepEqual(data, before);
});

test("demoRestore moves a hidden strip back to the dashboard", () => {
  const data = demoResponse();
  assert.deepEqual(data.removed.map((d) => d.mac), [HIDDEN]);
  const answer = demoRestore(data, HIDDEN);
  assert.equal(answer.ok, true);
  assert.deepEqual(data.removed, []);
  const back = data.devices.at(-1);
  assert.equal(back.mac, HIDDEN);
  assert.equal(back.alias, "Guest Room");
  assert.equal(back.removed, false);
  assert.equal(back.removed_at, null);
  assert.equal(data.devices.length, 5);
  assert.throws(() => demoRestore(data, HIDDEN), /device not found/);
  assert.throws(() => demoRestore(data, LIVING), /device not found/, "a strip on the dashboard is not hidden");
});

test("demoPurge deletes a hidden strip for good, and only a hidden one", () => {
  const data = demoResponse();
  assert.throws(() => demoPurge(data, LIVING), /숨긴 장치/);
  assert.equal(data.devices.length, 4);
  assert.deepEqual(demoPurge(data, HIDDEN), { ok: true, deleted: true, mac: HIDDEN });
  assert.deepEqual(data.removed, []);
  assert.equal(data.devices.length, 4);
  assert.throws(() => demoPurge(data, HIDDEN), /device not found/);
  assert.throws(() => demoPurge(data, "0a1b2c3d4e99"), /device not found/);
});

test("the dashboard keeps no copy of the demo device simulation", () => {
  const src = staticFile("dashboard.mjs");
  for (const name of ["demoSetDiagnostics", "demoRereadLock", "demoRestore", "demoPurge", "demoQueueJob", "demoAdvanceJob", "demoShiftFirmwareTimes"]) {
    assert.match(src, new RegExp(`\\b${name}\\(`), `${name} is used`);
    assert.ok(!new RegExp(`(?:function|const) ${name}\\b`).test(src), `${name} is not redefined`);
  }
  for (const name of ["compareVersions", "versionParts", "randomHex"]) {
    assert.ok(!new RegExp(`(?:function|const) ${name}\\b`).test(src), name);
  }
});
