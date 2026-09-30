import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const core = await import(new URL("../../mttl_w01/backend/static/dashboard-core.mjs", import.meta.url));
const {
  STRINGS, t, pickLang, resolveTheme, normalizeMac,
  fmtWatts, fmtKwh, fmtTemp, fmtVolt, fmtRssi, fmtAge,
  cardModel, demoResponse, demoHa, summaryModel, fmtMac, apkUrl, apkUrlForHost, ENGLISH_ONLY,
  isIngressPath, isViewOnly,
  pressConfirm, scriptLang,
  reducePoll, diffMacs, canToggleLock, toggleMask, withDevice, applyPending, nameEditOutcome,
  apiGet, apiSend,
} = core;

const staticFile = (name) => readFileSync(new URL(`../../mttl_w01/backend/static/${name}`, import.meta.url), "utf-8");

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/api_devices_guest.json", import.meta.url), "utf-8"),
);
const NA = "N/A"; // shown for missing or unmeasured values

test("string tables have the same keys", () => {
  assert.deepEqual(Object.keys(STRINGS.ko).sort(), Object.keys(STRINGS.en).sort());
  for (const lang of ["en", "ko"]) {
    for (const [key, value] of Object.entries(STRINGS[lang])) {
      assert.equal(typeof value, "string", `${lang}.${key}`);
      assert.notEqual(value, "", `${lang}.${key}`);
    }
  }
  assert.equal(t("en", "outlet", { n: 2 }), "Outlet 2");
  assert.equal(t("ko", "outlet", { n: 2 }), "콘센트 2");
  assert.equal(t("ko", "no_such_key"), "no_such_key");
});

test("KR keeps awkward technical terms in English", () => {
  for (const [key, vars, want] of [
    ["online", {}, "Online"],
    ["offline", {}, "Offline"],
    ["server_online", {}, "Server online"],
    ["mqtt_broker", {}, "Broker"],
    ["mqtt_topic", {}, "Topic prefix"],
    ["mqtt_discovery", {}, "Discovery prefix"],
    ["fw_ota_host", {}, "OTA server"],
    ["fw_badge_pending", { n: 1 }, "Update 1"],
  ]) {
    assert.equal(t("ko", key, vars), want, key);
  }
  // Plain Korean words stay Korean.
  assert.equal(t("ko", "total_power"), "전체 전력");
  assert.equal(t("ko", "all_on"), "전체 켜기");
});

test("top bar text is English in both languages (keys read from the pages)", () => {
  const keys = new Set();
  for (const page of ["dashboard.html", "logview.html"]) {
    const header = staticFile(page).match(/<header class="topbar"[\s\S]*?<\/header>/)[0];
    for (const m of header.matchAll(/data-i18n(?:-title)?="([^"]+)"/g)) keys.add(m[1]);
  }
  for (const mod of ["dashboard.mjs", "logview.mjs"]) {
    const body = staticFile(mod).match(/\nfunction renderTopbar\(\) \{[\s\S]*?\n\}\n/)[0];
    for (const m of body.matchAll(/"([a-z_]+)"/g)) if (m[1] in STRINGS.en) keys.add(m[1]);
  }
  // The VIEW ONLY tooltip tells where changes are made, so it is translated like the card hints.
  const translated = new Set(["view_only_hint"]);
  for (const must of [
    "settings", "logs", "log_back", "server_online", "online_count", "unlock_hint", "relock_hint", "view_only", "view_only_hint",
  ]) {
    assert.ok(keys.has(must), `scan found ${must}`);
  }
  for (const key of keys) {
    if (translated.has(key)) continue;
    assert.ok(ENGLISH_ONLY.includes(key), key);
    assert.equal(STRINGS.ko[key], STRINGS.en[key], key);
  }
});

test("firmware banner reads the same in EN and KR", () => {
  for (const key of ["fw_update", "fw_downgrade", "fw_reflash"]) {
    assert.ok(ENGLISH_ONLY.includes(key), key);
    assert.equal(STRINGS.ko[key], STRINGS.en[key], key);
  }
  assert.equal(t("ko", "fw_update", { v: "1.0.111" }), "Firmware update → 1.0.111");
  // Card text outside the top bar, the banner and the card labels below stays Korean.
  assert.equal(t("ko", "open_settings"), "설정 열기");
});

test("card labels RSSI, CHILD LOCK and HIDE DEVICE read the same in EN and KR", () => {
  for (const [key, want] of [
    ["rssi", "RSSI"], ["lock", "Child lock"], ["hide_device", "Hide device"], ["hide_confirm", "Confirm hide"],
  ]) {
    assert.ok(ENGLISH_ONLY.includes(key), key);
    assert.equal(STRINGS.en[key], want, key);
    assert.equal(STRINGS.ko[key], want, key);
  }
  // The restore hint stays translated.
  assert.notEqual(STRINGS.ko.hide_hint, STRINGS.en.hide_hint);
});

test("scriptLang marks text by script so English renders the same in both languages", () => {
  for (const text of ["BROKER", "Server online", "N/A", "Firmware update → 1.0.111", "0.0 W", "", "TV"]) {
    assert.equal(scriptLang(text), "en", text);
  }
  for (const text of ["전력", "콘센트 3", "Offline · 마지막으로 받은 값", "ㄱ"]) {
    assert.equal(scriptLang(text), "ko", text);
  }
});

test("pressConfirm needs a second press within the window", () => {
  const first = pressConfirm(null, 1000);
  assert.deepEqual(first, { armedAt: 1000, confirmed: false });
  assert.deepEqual(pressConfirm(first.armedAt, 4500), { armedAt: null, confirmed: true });
  // Too late: the second press arms again instead of confirming.
  assert.deepEqual(pressConfirm(first.armedAt, 5001), { armedAt: 5001, confirmed: false });
  assert.deepEqual(pressConfirm(1000, 1500, 400), { armedAt: 1500, confirmed: false });
});

test("pickLang prefers saved, then browser", () => {
  assert.equal(pickLang(null, "ko-KR"), "ko");
  assert.equal(pickLang(null, "en-US"), "en");
  assert.equal(pickLang("en", "ko-KR"), "en");
  assert.equal(pickLang("ko", "en-US"), "ko");
  assert.equal(pickLang("fr", "ko"), "ko");
  assert.equal(pickLang(null, undefined), "en");
});

test("resolveTheme defaults to dark", () => {
  assert.equal(resolveTheme("auto", undefined, false), "dark");
  assert.equal(resolveTheme("auto", undefined, true), "light");
  assert.equal(resolveTheme("auto", true, true), "dark");
  assert.equal(resolveTheme("auto", false, false), "light");
  assert.equal(resolveTheme("light", true, false), "light");
  assert.equal(resolveTheme("dark", false, true), "dark");
  assert.equal(resolveTheme("bogus", undefined, false), "dark");
});

test("normalizeMac", () => {
  assert.equal(normalizeMac("0A:1B:2C:3D:4E:5F"), "0a1b2c3d4e5f");
  assert.equal(normalizeMac("0a-1b-2c-3d-4e-5f"), "0a1b2c3d4e5f");
  assert.equal(normalizeMac("0a1b2c3d4e5f"), "0a1b2c3d4e5f");
  assert.equal(normalizeMac("xyz"), null);
  assert.equal(normalizeMac("0a1b2c3d4e5f0"), null);
  assert.equal(normalizeMac(null), null);
});

test("formatters show N/A for missing values", () => {
  for (const fmt of [fmtWatts, fmtKwh, fmtTemp, fmtVolt, fmtRssi]) {
    for (const missing of [null, undefined, NaN, "", "abc"]) {
      assert.equal(fmt(missing), NA, `${fmt.name}(${String(missing)})`);
    }
  }
  assert.equal(fmtWatts(12345), "12.3 W");
  assert.equal(fmtWatts(0), "0.0 W");
  assert.equal(fmtKwh(1234), "1.23 kWh");
  assert.equal(fmtKwh(0), "0.00 kWh");
  assert.equal(fmtTemp(26), "26 °C");
  assert.equal(fmtTemp(0), "0 °C");
  assert.equal(fmtVolt(221400), "221.4 V");
  assert.equal(fmtRssi(-54), "-54 dBm");
});

test("fmtAge shows whole seconds since last_seen", () => {
  assert.equal(fmtAge(1000, 1012.4), "12 s ago");
  assert.equal(fmtAge(1000, 1000), "0 s ago");
  assert.equal(fmtAge(1000, 998), "0 s ago"); // clock skew never shows a negative age
  assert.equal(fmtAge(1000.9, 1011.2), "10 s ago");
  for (const missing of [null, undefined, NaN, "", "abc"]) assert.equal(fmtAge(missing, 1000), NA, String(missing));
});

test("cardModel fills four outlets", () => {
  const empty = cardModel({ mac: "0a1b2c3d4e5f", online: true, channels: [] }, { authenticated: true, lang: "en" });
  assert.equal(empty.outlets.length, 4);
  for (const [i, o] of empty.outlets.entries()) {
    assert.equal(o.n, i + 1);
    assert.equal(o.on, null);
    assert.equal(o.name, `Outlet ${i + 1}`);
    assert.equal(o.w, NA);
    assert.equal(o.kwh, NA);
    assert.equal(o.temp, NA);
  }
  assert.equal(empty.totalW, NA);
  assert.equal(empty.totalKwh, NA);

  const partial = cardModel(
    {
      mac: "0a1b2c3d4e5f", online: true,
      channels: [
        { selector: 3, name: "Lamp", on_state: 1, power_mw: 5000, temperature_c: 25, energy_lifetime_wh: 2000 },
        { selector: 9, name: "ignored", on_state: 1, power_mw: 99999 },
      ],
    },
    { authenticated: true, lang: "ko" },
  );
  assert.equal(partial.outlets.length, 4);
  assert.deepEqual(partial.outlets.map((o) => o.on), [null, null, true, null]);
  assert.equal(partial.outlets[2].name, "Lamp");
  assert.equal(partial.outlets[0].name, "콘센트 1");
  assert.equal(partial.totalW, "5.0 W");
  assert.equal(partial.totalKwh, "2.00 kWh");

  const noChannels = cardModel({ mac: "0a1b2c3d4e5f", online: false }, { authenticated: false, lang: "en" });
  assert.equal(noChannels.outlets.length, 4);
  assert.equal(noChannels.controls, false);
});

test("cardModel guest view hides admin parts", () => {
  const m = cardModel(fixture.devices[0], { authenticated: fixture.authenticated, lang: "en" });
  assert.equal(m.mac, "0a1b2c3d4e5f");
  assert.equal(m.lastSeen, 1790682546.5);
  assert.equal(cardModel({ mac: "0a1b2c3d4e5f" }, { authenticated: true, lang: "en" }).lastSeen, null);
  assert.equal(m.title, "MTTL 3D4E5F");
  assert.equal(m.firmware, "1.0.66");
  assert.equal(m.online, true);
  assert.equal(m.lock, null);
  assert.equal(m.fwAction, null);
  assert.equal(m.controls, false);
  assert.equal(m.voltage, null);
  assert.equal(m.rssi, null);
  assert.deepEqual(m.outlets.map((o) => o.on), [false, false, true, true]);
  assert.equal(m.outlets[0].temp, "26 °C");
  assert.equal(m.totalW, "0.0 W");

  // Admin fields that leak into a guest render must still be ignored.
  const admin = demoResponse().devices.find((d) => d.childlock_supported);
  const leaked = cardModel({ ...admin, firmware_action: "update" }, { authenticated: false, unlocked: true, lang: "en" });
  assert.equal(leaked.lock, null);
  assert.equal(leaked.fwAction, null);
  assert.equal(leaked.controls, false);
});

test("cardModel locked view disables controls", () => {
  const device = demoResponse().devices.find((d) => d.online && d.childlock_synced);
  const locked = cardModel(device, { authenticated: true, unlocked: false, lang: "en" });
  assert.equal(locked.controls, false);
  assert.equal(locked.editable, false);
  // Locking the screen hides nothing: lock bits and firmware hints stay visible.
  assert.equal(locked.lock.supported, true);
  const open = cardModel(device, { authenticated: true, unlocked: true, lang: "en" });
  assert.equal(open.controls, true);
  assert.equal(open.editable, true);
  const offline = demoResponse().devices.find((d) => !d.online);
  const offlineOpen = cardModel(offline, { authenticated: true, unlocked: true, lang: "en" });
  // Rename and hide follow the screen lock, not the device being online.
  assert.equal(offlineOpen.editable, true);
  assert.equal(offlineOpen.controls, false);
  // Missing option means locked.
  assert.equal(cardModel(device, { authenticated: true, lang: "en" }).controls, false);
});

test("apkUrl prefers ota_host_ip", () => {
  const ingress = (hostname) => ({
    protocol: "http:", hostname, port: "8123",
    pathname: "/api/hassio_ingress/AbCd123/", href: `http://${hostname}:8123/api/hassio_ingress/AbCd123/`,
  });
  assert.equal(apkUrl({ ota_host_ip: "192.0.2.10" }, ingress("192.0.2.31")), "http://192.0.2.10:18282/provision-android.apk");
  assert.equal(apkUrl({ ota_host_ip: "" }, ingress("192.0.2.31")), "http://192.0.2.31:18282/provision-android.apk");
  assert.equal(apkUrl(null, ingress("192.0.2.31")), "http://192.0.2.31:18282/provision-android.apk");
  const direct = { protocol: "http:", hostname: "192.0.2.31", port: "18282", pathname: "/", href: "http://192.0.2.31:18282/" };
  assert.equal(apkUrl({ ota_host_ip: "192.0.2.10" }, direct), "http://192.0.2.31:18282/provision-android.apk");
  const directQuery = { ...direct, pathname: "/dashboard.html", href: "http://192.0.2.31:18282/dashboard.html?demo#x" };
  assert.equal(apkUrl(null, directQuery), "http://192.0.2.31:18282/provision-android.apk");
  assert.equal(apkUrlForHost({ ota_host_ip: "192.0.2.10" }, "localhost"), "http://192.0.2.10:18282/provision-android.apk");
});

test("isIngressPath finds the Home Assistant sidebar address", () => {
  for (const path of [
    "/api/hassio_ingress/AbCd123/", "/api/hassio_ingress/AbCd123/logs.html", "/api/hassio_ingress/Ab-C_d/tuo.html",
  ]) {
    assert.equal(isIngressPath(path), true, path);
  }
  for (const path of ["/", "/dashboard.html", "/logs.html", "/logview.html", "/api/devices", "/api/hassio_ingress", "", null, undefined]) {
    assert.equal(isIngressPath(path), false, String(path));
  }
});

test("isViewOnly: changes only in the sidebar, and in the demo on screen", () => {
  assert.equal(isViewOnly({ pathname: "/", demo: false }), true);
  assert.equal(isViewOnly({ pathname: "/dashboard.html", demo: false }), true);
  assert.equal(isViewOnly({ pathname: "/logs.html", demo: false }), true);
  assert.equal(isViewOnly({ pathname: "/api/hassio_ingress/AbCd123/", demo: false }), false);
  assert.equal(isViewOnly({ pathname: "/api/hassio_ingress/AbCd123/logs.html", demo: false }), false);
  // Demo controls change only the screen, so the demo stays unlockable everywhere.
  assert.equal(isViewOnly({ pathname: "/dashboard.html", demo: true }), false);
  assert.equal(isViewOnly({ pathname: "/logview.html", demo: true }), false);
});

test("VIEW ONLY reads the same in EN and KR; its tooltip is translated", () => {
  assert.equal(STRINGS.en.view_only, "View only");
  assert.equal(STRINGS.ko.view_only, "View only");
  assert.ok(ENGLISH_ONLY.includes("view_only"));
  assert.match(STRINGS.en.view_only_hint, /Home Assistant sidebar/);
  assert.match(STRINGS.ko.view_only_hint, /Home Assistant 사이드바/);
  assert.ok(!ENGLISH_ONLY.includes("view_only_hint"));
});

test("both pages take the view-only decision from isViewOnly", () => {
  for (const mod of ["dashboard.mjs", "logview.mjs"]) assert.match(staticFile(mod), /\bisViewOnly\(\{/, mod);
});

test("cardModel admin lock bits", () => {
  const device = {
    mac: "0a1b2c3d4e5f", alias: "Desk", online: true, firmware_version: "1.0.111",
    childlock_supported: true, childlock_synced: true, childlock_mask: 0b00101,
    firmware_action: "update", firmware_target: { version: "1.0.111" },
    diagnostics: { voltage_enabled: true, voltage_mv: 221400, rssi_enabled: true, rssi_dbm: -54 },
    channels: [],
  };
  const m = cardModel(device, { authenticated: true, unlocked: true, lang: "en" });
  assert.equal(m.title, "Desk");
  assert.deepEqual(m.lock, { supported: true, synced: true, bits: [true, false, true, false, false] });
  assert.equal(m.fwAction, "update");
  assert.equal(m.controls, true);
  assert.equal(m.voltage, "221.4 V");
  assert.equal(m.rssi, "-54 dBm");

  const unknown = cardModel({ ...device, childlock_synced: false, childlock_mask: null, firmware_action: "weird" }, { authenticated: true, lang: "en" });
  assert.deepEqual(unknown.lock, { supported: true, synced: false, bits: [false, false, false, false, false] });
  assert.equal(unknown.fwAction, null);

  const offline = cardModel({ ...device, online: false }, { authenticated: true, unlocked: true, lang: "en" });
  assert.equal(offline.controls, false);

  const noLock = cardModel({ ...device, childlock_supported: false }, { authenticated: true, lang: "en" });
  assert.equal(noLock.lock.supported, false);
});

test("demo response has the fixture keys", () => {
  const demo = demoResponse();
  const missing = (want, have, where) => {
    for (const key of Object.keys(want)) assert.ok(key in have, `${where}: ${key}`);
  };
  missing(fixture, demo, "response");
  assert.equal(demo.authenticated, true);
  assert.equal(demo.devices.length, 4);
  const want = fixture.devices[0];
  for (const d of demo.devices) {
    missing(want, d, d.mac);
    missing(want.diagnostics, d.diagnostics, `${d.mac}.diagnostics`);
    assert.equal(d.channels.length, 4);
    for (const ch of d.channels) missing(want.channels[0], ch, `${d.mac}.channels`);
    assert.ok(normalizeMac(d.mac) === d.mac, d.mac);
  }
  const byFw = (v) => demo.devices.filter((d) => d.firmware_version === v);
  assert.ok(byFw("1.0.111").some((d) => d.childlock_synced && d.diagnostics.voltage_enabled && d.diagnostics.rssi_enabled));
  assert.ok(byFw("1.0.66").some((d) => d.firmware_action === "update"));
  assert.ok(demo.devices.some((d) => !d.online));
  assert.ok(demo.devices.some((d) => d.channels.some((ch) => ch.on_state === 1)));
  // Each call returns a fresh copy so demo controls cannot leak between renders.
  demo.devices[0].alias = "changed";
  assert.notEqual(demoResponse().devices[0].alias, "changed");
});

test("summaryModel counts devices and tolerates missing admin parts", () => {
  const admin = summaryModel(demoResponse(), demoHa());
  assert.deepEqual(
    {
      online: admin.online, total: admin.total, mqtt: admin.mqtt, broker: admin.broker, topic: admin.topic,
      discovery: admin.discovery, fwTarget: admin.fwTarget, fwPending: admin.fwPending, otaHost: admin.otaHost, version: admin.version,
    },
    {
      online: 3, total: 4, mqtt: "connected", broker: "192.0.2.10:1883", topic: "mttl", discovery: "homeassistant",
      fwTarget: "1.0.111", fwPending: 1, otaHost: "192.0.2.10", version: "0.2.11",
    },
  );
  assert.equal(summaryModel(demoResponse(), { enabled: false, connected: false }).mqtt, "off");
  assert.equal(summaryModel(demoResponse(), { enabled: true, connected: false }).mqtt, "disconnected");
  assert.equal(summaryModel(demoResponse(), null).mqtt, "unknown");

  const guest = summaryModel(fixture, null);
  assert.equal(guest.mqtt, "unknown");
  assert.equal(guest.broker, null);
  assert.equal(guest.fwTarget, null);
  assert.equal(guest.fwPending, null);
  assert.equal(guest.otaHost, null);
  assert.equal(guest.online, 1);
  assert.equal(summaryModel(null, null).total, 0);
});

test("fmtMac", () => {
  assert.equal(fmtMac("0a1b2c3d4e5f"), "0A:1B:2C:3D:4E:5F");
  assert.equal(fmtMac("bad"), "");
});

// ---- Real mode: polling, controls and requests ----

const deviceA = { mac: "0a1b2c3d4e5f", online: true, alias: "Desk" };
const deviceB = { mac: "0a1b2c3d4e60", online: false, alias: null };

test("reducePoll keeps devices on error", () => {
  const resp = { authenticated: true, devices: [deviceA], backend_version: "0.2.11" };
  const prev = { devices: [deviceA], authenticated: true, stale: false, resp };
  for (const result of [{ error: "x" }, { status: 500 }, { status: 502, body: { error: "bad gateway" } }, { status: 200, body: null }]) {
    const next = reducePoll(prev, result);
    assert.deepEqual(next.devices, [deviceA], JSON.stringify(result));
    assert.equal(next.stale, true);
    assert.equal(next.authenticated, true);
    assert.equal(next.resp, resp);
  }
  assert.equal(prev.stale, false); // the previous state is not changed in place
});

test("reducePoll applies 200", () => {
  const prev = { devices: [deviceA], authenticated: false, stale: true, resp: null };
  const body = { authenticated: true, devices: [deviceB], backend_version: "0.2.11" };
  assert.deepEqual(reducePoll(prev, { status: 200, body }), { devices: [deviceB], authenticated: true, stale: false, resp: body });
  // A 200 answer without a device list is an empty list, not the previous one.
  assert.deepEqual(reducePoll(prev, { status: 200, body: { authenticated: true } }).devices, []);
});

test("diffMacs", () => {
  assert.deepEqual(diffMacs(["a", "b"], ["b", "c"]), { added: ["c"], removed: ["a"] });
  assert.deepEqual(diffMacs([], ["a", "b", "b"]), { added: ["a", "b"], removed: [] });
  assert.deepEqual(diffMacs(["a", "b"], []), { added: [], removed: ["a", "b"] });
  assert.deepEqual(diffMacs(["a", "b"], ["b", "a"]), { added: [], removed: [] });
});

test("canToggleLock requires synced integer mask", () => {
  assert.equal(canToggleLock({ childlock_synced: false, childlock_mask: 4 }), false);
  assert.equal(canToggleLock({ childlock_synced: true, childlock_mask: null }), false);
  assert.equal(canToggleLock({ childlock_synced: true, childlock_mask: 0 }), true);
  assert.equal(canToggleLock({ childlock_synced: true, childlock_mask: 31 }), true);
  for (const mask of [1.5, "3", undefined, -1, 32, 255]) {
    assert.equal(canToggleLock({ childlock_synced: true, childlock_mask: mask }), false, String(mask));
  }
  assert.equal(canToggleLock({ childlock_synced: "yes", childlock_mask: 0 }), false);
  assert.equal(canToggleLock(null), false);
});

test("toggleMask", () => {
  assert.equal(toggleMask(0b00001, 3, true), 0b01001);
  assert.equal(toggleMask(0b01001, 0, false), 0b01000);
  assert.equal(toggleMask(0b01000, 3, true), 0b01000);
  assert.equal(toggleMask(0, 4, false), 0);
});

test("withDevice replaces or drops one device of the poll state", () => {
  const body = demoResponse();
  const poll = reducePoll({ devices: [], authenticated: false, stale: true, resp: null }, { status: 200, body });
  const renamed = { ...body.devices[1], alias: "Standing desk" };
  const next = withDevice(poll, "0a1b2c3d4e60", renamed);
  assert.deepEqual(next.devices.map((d) => d.alias), ["Living Room", "Standing desk", null, "Garage"]);
  assert.equal(next.resp.devices, next.devices);
  assert.equal(next.stale, false);
  assert.equal(poll.devices[1].alias, "Office Desk");

  const macs = (p) => p.devices.map((d) => d.mac);
  assert.deepEqual(macs(withDevice(poll, "0a1b2c3d4e60", null)), ["0a1b2c3d4e5f", "0a1b2c3d4e61", "0a1b2c3d4e62"]);
  // A hidden device leaves the list, like it does in the next `api/devices` answer.
  assert.deepEqual(macs(withDevice(poll, "0a1b2c3d4e60", { ...renamed, removed: true })), ["0a1b2c3d4e5f", "0a1b2c3d4e61", "0a1b2c3d4e62"]);
  // An answer for a device that is not on the screen does not add it.
  assert.deepEqual(macs(withDevice(poll, "0a1b2c3d4e99", { mac: "0a1b2c3d4e99" })), macs(poll));
});

test("applyPending shows requested values until the answer arrives", () => {
  const raw = demoResponse().devices[0];
  const shown = applyPending(raw, [
    { kind: "power", n: 3, on: true },
    { kind: "alias", value: "Desk" },
    { kind: "outletName", n: 1, value: "Lamp" },
    { kind: "lock", mask: 0b00110 },
  ]);
  assert.deepEqual(shown.channels.map((ch) => ch.on_state), [1, 1, 1, 1]);
  assert.equal(shown.alias, "Desk");
  assert.equal(shown.channels[0].name, "Lamp");
  assert.equal(shown.childlock_mask, 0b00110);
  // The last answer stays as it was.
  assert.deepEqual(raw.channels.map((ch) => ch.on_state), [1, 1, 0, 1]);
  assert.equal(raw.alias, "Living Room");
  assert.equal(raw.channels[0].name, "TV");

  const allOff = applyPending(raw, [{ kind: "power", n: 0, on: false }]);
  assert.deepEqual(allOff.channels.map((ch) => ch.on_state), [0, 0, 0, 0]);
  assert.equal(applyPending(raw, []), raw);
});

test("nameEditOutcome cancels on relock and waits for the IME", () => {
  const base = { unlocked: true, value: "New name", current: "Old name" };
  assert.equal(nameEditOutcome({ ...base, how: "enter" }), "save");
  assert.equal(nameEditOutcome({ ...base, how: "blur" }), "save");
  // Relocking the screen closes the field without a request, and so does a blur that follows it.
  assert.equal(nameEditOutcome({ ...base, how: "relock" }), "cancel");
  assert.equal(nameEditOutcome({ ...base, how: "blur", unlocked: false }), "cancel");
  assert.equal(nameEditOutcome({ ...base, how: "enter", unlocked: false }), "cancel");
  // Enter that ends a Korean IME composition keeps the field open.
  assert.equal(nameEditOutcome({ ...base, how: "enter", composing: true, value: "거실" }), "keep");
  assert.equal(nameEditOutcome({ ...base, how: "escape" }), "cancel");
  assert.equal(nameEditOutcome({ ...base, how: "blur", value: "  Old name " }), "cancel");
  assert.equal(nameEditOutcome({ ...base, how: "enter", value: "", current: null }), "cancel");
  assert.equal(nameEditOutcome({ ...base, how: "enter", value: "", current: "Old name" }), "save");
});

/** Runs `fn` with a fetch that records its calls and answers from `reply(url, init)`. */
async function withFetch(reply, fn) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    return reply(url, init);
  };
  try {
    await fn();
  } finally {
    globalThis.fetch = real;
  }
  return calls;
}

const jsonReply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("apiSend puts the request header on every POST and PUT", async () => {
  const calls = await withFetch(() => jsonReply(200, { ok: true }), async () => {
    assert.deepEqual(await apiSend("POST", "api/devices/0a1b2c3d4e5f/outlets/0/power", { on: true }), { ok: true });
    await apiSend("PUT", "api/devices/0a1b2c3d4e5f", { alias: "Desk" });
    await apiSend("POST", "api/logs/clear");
  });
  assert.deepEqual(
    calls.map(({ url, init }) => [init.method, url, init.body]),
    [
      ["POST", "api/devices/0a1b2c3d4e5f/outlets/0/power", '{"on":true}'],
      ["PUT", "api/devices/0a1b2c3d4e5f", '{"alias":"Desk"}'],
      ["POST", "api/logs/clear", "{}"],
    ],
  );
  for (const { init } of calls) {
    const headers = new Headers(init.headers);
    assert.equal(headers.get("X-MTTL-Request"), "1");
    assert.equal(headers.get("Content-Type"), "application/json");
  }
});

test("apiSend rejects with the backend's message", async () => {
  await withFetch(() => jsonReply(409, { ok: false, state: "busy", error: "device transaction queue busy" }), async () => {
    await assert.rejects(apiSend("POST", "api/devices/0a1b2c3d4e5f/refresh"), /device transaction queue busy/);
  });
  await withFetch(() => jsonReply(504, { ok: false, state: "indeterminate" }), async () => {
    await assert.rejects(apiSend("POST", "api/devices/0a1b2c3d4e5f/outlets/1/power", { on: false }), /indeterminate/);
  });
  await withFetch(() => new Response("Forbidden", { status: 403 }), async () => {
    await assert.rejects(apiSend("PUT", "api/devices/0a1b2c3d4e5f", { alias: "x" }), /HTTP 403/);
  });
});

test("apiGet answers status and body, or an error", async () => {
  const calls = await withFetch((url) => (url === "api/ha" ? new Response("oops", { status: 500 }) : jsonReply(200, { devices: [] })), async () => {
    assert.deepEqual(await apiGet("api/devices"), { status: 200, body: { devices: [] } });
    assert.deepEqual(await apiGet("api/ha"), { status: 500, body: null });
  });
  // Reads are plain GETs without a body.
  for (const { init } of calls) {
    assert.equal(init.method ?? "GET", "GET");
    assert.equal(init.body, undefined);
  }
  await withFetch(() => Promise.reject(new TypeError("Failed to fetch")), async () => {
    assert.deepEqual(await apiGet("api/devices"), { error: "Failed to fetch" });
  });
});
