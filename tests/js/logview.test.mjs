import test from "node:test";
import assert from "node:assert/strict";

const {
  LOG_CATEGORIES, LOG_LEVELS, logQuery, filterLogs, fmtLogTime, logLine, logText, demoLogs, logRowKey,
} = await import(new URL("../../mttl_w01/backend/static/dashboard-core.mjs", import.meta.url));

// Row keys produced by backend.py UILogHandler.emit.
const ROW_KEYS = ["category", "level", "logger", "message", "seq", "thread", "ts"];

const row = (seq, level, category, message, ts = 1790682546.5 + seq) => ({
  seq, ts, level, logger: "mttl", category, message, thread: "MainThread",
});

test("logQuery normalizes filters like the backend", () => {
  assert.equal(logQuery({ level: "info", category: "ha", limit: "500" }), "level=INFO&category=ha&limit=500");
  assert.equal(logQuery({ level: "verbose", category: "nope", limit: "x" }), "level=INFO&category=all&limit=300");
  assert.equal(logQuery({ level: "ERROR", category: "all", limit: 5000 }), "level=ERROR&category=all&limit=1000");
  assert.equal(logQuery({ level: "DEBUG", category: "wire", limit: 0 }), "level=DEBUG&category=wire&limit=1");
  assert.deepEqual(LOG_LEVELS, ["DEBUG", "INFO", "WARNING", "ERROR"]);
  assert.ok(LOG_CATEGORIES.includes("all") && LOG_CATEGORIES.includes("childlock"));
});

test("filterLogs mirrors UILogHandler.snapshot", () => {
  const rows = [
    row(1, "DEBUG", "wire", "RX a"),
    row(2, "INFO", "ha", "mqtt connected"),
    row(3, "WARNING", "control", "control busy"),
    row(4, "ERROR", "storage", "DB backup failed"),
    row(5, "INFO", "control", "control confirmed"),
  ];
  const seqs = (opts) => filterLogs(rows, opts).map((r) => r.seq);
  assert.deepEqual(seqs({ level: "DEBUG", category: "all", limit: 300 }), [1, 2, 3, 4, 5]);
  assert.deepEqual(seqs({ level: "INFO", category: "all", limit: 300 }), [2, 3, 4, 5]);
  assert.deepEqual(seqs({ level: "WARNING", category: "all", limit: 300 }), [3, 4]);
  assert.deepEqual(seqs({ level: "INFO", category: "control", limit: 300 }), [3, 5]);
  assert.deepEqual(seqs({ level: "DEBUG", category: "all", limit: 2 }), [4, 5]); // newest rows win
});

test("logLine formats like the Tuo text view", () => {
  const r = row(7, "INFO", "ha", "mqtt connected host=192.0.2.10", 1790682546.5);
  assert.equal(fmtLogTime(1790682546.5, "UTC"), "2026-09-29 11:49:06.500");
  assert.equal(logLine(r, "UTC"), "2026-09-29 11:49:06.500 INFO    [ha] mqtt connected host=192.0.2.10");
  assert.equal(logLine({ ...r, category: null }, "UTC"), "2026-09-29 11:49:06.500 INFO    [other] mqtt connected host=192.0.2.10");
  assert.equal(logText([r, r], "text", "UTC").split("\n").length, 2);
  assert.deepEqual(JSON.parse(logText([r], "json", "UTC")), [r]);
});

test("demo logs look like backend rows", () => {
  const rows = demoLogs();
  assert.ok(rows.length >= 20);
  const levels = new Set(rows.map((r) => r.level));
  for (const level of LOG_LEVELS) assert.ok(levels.has(level), level);
  for (const r of rows) {
    assert.deepEqual(Object.keys(r).sort(), ROW_KEYS);
    assert.ok(LOG_CATEGORIES.includes(r.category) && r.category !== "all", r.category);
  }
  const seqs = rows.map((r) => r.seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));
  assert.equal(new Set(seqs).size, seqs.length);
});

test("logRowKey tells a restarted backend's rows apart", () => {
  // backend.py numbers rows from 1 again after every start, so seq alone repeats.
  const before = [row(1, "INFO", "other", "old run", 1000.25), row(2, "INFO", "ha", "old run", 1001.5)];
  const after = [row(1, "INFO", "other", "new run", 5000.75), row(2, "INFO", "ha", "new run", 5002)];
  const keys = (rows) => new Set(rows.map(logRowKey));
  const shared = [...keys(after)].filter((k) => keys(before).has(k));
  assert.deepEqual(shared, []);
  // The same row read twice keeps its key, so it is not redrawn.
  assert.equal(logRowKey(before[0]), logRowKey({ ...before[0] }));
  assert.notEqual(logRowKey(before[0]), logRowKey({ ...before[0], ts: 1000.5 }));
});
