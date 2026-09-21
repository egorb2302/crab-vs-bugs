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

const TILE_PAL = {
  L: "#a7f070", G: "#38b764", t: "#257179",
  p: "#4b3d63", q: "#392d4f", l: "#63527f",
  s: "#dfe7ee", S: "#8093ab",
};

const tileGrass = fromGrid("tile.grass", [
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
], TILE_PAL);

const tileDirt = fromGrid("tile.dirt", [
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
], TILE_PAL);

const tileSpikes = fromGrid("tile.spikes", [
  ...Array(8).fill("................"),
  "...sS......sS...",
  "...sS......sS...",
  "..ssSS....ssSS..",
  "..ssSS....ssSS..",
  ".sssSSS..sssSSS.",
  ".sssSSS..sssSSS.",
  "ssssSSSSssssSSSS",
  "ssssSSSSssssSSSS",
], TILE_PAL);

// frames: 0 grass, 1 dirt, 2 spikes
const tileSheet = sheet([tileGrass, tileDirt, tileSpikes]);

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

// tileable hill silhouettes: integer sine frequencies over the strip width
function hills(w, h, color, base, waves) {
  const img = new Img(w, h);
  for (let x = 0; x < w; x++) {
    let top = base;
    for (const [amp, freq, phase] of waves) top += amp * Math.sin((x / w) * Math.PI * 2 * freq + phase);
    img.fill(x, Math.round(top), 1, h, color);
  }
  return img;
}

const hillsFar = hills(320, 96, C.hillFar, 34, [[16, 2, 0.4], [7, 5, 1.9], [3, 11, 0.7]]);
const hillsNear = hills(320, 64, C.hillNear, 30, [[10, 3, 2.2], [6, 7, 0.3], [2, 13, 1.1]]);

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
save("sprites/tiles.png", tileSheet);
save("sprites/flag.png", flagSheet);
save("sprites/hills-far.png", hillsFar);
save("sprites/hills-near.png", hillsNear);
save("sprites/moon.png", moonImg);

const favicon = new Img(64, 64);
favicon.blit(crabIdle1.crop(0, 2, 16, 14), 0, 4, 4);
save("favicon.png", favicon);
save("og.png", ogImage());

// optional upscaled contact sheet for eyeballing the art
const previewAt = process.argv.indexOf("--preview");
if (previewAt !== -1) {
  const dir = process.argv[previewAt + 1];
  const S = 8;
  const rows = [crabSheet, bugSheet, coinSheet, tileSheet, flagSheet];
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
