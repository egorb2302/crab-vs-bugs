// Generates every image asset of the game from ASCII pixel grids:
//   public/sprites/*.png, public/favicon.png, public/og.png
// Run: npm run assets            (add --preview <dir> to also dump an upscaled contact sheet)
// No dependencies — PNGs are encoded by hand with node:zlib.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");

// ---------------------------------------------------------------- png encoder

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePNG(img) {
  const { w, h, data } = img;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    Buffer.from(data.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- tiny raster

function hex(color) {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

class Img {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }
  set(x, y, rgba) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || rgba[3] === 0) return;
    this.data.set(rgba, (y * this.w + x) * 4);
  }
  get(x, y) {
    const i = (y * this.w + x) * 4;
    return this.data.subarray(i, i + 4);
  }
  fill(x0, y0, w, h, color) {
    const rgba = typeof color === "string" ? hex(color) : color;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, rgba);
  }
  // set() ignores transparent pixels (that's what makes blit skip them), so punching a hole needs its own path
  clear(x0, y0, w, h) {
    for (let y = Math.max(0, y0); y < Math.min(this.h, y0 + h); y++) {
      this.data.fill(0, (y * this.w + Math.max(0, x0)) * 4, (y * this.w + Math.min(this.w, x0 + w)) * 4);
    }
  }
  // nearest-neighbour blit, optional horizontal flip / flat tint (for shadows)
  blit(src, dx, dy, scale = 1, { flipX = false, tint = null } = {}) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const px = src.get(flipX ? src.w - 1 - x : x, y);
        if (px[3] === 0) continue;
        this.fill(dx + x * scale, dy + y * scale, scale, scale, tint ?? [...px]);
      }
    }
  }
  crop(x0, y0, w, h) {
    const out = new Img(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.set(x, y, [...this.get(x0 + x, y0 + y)]);
    return out;
  }
}

function fromGrid(name, rows, palette, w = 16) {
  const img = new Img(w, rows.length);
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${name}: row ${y} is ${row.length} wide, expected ${w}: "${row}"`);
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      if (!palette[ch]) throw new Error(`${name}: unknown palette char "${ch}" in row ${y}`);
      img.set(x, y, hex(palette[ch]));
    });
  });
  return img;
}

function sheet(frames) {
  const out = new Img(frames.reduce((sum, f) => sum + f.w, 0), frames[0].h);
  let x = 0;
  for (const f of frames) {
    out.blit(f, x, 0);
    x += f.w;
  }
  return out;
}

function save(path, img) {
  const file = join(PUBLIC, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePNG(img));
  console.log(`  ${path}  ${img.w}x${img.h}`);
}

// ---------------------------------------------------------------- palette

const C = {
  sky: "#1a1c2c",
  hillFar: "#222644",
  hillNear: "#2b3157",
  star: "#94b0c2",
  white: "#f4f4f4",
};

// ---------------------------------------------------------------- crab
// Own take on the little orange terminal crab: blocky body, slit eyes,
// stubby claws, four legs. 16x16, feet on the bottom row.

const CRAB_PAL = { o: "#d97757", O: "#eca184", d: "#a9522f", "#": "#1a1c2c" };

const CRAB_BODY = [
  "................",
  "................",
  "................",
  "................",
  "...OOOOOOOOOO...",
  "..oooooooooooo..",
  "..oo#oooooo#oo..",
  "o.oo#oooooo#oo.o",
  "oooooooooooooooo",
  "ddoooooooooooodd",
  "..oooooooooooo..",
  "..oooooooooooo..",
  "..dddddddddddd..",
];

const crabFrame = (name, legs, body = CRAB_BODY) => fromGrid(name, [...body, ...legs], CRAB_PAL);

const crabIdle1 = crabFrame("crab.idle1", [
  "...o.o....o.o...",
  "...o.o....o.o...",
  "...d.d....d.d...",
]);

const crabIdle2 = fromGrid("crab.idle2", [
  "................",
  ...CRAB_BODY.slice(0, 13),
  "...o.o....o.o...",
  "...d.d....d.d...",
], CRAB_PAL);

const crabWalkA = crabFrame("crab.walkA", [
  "...o.o....o.o...",
  "...o......o.....",
  "...d......d.....",
]);

const crabWalkB = crabFrame("crab.walkB", [
  "...o.o....o.o...",
  ".....o......o...",
  ".....d......d...",
]);

const crabJump = fromGrid("crab.jump", [
  "................",
  "................",
  "................",
  "...OOOOOOOOOO...",
  "o.oooooooooooo.o",
  "o.oo#oooooo#oo.o",
  "oooo#oooooo#oooo",
  "ddoooooooooooodd",
  "..oooooooooooo..",
  "..oooooooooooo..",
  "..oooooooooooo..",
  "..dddddddddddd..",
  "..o..o....o..o..",
  ".o...o....o...o.",
  ".d...d....d...d.",
  "................",
], CRAB_PAL);

const crabDead = crabFrame("crab.dead", [
  "...o.o....o.o...",
  "...o.o....o.o...",
  "...d.d....d.d...",
], [
  ...CRAB_BODY.slice(0, 5),
  "..o#o#oooo#o#o..",
  "..oo#oooooo#oo..",
  "o.o#o#oooo#o#o.o",
  ...CRAB_BODY.slice(8),
]);

// frames: 0-1 idle, 2-5 walk, 6 jump, 7 dead
const crabSheet = sheet([crabIdle1, crabIdle2, crabWalkA, crabIdle1, crabWalkB, crabIdle1, crabJump, crabDead]);

// ---------------------------------------------------------------- bug (faces left)

const BUG_PAL = { r: "#b13e53", R: "#e0697c", m: "#5d275d", w: "#f4f4f4", a: "#94b0c2", s: "#94b0c2" };

const BUG_BODY = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".......rrrrrr...",
  ".a...rrRRrrrrrr.",
  "..a.rrRrrrrrrrrr",
  "..mmrrrrrrrrrrrr",
  ".mwmrrrrrrrrrrrr",
  ".mmmrrrrrrrrrrrr",
  "..mmmmmmmmmmmmm.",
];

const bugWalk1 = fromGrid("bug.walk1", [
  ...BUG_BODY,
  "...s...s....s...",
  "..s...s....s....",
  "..s...s....s....",
], BUG_PAL);

const bugWalk2 = fromGrid("bug.walk2", [
  ...BUG_BODY,
  "....s...s....s..",
  ".....s...s....s.",
  ".....s...s....s.",
], BUG_PAL);

const bugSquash = fromGrid("bug.squash", [
  ...Array(13).fill("................"),
  "...rrrrrrrrrrr..",
  ".mmrrRRrrrrrrrr.",
  ".mwmmmmmmmmmmmm.",
], BUG_PAL);

// frames: 0-1 walk, 2 squashed
const bugSheet = sheet([bugWalk1, bugWalk2, bugSquash]);

// ---------------------------------------------------------------- coin

const COIN_PAL = { y: "#ffcd75", Y: "#fff6d3", n: "#d08a3c" };
const EMPTY4 = Array(4).fill("................");

const coinFull = fromGrid("coin.full", [
  ...EMPTY4,
  "......yyyy......",
  ".....yYyyyn.....",
  "....yYyyyyyn....",
  "....yYyyyyyn....",
  "....yyyyyyyn....",
  "....yyyyyynn....",
  ".....yyyynn.....",
  "......nnnn......",
  ...EMPTY4,
], COIN_PAL);

const coinHalf = fromGrid("coin.half", [
  ...EMPTY4,
  ".......yy.......",
  "......yYyn......",
  ".....yYyyyn.....",
  ".....yYyyyn.....",
  ".....yyyyyn.....",
  ".....yyyynn.....",
  "......yynn......",
  ".......nn.......",
  ...EMPTY4,
], COIN_PAL);

const coinEdge = fromGrid("coin.edge", [
  ...EMPTY4,
  ...Array(8).fill(".......yn......."),
  ...EMPTY4,
], COIN_PAL);

const coinSheet = sheet([coinFull, coinHalf, coinEdge, coinHalf]);

// ---------------------------------------------------------------- tiles
// One set of grids, one palette per location. Chars: L/G/t surface, p/q/l body,
// s/S spikes (same silver everywhere — a hazard must read as a hazard), w/W/x liquid.

const TILE_PALS = {
  meadow: {
    L: "#a7f070", G: "#38b764", t: "#257179",
    p: "#4b3d63", q: "#392d4f", l: "#63527f",
    w: "#73eff7", W: "#41a6f6", x: "#29366f",
  },
  desert: {
    L: "#ffcd75", G: "#ef7d57", t: "#b13e53",
    p: "#7a4a3a", q: "#5e3a2e", l: "#8f5a46",
    w: "#73eff7", W: "#41a6f6", x: "#29366f",
  },
  cavern: {
    L: "#94b0c2", G: "#566c86", t: "#333c57",
    p: "#2b2f45", q: "#1f2335", l: "#3c4361",
    w: "#73eff7", W: "#41a6f6", x: "#29366f",
  },
  frost: {
    L: "#f4f4f4", G: "#dfe7ee", t: "#94b0c2",
    p: "#465b7d", q: "#36486a", l: "#5a729a",
    w: "#73eff7", W: "#41a6f6", x: "#29366f",
  },
  magma: {
    L: "#7a5560", G: "#5d3a4a", t: "#45283c",
    p: "#2f1e2b", q: "#241722", l: "#8b3a4a",
    w: "#ffcd75", W: "#ef7d57", x: "#b13e53",
  },
};

const SPIKE_PAL = { s: "#dfe7ee", S: "#8093ab" };

const TILE_TOP = [
  "LLLLLLLLLLLLLLLL",
  "GLGGGGLGGGGGLGGG",
  "GGGGGGGGGGGGGGGG",
  "GGtGGGGtGGGtGGGG",
  "tGtttGttGtttGttG",
  "qtqqqtqqtqqqtqqt",
  "pppppppppppppppp",
  "ppplpppppppqpppp",
  "pppppppppppppppp",
  "pqpppppplppppppp",
  "pppppppppppppplp",
  "ppppqppppppppppp",
  "pppppppppqpppppp",
  "plpppppppppppppp",
  "ppppppplpppppqpp",
  "pppppppppppppppp",
];

const TILE_BODY = [
  "pppppppppppppppp",
  "pppqpppppppplppp",
  "pppppppppppppppp",
  "ppppppplpppppppp",
  "pqpppppppppppqpp",
  "pppppppppppppppp",
  "ppppplpppqpppppp",
  "pppppppppppppppp",
  "pplpppppppppplpp",
  "pppppppqpppppppp",
  "pppppppppppppppp",
  "pqppppppppplpppp",
  "pppppplppppppppp",
  "pppppppppppqpppp",
  "ppplpppppppppppp",
  "pppppppppppppppp",
];

const TILE_SPIKES = [
  ...Array(8).fill("................"),
  "...sS......sS...",
  "...sS......sS...",
  "..ssSS....ssSS..",
  "..ssSS....ssSS..",
  ".sssSSS..sssSSS.",
  ".sssSSS..sssSSS.",
  "ssssSSSSssssSSSS",
  "ssssSSSSssssSSSS",
];

// surface of a pool: a bright, restless line, then the body colour
const TILE_LIQUID_TOP = [
  "wwWwwwwwWwwwwWww",
  "WWWwWWWWwWWWWwWW",
  "WWWWWWWWWWWWWWWW",
  "WxWWWWWxWWWWWWWW",
  "xxxxxxxxxxxxxxxx",
  "xxxxWxxxxxxxWxxx",
  ...Array(10).fill("xxxxxxxxxxxxxxxx"),
];

const TILE_LIQUID_BODY = [
  ...Array(3).fill("xxxxxxxxxxxxxxxx"),
  "xxxWxxxxxxxxxxWx",
  ...Array(4).fill("xxxxxxxxxxxxxxxx"),
  "xxxxxxxWxxxxxxxx",
  ...Array(7).fill("xxxxxxxxxxxxxxxx"),
];

// frames: 0 surface, 1 body, 2 spikes, 3 liquid surface, 4 liquid body
function tileSheetFor(name) {
  const pal = { ...TILE_PALS[name], ...SPIKE_PAL };
  return sheet([
    fromGrid(`${name}.top`, TILE_TOP, pal),
    fromGrid(`${name}.body`, TILE_BODY, pal),
    fromGrid(`${name}.spikes`, TILE_SPIKES, pal),
    fromGrid(`${name}.liquidTop`, TILE_LIQUID_TOP, pal),
    fromGrid(`${name}.liquidBody`, TILE_LIQUID_BODY, pal),
  ]);
}

const THEMES = Object.keys(TILE_PALS);
const tileGrass = fromGrid("meadow.top", TILE_TOP, { ...TILE_PALS.meadow, ...SPIKE_PAL }); // used by the OG image

// ---------------------------------------------------------------- moving platform (32x8)

function platformImg() {
  const img = new Img(32, 8);
  img.fill(0, 0, 32, 1, "#dfe7ee");
  img.fill(0, 1, 32, 3, "#8093ab");
  img.fill(0, 4, 32, 2, "#566c86");
  img.fill(0, 6, 32, 1, "#333c57");
  img.fill(2, 7, 28, 1, "#333c57");
  img.fill(1, 2, 2, 2, "#ffcd75"); // bolts, so the plank reads as machinery
  img.fill(29, 2, 2, 2, "#ffcd75");
  return img;
}

// ---------------------------------------------------------------- finish flag (16x32, 2 frames)

const FLAG_PAL = { s: "#dfe7ee", S: "#8093ab", G: "#38b764", t: "#257179", w: "#f4f4f4" };
const POLE = ".......sS.......";

const flagFrame = (name, cloth) => fromGrid(name, [
  ".......ss.......",
  ".......ss.......",
  ...cloth,
  ...Array(32 - 2 - cloth.length - 2).fill(POLE),
  "......ssSS......",
  ".....sssSSS.....",
], FLAG_PAL);

const flag1 = flagFrame("flag.1", [
  ".......sSGGGGGG.",
  ".......sSGGGGwG.",
  ".......sSGwGwGG.",
  ".......sSGGwGGG.",
  ".......sSGGGGGG.",
  ".......sSttttt..",
]);

const flag2 = flagFrame("flag.2", [
  ".......sSGGG....",
  ".......sSGGGGGG.",
  ".......sSGGGGwG.",
  ".......sSGwGwGG.",
  ".......sSGGwGGG.",
  ".......sSGGGttt.",
  ".......sSttt....",
]);

const flagSheet = sheet([flag1, flag2]);

// ---------------------------------------------------------------- background pieces

// tileable silhouettes: integer wave frequencies over the strip width, so the ends match up.
// `tri` swaps the sine for a triangle wave — round dunes vs jagged rock.
function ridge(w, base, waves, tri) {
  const wave = tri ? (t) => (2 / Math.PI) * Math.asin(Math.sin(t)) : Math.sin;
  return Array.from({ length: w }, (_, x) => {
    let top = base;
    for (const [amp, freq, phase] of waves) top += amp * wave((x / w) * Math.PI * 2 * freq + phase);
    return Math.round(top);
  });
}

function hills(w, h, color, base, waves, tri = false) {
  const img = new Img(w, h);
  ridge(w, base, waves, tri).forEach((top, x) => img.fill(x, top, 1, h, color));
  return img;
}

/** Same thing upside down: rock hanging from the top of the screen. */
function ceiling(w, h, color, base, waves, tri = false) {
  const img = new Img(w, h);
  ridge(w, base, waves, tri).forEach((depth, x) => img.fill(x, 0, 1, depth, color));
  return img;
}

// per location: [far colour, far base, far waves, near colour, near base, near waves, jagged?]
const SKYLINES = {
  meadow: [C.hillFar, 34, [[16, 2, 0.4], [7, 5, 1.9], [3, 11, 0.7]], C.hillNear, 30, [[10, 3, 2.2], [6, 7, 0.3], [2, 13, 1.1]], false],
  desert: ["#47204a", 42, [[15, 1, 0.8], [6, 3, 2.4]], "#5b2a50", 34, [[11, 2, 1.4], [5, 5, 0.2]], false],
  cavern: ["#1f2035", 46, [[9, 4, 0.5], [5, 9, 1.2], [3, 17, 2.0]], "#2c2b46", 36, [[8, 6, 1.7], [4, 13, 0.4], [2, 23, 1.0]], true],
  frost: ["#202a55", 34, [[20, 2, 1.1], [7, 4, 2.6]], "#2c3a6d", 28, [[13, 3, 0.2], [6, 6, 1.5]], true],
  magma: ["#3a1b2e", 40, [[17, 1, 1.6], [8, 3, 0.4]], "#55243a", 32, [[11, 2, 2.0], [5, 5, 1.2], [2, 9, 0.6]], false],
};

const hillsFar = hills(320, 96, C.hillFar, 34, [[16, 2, 0.4], [7, 5, 1.9], [3, 11, 0.7]]);
const hillsNear = hills(320, 64, C.hillNear, 30, [[10, 3, 2.2], [6, 7, 0.3], [2, 13, 1.1]]);
const caveCeiling = ceiling(320, 40, "#2c2b46", 16, [[10, 5, 0.9], [6, 11, 2.1], [3, 19, 0.3]], true);

function moon(size) {
  const img = new Img(size, size);
  const r = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - size / 2;
      const dy = y + 0.5 - size / 2;
      if (dx * dx + dy * dy > r * r) continue;
      // lit disc offset to the upper-left leaves a shaded crescent on the lower-right limb
      const lx = dx + r * 0.25;
      const ly = dy + r * 0.25;
      img.set(x, y, hex(lx * lx + ly * ly < r * r * 0.85 ? "#f4f4f4" : "#94b0c2"));
    }
  }
  for (const [cx, cy] of [[8, 7], [13, 12], [7, 14]]) img.fill(cx, cy, 2, 2, "#c4d2dc");
  return img;
}

const moonImg = moon(24);

/** Low desert sun: a flat disc with a brighter core and a couple of haze bands cut out. */
function sun(size) {
  const img = new Img(size, size);
  const r = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - size / 2;
      const dy = y + 0.5 - size / 2;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      img.set(x, y, hex(d2 < r * r * 0.45 ? "#ffcd75" : "#ef7d57"));
    }
  }
  for (const band of [size * 0.6, size * 0.78]) img.clear(0, Math.round(band), size, 1);
  return img;
}

const sunImg = sun(26);

// ---------------------------------------------------------------- og image (1200x630)

const GLYPHS = {
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  5: ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  ".": [".....", ".....", ".....", "..#..", ".....", ".....", "....."],
};

function drawText(img, text, x, y, scale, color) {
  const bold = Math.round(scale * 0.4); // overdraw each cell a bit so strokes read as bold
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (glyph) {
      glyph.forEach((row, gy) => [...row].forEach((bit, gx) => {
        if (bit === "#") img.fill(x + gx * scale, y + gy * scale, scale + bold, scale + bold, color);
      }));
    }
    x += 6 * scale;
  }
  return x;
}

const textWidth = (text, scale) => (text.length * 6 - 1) * scale;

function ogImage() {
  const W = 1200;
  const H = 630;
  const S = 10; // one art pixel = 10 image pixels
  const img = new Img(W, H);
  img.fill(0, 0, W, H, C.sky);

  // deterministic stars
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const big = rnd() > 0.8;
    img.fill(Math.floor(rnd() * 120) * S, Math.floor(rnd() * 40) * S, S * (big ? 1 : 0.5), S * (big ? 1 : 0.5), big ? C.white : C.star);
  }

  img.blit(moonImg, 1045, 25, S / 2);
  img.blit(hillsFar, 0, 250, 4);
  img.blit(hillsNear, 0, 330, 4);

  const groundY = H - 16 * S;
  for (let x = 0; x < W; x += 16 * S) img.blit(tileGrass, x, groundY, S);

  // title: CRAB vs BUGS
  const big = 12;
  const small = 7;
  const total = textWidth("CRAB", big) + textWidth("VS", small) + textWidth("BUGS", big) + 2 * 5 * big;
  let x = Math.round((W - total) / 2);
  const ty = 60;
  const shadow = 8;
  const word = (text, scale, color, dy = 0) => {
    drawText(img, text, x + shadow, ty + dy + shadow, scale, "#0d0e17");
    drawText(img, text, x, ty + dy, scale, color);
    x += textWidth(text, scale) + 5 * big;
  };
  word("CRAB", big, "#d97757");
  word("VS", small, C.white, (7 * big - 7 * small));
  word("BUGS", big, "#b13e53");

  // subtitle: what's actually in there
  const sub = "11 LEVELS . 5 WORLDS";
  const subScale = 5;
  const subX = Math.round((W - textWidth(sub, subScale)) / 2);
  const subY = ty + 7 * big + 26;
  drawText(img, sub, subX + 4, subY + 4, subScale, "#0d0e17");
  drawText(img, sub, subX, subY, subScale, "#ffcd75");

  // actors
  img.blit(crabJump, 250, groundY - 16 * S - 60, S);
  img.blit(bugWalk1, 760, groundY - 16 * S, S);
  for (const [cx, cy] of [[470, 290], [570, 250], [670, 290]]) img.blit(coinFull, cx, cy, S);
  img.blit(flag1, 1010, groundY - 32 * S, S);
  return img;
}

// ---------------------------------------------------------------- write everything

console.log("generating assets:");
save("sprites/crab.png", crabSheet);
save("sprites/bug.png", bugSheet);
save("sprites/coin.png", coinSheet);
save("sprites/flag.png", flagSheet);
save("sprites/platform.png", platformImg());
save("sprites/moon.png", moonImg);
save("sprites/sun.png", sunImg);
save("sprites/cave-ceiling.png", caveCeiling);

// one tile sheet and two hill strips per location
for (const name of THEMES) {
  const [farColor, farBase, farWaves, nearColor, nearBase, nearWaves, tri] = SKYLINES[name];
  save(`sprites/tiles-${name}.png`, tileSheetFor(name));
  save(`sprites/hills-far-${name}.png`, hills(320, 96, farColor, farBase, farWaves, tri));
  save(`sprites/hills-near-${name}.png`, hills(320, 64, nearColor, nearBase, nearWaves, tri));
}

const favicon = new Img(64, 64);
favicon.blit(crabIdle1.crop(0, 2, 16, 14), 0, 4, 4);
save("favicon.png", favicon);
save("og.png", ogImage());

// optional upscaled contact sheet for eyeballing the art
const previewAt = process.argv.indexOf("--preview");
if (previewAt !== -1) {
  const dir = process.argv[previewAt + 1];
  const S = 8;
  const rows = [crabSheet, bugSheet, coinSheet, flagSheet, platformImg(), ...THEMES.map(tileSheetFor)];
  const out = new Img(Math.max(...rows.map((r) => r.w)) * S, rows.reduce((sum, r) => sum + r.h + 2, 0) * S);
  out.fill(0, 0, out.w, out.h, C.sky);
  let y = 0;
  for (const r of rows) {
    out.blit(r, 0, y, S);
    y += (r.h + 2) * S;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "contact-sheet.png"), encodePNG(out));
  console.log(`preview -> ${join(dir, "contact-sheet.png")}`);
}
