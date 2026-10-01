import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const staticFile = (name) => readFileSync(new URL(`../../mttl_w01/backend/static/${name}`, import.meta.url), "utf-8");

// page.mjs reads the browser at load time; a bare stand-in is enough for the helpers under test.
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), parent: undefined };
globalThis.window.parent = globalThis.window;
const page = await import(new URL("../../mttl_w01/backend/static/page.mjs", import.meta.url));

const HELPERS = ["setData", "setHidden", "setDisabled", "setAttr", "fieldMap", "setInput", "syncOptions", "syncList", "paintButton"];
const PAGE_MODULES = ["dashboard.mjs", "logview.mjs", "settings.mjs"];

/** An element stand-in that counts every write to the properties and attributes under test. */
function fakeElement() {
  const writes = [];
  const attrs = new Map();
  const dataset = {};
  let hidden = false;
  let disabled = false;
  return {
    writes,
    dataset: new Proxy(dataset, { set: (t, k, v) => { writes.push(`data-${String(k)}`); t[k] = v; return true; } }),
    get hidden() { return hidden; },
    set hidden(v) { writes.push("hidden"); hidden = v; },
    get disabled() { return disabled; },
    set disabled(v) { writes.push("disabled"); disabled = v; },
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
    setAttribute: (name, value) => { writes.push(`attr-${name}`); attrs.set(name, value); },
  };
}

test("page.mjs exports the DOM helpers every page uses", () => {
  for (const name of HELPERS) assert.equal(typeof page[name], "function", name);
});

test("the helpers write to the page only when the value changed", () => {
  const el = fakeElement();
  page.setData(el, "state", "ok");
  page.setData(el, "state", "ok");
  page.setData(el, "state", "bad");
  assert.deepEqual(el.writes, ["data-state", "data-state"]);
  assert.equal(el.dataset.state, "bad");

  const hide = fakeElement();
  page.setHidden(hide, false);
  page.setHidden(hide, true);
  page.setHidden(hide, true);
  assert.deepEqual(hide.writes, ["hidden"]);
  assert.equal(hide.hidden, true);

  const off = fakeElement();
  page.setDisabled(off, false);
  page.setDisabled(off, true);
  page.setDisabled(off, true);
  assert.deepEqual(off.writes, ["disabled"]);

  const attr = fakeElement();
  page.setAttr(attr, "title", "a");
  page.setAttr(attr, "title", "a");
  page.setAttr(attr, "title", "b");
  assert.deepEqual(attr.writes, ["attr-title", "attr-title"]);
  assert.equal(attr.getAttribute("title"), "b");
});

test("fieldMap names the elements marked data-f under a root", () => {
  const a = { dataset: { f: "title" } };
  const b = { dataset: { f: "mac" } };
  const root = { querySelectorAll: (sel) => (sel === "[data-f]" ? [a, b] : []) };
  assert.deepEqual(page.fieldMap(root), { title: a, mac: b });
  assert.deepEqual(page.fieldMap({ querySelectorAll: () => [] }), {});
});

test("setInput writes a field's value only when it changed", () => {
  let writes = 0;
  let value = "";
  const input = { get value() { return value; }, set value(v) { writes++; value = v; } };
  page.setInput(input, "a");
  page.setInput(input, "a");
  page.setInput(input, 5);
  page.setInput(input, null);
  assert.equal(writes, 3);
  assert.equal(value, "");
});

test("syncOptions rebuilds a select only when its list changed and picks the current value", () => {
  globalThis.document = { createElement: () => ({}) };
  let rebuilt = 0;
  const select = { dataset: {}, value: "", replaceChildren(...opts) { rebuilt++; this.options = opts; } };
  const list = [{ value: "30", text: "30 s" }, { value: "60", text: "1 min" }];
  page.syncOptions(select, list, 60);
  assert.deepEqual(select.options, [{ value: "30", textContent: "30 s" }, { value: "60", textContent: "1 min" }]);
  assert.equal(select.value, "60");
  page.syncOptions(select, list, 30);
  assert.equal(rebuilt, 1, "the same list is not rebuilt");
  assert.equal(select.value, "30");
  page.syncOptions(select, [...list, { value: "120", text: "2 min" }], 120);
  assert.equal(rebuilt, 2);
  assert.equal(select.value, "120");
  delete globalThis.document;
});

test("syncList keeps the rows that stay, creates the new ones, drops the gone ones and orders them", () => {
  const container = {
    kids: [],
    get firstElementChild() { return this.kids[0] ?? null; },
    insertBefore(el, before) {
      const at = this.kids.indexOf(el);
      if (at !== -1) this.kids.splice(at, 1);
      this.kids.splice(before ? this.kids.indexOf(before) : this.kids.length, 0, el);
      el.parent = this;
    },
  };
  const rowOf = (key) => ({
    key,
    parent: null,
    get nextElementSibling() { return this.parent?.kids[this.parent.kids.indexOf(this) + 1] ?? null; },
    remove() { this.parent.kids.splice(this.parent.kids.indexOf(this), 1); this.parent = null; },
  });
  const made = [];
  const create = (item) => { const el = rowOf(item.id); made.push(item.id); return el; };
  const update = (el, item) => { el.label = item.label; };
  page.syncList(container, [{ id: "a", label: 1 }, { id: "b", label: 1 }, { id: "a", label: 9 }], (i) => i.id, create, update);
  assert.deepEqual(container.kids.map((e) => e.key), ["a", "b"], "a repeated key is one row");
  const rowA = container.kids[0];
  page.syncList(container, [{ id: "c", label: 2 }, { id: "a", label: 2 }], (i) => i.id, create, update);
  assert.deepEqual(container.kids.map((e) => e.key), ["c", "a"]);
  assert.equal(container.kids[1], rowA, "a row that stays is not created again");
  assert.equal(rowA.label, 2);
  assert.deepEqual(made, ["a", "b", "c"]);
  page.syncList(container, [], (i) => i.id, create, update);
  assert.deepEqual(container.kids, []);
});

test("paintButton shows idle, armed and busy and turns the button off while it cannot be pressed", () => {
  page.page.lang = "en"; // the labels are looked up in the page's language
  const btn = { dataset: {}, textContent: "", lang: "", disabled: false };
  page.paintButton(btn, { label: "btn_save", can: true });
  assert.deepEqual([btn.dataset.state, btn.textContent, btn.disabled], ["idle", "Save", false]);
  page.paintButton(btn, { label: "btn_save", can: true, armed: true });
  assert.deepEqual([btn.dataset.state, btn.textContent, btn.disabled], ["armed", "Press again", false]);
  page.paintButton(btn, { label: "btn_save", can: true, armed: true, busy: true });
  assert.deepEqual([btn.dataset.state, btn.textContent, btn.disabled], ["busy", "Working…", true]);
  page.paintButton(btn, { label: "fw_update_all", vars: { n: 3 }, can: false });
  assert.deepEqual([btn.dataset.state, btn.textContent, btn.disabled], ["idle", "Update all (3)", true]);
});

test("the page modules import the DOM helpers from page.mjs and define none of their own", () => {
  for (const mod of PAGE_MODULES) {
    const src = staticFile(mod);
    const imported = src.match(/import \{([^}]*)\} from "\.\/page\.mjs"/)?.[1] ?? "";
    for (const name of HELPERS) {
      assert.ok(!new RegExp(`function ${name}\\b`).test(src), `${mod} defines ${name}`);
      if (new RegExp(`\\b${name}\\(`).test(src)) assert.match(imported, new RegExp(`\\b${name}\\b`), `${mod} does not import ${name}`);
    }
  }
  // The pages really use them (the scan is not looking at nothing).
  assert.match(staticFile("settings.mjs"), /\bsetDisabled\(/);
  assert.match(staticFile("dashboard.mjs"), /\bfieldMap\(/);
  assert.match(staticFile("logview.mjs"), /\bsetHidden\(/);
});

// ---- Parts in dashboard.css ----

const selectorsOf = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(?:^|[}\n])\s*([^{}@][^{}]*)\{/g)].map((m) => m[1].trim());

test("the shared form parts are in dashboard.css, which both pages and the device window load", () => {
  const css = staticFile("dashboard.css");
  for (const part of [
    ".btn-row", ".btn", ".form", ".form-row", ".form-sub", ".note", ".field-err", ".alert-line",
    'button[data-state="armed"]', 'button[data-state="busy"]', "button.action",
  ]) {
    assert.ok(css.includes(part), `dashboard.css has no ${part}`);
  }
  assert.match(css, /@keyframes pulse/);
  for (const kind of ["ok", "warn", "bad"]) assert.match(css, new RegExp(`\\.alert-line\\[data-kind="${kind}"\\]`));
  // The dashboard page does not load the settings stylesheet, so a part there would be missing from the device window.
  assert.ok(!staticFile("dashboard.html").includes("settings.css"));
  assert.ok(staticFile("settings.html").includes('href="dashboard.css"'));
});

test("settings.css holds the layout of the page and its cards, no parts", () => {
  const selectors = selectorsOf(staticFile("settings.css"));
  assert.ok(selectors.length > 20, `scan found ${selectors.length} rules`);
  const parts = /(?:^|[\s,>+~(])(button|input|select|textarea|a)(?=[\s.:\[,{]|$)|\.btn|\.alert-line|\.field|\.form\b|\.form-|\.note\b|\.action|\.hide-btn|\.check\b|\.badge/;
  for (const selector of selectors) assert.ok(!parts.test(selector), `settings.css styles a part: ${selector}`);
  const css = staticFile("settings.css");
  // No colors of its own: they come from the custom properties of dashboard.css.
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "settings.css holds a color value");
  assert.ok(!/rgba?\(/.test(css));
});

test("the settings page and its code use the shared part names", () => {
  for (const name of ["settings.html", "settings.mjs", "settings.css"]) {
    const src = staticFile(name);
    for (const old of ["set-btn", "set-actions", "set-form", "set-note", "set-sub", "set-pulse"]) {
      assert.ok(!src.includes(old), `${name} still uses ${old}`);
    }
  }
  const html = staticFile("settings.html");
  // Primary buttons are the dashboard's .action, delete is its .hide-btn.
  assert.match(html, /class="action"[^>]*data-act="fw-save"/);
  assert.match(html, /class="hide-btn"[^>]*data-act="fw-delete"/);
  assert.match(html, /class="btn-row"/);
});
