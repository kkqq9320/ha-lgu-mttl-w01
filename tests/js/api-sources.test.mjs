import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The live data sources of the settings page and of the device window send these requests to Tuo's backend.
// fetch is replaced by a recorder, so the headers apiSend and apiSendRaw add are checked on the way out.
const core = await import(new URL("../../mttl_w01/backend/static/dashboard-core.mjs", import.meta.url));
const settings = await import(new URL("../../mttl_w01/backend/static/settings-core.mjs", import.meta.url));
const { createSettingsApi } = settings;
const { createDeviceAdminApi } = core;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replaces fetch; `reply(url, init)` gives `{status, body}` (body undefined: not JSON). Returns the recorded calls. */
function stubFetch(reply = () => ({ status: 200, body: { ok: true } })) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body });
    const { status, body } = reply(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (body === undefined) throw new SyntaxError("not json");
        return body;
      },
    };
  };
  return calls;
}

const sentJson = (call) => JSON.parse(call.body);

test("reading goes to the three GET endpoints; config and ha give null unless the backend answers 200", async () => {
  const calls = stubFetch((url) => ({ status: 200, body: { url } }));
  const api = createSettingsApi();
  assert.equal(api.demo, false);
  assert.deepEqual(await api.load(), { status: 200, body: { url: "api/devices" } });
  assert.deepEqual(await api.config(), { url: "api/config" });
  assert.deepEqual(await api.ha(), { url: "api/ha" });
  assert.deepEqual(calls.map((c) => [c.method, c.url]), [["GET", "api/devices"], ["GET", "api/config"], ["GET", "api/ha"]]);

  stubFetch(() => ({ status: 500, body: { error: "boom" } }));
  assert.equal(await api.config(), null);
  assert.equal(await api.ha(), null);
  assert.equal((await api.load()).status, 500);

  stubFetch(() => ({ status: 200, body: undefined }));
  assert.equal(await api.config(), null, "an answer that is not JSON is no config");

  globalThis.fetch = async () => {
    throw new TypeError("network down");
  };
  assert.equal(await api.config(), null);
  assert.equal(await api.ha(), null);
  assert.deepEqual(await api.load(), { error: "network down" });
});

test("savePoll sends the interval and saveTarget leaves a blank OTA address out", async () => {
  const calls = stubFetch();
  const api = createSettingsApi();
  await api.savePoll(30);
  await api.saveTarget("official-111", "192.0.2.10");
  await api.saveTarget("official-110", "");
  await api.saveTarget("official-66", "   ");
  await api.saveTarget("custom-0123456789abcdef", " 192.0.2.11 ");
  assert.deepEqual(calls.map((c) => [c.method, c.url]), [
    ["PUT", "api/config"], ["PUT", "api/firmware/target"], ["PUT", "api/firmware/target"], ["PUT", "api/firmware/target"], ["PUT", "api/firmware/target"],
  ]);
  assert.deepEqual(sentJson(calls[0]), { poll_interval: 30 });
  assert.deepEqual(sentJson(calls[1]), { profile_id: "official-111", ota_host_ip: "192.0.2.10" });
  // A blank address means "keep the stored one": the key is not sent at all.
  assert.deepEqual(sentJson(calls[2]), { profile_id: "official-110" });
  assert.equal("ota_host_ip" in sentJson(calls[3]), false);
  assert.deepEqual(sentJson(calls[4]), { profile_id: "custom-0123456789abcdef", ota_host_ip: "192.0.2.11" });
});

test("the firmware calls: prepare, update all, delete a file", async () => {
  const calls = stubFetch((url) => (url === "api/firmware/ota-all" ? { status: 202, body: { ok: true, jobs: [{ mac: "0a1b2c3d4e5f" }] } } : { status: 200, body: { ok: true } }));
  const api = createSettingsApi();
  await api.prepare("official-110");
  const all = await api.otaAll("official-111");
  await api.deleteFwr("custom-0123456789abcdef");
  assert.deepEqual(calls.map((c) => [c.method, c.url]), [
    ["POST", "api/firmware/prepare/official-110"],
    ["POST", "api/firmware/ota-all"],
    ["POST", "api/firmware/custom/custom-0123456789abcdef/delete"],
  ]);
  assert.deepEqual(sentJson(calls[1]), { profile_id: "official-111" });
  assert.deepEqual(all, { ok: true, jobs: [{ mac: "0a1b2c3d4e5f" }] }, "the page counts the queued jobs from the answer");
});

test("a profile id is escaped inside the address", async () => {
  const calls = stubFetch();
  const api = createSettingsApi();
  await api.prepare("../x?y");
  await api.deleteFwr("a/b");
  assert.equal(calls[0].url, "api/firmware/prepare/..%2Fx%3Fy");
  assert.equal(calls[1].url, "api/firmware/custom/a%2Fb/delete");
});

test("uploadFwr sends the file bytes as they are, with the name in X-Filename", async () => {
  const calls = stubFetch();
  const api = createSettingsApi();
  const bytes = new Uint8Array([1, 2, 3]);
  await api.uploadFwr(bytes, "MTTL_1.0.113.fwr");
  await api.uploadFwr(bytes, "펌웨어.fwr");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "api/firmware/custom");
  assert.equal(calls[0].body, bytes);
  assert.equal(calls[0].headers["Content-Type"], "application/octet-stream");
  assert.equal(calls[0].headers["X-Filename"], "MTTL_1.0.113.fwr");
  // fetch refuses a header value outside ISO-8859-1.
  assert.equal(calls[1].headers["X-Filename"], "___.fwr");
});

test("the MQTT calls send the body they are given", async () => {
  const calls = stubFetch();
  const api = createSettingsApi();
  const body = { enabled: true, host: "core-mosquitto", port: 1883 };
  await api.saveMqtt(body);
  await api.testMqtt({ host: "192.0.2.10", port: 1883 });
  await api.syncMqtt();
  assert.deepEqual(calls.map((c) => [c.method, c.url]), [["PUT", "api/ha"], ["POST", "api/ha/test"], ["POST", "api/ha/sync"]]);
  assert.deepEqual(sentJson(calls[0]), body);
  assert.deepEqual(sentJson(calls[1]), { host: "192.0.2.10", port: 1883 });
  assert.deepEqual(sentJson(calls[2]), {});
});

test("every POST and PUT carries X-MTTL-Request: 1, which the backend demands", async () => {
  const calls = stubFetch();
  const api = createSettingsApi();
  await api.savePoll(15);
  await api.saveTarget("official-111", "");
  await api.prepare("official-111");
  await api.otaAll("official-111");
  await api.uploadFwr(new Uint8Array(1), "a.fwr");
  await api.deleteFwr("custom-0123456789abcdef");
  await api.saveMqtt({});
  await api.testMqtt({});
  await api.syncMqtt();
  const device = createDeviceAdminApi();
  await device.ota("0a1b2c3d4e5f", "official-111");
  await device.diagnostics("0a1b2c3d4e5f", {});
  await device.rereadLock("0a1b2c3d4e5f");
  await device.restore("0a1b2c3d4e5f");
  await device.purge("0a1b2c3d4e5f");
  assert.equal(calls.length, 14);
  for (const call of calls) {
    assert.equal(call.headers["X-MTTL-Request"], "1", `${call.method} ${call.url}`);
    assert.ok(["POST", "PUT"].includes(call.method), call.url);
  }
  // They are JSON, except the file upload.
  assert.deepEqual(calls.filter((c) => c.headers["Content-Type"] !== "application/json").map((c) => c.url), ["api/firmware/custom"]);
});

test("a refused or failed write rejects with the backend's text, status and state", async () => {
  stubFetch(() => ({ status: 403, body: { error: "changes are only accepted through the Home Assistant sidebar" } }));
  const api = createSettingsApi();
  await assert.rejects(api.savePoll(15), (err) => err.message === "changes are only accepted through the Home Assistant sidebar" && err.status === 403);
  stubFetch(() => ({ status: 503, body: { ok: false, error: "[Errno 111] Connection refused" } }));
  await assert.rejects(api.testMqtt({ host: "x" }), { message: "[Errno 111] Connection refused" });
  stubFetch(() => ({ status: 503, body: { error: "HA MQTT disconnected" } }));
  await assert.rejects(api.syncMqtt(), { message: "HA MQTT disconnected" });
  stubFetch(() => ({ status: 400, body: { error: "OTA server IP must be a valid IPv4 address" } }));
  await assert.rejects(api.saveTarget("official-111", "999.1.1.1"), { message: "OTA server IP must be a valid IPv4 address" });
});

test("the device window calls", async () => {
  const calls = stubFetch((url) => (url.endsWith("/ota") ? { status: 202, body: { ok: true, job: { id: 7 } } } : { status: 200, body: { ok: true } }));
  const api = createDeviceAdminApi();
  const mac = "0a1b2c3d4e5f";
  const queued = await api.ota(mac, "official-111");
  await api.diagnostics(mac, { voltage_enabled: true, rssi_enabled: false, poll_interval: 60 });
  await api.rereadLock(mac);
  await api.restore(mac);
  await api.purge(mac);
  assert.deepEqual(calls.map((c) => [c.method, c.url]), [
    ["POST", `api/devices/${mac}/ota`],
    ["PUT", `api/devices/${mac}/diagnostics`],
    ["POST", `api/devices/${mac}/childlock/refresh`],
    ["POST", `api/devices/${mac}/restore`],
    ["POST", `api/devices/${mac}/delete`],
  ]);
  assert.deepEqual(sentJson(calls[0]), { profile_id: "official-111" });
  assert.deepEqual(sentJson(calls[1]), { voltage_enabled: true, rssi_enabled: false, poll_interval: 60 });
  assert.deepEqual(queued, { ok: true, job: { id: 7 } });
});

test("a Child Lock reread that fails keeps the backend's state on the error", async () => {
  stubFetch(() => ({ status: 409, body: { ok: false, state: "busy", error: "Child Lock operation in progress" } }));
  const api = createDeviceAdminApi();
  await assert.rejects(api.rereadLock("0a1b2c3d4e5f"), (err) => err.state === "busy" && err.status === 409);
  stubFetch(() => ({ status: 504, body: { ok: false, state: "device_timeout" } }));
  await assert.rejects(api.rereadLock("0a1b2c3d4e5f"), (err) => err.state === "device_timeout" && err.status === 504);
});

test("both pages build their live source from these functions", () => {
  const file = (name) => readFileSync(new URL(`../../mttl_w01/backend/static/${name}`, import.meta.url), "utf-8");
  assert.match(file("dashboard.mjs"), /\.\.\.createDeviceAdminApi\(\)/);
  assert.match(file("settings.mjs"), /createSettingsApi\(\)/);
});
