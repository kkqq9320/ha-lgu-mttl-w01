import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const core = await import(new URL("../../mttl_w01/backend/static/dashboard-core.mjs", import.meta.url));
const { JOB_STATES, FWR_SIZE, jobStateKey, deviceFirmware } = await import(new URL("../../mttl_w01/backend/static/firmware-core.mjs", import.meta.url));
const {
  STRINGS, t, pickLang, resolveTheme, normalizeMac,
  fmtWatts, fmtKwh, fmtTemp, fmtVolt, fmtRssi, fmtAge,
  cardModel, demoResponse, demoHa, summaryModel, fmtMac, apkUrl, apkUrlForHost, ENGLISH_ONLY,
  isIngressPath, isViewOnly,
  pressConfirm, scriptLang,
  reducePoll, diffMacs, canToggleLock, toggleMask, withDevice, applyPending, nameEditOutcome,
  apiGet, apiSend, apiSendRaw,
  DIAG_INTERVALS, DIAG_DEFAULT, deviceTitle, deviceWindowModel, measureForm, measurePayload, hiddenModel, deleteWordOk,
  lockErrorKey, otaWarnKeys, fwNoteKey, jobLabel, cardNotice, pickAlert, intervalUnit, fmtAgo, demoConfig,
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
  for (const page of ["dashboard.html", "logview.html", "settings.html"]) {
    const header = staticFile(page).match(/<header class="topbar"[\s\S]*?<\/header>/)[0];
    for (const m of header.matchAll(/data-i18n(?:-title)?="([^"]+)"/g)) keys.add(m[1]);
  }
  for (const mod of ["dashboard.mjs", "logview.mjs", "settings.mjs"]) {
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

test("every job state and hint has EN and KR text", () => {
  const keys = [...JOB_STATES.map((state) => jobStateKey(state)), "hint_111", "hint_110", "hint_66", "hint_custom", "fwr_ext", "fwr_size"];
  assert.equal(keys.filter((key) => key?.startsWith("job_")).length, JOB_STATES.length);
  for (const key of keys) {
    assert.ok(key, "a job state has no text key");
    assert.ok(!ENGLISH_ONLY.includes(key), key);
    for (const lang of ["en", "ko"]) assert.ok(STRINGS[lang][key], `${lang}.${key}`);
    // Translated texts: the Korean one is written in Korean.
    assert.match(STRINGS.ko[key], /\p{Script=Hangul}/u, key);
    assert.notEqual(STRINGS.ko[key], STRINGS.en[key], key);
  }
  assert.match(STRINGS.en.hint_111, /Child Lock/);
  assert.match(STRINGS.en.hint_111, /49217/);
  assert.match(STRINGS.ko.hint_111, /49217/);
  assert.match(STRINGS.en.hint_110, /TCP 80/);
  assert.match(STRINGS.en.hint_66, /LG U\+/);
  assert.match(STRINGS.en.hint_custom, /structure/);
  assert.equal(t("en", "job_downloading"), STRINGS.en.job_downloading);
  // The size in the message is the size the check wants.
  const size = FWR_SIZE.toLocaleString("en-US");
  assert.ok(STRINGS.en.fwr_size.includes(size), STRINGS.en.fwr_size);
  assert.ok(STRINGS.ko.fwr_size.includes(size), STRINGS.ko.fwr_size);
  assert.match(STRINGS.en.fwr_ext, /\.fwr/);
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
  for (const mod of ["dashboard.mjs", "logview.mjs", "settings.mjs"]) assert.match(staticFile(mod), /\bisViewOnly\(\{/, mod);
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
  assert.equal(m.controls, true);
  assert.equal(m.voltage, "221.4 V");
  assert.equal(m.rssi, "-54 dBm");

  const unknown = cardModel({ ...device, childlock_synced: false, childlock_mask: null, firmware_action: "weird" }, { authenticated: true, lang: "en" });
  assert.deepEqual(unknown.lock, { supported: true, synced: false, bits: [false, false, false, false, false] });

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
      fwTarget: "1.0.111", fwPending: 2, otaHost: "192.0.2.10", version: "0.2.11",
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

test("apiSendRaw posts raw bytes with the request and file-name headers", async () => {
  const bytes = Uint8Array.from([0, 1, 2, 250, 251, 255]);
  const calls = await withFetch(() => jsonReply(200, { ok: true, profile: { id: "custom-1" } }), async () => {
    assert.deepEqual(await apiSendRaw("api/firmware/custom", bytes, "custom.fwr"), { ok: true, profile: { id: "custom-1" } });
    // An ArrayBuffer (what File.arrayBuffer() gives) is sent as it is.
    await apiSendRaw("api/firmware/custom", bytes.buffer.slice(0), "custom.fwr");
  });
  assert.equal(calls.length, 2);
  for (const { url, init } of calls) {
    assert.equal(url, "api/firmware/custom");
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "same-origin");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("X-MTTL-Request"), "1");
    assert.equal(headers.get("Content-Type"), "application/octet-stream");
    assert.equal(headers.get("X-Filename"), "custom.fwr");
    assert.deepEqual([...new Uint8Array(init.body)], [...bytes]);
  }
});

test("apiSendRaw sends a file name that fetch accepts: anything outside printable ASCII becomes _", async () => {
  const cases = [
    ["거실 멀티탭.fwr", "__ ___.fwr"],
    ["tab\tnew\nline.fwr", "tab_new_line.fwr"],
    ["em😀oji.fwr", "em_oji.fwr"],
    ["café.fwr", "caf_.fwr"],
    ["plain name (1).fwr", "plain name (1).fwr"],
  ];
  const calls = await withFetch(() => jsonReply(200, { ok: true }), async () => {
    for (const [name] of cases) await apiSendRaw("api/firmware/custom", new Uint8Array(1), name);
  });
  const names = calls.map(({ init }) => new Headers(init.headers).get("X-Filename"));
  assert.deepEqual(names, cases.map(([, want]) => want));
  // A real fetch throws a TypeError for a header value outside ISO-8859-1; the cleaned values pass.
  assert.throws(() => new Headers({ "X-Filename": "거실.fwr" }), TypeError);
  for (const name of names) assert.doesNotThrow(() => new Headers({ "X-Filename": name }), name);
});

test("apiSendRaw rejects with the backend's message", async () => {
  await withFetch(() => jsonReply(400, { ok: false, error: "invalid FWR structure" }), async () => {
    await assert.rejects(apiSendRaw("api/firmware/custom", new Uint8Array(1), "a.fwr"), /invalid FWR structure/);
  });
  await withFetch(() => new Response("Forbidden", { status: 403 }), async () => {
    await assert.rejects(apiSendRaw("api/firmware/custom", new Uint8Array(1), "a.fwr"), /HTTP 403/);
  });
  await withFetch(() => Promise.reject(new TypeError("Failed to fetch")), async () => {
    await assert.rejects(apiSendRaw("api/firmware/custom", new Uint8Array(1), "a.fwr"), /Failed to fetch/);
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

// ---- Device window, hidden devices and the links to the settings page ----

const LIVING = "0a1b2c3d4e5f"; // 1.0.111, online, Child Lock mask 4, voltage and RSSI on
const OFFICE = "0a1b2c3d4e60"; // 1.0.66, online, update to 1.0.111
const GARAGE = "0a1b2c3d4e62"; // 1.0.66, offline, the update to 1.0.111 still running
const open = { unlocked: true, viewOnly: false };
const demoDevice = (mac) => demoResponse().devices.find((d) => d.mac === mac);

test("deviceWindowModel locks controls when locked, view-only or offline", () => {
  const dev = demoResponse().devices[0];
  assert.equal(deviceWindowModel(dev, { jobs: [] }, { unlocked: true, viewOnly: false }).controls, true);
  assert.equal(deviceWindowModel(dev, { jobs: [] }, { unlocked: false, viewOnly: false }).controls, false);
  assert.equal(deviceWindowModel(dev, { jobs: [] }, { unlocked: true, viewOnly: true }).controls, false);
  assert.equal(deviceWindowModel({ ...dev, online: false }, { jobs: [] }, { unlocked: true, viewOnly: false }).controls, false);
  // Whatever is missing counts as locked.
  assert.equal(deviceWindowModel(dev, { jobs: [] }, {}).controls, false);
  assert.equal(deviceWindowModel(dev, { jobs: [] }, { unlocked: true }).controls, true);
});

test("deviceWindowModel shows Child Lock only on 1.0.111 devices", () => {
  const living = demoDevice(LIVING);
  assert.deepEqual(deviceWindowModel(living, { jobs: [] }, open).lock, { mask: 4, synced: true, canReread: true });
  assert.equal(deviceWindowModel(demoDevice(OFFICE), { jobs: [] }, open).lock, null);
  assert.equal(deviceWindowModel({ ...living, childlock_supported: false }, { jobs: [] }, open).lock, null);
  // An offline strip keeps its last mask but is not in sync and cannot be read.
  const offline = { ...living, online: false, childlock_synced: false };
  assert.deepEqual(deviceWindowModel(offline, { jobs: [] }, open).lock, { mask: 4, synced: false, canReread: false });
  // A strip still on an older firmware has no Child Lock to show.
  assert.equal(deviceWindowModel(demoDevice(GARAGE), { jobs: [] }, open).lock, null);
  // Reading needs an online strip whose Child Lock wire access is safe.
  assert.equal(deviceWindowModel({ ...living, childlock_probe_safe: false }, { jobs: [] }, open).lock.canReread, false);
  assert.equal(deviceWindowModel({ ...living, online: false }, { jobs: [] }, open).lock.canReread, false);
  assert.equal(deviceWindowModel({ ...living, childlock_mask: null, childlock_synced: false }, { jobs: [] }, open).lock.mask, null);
  // The screen lock does not hide the panel; the page turns the button off with `controls`.
  assert.equal(deviceWindowModel(living, { jobs: [] }, { unlocked: false, viewOnly: false }).lock.canReread, true);
});

test("deviceWindowModel reads firmware from deviceFirmware and measurement from the device", () => {
  const data = demoResponse();
  const living = deviceWindowModel(demoDevice(LIVING), data.firmware, open);
  assert.deepEqual(living.measure, { voltage: true, rssi: true, interval: 60 });
  assert.deepEqual(living.fw, deviceFirmware(demoDevice(LIVING), data.firmware));
  assert.equal(living.fw.action, null);

  const office = deviceWindowModel(demoDevice(OFFICE), data.firmware, open);
  assert.deepEqual(office.measure, { voltage: false, rssi: false, interval: 60 });
  // Office is on 1.0.66: the update is due, but the app cannot start it (TCP 80 only).
  assert.equal(office.fw.action, "update");
  assert.equal(office.fw.canUpdate, false);
  assert.equal(office.fw.block, "pc_tool");
  assert.equal(office.fw.target, "1.0.111");

  // The strip that reboots during its update: an update to 1.0.111 is under way, so the window never says "matches".
  const garage = deviceWindowModel(demoDevice(GARAGE), data.firmware, open);
  assert.equal(garage.fw.active, true);
  assert.equal(garage.fw.block, "busy");
  assert.equal(garage.fw.job.state, "RECONNECTING");
  assert.equal(garage.fw.current, "1.0.66");
  assert.equal(garage.fw.action, "update");
  assert.equal(garage.fw.job.from_version, garage.fw.current);

  // A value the window does not offer stays visible; a missing one is the default.
  assert.equal(deviceWindowModel({ ...demoDevice(OFFICE), diagnostics: { poll_interval: 45 } }, data.firmware, open).measure.interval, 45);
  assert.equal(deviceWindowModel({ ...demoDevice(OFFICE), diagnostics: {} }, data.firmware, open).measure.interval, DIAG_DEFAULT);
  const bare = deviceWindowModel(null, null, open);
  assert.deepEqual(bare.measure, { voltage: false, rssi: false, interval: 60 });
  assert.equal(bare.lock, null);
  assert.equal(bare.controls, false);
  assert.equal(bare.fw.action, null);
});

test("deviceWindowModel says the PC tool installs firmware on a strip below 1.0.111", () => {
  const data = demoResponse();
  // Office and Garage are on 1.0.66, Living is on 1.0.111.
  assert.equal(deviceWindowModel(demoDevice(OFFICE), data.firmware, open).pcTool, true);
  assert.equal(deviceWindowModel(demoDevice(GARAGE), data.firmware, open).pcTool, true);
  assert.equal(deviceWindowModel(demoDevice(LIVING), data.firmware, open).pcTool, false);
  assert.equal(deviceWindowModel({ ...demoDevice(LIVING), firmware_version: "1.0.110" }, data.firmware, open).pcTool, true);
  // The note does not depend on the lock, the connection or the target.
  const locked = deviceWindowModel({ ...demoDevice(OFFICE), online: false }, data.firmware, { unlocked: false, viewOnly: true });
  assert.equal(locked.pcTool, true);
  assert.equal(deviceWindowModel({ ...demoDevice(OFFICE), firmware_version: null }, data.firmware, open).pcTool, false);
  assert.equal(deviceWindowModel(null, null, open).pcTool, false);
  // The update button is off for it, and the same note says why. A strip on 1.0.111 can update.
  const office = deviceWindowModel(demoDevice(OFFICE), data.firmware, open);
  assert.equal(office.fw.canUpdate, false);
  assert.equal(office.fw.block, "pc_tool");
  const reflash = { ...demoDevice(LIVING), firmware_action: "reflash" };
  const living = deviceWindowModel(reflash, data.firmware, open);
  assert.equal(living.fw.canUpdate, true);
  assert.equal(living.pcTool, false);
});

test("fwNoteKey: a strip below 1.0.111 gets the TCP 80 note and none of the update notes", () => {
  const official = { kind: "official", ready: false };
  const fw = (extra = {}) => ({ target: "1.0.111", action: "update", block: null, ...extra });
  assert.equal(fwNoteKey(fw(), official, false), "dw_auto_prepare");
  assert.equal(fwNoteKey(fw(), { kind: "official", ready: true }, false), null);
  assert.equal(fwNoteKey(fw({ block: "not_ready" }), { kind: "custom", ready: false }, false), "dw_not_ready");
  assert.equal(fwNoteKey(fw({ action: null }), official, false), "dw_fw_match");
  assert.equal(fwNoteKey(fw({ target: null, action: null }), official, false), null);
  // Below 1.0.111 the update cannot start, so "prepared when the update starts" would mislead; dw_port80 is the reason.
  assert.equal(fwNoteKey(fw({ block: "pc_tool" }), official, true), null);
  assert.equal(fwNoteKey(fw({ block: "pc_tool" }), { kind: "custom", ready: false }, true), null);
  assert.equal(fwNoteKey(fw({ block: "busy" }), official, true), null);
  // Matching the target is still true for such a strip.
  assert.equal(fwNoteKey(fw({ action: null }), official, true), "dw_fw_match");
  assert.equal(fwNoteKey(fw(), null, false), null);
});

test("the measurement choices are the backend's", () => {
  assert.deepEqual(DIAG_INTERVALS, [30, 60, 120, 300, 600, 1800]);
  assert.deepEqual([...DIAG_INTERVALS], demoConfig().diagnostic_allowed);
  assert.equal(DIAG_DEFAULT, 60);
  assert.ok(DIAG_INTERVALS.includes(DIAG_DEFAULT));
  for (const n of DIAG_INTERVALS) for (const lang of ["en", "ko"]) assert.ok(STRINGS[lang][intervalUnit(n).key], `${lang} ${n}`);
});

test("measureForm lays the user's changes over what the device holds", () => {
  const saved = { voltage: false, rssi: true, interval: 60 };
  assert.deepEqual(measureForm(saved, {}), { voltage: false, rssi: true, interval: 60, dirty: false });
  assert.deepEqual(measureForm(saved, { voltage: true }), { voltage: true, rssi: true, interval: 60, dirty: true });
  assert.deepEqual(measureForm(saved, { interval: 300 }), { voltage: false, rssi: true, interval: 300, dirty: true });
  // A field put back to what the device holds is no change.
  assert.equal(measureForm(saved, { voltage: false, interval: 60 }).dirty, false);
  // The device changed under a field the user did not touch: the new value shows, the touched field stays.
  assert.deepEqual(measureForm({ voltage: false, rssi: false, interval: 300 }, { voltage: true }), { voltage: true, rssi: false, interval: 300, dirty: true });
  // Apply sends all three values together.
  assert.deepEqual(measurePayload(measureForm(saved, { interval: 120 })), { voltage_enabled: false, rssi_enabled: true, poll_interval: 120 });
  assert.deepEqual(measurePayload({ voltage: true, rssi: true, interval: 1800, dirty: false }), { voltage_enabled: true, rssi_enabled: true, poll_interval: 1800 });
});

test("hiddenModel sums preserved energy", () => {
  const removed = [{ mac: "0A:1B:2C:3D:4E:63", alias: "Guest Room", channels: [{ selector: 1, energy_lifetime_wh: 1000 }, { selector: 2, energy_lifetime_wh: 2500 }] }];
  assert.deepEqual(hiddenModel(removed), [{ mac: "0a1b2c3d4e63", name: "Guest Room", macText: "0A:1B:2C:3D:4E:63", kwh: "3.50 kWh" }]);
  assert.equal(hiddenModel(removed)[0].kwh, fmtKwh(3500));
  // The demo's hidden strip: 12.48 + 3.32 kWh.
  assert.deepEqual(hiddenModel(demoResponse().removed), [{ mac: "0a1b2c3d4e63", name: "Guest Room", macText: "0A:1B:2C:3D:4E:63", kwh: "15.80 kWh" }]);
  // A strip without a name is MTTL and the last six digits, one without energy shows N/A, garbage rows are skipped.
  assert.deepEqual(
    hiddenModel([{ mac: "0a1b2c3d4e64", channels: [] }, null, { mac: "bad" }, "x", { mac: "0a1b2c3d4e65", channels: [{ selector: 0, energy_lifetime_wh: 9000 }] }]),
    [
      { mac: "0a1b2c3d4e64", name: "MTTL 3D4E64", macText: "0A:1B:2C:3D:4E:64", kwh: NA },
      { mac: "0a1b2c3d4e65", name: "MTTL 3D4E65", macText: "0A:1B:2C:3D:4E:65", kwh: NA },
    ],
  );
  assert.deepEqual(hiddenModel(undefined), []);
  assert.deepEqual(hiddenModel(null), []);
  assert.deepEqual(hiddenModel({}), []);
});

test("deviceTitle is the name or MTTL and the last six digits of the MAC", () => {
  assert.equal(deviceTitle({ mac: LIVING, alias: "Living Room" }), "Living Room");
  assert.equal(deviceTitle({ mac: LIVING, alias: "  " }), "MTTL 3D4E5F");
  assert.equal(deviceTitle({ mac: LIVING }), "MTTL 3D4E5F");
  assert.equal(deviceTitle(null), "MTTL ");
  assert.equal(cardModel({ mac: LIVING }, { authenticated: true, lang: "en" }).title, "MTTL 3D4E5F");
});

test("deleteWordOk", () => {
  assert.equal(deleteWordOk(" delete "), true);
  assert.equal(deleteWordOk("DELETE"), true);
  assert.equal(deleteWordOk("Delete\n"), true);
  assert.equal(deleteWordOk("DELET"), false);
  assert.equal(deleteWordOk("delete me"), false);
  assert.equal(deleteWordOk("yes"), false);
  assert.equal(deleteWordOk(""), false);
  assert.equal(deleteWordOk(null), false);
  assert.equal(deleteWordOk(undefined), false);
});

test("lockErrorKey turns a Child Lock read state into text in both languages", () => {
  for (const state of ["busy", "channel_quarantined", "device_timeout", "state_unresolved", "invalid_device_mask", "observed_mismatch", "indeterminate"]) {
    const key = lockErrorKey(state);
    assert.ok(key, state);
    assert.ok(!ENGLISH_ONLY.includes(key), key);
    for (const lang of ["en", "ko"]) assert.ok(STRINGS[lang][key], `${lang}.${key}`);
    assert.match(STRINGS.ko[key], /\p{Script=Hangul}/u, key);
  }
  assert.notEqual(lockErrorKey("busy"), lockErrorKey("device_timeout"));
  // A state this page does not know is shown with the backend's own text.
  for (const unknown of ["something_new", "", null, undefined]) assert.equal(lockErrorKey(unknown), null, String(unknown));
});

test("apiSend errors carry the backend's state and status", async () => {
  await withFetch(() => jsonReply(409, { ok: false, state: "busy", error: "device transaction queue busy" }), async () => {
    await assert.rejects(apiSend("POST", "api/devices/0a1b2c3d4e5f/childlock/refresh"), (err) => {
      assert.equal(err.message, "device transaction queue busy");
      assert.equal(err.state, "busy");
      assert.equal(err.status, 409);
      return true;
    });
  });
  await withFetch(() => new Response("Forbidden", { status: 403 }), async () => {
    await assert.rejects(apiSend("PUT", "api/devices/0a1b2c3d4e5f", { alias: "x" }), (err) => err.state === null && err.status === 403);
  });
});

test("otaWarnKeys picks the warning of the action and adds the custom-file note", () => {
  assert.deepEqual(otaWarnKeys("update", { kind: "official" }), ["dw_ota_update"]);
  assert.deepEqual(otaWarnKeys("downgrade", { kind: "official" }), ["dw_ota_downgrade"]);
  assert.deepEqual(otaWarnKeys("reflash", null), ["dw_ota_reflash"]);
  assert.deepEqual(otaWarnKeys("update", { kind: "custom" }), ["dw_ota_update", "dw_ota_custom"]);
  assert.deepEqual(otaWarnKeys(null, { kind: "custom" }), []);
  for (const key of ["dw_ota_update", "dw_ota_downgrade", "dw_ota_reflash", "dw_ota_custom"]) {
    for (const lang of ["en", "ko"]) assert.ok(STRINGS[lang][key], `${lang}.${key}`);
  }
  // The power warning is in every action's text, in both languages.
  for (const key of ["dw_ota_update", "dw_ota_downgrade", "dw_ota_reflash"]) {
    assert.match(STRINGS.en[key], /power/i, key);
    assert.match(STRINGS.ko[key], /전원/, key);
    assert.match(STRINGS.en[key], /\{to\}/, key);
  }
});

test("otaWarnKeys adds the PC tool note to a downgrade below 1.0.111 only", () => {
  const official = (version) => ({ kind: "official", version });
  assert.deepEqual(otaWarnKeys("downgrade", official("1.0.110")), ["dw_ota_downgrade", "pc_return"]);
  assert.deepEqual(otaWarnKeys("downgrade", official("1.0.66")), ["dw_ota_downgrade", "pc_return"]);
  assert.deepEqual(otaWarnKeys("downgrade", { kind: "custom", version: "1.0.66" }), ["dw_ota_downgrade", "pc_return", "dw_ota_custom"]);
  // A downgrade that stays at 1.0.111 or above can be undone from the app; other actions are unchanged.
  assert.deepEqual(otaWarnKeys("downgrade", official("1.0.111")), ["dw_ota_downgrade"]);
  assert.deepEqual(otaWarnKeys("downgrade", official("1.0.112")), ["dw_ota_downgrade"]);
  assert.deepEqual(otaWarnKeys("update", official("1.0.110")), ["dw_ota_update"]);
  assert.deepEqual(otaWarnKeys("reflash", official("1.0.66")), ["dw_ota_reflash"]);
  assert.deepEqual(otaWarnKeys("downgrade", { kind: "official" }), ["dw_ota_downgrade"]);
});

test("the PC tool texts exist in EN and KR and name the tool and 1.0.111", () => {
  for (const key of ["pc_return", "dw_port80", "hint_110", "hint_66", "fw_all_pc"]) {
    for (const lang of ["en", "ko"]) assert.ok(STRINGS[lang][key], `${lang}.${key}`);
    assert.ok(!ENGLISH_ONLY.includes(key), key);
    assert.match(STRINGS.ko[key], /\p{Script=Hangul}/u, key);
    assert.match(STRINGS.en[key], /PC tool/, `en.${key}`);
    assert.match(STRINGS.ko[key], /PC 도구/, `ko.${key}`);
  }
  // The mark in the update-all list is short: it follows the device's line.
  assert.equal(STRINGS.en.fw_all_pc, "will fail, PC tool needed");
  assert.equal(STRINGS.ko.fw_all_pc, "실패 예정, PC 도구 필요");
  // Going back to 1.0.111 is the point of the downgrade note and of both hints.
  for (const key of ["pc_return", "hint_110", "hint_66"]) {
    assert.match(STRINGS.en[key], /1\.0\.111/, `en.${key}`);
    assert.match(STRINGS.ko[key], /1\.0\.111/, `ko.${key}`);
  }
  // The hints speak of a strip that runs that version (it takes firmware over TCP 80 only). They do not say a strip on
  // 1.0.111 fails to go down to it: that works over TCP 49217.
  for (const key of ["hint_110", "hint_66"]) {
    assert.match(STRINGS.en[key], /strip on this version/, key);
    assert.match(STRINGS.ko[key], /이 판을 쓰는 멀티탭/, key);
    assert.match(STRINGS.en[key], /TCP 80/);
    assert.match(STRINGS.ko[key], /TCP 80/);
    assert.doesNotMatch(STRINGS.en[key], /downgrad/i, key);
    assert.doesNotMatch(STRINGS.ko[key], /다운그레이드/, key);
  }
  // The window's note says why: the strip listens on TCP 80 only and the app does not open that port.
  assert.match(STRINGS.en.dw_port80, /TCP 80/);
  assert.match(STRINGS.ko.dw_port80, /TCP 80/);
  assert.match(STRINGS.en.dw_port80, /does not open/);
  assert.match(STRINGS.ko.dw_port80, /열지 않/);
});

test("jobLabel names a job state, and shows a state it does not know as sent", () => {
  assert.equal(jobLabel("en", "DOWNLOADING"), "Downloading");
  assert.equal(jobLabel("ko", "DOWNLOADING"), "내려받는 중");
  assert.equal(jobLabel("en", "FAILED_DOWNLOAD"), "Failed: download");
  assert.equal(jobLabel("en", "ROLLING_BACK"), "ROLLING_BACK");
  assert.equal(jobLabel("ko", "ROLLING_BACK"), "ROLLING_BACK");
  for (const none of [null, undefined, ""]) assert.equal(jobLabel("en", none), NA);
});

test("cardNotice shows a running job, else the offline note, else the update link", () => {
  const data = demoResponse();
  const admin = { authenticated: true, lang: "en" };
  // A strip that reboots during its OTA job is offline, but the job is what matters.
  assert.deepEqual(cardNotice(demoDevice(GARAGE), data.firmware, admin), { kind: "fw", text: "OTA · Reconnecting", live: true });
  assert.deepEqual(cardNotice(demoDevice(GARAGE), data.firmware, { ...admin, lang: "ko" }), { kind: "fw", text: "OTA · 다시 연결 중", live: true });
  assert.deepEqual(cardNotice(demoDevice(OFFICE), data.firmware, admin), { kind: "fw", text: "Firmware update → 1.0.111", live: false });
  assert.deepEqual(cardNotice(demoDevice(LIVING), data.firmware, admin), { kind: "none", text: "", live: false });
  assert.deepEqual(cardNotice({ ...demoDevice(OFFICE), online: false }, data.firmware, admin), { kind: "offline", text: "", live: false });
  const downgrade = { ...demoDevice(LIVING), firmware_action: "downgrade", firmware_target: { version: "1.0.110", kind: "official" } };
  assert.equal(cardNotice(downgrade, data.firmware, admin).text, "Firmware downgrade → 1.0.110");
  // A finished job leaves the notice alone; an unknown state is shown as sent.
  const done = { jobs: [{ mac: OFFICE, state: "FAILED_DOWNLOAD", queued_at: 1, updated_at: 2 }] };
  assert.equal(cardNotice(demoDevice(OFFICE), done, admin).text, "Firmware update → 1.0.111");
  const odd = { jobs: [{ mac: OFFICE, state: "ROLLING_BACK", queued_at: 1, updated_at: 2 }] };
  assert.equal(cardNotice(demoDevice(OFFICE), odd, admin).text, "OTA · ROLLING_BACK");
  // An action this page does not know is no update.
  assert.equal(cardNotice({ ...demoDevice(LIVING), firmware_action: "weird" }, data.firmware, admin).kind, "none");
  // A guest view has no firmware parts.
  assert.deepEqual(cardNotice(demoDevice(OFFICE), data.firmware, { ...admin, authenticated: false }), { kind: "none", text: "", live: false });
  assert.deepEqual(cardNotice({ ...demoDevice(OFFICE), online: false }, data.firmware, { ...admin, authenticated: false }), { kind: "offline", text: "", live: false });
});

test("pickAlert shows a failure before the warning of an open two-press action", () => {
  const warn = { kind: "warn", keys: ["purge_warn"], vars: { name: "Guest Room" } };
  const bad = { kind: "bad", keys: ["action_failed"], vars: { msg: "boom" } };
  const ok = { kind: "ok", keys: ["restore_done"], vars: { name: "Guest Room" } };
  // A permanent delete that failed leaves the word box open, so its warning is still due; the failure must stay in view.
  assert.equal(pickAlert(warn, bad), bad);
  assert.equal(pickAlert(null, bad), bad);
  // A warning that is due replaces a result that is only news.
  assert.equal(pickAlert(warn, ok), warn);
  assert.equal(pickAlert(warn, null), warn);
  assert.equal(pickAlert(null, ok), ok);
  assert.equal(pickAlert(null, null), null);
  assert.equal(pickAlert(undefined, undefined), null);
  // The pages choose their line with it.
  for (const name of ["dashboard.mjs"]) assert.match(staticFile(name), /\bpickAlert\(/, name);
});

test("intervalUnit picks seconds or minutes", () => {
  assert.deepEqual(intervalUnit(10), { key: "unit_s", n: 10 });
  assert.deepEqual(intervalUnit(15), { key: "unit_s", n: 15 });
  assert.deepEqual(intervalUnit(60), { key: "unit_min", n: 1 });
  assert.deepEqual(intervalUnit(120), { key: "unit_min", n: 2 });
  assert.deepEqual(intervalUnit(1800), { key: "unit_min", n: 30 });
  assert.deepEqual(intervalUnit(90), { key: "unit_s", n: 90 });
  for (const n of [10, 15, 30, 60, 120, 300, 600, 1800]) {
    for (const lang of ["en", "ko"]) assert.ok(STRINGS[lang][intervalUnit(n).key], `${lang} ${n}`);
  }
});

test("fmtAgo counts up in English in both languages", () => {
  const now = 10_000;
  assert.equal(fmtAgo(now - 12.9, now), "12 s ago");
  assert.equal(fmtAgo(now, now), "0 s ago");
  assert.equal(fmtAgo(now + 5, now), "0 s ago");
  assert.equal(fmtAgo(now - 59, now), "59 s ago");
  assert.equal(fmtAgo(now - 60, now), "1 min ago");
  assert.equal(fmtAgo(now - 3599, now), "59 min ago");
  assert.equal(fmtAgo(now - 3600, now), "1 h ago");
  assert.equal(fmtAgo(now - 86399, now), "23 h ago");
  assert.equal(fmtAgo(now - 86400 * 3, now), "3 d ago");
  for (const bad of [null, undefined, "", "x", NaN]) assert.equal(fmtAgo(bad, now), NA, String(bad));
  assert.equal(fmtAgo("9990", now), "10 s ago");
});

// ---- Texts of the device window and the hidden section ----

const WINDOW_KEYS = [
  "device_settings", "dw_measure", "hidden_title", "fw_job_notice", "lock_mask",
  "close", "dw_fw_current", "dw_fw_match", "dw_job", "dw_locked", "dw_offline", "dw_not_ready", "dw_auto_prepare",
  "dw_port80", "pc_return", "dw_ota_update", "dw_ota_downgrade", "dw_ota_reflash", "dw_ota_custom", "dw_ota_queued",
  "dw_voltage", "dw_rssi", "dw_interval", "dw_measure_note", "dw_apply",
  "lock_reread", "lock_status", "lock_stale", "lock_note", "lock_reread_ok",
  "lock_err_busy", "lock_err_channel_quarantined", "lock_err_device_timeout", "lock_err_state_unresolved",
  "lock_err_invalid_device_mask", "lock_err_observed_mismatch", "lock_err_indeterminate",
  "hidden_note", "hidden_kept", "restore", "purge", "purge_warn", "purge_type", "purge_do", "purge_cancel", "restore_done", "purge_done",
];

test("the device window and hidden section texts exist in EN and KR", () => {
  for (const key of WINDOW_KEYS) {
    for (const lang of ["en", "ko"]) assert.ok(STRINGS[lang][key], `${lang}.${key}`);
    // Whatever is not one of the English-only titles is translated.
    if (!ENGLISH_ONLY.includes(key)) {
      assert.match(STRINGS.ko[key], /\p{Script=Hangul}/u, key);
      assert.notEqual(STRINGS.ko[key], STRINGS.en[key], key);
    }
  }
  assert.equal(t("en", "hidden_kept", { kwh: "3.50 kWh" }), "Kept 3.50 kWh");
  assert.match(t("ko", "hidden_kept", { kwh: "3.50 kWh" }), /3\.50 kWh/);
  assert.match(t("en", "purge_warn", { name: "Guest Room" }), /Guest Room/);
  assert.match(t("ko", "purge_warn", { name: "Guest Room" }), /Guest Room/);
});

test("DEVICE SETTINGS, MEASUREMENT, CHILD LOCK, HIDDEN DEVICES and the job notice read the same in EN and KR", () => {
  for (const [key, want] of [
    ["device_settings", "Device settings"], ["dw_measure", "Measurement"], ["lock", "Child lock"], ["hidden_title", "Hidden devices"],
    ["fw_job_notice", "OTA · {state}"], ["lock_mask", "Mask {n}"],
  ]) {
    assert.ok(ENGLISH_ONLY.includes(key), key);
    assert.equal(STRINGS.en[key], want, key);
    assert.equal(STRINGS.ko[key], want, key);
  }
});

test("the device window's FIRMWARE section has its own line for the TCP 80 note, below the match note", () => {
  const html = staticFile("dashboard.html");
  const match = html.indexOf('data-f="fwNote"');
  const port = html.indexOf('data-f="fwPort"');
  const job = html.indexOf('data-f="job"');
  assert.ok(match !== -1 && port > match && port < job, "the note sits in the FIRMWARE section before the job row");
  assert.match(html, /<p class="note" data-f="fwPort" hidden><\/p>/);
  const src = staticFile("dashboard.mjs");
  assert.match(src, /setText\(f\.fwPort, m\.pcTool \? t\(lang, "dw_port80"\) : ""\)/);
  assert.match(src, /setHidden\(f\.fwPort, !m\.pcTool\)/);
  assert.match(src, /const noteKey = fwNoteKey\(fw, target, m\.pcTool\);/);
  // The button follows deviceFirmware's canUpdate, which is off for a strip below 1.0.111.
  assert.match(src, /const can = controls && fw\.canUpdate;/);
});

test("the install guide names every button of the permanent delete as the screen shows it", () => {
  const guide = (name) => readFileSync(new URL(`../../docs/${name}`, import.meta.url), "utf-8");
  for (const [file, lang] of [["install.md", "en"], ["install.ko.md", "ko"]]) {
    const text = guide(file);
    const line = text.split("\n").find((l) => l.includes(`**${STRINGS[lang].purge}**`));
    assert.ok(line, `${file} names ${STRINGS[lang].purge}`);
    // The last button, which stays off until DELETE is typed.
    assert.ok(line.includes(`**${STRINGS[lang].purge_do}**`), `${file} names ${STRINGS[lang].purge_do}`);
    assert.ok(line.includes("`DELETE`"), `${file} names the word`);
  }
});

test("the install guide quotes the update-all mark and the update button's state for a strip below 1.0.111", () => {
  const guide = (name) => readFileSync(new URL(`../../docs/${name}`, import.meta.url), "utf-8");
  for (const [file, lang] of [["install.md", "en"], ["install.ko.md", "ko"]]) {
    const text = guide(file);
    assert.ok(text.includes(`"${STRINGS[lang].fw_all_pc}"`), `${file} quotes ${STRINGS[lang].fw_all_pc}`);
    assert.ok(text.includes(`**${lang === "en" ? "Update all" : "모두 순차 업데이트"}**`), `${file} names the update-all button`);
  }
});

test("the hide texts point to the hidden devices section", () => {
  for (const lang of ["en", "ko"]) {
    for (const key of ["hide_hint", "hide_note"]) assert.doesNotMatch(STRINGS[lang][key], /Settings|설정 화면/, `${lang}.${key}`);
  }
  assert.match(STRINGS.en.hide_note, /hidden/i);
  assert.match(STRINGS.ko.hide_note, /HIDDEN DEVICES/);
});

// ---- Pages ----

test("dashboard and log page no longer point at tuo.html", () => {
  for (const name of ["dashboard.html", "dashboard.mjs", "logview.html"]) {
    assert.ok(!staticFile(name).includes("tuo.html"), name);
  }
  const dashboard = staticFile("dashboard.html");
  // The top bar, and the "Open settings" links of the summary cards (the demo keeps ?demo).
  assert.match(dashboard, /<a class="tool" href="settings\.html" data-demo-href="settings\.html\?demo"/);
  assert.match(dashboard, /href="settings\.html#mqtt" data-demo-href="settings\.html\?demo#mqtt"/);
  assert.match(dashboard, /href="settings\.html#firmware" data-demo-href="settings\.html\?demo#firmware"/);
  assert.match(staticFile("logview.html"), /<a class="tool" href="settings\.html" data-demo-href="settings\.html\?demo"/);
  assert.equal(dashboard.match(/data-demo-href="settings\.html\?demo#(mqtt|firmware)"/g).length, 2);
});

test("every text key of the dashboard page exists in the string table", () => {
  const html = staticFile("dashboard.html");
  const keys = new Set([...html.matchAll(/data-i18n(?:-title)?="([^"]+)"/g)].map((m) => m[1]));
  const js = staticFile("dashboard.mjs");
  for (const m of js.matchAll(/\bt\((?:page\.)?lang,\s*"([a-z_0-9]+)"/g)) keys.add(m[1]);
  for (const m of js.matchAll(/\blabel: "([a-z_0-9]+)"/g)) keys.add(m[1]); // button labels
  for (const m of js.matchAll(/\bkeys: \[([^\]]*)\]/g)) for (const k of m[1].matchAll(/"([a-z_0-9]+)"/g)) keys.add(k[1]); // alert lines
  assert.ok(keys.size > 40, `scan found ${keys.size} keys`);
  for (const key of keys) assert.ok(key in STRINGS.en, `dashboard uses ${key}`);
  for (const key of ["device_settings", "dw_measure", "hidden_title", "lock", "close", "restore", "purge"]) assert.ok(keys.has(key), `scan found ${key}`);
});

test("the card's bottom row has DEVICE SETTINGS on the left and HIDE DEVICE on the right, the same size", () => {
  const card = staticFile("dashboard.html").match(/<div class="card-tools">[\s\S]*?<\/div>/)[0];
  const opener = card.indexOf('data-act="open-window"');
  const hide = card.indexOf('data-act="hide"');
  assert.ok(opener !== -1 && hide !== -1 && opener < hide, "DEVICE SETTINGS comes before HIDE DEVICE");
  assert.match(card, /data-i18n="device_settings"/);
  const css = staticFile("dashboard.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.card-tools\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  // The firmware notice of the card opens the window instead of linking away.
  assert.match(staticFile("dashboard.html"), /<button[^>]*class="notice-fw"[^>]*data-act="open-window"/);
});

test("the device window is a dialog with a close button, and the hidden devices a details section", () => {
  const html = staticFile("dashboard.html");
  assert.match(html, /<dialog[^>]*id="device-dialog"[^>]*aria-labelledby="dw-title"/);
  assert.match(html, /id="dw-title"[^>]*data-i18n="device_settings"/);
  assert.match(html, /data-act="dw-close"/);
  for (const act of ["dw-ota", "dw-apply", "dw-reread"]) assert.match(html, new RegExp(`data-act="${act}"`), act);
  assert.match(html, /<details[^>]*id="hidden-section"[^>]*hidden/);
  for (const act of ["restore", "purge", "purge-do", "purge-cancel"]) assert.match(html, new RegExp(`data-act="${act}"`), act);
  const js = staticFile("dashboard.mjs");
  assert.match(js, /\.showModal\(\)/);
  for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "confirm(", "prompt("]) assert.ok(!js.includes(sink), sink);
});
