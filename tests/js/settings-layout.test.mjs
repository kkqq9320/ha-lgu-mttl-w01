import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const staticFile = (name) => readFileSync(new URL(`../../mttl_w01/backend/static/${name}`, import.meta.url), "utf-8");
const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The text between the braces of the first `@media <query>` block, or null. */
function mediaBlock(css, query) {
  const at = css.indexOf(`@media ${query}`);
  if (at === -1) return null;
  let depth = 0;
  for (let i = css.indexOf("{", at); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", at) + 1, i);
  }
  return null;
}

/** The declarations of the first innermost rule that has `selector` in its selector list, or null. */
function ruleBody(css, selector) {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].split(",").map((x) => x.replace(/\s+/g, " ").trim()).includes(selector)) return m[2];
  }
  return null;
}

const CARDS = ["firmware", "firmware-files", "polling", "mqtt", "firmware-jobs"];

test("the settings cards are direct cells of one grid, in the order the cards stack on a phone", () => {
  const html = staticFile("settings.html");
  assert.ok(!html.includes("set-col"), "the page has no column wrappers");
  assert.ok(!staticFile("settings.css").includes("set-col"));
  const grid = html.match(/<div class="set-grid">([\s\S]*?)<\/main>/)[1];
  const ids = [...grid.matchAll(/<section class="panel set-card[^"]*" id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["firmware", "firmware-files", "polling", "mqtt", "firmware-jobs"]);
  // One level deep: no <section> of a card sits inside another element of the grid.
  assert.equal([...grid.matchAll(/<section/g)].length, 5);
});

test("on a wide screen the cards sit on a 2x2 grid with the jobs card under it, and a row shares its height", () => {
  const css = withoutComments(staticFile("settings.css"));
  const wide = mediaBlock(css, "(min-width: 1024px)");
  assert.ok(wide, "a block for 1024 px and wider");
  const grid = ruleBody(wide, ".set-grid");
  assert.ok(grid);
  assert.match(grid, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  const areas = grid.match(/grid-template-areas:([^;]*);/)[1].match(/"[^"]*"/g).map((row) => row.replace(/"/g, "").trim().split(/\s+/));
  assert.deepEqual(areas, [["firmware", "polling"], ["files", "mqtt"], ["jobs", "jobs"]]);
  // Cards stretch to the row, so FIRMWARE and POLLING, and FIRMWARE FILES and HOME ASSISTANT MQTT, end at the same line.
  assert.match(grid, /align-items:\s*stretch/);
  for (const [id, area] of [["#firmware", "firmware"], ["#polling", "polling"], ["#firmware-files", "files"], ["#mqtt", "mqtt"], ["#firmware-jobs", "jobs"]]) {
    assert.match(ruleBody(wide, id) ?? "", new RegExp(`grid-area:\\s*${area}\\b`), id);
  }
});

test("on a phone the cards stack at their content height", () => {
  const css = withoutComments(staticFile("settings.css"));
  const base = ruleBody(css, ".set-grid");
  assert.match(base, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(base, /align-items:\s*start/, "a card is not stretched beyond its content");
  assert.ok(!/grid-template-rows|grid-auto-rows:\s*1fr/.test(base), "no equal-height rows below the wide layout");
  const narrow = mediaBlock(css, "(max-width: 1023px)");
  assert.ok(narrow);
  // The stacking order of the settings: firmware, files, jobs, polling, MQTT.
  const order = ["#firmware", "#firmware-files", "#firmware-jobs", "#polling", "#mqtt"].map((id) => Number(/order:\s*(\d+)/.exec(ruleBody(narrow, id) ?? "")?.[1]));
  assert.deepEqual(order, [1, 2, 3, 4, 5]);
});

test("each card has one alert line slot, last in the card, and no other reserved blank space", () => {
  const html = staticFile("settings.html");
  const css = withoutComments(staticFile("settings.css"));
  const cards = Object.fromEntries([...html.matchAll(/<section class="panel set-card[^"]*" id="([^"]+)">([\s\S]*?)<\/section>/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(Object.keys(cards), CARDS);
  for (const id of CARDS) {
    const slots = [...cards[id].matchAll(/class="alert-line"/g)].length;
    // The jobs card has no controls, so it has no line for a result.
    assert.equal(slots, id === "firmware-jobs" ? 0 : 1, id);
    if (slots === 1) assert.match(cards[id], /<div class="alert-line"[\s\S]*?<\/div>\s*$/, `${id}: the line is the last element`);
  }
  // Lovelace is folded under the MQTT buttons, before the line, so the buttons are not pushed away from what follows them.
  assert.ok(cards.mqtt.indexOf("lovelace") !== -1 && cards.mqtt.indexOf("lovelace") < cards.mqtt.indexOf('class="alert-line"'));
  // The hint under the target keeps one line, not two.
  assert.ok(!/min-height:\s*35px/.test(ruleBody(css, ".set-hint") ?? ""));
  const dashboardCss = withoutComments(staticFile("dashboard.css"));
  assert.match(ruleBody(dashboardCss, ".alert-line") ?? "", /min-height:\s*40px/);
});
