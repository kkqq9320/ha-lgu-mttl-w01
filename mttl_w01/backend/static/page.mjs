// Theme, language and demo-link wiring shared by dashboard.html and logview.html.
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
