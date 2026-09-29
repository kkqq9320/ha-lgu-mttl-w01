import test from "node:test";
import assert from "node:assert/strict";

const { encodeQr, qrSymbol, rsEncode, formatBits } = await import(
  new URL("../../mttl_w01/backend/static/qr.mjs", import.meta.url)
);

const APK = "http://192.0.2.10:18282/provision-android.apk";

// ISO/IEC 18004 format information for error correction level M, masks 0..7.
const FORMAT_M = [
  0b101010000010010, 0b101000100100101, 0b101111001111100, 0b101101101001011,
  0b100010111111001, 0b100000011001110, 0b100111110010111, 0b100101010100000,
];

// ---- An independent reader, written from the standard rather than from qr.mjs ----

// Level M block layout per version: [EC codewords per block, [blocks, data codewords per block]...].
const BLOCKS_M = {
  1: [10, [1, 16]], 2: [16, [1, 28]], 3: [26, [1, 44]], 4: [18, [2, 32]], 5: [24, [2, 43]],
  6: [16, [4, 27]], 7: [18, [4, 31]], 8: [22, [2, 38], [2, 39]], 9: [22, [3, 36], [2, 37]],
  10: [26, [4, 43], [1, 44]],
};
const ALIGN_CENTERS = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};
const MASKS = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

const GF_EXP = [];
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP.push(x);
    x = x & 0x80 ? ((x << 1) ^ 0x11d) & 0xff : x << 1;
  }
}
const GF_LOG = new Map(GF_EXP.map((v, i) => [v, i]));
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[(GF_LOG.get(a) + GF_LOG.get(b)) % 255]);

function readFormat(m) {
  // Copy 1, most significant bit first: row 8 cols 0-5, (8,7), (8,8), (7,8), col 8 rows 5-0.
  const cells = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  const n = m.length;
  // Copy 2, most significant bit first: col 8 rows n-1 .. n-7, then row 8 cols n-8 .. n-1.
  const cells2 = [];
  for (let r = n - 1; r >= n - 7; r--) cells2.push([r, 8]);
  for (let c = n - 8; c <= n - 1; c++) cells2.push([8, c]);
  const read = (list) => list.reduce((v, [r, c]) => (v << 1) | (m[r][c] ? 1 : 0), 0);
  return [read(cells), read(cells2)];
}

function functionMap(version) {
  const n = 17 + 4 * version;
  const fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const mark = (r0, c0, h, w) => {
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) fn[r][c] = true;
  };
  mark(0, 0, 9, 9); // finder, separator and format (top left)
  mark(0, n - 8, 9, 8); // finder, separator (top right) and format row
  mark(n - 8, 0, 8, 9); // finder, separator (bottom left), format column and dark module
  mark(6, 0, 1, n); // timing row
  mark(0, 6, n, 1); // timing column
  if (version >= 7) {
    mark(0, n - 11, 6, 3);
    mark(n - 11, 0, 3, 6);
  }
  const centers = ALIGN_CENTERS[version];
  for (const r of centers) {
    for (const c of centers) {
      const overlapsFinder = (r < 9 && c < 9) || (r < 9 && c > n - 10) || (r > n - 10 && c < 9);
      if (!overlapsFinder) mark(r - 2, c - 2, 5, 5);
    }
  }
  return fn;
}

function readQr(m) {
  const n = m.length;
  const version = (n - 17) / 4;
  const [f1, f2] = readFormat(m);
  const info = f1 ^ 0b101010000010010;
  const level = info >> 13;
  const mask = (info >> 10) & 7;
  const fn = functionMap(version);
  const bits = [];
  let upward = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let k = 0; k < n; k++) {
      const r = upward ? n - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (!fn[r][c]) bits.push(m[r][c] !== MASKS[mask](r, c) ? 1 : 0);
      }
    }
    upward = !upward;
  }
  const [ec, ...groups] = BLOCKS_M[version];
  const sizes = groups.flatMap(([count, size]) => new Array(count).fill(size));
  const total = sizes.reduce((a, b) => a + b, 0) + ec * sizes.length;
  const words = [];
  for (let i = 0; i < total; i++) words.push(bits.slice(i * 8, i * 8 + 8).reduce((v, b) => (v << 1) | b, 0));
  const blocks = sizes.map(() => []);
  let p = 0;
  for (let i = 0; i < Math.max(...sizes); i++) sizes.forEach((size, b) => { if (i < size) blocks[b].push(words[p++]); });
  for (let i = 0; i < ec; i++) blocks.forEach((blk) => blk.push(words[p++]));
  // Every block's syndromes must be zero.
  for (const blk of blocks) {
    for (let s = 0; s < ec; s++) {
      let acc = 0;
      for (const w of blk) acc = gfMul(acc, GF_EXP[s]) ^ w;
      assert.equal(acc, 0, `syndrome ${s} of a block`);
    }
  }
  const data = blocks.flatMap((blk, b) => blk.slice(0, sizes[b]));
  const dbits = data.flatMap((w) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (w >> i) & 1));
  const take = (len) => dbits.splice(0, len).reduce((v, b) => (v << 1) | b, 0);
  const mode = take(4);
  const count = take(version < 10 ? 8 : 16);
  const bytes = Uint8Array.from({ length: count }, () => take(8));
  return { version, level, mask, formatCopiesAgree: f1 === f2, mode, text: new TextDecoder().decode(bytes) };
}

// ---- Tests ----

test("reed-solomon matches published example", () => {
  // Version 1-M "HELLO WORLD" (alphanumeric) data and error correction codewords from the published example.
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(rsEncode(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test("matrix size and finder patterns", () => {
  const m = encodeQr("HELLO");
  assert.equal(m.length, 21);
  for (const row of m) assert.equal(row.length, 21);
  const n = m.length;
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        assert.equal(m[r0 + r][c0 + c], ring !== 2, `finder at ${r0},${c0} cell ${r},${c}`);
      }
    }
  }
  // Separators are light, timing patterns alternate starting dark.
  for (let i = 0; i < 8; i++) {
    assert.equal(m[7][i], false);
    assert.equal(m[i][7], false);
    assert.equal(m[7][n - 1 - i], false);
    assert.equal(m[n - 8][i], false);
  }
  for (let i = 8; i < n - 8; i++) {
    assert.equal(m[6][i], i % 2 === 0);
    assert.equal(m[i][6], i % 2 === 0);
  }
  assert.equal(m[n - 8][8], true, "dark module");
});

test("format bits for level M", () => {
  for (let mask = 0; mask < 8; mask++) assert.equal(formatBits(mask), FORMAT_M[mask], `mask ${mask}`);
  for (const text of [APK, "HELLO", "x".repeat(100)]) {
    const sym = qrSymbol(text);
    const [f1, f2] = readFormat(sym.modules);
    assert.equal(f1, FORMAT_M[sym.mask], text);
    assert.equal(f2, FORMAT_M[sym.mask], text);
  }
});

test("version grows with length", () => {
  const size = (text) => encodeQr(text).length;
  assert.equal(size("a".repeat(14)), 21); // version 1 holds 14 bytes at level M
  assert.equal(size("a".repeat(15)), 25);
  assert.equal(size(APK), 33); // 45 bytes: version 4
  assert.equal(size("a".repeat(213)), 57); // version 10 limit
  assert.throws(() => encodeQr("a".repeat(214)), RangeError);
  assert.equal(qrSymbol("가".repeat(5)).version, 2); // 15 UTF-8 bytes
  // Version information for version 7 (000111110010010100), bottom-left block.
  const v7 = qrSymbol("a".repeat(110));
  assert.equal(v7.version, 7);
  let bits = 0;
  for (let i = 17; i >= 0; i--) bits = (bits << 1) | (v7.modules[v7.size - 11 + (i % 3)][Math.floor(i / 3)] ? 1 : 0);
  assert.equal(bits, 0b000111110010010100);
});

test("symbols read back to their text", () => {
  const samples = [
    APK, "http://192.0.2.31:18282/provision-android.apk", "HELLO", "a",
    "a".repeat(14), "a".repeat(62), "b".repeat(110), "c".repeat(152), "d".repeat(213),
    "콘센트 설정 앱", "https://example.com/?q=<tag>&x=1",
  ];
  const masks = new Set();
  for (const text of samples) {
    const sym = qrSymbol(text);
    const got = readQr(sym.modules);
    assert.equal(got.level, 0, `level M for ${text.slice(0, 20)}`);
    assert.equal(got.mask, sym.mask);
    assert.equal(got.version, sym.version);
    assert.ok(got.formatCopiesAgree);
    assert.equal(got.mode, 0b0100);
    assert.equal(got.text, text);
    masks.add(sym.mask);
  }
  assert.ok(masks.size > 1, "penalty rules pick different masks for different inputs");
});
