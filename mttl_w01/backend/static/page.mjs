// Theme, language, demo-link wiring and DOM helpers shared by dashboard.html, logview.html and settings.html.
// The decisions (pickLang, resolveTheme, t) live in dashboard-core.mjs; this module only
// reads and writes the browser state and the page's top-bar controls.
import { t, pickLang, resolveTheme, scriptLang } from "./dashboard-core.mjs";

const THEME_KEY = "mttl.theme";
const LANG_KEY = "mttl.lang";
const THEMES = ["auto", "dark", "light"];

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked inside the HA frame; the choice then lasts for this page only.
  }
}

const savedTheme = storageGet(THEME_KEY);

/** Current choices; `lang` is read by both pages when they build text. */
export const page = {
  lang: pickLang(storageGet(LANG_KEY), navigator.language),
  theme: THEMES.includes(savedTheme) ? savedTheme : "auto",
};

/** Dark-mode setting of the Home Assistant frontend when this page runs in its sidebar frame. */
function haDarkMode() {
  try {
    if (window.parent === window) return undefined;
    const dark = window.parent.document.querySelector("home-assistant")?.hass?.themes?.darkMode;
    return typeof dark === "boolean" ? dark : undefined;
  } catch {
    return undefined;
  }
}

const lightQuery = window.matchMedia("(prefers-color-scheme: light)");

export function applyTheme() {
  document.documentElement.dataset.theme = resolveTheme(page.theme, haDarkMode(), lightQuery.matches);
  const select = document.querySelector("#theme-select");
  if (select) select.value = page.theme;
}

/**
 * Writes text only when it changed and marks the element's language by the text's script,
 * so tracking and font follow the text itself: the same English looks the same in EN and KR.
 */
export function setText(el, value) {
  const text = String(value ?? "");
  if (el.textContent !== text) el.textContent = text;
  const lang = scriptLang(text);
  if (el.lang !== lang) el.lang = lang;
}

// The helpers below write only when the value changed, so a redraw does not touch the page for nothing.

export function setData(el, name, value) {
  if (el.dataset[name] !== value) el.dataset[name] = value;
}

export function setHidden(el, hidden) {
  if (el.hidden !== hidden) el.hidden = hidden;
}

export function setDisabled(el, disabled) {
  if (el.disabled !== disabled) el.disabled = disabled;
}

export function setAttr(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

export function setInput(el, value) {
  const text = String(value ?? "");
  if (el.value !== text) el.value = text;
}

/** The elements marked `data-f` under `root`, by their name. */
export function fieldMap(root) {
  const f = {};
  for (const el of root.querySelectorAll("[data-f]")) f[el.dataset.f] = el;
  return f;
}

/** Fills a <select> with `options` ({value, text}) and picks `current`; rebuilds only when the list changed. */
export function syncOptions(select, options, current) {
  const signature = options.map((o) => `${o.value}\u0000${o.text}`).join("\n");
  if (select.dataset.signature !== signature) {
    select.dataset.signature = signature;
    select.replaceChildren(...options.map((o) => {
      const el = document.createElement("option");
      el.value = o.value;
      el.textContent = o.text;
      return el;
    }));
  }
  if (select.value !== String(current)) select.value = String(current);
}

const lists = new WeakMap();

/** Keeps `container`'s children in the order of `items`, creating and dropping rows by key and never recreating one that stays. */
export function syncList(container, items, keyOf, create, update) {
  let rows = lists.get(container);
  if (!rows) lists.set(container, (rows = new Map()));
  const seen = new Set();
  let prev = null;
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    let el = rows.get(key);
    if (!el) {
      el = create(item);
      rows.set(key, el);
    }
    update(el, item);
    const want = prev ? prev.nextElementSibling : container.firstElementChild;
    if (want !== el) container.insertBefore(el, want);
    prev = el;
  }
  for (const [key, el] of rows) {
    if (!seen.has(key)) {
      el.remove();
      rows.delete(key);
    }
  }
}

/**
 * A button that can be armed by a first press or busy with a request: its state (`data-state`), its label
 * (`label` is a STRINGS key that takes `vars`; armed and busy replace it) and whether it can be pressed.
 */
export function paintButton(btn, { label, vars, can, armed = false, busy = false }) {
  setData(btn, "state", busy ? "busy" : armed ? "armed" : "idle");
  setText(btn, t(page.lang, busy ? "working" : armed ? "press_again" : label, vars));
  setDisabled(btn, !can || busy);
}

/** Static labels: `data-i18n` sets the text, `data-i18n-title` the tooltip and accessible name. */
export function applyStrings(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) setText(el, t(page.lang, el.dataset.i18n));
  for (const el of root.querySelectorAll("[data-i18n-title]")) {
    const label = t(page.lang, el.dataset.i18nTitle);
    el.title = label;
    el.setAttribute("aria-label", label);
  }
}

function applyLang() {
  document.documentElement.lang = page.lang;
  for (const b of document.querySelectorAll("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === page.lang));
  document.querySelector("#lang-group")?.setAttribute("aria-label", t(page.lang, "language"));
  const themeLabel = document.querySelector("#theme-select")?.closest("label");
  if (themeLabel) themeLabel.title = t(page.lang, "theme");
  applyStrings();
}

/**
 * Applies the saved theme and language and wires the theme select and the EN/KR switch.
 * `onLangChange` runs after the static labels are redrawn, for text the page builds itself.
 */
export function initPage({ onLangChange } = {}) {
  applyTheme();
  applyLang();
  lightQuery.addEventListener("change", applyTheme);
  document.querySelector("#theme-select")?.addEventListener("change", (e) => {
    page.theme = THEMES.includes(e.target.value) ? e.target.value : "auto";
    storageSet(THEME_KEY, page.theme);
    applyTheme();
  });
  document.querySelector("#lang-group")?.addEventListener("click", (e) => {
    const lang = e.target.closest("[data-lang]")?.dataset.lang;
    if (!lang || lang === page.lang) return;
    page.lang = lang;
    storageSet(LANG_KEY, lang);
    applyLang();
    onLangChange?.();
  });
}

/** A static preview has no backend routes: in demo mode, links with `data-demo-href` stay inside the demo pages. */
export function useDemoLinks() {
  for (const a of document.querySelectorAll("[data-demo-href]")) a.setAttribute("href", a.dataset.demoHref);
}
