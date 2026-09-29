import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const core = await import(new URL("../../mttl_w01/backend/static/dashboard-core.mjs", import.meta.url));
const {
  STRINGS, t, pickLang, resolveTheme, normalizeMac,
  fmtWatts, fmtKwh, fmtTemp, fmtVolt, fmtRssi,
  cardModel, demoResponse, demoHa, summaryModel, fmtMac, apkUrl, apkUrlForHost,
} = core;

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/api_devices_guest.json", import.meta.url), "utf-8"),
);
const DASH = "–";

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

test("formatters show dash for missing values", () => {
  for (const fmt of [fmtWatts, fmtKwh, fmtTemp, fmtVolt, fmtRssi]) {
    for (const missing of [null, undefined, NaN, "", "abc"]) {
      assert.equal(fmt(missing), DASH, `${fmt.name}(${String(missing)})`);
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

test("cardModel fills four outlets", () => {
  const empty = cardModel({ mac: "0a1b2c3d4e5f", online: true, channels: [] }, { authenticated: true, lang: "en" });
  assert.equal(empty.outlets.length, 4);
  for (const [i, o] of empty.outlets.entries()) {
    assert.equal(o.n, i + 1);
    assert.equal(o.on, null);
    assert.equal(o.name, `Outlet ${i + 1}`);
    assert.equal(o.w, DASH);
    assert.equal(o.kwh, DASH);
    assert.equal(o.temp, DASH);
  }
  assert.equal(empty.totalW, DASH);
  assert.equal(empty.totalKwh, DASH);

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
  assert.equal(offlineOpen.controls, false);
  assert.equal(offlineOpen.editable, true);
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
