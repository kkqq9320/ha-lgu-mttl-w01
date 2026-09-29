// QR code encoder for the dashboard's app-download card (ISO/IEC 18004).
// Byte mode, error correction level M, versions 1-10. No DOM access; dashboard.mjs draws the result.

export const MAX_VERSION = 10;

// Level M: error correction codewords per block and [block count, data codewords per block] groups.
const BLOCKS_M = [
  null,
  { ec: 10, groups: [[1, 16]] },
  { ec: 16, groups: [[1, 28]] },
  { ec: 26, groups: [[1, 44]] },
  { ec: 18, groups: [[2, 32]] },
  { ec: 24, groups: [[2, 43]] },
  { ec: 16, groups: [[4, 27]] },
  { ec: 18, groups: [[4, 31]] },
  { ec: 22, groups: [[2, 38], [2, 39]] },
  { ec: 22, groups: [[3, 36], [2, 37]] },
  { ec: 26, groups: [[4, 43], [1, 44]] },
];

// Alignment pattern center coordinates per version.
const ALIGNMENT = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// ---- GF(256) arithmetic, primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 ----

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/** Generator polynomial (x - a^0)(x - a^1)...(x - a^(degree-1)), highest coefficient first. */
function generator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Reed-Solomon error correction codewords for one block. */
export function rsEncode(data, degree) {
  const gen = generator(degree);
  const rem = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem.shift();
    rem.push(0);
    for (let j = 0; j < degree; j++) rem[j] ^= gfMul(gen[j + 1], factor);
  }
  return rem;
}

// ---- Data codewords ----

function dataCapacity(version) {
  return BLOCKS_M[version].groups.reduce((sum, [count, size]) => sum + count * size, 0);
}

function countBits(version) {
  return version < 10 ? 8 : 16;
}

function pickVersion(byteCount) {
  for (let v = 1; v <= MAX_VERSION; v++) {
    if (4 + countBits(v) + 8 * byteCount <= dataCapacity(v) * 8) return v;
  }
  throw new RangeError(`QR text is too long: ${byteCount} bytes (version ${MAX_VERSION}-M holds 213)`);
}

function dataCodewords(bytes, version) {
  const capacity = dataCapacity(version);
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, countBits(version));
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacity * 8 - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);
  const words = [];
  for (let i = 0; i < bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));
  for (let pad = 0xec; words.length < capacity; pad ^= 0xec ^ 0x11) words.push(pad);
  return words;
}

/** Split into blocks, add error correction, and interleave. */
function finalCodewords(data, version) {
  const { ec, groups } = BLOCKS_M[version];
  const blocks = [];
  let pos = 0;
  for (const [count, size] of groups) {
    for (let i = 0; i < count; i++) {
      const block = data.slice(pos, pos + size);
      pos += size;
      blocks.push({ data: block, ec: rsEncode(block, ec) });
    }
  }
  const out = [];
  const longest = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.ec[i]);
  return out;
}

// ---- Matrix ----

/** 15-bit format information for level M (bits 00) and the given mask. */
export function formatBits(mask) {
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

class Grid {
  constructor(size) {
    this.size = size;
    this.dark = Array.from({ length: size }, () => new Array(size).fill(false));
    this.fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  }

  /** A function module (not data): x is the column, y the row. */
  set(x, y, dark) {
    this.dark[y][x] = dark;
    this.fixed[y][x] = true;
  }
}

function drawFormat(grid, mask) {
  const bits = formatBits(mask);
  const bit = (i) => ((bits >>> i) & 1) === 1;
  const n = grid.size;
  for (let i = 0; i <= 5; i++) grid.set(8, i, bit(i));
  grid.set(8, 7, bit(6));
  grid.set(8, 8, bit(7));
  grid.set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) grid.set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) grid.set(n - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) grid.set(8, n - 15 + i, bit(i));
  grid.set(8, n - 8, true); // dark module
}

function drawFunctionPatterns(grid, version) {
  const n = grid.size;
  for (let i = 0; i < n; i++) {
    grid.set(6, i, i % 2 === 0);
    grid.set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        grid.set(x, y, ring !== 2 && ring !== 4);
      }
    }
  }
  const centers = ALIGNMENT[version];
  const last = centers.length - 1;
  centers.forEach((cy, i) => {
    centers.forEach((cx, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) grid.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    });
  });
  drawFormat(grid, 0); // reserves the format area; redrawn once the mask is chosen
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      grid.set(a, b, dark);
      grid.set(b, a, dark);
    }
  }
}

function placeCodewords(grid, words) {
  const n = grid.size;
  const total = words.length * 8;
  let i = 0;
  let upward = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip the vertical timing pattern
    for (let k = 0; k < n; k++) {
      const y = upward ? n - 1 - k : k;
      for (const x of [right, right - 1]) {
        if (grid.fixed[y][x]) continue;
        // Remainder bits after the last codeword stay light.
        grid.dark[y][x] = i < total && ((words[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function masked(grid, mask) {
  const out = new Grid(grid.size);
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      out.fixed[y][x] = grid.fixed[y][x];
      out.dark[y][x] = grid.fixed[y][x] ? grid.dark[y][x] : grid.dark[y][x] !== MASKS[mask](x, y);
    }
  }
  drawFormat(out, mask);
  return out;
}

const FINDER_LIKE = [
  [true, false, true, true, true, false, true, false, false, false, false],
  [false, false, false, false, true, false, true, true, true, false, true],
];

/** Penalty score from the four rules of ISO/IEC 18004 section 7.8.3. */
function penalty(dark) {
  const n = dark.length;
  let score = 0;
  const lines = [];
  for (let y = 0; y < n; y++) lines.push(dark[y]);
  for (let x = 0; x < n; x++) lines.push(dark.map((row) => row[x]));
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) {
        run++;
      } else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    for (let i = 0; i + 11 <= n; i++) {
      if (FINDER_LIKE.some((p) => p.every((v, k) => line[i + k] === v))) score += 40;
    }
  }
  let darkCount = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (dark[y][x]) darkCount++;
      if (x < n - 1 && y < n - 1) {
        const c = dark[y][x];
        if (dark[y][x + 1] === c && dark[y + 1][x] === c && dark[y + 1][x + 1] === c) score += 3;
      }
    }
  }
  score += Math.floor(Math.abs((darkCount * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

/** Full symbol: {version, mask, size, modules}. modules[row][column] is true for dark. No quiet zone. */
export function qrSymbol(text) {
  const bytes = new TextEncoder().encode(String(text));
  const version = pickVersion(bytes.length);
  const grid = new Grid(17 + 4 * version);
  drawFunctionPatterns(grid, version);
  placeCodewords(grid, finalCodewords(dataCodewords(bytes, version), version));
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = masked(grid, mask);
    const score = penalty(candidate.dark);
    if (best === null || score < best.score) best = { mask, score, grid: candidate };
  }
  return { version, mask: best.mask, size: grid.size, modules: best.grid.dark };
}

export function encodeQr(text) {
  return qrSymbol(text).modules;
}
