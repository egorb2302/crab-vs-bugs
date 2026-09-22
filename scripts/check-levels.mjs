// Sanity-checks every map in src/levels.ts before it ever reaches a browser:
// chunk shape, legend, rails, bug patrols, and whether the flag and the coins can
// actually be reached with the jump the crab has.
//
// Run: npm run levels            (add --map to print the maps with a column ruler)
// Needs Node 22.18+ / 24 — the level data is imported straight from TypeScript.

import { LEVELS } from "../src/levels.ts";

const CHUNK_W = 20;
const CHUNK_H = 12;
const LEGEND = " =$^~><@F-|";
const SOLID = "=";
const HAZARDS = "^~";
const BUG_PATROL_TILES = 3;

// What one jump can do: 3 tiles up or 4 across, never both. Falling buys extra drift.
// The flood below stops at 2 tiles up on purpose: a 3-tile climb is possible but pixel-tight,
// so a route that needs one counts as unreachable and gets redesigned.
const maxDx = (dy) => (dy < 0 ? 3 : Math.min(8, 4 + dy));
const MIN_DY = -2;

let failed = false;
const wantMaps = process.argv.includes("--map");

function buildMap(level, err) {
  level.chunks.forEach((chunk, i) => {
    if (chunk.length !== CHUNK_H) err(`chunk ${i} has ${chunk.length} rows, expected ${CHUNK_H}`);
    chunk.forEach((row, r) => {
      if (row.length > CHUNK_W) err(`chunk ${i} row ${r} is ${row.length} wide, max ${CHUNK_W}: "${row}"`);
      for (const ch of row) if (!LEGEND.includes(ch)) err(`chunk ${i} row ${r}: "${ch}" is not in the legend`);
    });
  });
  return Array.from({ length: CHUNK_H }, (_, r) =>
    level.chunks.map((chunk) => (chunk[r] ?? "").padEnd(CHUNK_W)).join(""),
  );
}

function findRails(map, cols, rows, err) {
  const rails = [];
  const stands = new Set(); // cells you can stand on because a plank passes under them

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (map[r][c] !== "-") continue;
      const start = c;
      while (map[r][c + 1] === "-") c++;
      if (c === start) err(`horizontal rail at ${start},${r} is 1 tile long — needs 2+`);
      rails.push({ axis: "x", row: r, from: start, to: c });
      for (let x = start; x <= c; x++) {
        if (map[r - 1]?.[x] === SOLID) err(`rail at row ${r} runs into the ceiling at ${x},${r - 1}`);
        stands.add(`${x},${r - 1}`);
      }
    }
  }

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (map[r][c] !== "|") continue;
      const start = r;
      while (map[r + 1]?.[c] === "|") r++;
      if (r === start) err(`vertical rail at ${c},${start} is 1 tile long — needs 2+`);
      rails.push({ axis: "y", col: c, from: start, to: r });
      for (let y = start; y <= r; y++) {
        // the plank is 2 tiles wide: the column to the right has to be clear all the way
        if (map[y][c + 1] === SOLID) err(`vertical rail at col ${c} is blocked at ${c + 1},${y}`);
        for (const x of [c, c + 1]) stands.add(`${x},${y - 1}`);
      }
    }
  }

  return { rails, stands };
}

function checkLevel(level, index) {
  const errors = [];
  const warnings = [];
  const err = (msg) => errors.push(msg);

  const map = buildMap(level, err);
  const rows = map.length;
  const cols = map[0].length;
  const at = (c, r) => map[r]?.[c] ?? " ";

  const { rails, stands } = findRails(map, cols, rows, err);

  const solid = (c, r) => at(c, r) === SOLID;
  const standable = (c, r) =>
    c >= 0 && c < cols && r >= 0 && r < rows &&
    !solid(c, r) && !HAZARDS.includes(at(c, r)) &&
    (solid(c, r + 1) || stands.has(`${c},${r}`));

  // clear line of travel: up from the start, across at the higher row, down to the target.
  // only solids block — arcing over spikes is the whole point of spikes.
  const clear = (c1, r1, c2, r2) => {
    const top = Math.min(r1, r2);
    for (let r = top; r <= r1; r++) if (solid(c1, r)) return false;
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) if (solid(c, top)) return false;
    for (let r = top; r <= r2; r++) if (solid(c2, r)) return false;
    return true;
  };

  const coins = [];
  const bugs = [];
  let spawn = null;
  let flag = null;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = at(c, r);
      if (ch === "$") coins.push([c, r]);
      else if (ch === "@") {
        if (spawn) err(`more than one spawn (@), second at ${c},${r}`);
        spawn = [c, r];
      } else if (ch === "F") {
        if (flag) err(`more than one flag (F), second at ${c},${r}`);
        flag = [c, r];
      } else if (ch === ">") {
        const walkable = (x) => !"=^~".includes(at(x, r)) && solid(x, r + 1);
        if (!walkable(c)) err(`bug at ${c},${r} has no floor under it`);
        let min = c;
        let max = c;
        while (c - min < BUG_PATROL_TILES && walkable(min - 1)) min--;
        while (max - c < BUG_PATROL_TILES && walkable(max + 1)) max++;
        bugs.push({ c, r, min, max });
        if (max === min) warnings.push(`bug at ${c},${r} is boxed in and cannot patrol`);
      }
    }
  }

  if (!spawn) err("no spawn (@)");
  if (!flag) err("no flag (F)");
  if (spawn && !standable(spawn[0], spawn[1])) err(`spawn at ${spawn} has no floor under it`);
  if (flag && !standable(flag[0], flag[1])) err(`flag at ${flag} has no floor under it`);

  // flood the level with everything the crab can walk, jump or fall onto
  const seen = new Set();
  if (spawn && standable(spawn[0], spawn[1])) {
    const queue = [spawn];
    seen.add(`${spawn[0]},${spawn[1]}`);
    while (queue.length) {
      const [c, r] = queue.pop();
      for (let dy = MIN_DY; dy <= rows; dy++) {
        const span = maxDx(dy);
        for (let dx = -span; dx <= span; dx++) {
          const c2 = c + dx;
          const r2 = r + dy;
          const key = `${c2},${r2}`;
          if (seen.has(key) || !standable(c2, r2) || !clear(c, r, c2, r2)) continue;
          seen.add(key);
          queue.push([c2, r2]);
        }
      }
    }
  }

  // a coin counts as reached if the crab can stand next to it, or pass through it on a jump
  const reachable = (c, r) => {
    for (let dr = 0; dr <= 3; dr++) {
      for (let dc = -2; dc <= 2; dc++) if (seen.has(`${c + dc},${r + dr}`)) return true;
    }
    return false;
  };

  if (flag && !reachable(flag[0], flag[1])) err(`flag at ${flag} cannot be reached from the spawn`);
  for (const [c, r] of coins) if (!reachable(c, r)) warnings.push(`coin at ${c},${r} looks unreachable`);

  const head = `${String(index + 1).padStart(2)}. ${level.name.padEnd(12)} ${String(level.theme).padEnd(7)}` +
    ` ${cols}x${rows}  coins ${String(coins.length).padStart(2)}  bugs ${String(bugs.length).padStart(2)}` +
    `  rails ${rails.length}  reach ${seen.size}`;
  console.log(head);
  for (const w of warnings) console.log(`      warn  ${w}`);
  for (const e of errors) console.log(`      ERROR ${e}`);
  if (errors.length) failed = true;

  if (wantMaps) {
    for (let i = 0; i < level.chunks.length; i++) {
      const from = i * CHUNK_W;
      console.log(`      chunk ${i}  cols ${from}-${from + CHUNK_W - 1}`);
      console.log(`         ${"0    5    10   15   ".slice(0, CHUNK_W)}`);
      map.forEach((row, r) => console.log(`      ${String(r).padStart(2)} ${row.slice(from, from + CHUNK_W)}`));
    }
    for (const b of bugs) console.log(`      bug ${b.c},${b.r} patrols cols ${b.min}-${b.max}`);
    for (const rail of rails) {
      console.log(rail.axis === "x"
        ? `      rail - row ${rail.row}, cols ${rail.from}-${rail.to}`
        : `      rail | col ${rail.col}, rows ${rail.from}-${rail.to}`);
    }
  }
}

console.log(`checking ${LEVELS.length} levels:`);
const ids = new Set();
for (const [i, level] of LEVELS.entries()) {
  if (ids.has(level.id)) {
    console.log(`   ERROR duplicate level id "${level.id}"`);
    failed = true;
  }
  ids.add(level.id);
  checkLevel(level, i);
}

if (failed) {
  console.error("\nlevel check failed");
  process.exit(1);
}
console.log("all good");
