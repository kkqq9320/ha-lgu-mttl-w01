import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const staticFile = (name) => readFileSync(new URL(`../../mttl_w01/backend/static/${name}`, import.meta.url), "utf-8");

const core = await import(new URL("../../mttl_w01/backend/static/dashboard-core.mjs", import.meta.url));
const { JOB_STATES, isJobActive } = await import(new URL("../../mttl_w01/backend/static/firmware-core.mjs", import.meta.url));
const {
  DEMO_JOB_STEPS, compareVersions, demoHex, demoResponse, demoProfileOf, demoSetTarget, demoRunningJob, demoQueueJob,
  demoAdvanceJob, demoShiftFirmwareTimes,
} = core;

const LIVING = "0a1b2c3d4e5f";
const OFFICE = "0a1b2c3d4e60";
const GARAGE = "0a1b2c3d4e62"; // offline, with a job that is still running
const HIDDEN = "0a1b2c3d4e63";

const actions = (data) => Object.fromEntries([...data.devices, ...data.removed].map((d) => [d.mac, d.firmware_action]));

test("compareVersions orders dotted versions by number", () => {
  assert.equal(compareVersions("1.0.66", "1.0.111"), -1);
  assert.equal(compareVersions("1.0.111", "1.0.66"), 1);
  assert.equal(compareVersions("1.0.111", "1.0.111"), 0);
  assert.equal(compareVersions("1.0.112", "1.0.111"), 1);
  assert.equal(compareVersions("1.1", "1.0.111"), 1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  assert.equal(compareVersions(null, "1.0.1"), -1);
  assert.equal(compareVersions(undefined, null), 0);
  assert.equal(compareVersions("x", "1"), -1);
});

test("a demo job moves through the states the backend uses, in its order", () => {
  assert.deepEqual([...DEMO_JOB_STEPS], JOB_STATES.slice(0, JOB_STATES.indexOf("SUCCESS") + 1));
  assert.equal(DEMO_JOB_STEPS[0], "QUEUED");
  assert.equal(DEMO_JOB_STEPS.at(-1), "SUCCESS");
});

test("demoHex is stable, as long as asked and different for every seed", () => {
  assert.equal(demoHex("a", 64), demoHex("a", 64));
  assert.match(demoHex("0a1b2c3d4e60-1000", 32), /^[0-9a-f]{32}$/);
  assert.equal(demoHex("seed", 5).length, 5);
  // Seeds that share their first characters still differ.
  assert.notEqual(demoHex("0a1b2c3d4e60-1000", 32), demoHex("0a1b2c3d4e62-1000", 32));
  assert.notEqual(demoHex("official-110", 64), demoHex("official-66", 64));
});

test("demoProfileOf finds a profile or fails like the backend", () => {
  const data = demoResponse();
  assert.equal(demoProfileOf(data, "official-110").version, "1.0.110");
  assert.throws(() => demoProfileOf(data, "official-1"), /firmware profile not found/);
});

test("demoSetTarget makes a profile the target and refreshes every device", () => {
  const data = demoResponse();
  const initial = actions(data);
  assert.deepEqual(initial, { [LIVING]: null, [OFFICE]: "update", "0a1b2c3d4e61": null, [GARAGE]: null, [HIDDEN]: null });

  demoSetTarget(data, "official-110");
  assert.equal(data.firmware.target_profile, "official-110");
  assert.deepEqual(data.firmware.profiles.filter((p) => p.selected).map((p) => p.id), ["official-110"]);
  // 1.0.111 is newer than the target: a downgrade; the 1.0.66 strip still updates; hidden devices follow too.
  assert.deepEqual(actions(data), { [LIVING]: "downgrade", [OFFICE]: "update", "0a1b2c3d4e61": "downgrade", [GARAGE]: "downgrade", [HIDDEN]: "downgrade" });
  const office = data.devices.find((d) => d.mac === OFFICE);
  assert.deepEqual(office.firmware_target, { profile_id: "official-110", version: "1.0.110", label: "UP · 1.0.110", kind: "official", ready: false });
  assert.equal(office.firmware_build_current, false);

  const custom = data.firmware.profiles.find((p) => p.kind === "custom");
  demoSetTarget(data, custom.id);
  assert.equal(data.devices.find((d) => d.mac === LIVING).firmware_action, "update");
  assert.deepEqual(data.devices[0].firmware_target, { profile_id: custom.id, version: "1.0.112", label: custom.label, kind: "custom", ready: true });

  // Back to 1.0.111: the devices look as they did at the start.
  demoSetTarget(data, "official-111");
  assert.deepEqual(actions(data), initial);
  assert.equal(data.devices.find((d) => d.mac === LIVING).firmware_build_current, true);
  assert.equal(office.firmware_target.profile_id, "official-111");
});

test("demoSetTarget leaves the data alone for an unknown profile", () => {
  const data = demoResponse();
  assert.throws(() => demoSetTarget(data, "official-1"), /firmware profile not found/);
  assert.deepEqual(data, demoResponse());
});

test("demoSetTarget picks up a profile that became ready", () => {
  const data = demoResponse();
  demoSetTarget(data, "official-110");
  const p = demoProfileOf(data, "official-110");
  p.ready = true;
  demoSetTarget(data, data.firmware.target_profile);
  assert.equal(data.devices[0].firmware_target.ready, true);
});

test("demoRunningJob finds a running job of a device", () => {
  const data = demoResponse();
  assert.equal(demoRunningJob(data, GARAGE).state, "RECONNECTING");
  assert.equal(demoRunningJob(data, OFFICE), null, "a failed job is not running");
  assert.equal(demoRunningJob(data, LIVING), null, "a finished job is not running");
  assert.equal(demoRunningJob(data, "0a1b2c3d4e99"), null);
  // Every state a demo job passes through, except the last, counts as running.
  for (const state of DEMO_JOB_STEPS) {
    data.firmware.jobs[0].state = state;
    assert.equal(demoRunningJob(data, GARAGE) !== null, state !== "SUCCESS", state);
    assert.equal(isJobActive({ state }), state !== "SUCCESS", `firmware-core agrees on ${state}`);
  }
});

test("demoQueueJob queues one job per device, like the backend", () => {
  const data = demoResponse();
  const before = data.firmware.jobs.length;
  const job = demoQueueJob(data, OFFICE, "official-111", 1000);
  const sha = demoProfileOf(data, "official-111").sha256;
  assert.deepEqual(
    { mac: job.mac, from: job.from_version, profile: job.profile_id, to: job.target_version, sha: job.firmware_sha256, state: job.state, detail: job.detail, queued: job.queued_at, updated: job.updated_at, started: job.started_at, completed: job.completed_at, live: job.demo_live },
    { mac: OFFICE, from: "1.0.66", profile: "official-111", to: "1.0.111", sha, state: "QUEUED", detail: null, queued: 1000, updated: 1000, started: null, completed: null, live: true },
  );
  assert.match(job.id, /^[0-9a-f]{32}$/);
  assert.equal(data.firmware.jobs.length, before + 1);
  assert.equal(data.firmware.jobs[0], job, "the newest job is first");
  // A second request while it runs gives the same job and adds nothing.
  assert.equal(demoQueueJob(data, OFFICE, "official-111", 1005), job);
  assert.equal(data.firmware.jobs.length, before + 1);
  // The id depends only on the device and the time, so a rerun gives the same demo.
  assert.equal(demoQueueJob(demoResponse(), OFFICE, "official-111", 1000).id, job.id);
  assert.notEqual(demoQueueJob(demoResponse(), OFFICE, "official-111", 1001).id, job.id);
  // The strip's own record is not touched by queueing.
  assert.equal(data.devices.find((d) => d.mac === OFFICE).firmware_version, "1.0.66");
});

test("demoQueueJob refuses what the backend refuses", () => {
  const data = demoResponse();
  const before = structuredClone(data);
  assert.throws(() => demoQueueJob(data, GARAGE, "official-111", 1000), /device offline/);
  assert.throws(() => demoQueueJob(data, "0a1b2c3d4e99", "official-111", 1000), /device not found/);
  assert.throws(() => demoQueueJob(data, HIDDEN, "official-111", 1000), /device not found/, "a hidden device is not queued");
  assert.throws(() => demoQueueJob(data, OFFICE, "official-1", 1000), /firmware profile not found/);
  assert.deepEqual(data, before);
});

test("demoAdvanceJob moves a demo job one state per call and updates the device at the end", () => {
  const data = demoResponse();
  assert.equal(demoAdvanceJob(data, 999), null, "nothing is running in this page yet");
  assert.deepEqual(data, demoResponse(), "the sample jobs stay as they are");

  const job = demoQueueJob(data, OFFICE, "official-111", 1000);
  const seen = [];
  for (let now = 1001; now <= 1008; now++) {
    assert.equal(demoAdvanceJob(data, now), job);
    seen.push(job.state);
    assert.equal(job.updated_at, now);
  }
  assert.deepEqual(seen, DEMO_JOB_STEPS.slice(1));
  assert.equal(job.started_at, 1001);
  assert.equal(job.completed_at, 1008);
  assert.match(job.detail, /1\.0\.111/);
  const office = data.devices.find((d) => d.mac === OFFICE);
  assert.equal(office.firmware_version, "1.0.111");
  assert.equal(office.firmware_action, null);
  assert.equal(office.firmware_build_current, true);
  assert.equal(demoAdvanceJob(data, 1009), null, "a finished job stays finished");
  // The sample job of the offline strip never moves.
  assert.equal(demoRunningJob(data, GARAGE).state, "RECONNECTING");
});

test("demoAdvanceJob works through jobs one at a time, oldest first", () => {
  const data = demoResponse();
  const first = demoQueueJob(data, OFFICE, "official-111", 1000);
  const second = demoQueueJob(data, LIVING, "official-111", 1001);
  demoAdvanceJob(data, 1002);
  assert.deepEqual([first.state, second.state], ["PREPARING", "QUEUED"]);
  for (let i = 0; i < 7; i++) demoAdvanceJob(data, 1003 + i);
  assert.deepEqual([first.state, second.state], ["SUCCESS", "QUEUED"]);
  demoAdvanceJob(data, 1020);
  assert.deepEqual([first.state, second.state], ["SUCCESS", "PREPARING"]);
});

test("demoShiftFirmwareTimes moves the sample jobs and files to now", () => {
  const data = demoResponse();
  const original = demoResponse();
  demoShiftFirmwareTimes(data, 100);
  data.firmware.jobs.forEach((job, i) => {
    const was = original.firmware.jobs[i];
    for (const key of ["queued_at", "started_at", "updated_at", "completed_at"]) {
      assert.equal(job[key], was[key] === null ? null : was[key] + 100, `${job.id}.${key}`);
    }
  });
  data.firmware.profiles.forEach((p, i) => {
    assert.equal(p.created_at, original.firmware.profiles[i].created_at + 100);
    assert.equal(p.updated_at, original.firmware.profiles[i].updated_at + 100);
  });
  assert.ok(data.firmware.jobs.some((j) => j.completed_at === null), "a running job keeps its empty finish time");
  // Devices keep their times: the dashboard moves those itself.
  assert.equal(data.devices[0].last_seen, original.devices[0].last_seen);
});

test("the settings page keeps no copy of the demo firmware simulation", () => {
  const src = staticFile("settings.mjs");
  for (const name of ["compareVersions", "retarget", "advance", "queue", "versionParts", "randomHex"]) {
    assert.ok(!new RegExp(`(?:function|const) ${name}\\b`).test(src), name);
  }
  for (const name of ["demoSetTarget", "demoQueueJob", "demoAdvanceJob", "demoProfileOf", "demoShiftFirmwareTimes"]) {
    assert.match(src, new RegExp(`\\b${name}\\b`), name);
  }
});
