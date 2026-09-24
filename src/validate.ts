// Checks one map: chunk shape, legend, rails, bug patrols, and whether the flag and the coins can
// actually be reached with the jump the crab has. The same code runs in `npm run levels` (which
// fails the build on an error) and live in the level editor.
//
// No runtime imports on purpose: scripts/check-levels.mjs loads this file straight into Node.

export const CHUNK_W = 20; // one chunk ≈ one screen
export const CHUNK_H = 12;
export const LEGEND = " =$^~><@F-|";

const SOLID = "=";
const HAZARDS = "^~";
const BUG_PATROL_TILES = 3;

// What one jump can do: 3 tiles up or 4 across, never both. Falling buys extra drift.
// The flood below stops at 2 tiles up on purpose: a 3-tile climb is possible but pixel-tight,
// so a route that needs one counts as unreachable and gets redesigned.
const maxDx = (dy: number) => (dy < 0 ? 3 : Math.min(8, 4 + dy));
const MIN_DY = -2;

export type Cell = [col: number, row: number];

export interface Issue {
  msg: string;
  /** the tile it's about, when there is one */
  at?: Cell;
}

export interface Rail {
  axis: "x" | "y";
  /** the row of a horizontal rail, the column of a vertical one */
  line: number;
  from: number;
  to: number;
}

export interface BugPatrol {
  at: Cell;
  min: number;
  max: number;
}

export interface Report {
  errors: Issue[];
  warnings: Issue[];
  map: string[];
  cols: number;
  rows: number;
  coins: Cell[];
  bugs: BugPatrol[];
  rails: Rail[];
  spawn: Cell | null;
  flag: Cell | null;
  /** every tile the crab can stand on, as "col,row" */
  reach: Set<string>;
}

/** Chunks are 20×12; rows may be written short and are padded with sky. */
export function joinChunks(chunks: string[][], err: (issue: Issue) => void = () => {}): string[] {
  chunks.forEach((chunk, i) => {
    if (chunk.length !== CHUNK_H) err({ msg: `chunk ${i} has ${chunk.length} rows, expected ${CHUNK_H}` });
    chunk.forEach((row, r) => {
      if (row.length > CHUNK_W) err({ msg: `chunk ${i} row ${r} is ${row.length} wide, max ${CHUNK_W}: "${row}"` });
      for (const ch of row) if (!LEGEND.includes(ch)) err({ msg: `chunk ${i} row ${r}: "${ch}" is not in the legend` });
    });
  });
  return Array.from({ length: CHUNK_H }, (_, r) => chunks.map((chunk) => (chunk[r] ?? "").padEnd(CHUNK_W)).join(""));
}

function findRails(map: string[], err: (issue: Issue) => void) {
  const rows = map.length;
  const cols = map[0].length;
  const rails: Rail[] = [];
  const stands = new Set<string>(); // cells you can stand on because a plank passes under them

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (map[r][c] !== "-") continue;
      const start = c;
      while (map[r][c + 1] === "-") c++;
      if (c === start) err({ msg: `horizontal rail at ${start},${r} is 1 tile long — needs 2+`, at: [start, r] });
      rails.push({ axis: "x", line: r, from: start, to: c });
      for (let x = start; x <= c; x++) {
        if (map[r - 1]?.[x] === SOLID) err({ msg: `rail at row ${r} runs into the ceiling at ${x},${r - 1}`, at: [x, r - 1] });
        stands.add(`${x},${r - 1}`);
      }
    }
  }

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (map[r][c] !== "|") continue;
      const start = r;
      while (map[r + 1]?.[c] === "|") r++;
      if (r === start) err({ msg: `vertical rail at ${c},${start} is 1 tile long — needs 2+`, at: [c, start] });
      rails.push({ axis: "y", line: c, from: start, to: r });
      for (let y = start; y <= r; y++) {
        // the plank is 2 tiles wide: the column to the right has to be clear all the way
        if (map[y][c + 1] === SOLID) err({ msg: `vertical rail at col ${c} is blocked at ${c + 1},${y}`, at: [c + 1, y] });
        for (const x of [c, c + 1]) stands.add(`${x},${y - 1}`);
      }
    }
  }

  return { rails, stands };
}

export function validateLevel(chunks: string[][]): Report {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (issue: Issue) => errors.push(issue);
  const warn = (issue: Issue) => warnings.push(issue);

  const map = joinChunks(chunks, err);
  const rows = map.length;
  const cols = map[0]?.length ?? 0;
  const at = (c: number, r: number) => map[r]?.[c] ?? " ";

  const { rails, stands } = cols > 0 ? findRails(map, err) : { rails: [], stands: new Set<string>() };

  const solid = (c: number, r: number) => at(c, r) === SOLID;
  const standable = (c: number, r: number) =>
    c >= 0 &&
    c < cols &&
    r >= 0 &&
    r < rows &&
    !solid(c, r) &&
    !HAZARDS.includes(at(c, r)) &&
    (solid(c, r + 1) || stands.has(`${c},${r}`));

  // clear line of travel: up from the start, across at the higher row, down to the target.
  // only solids block — arcing over spikes is the whole point of spikes.
  const clear = (c1: number, r1: number, c2: number, r2: number) => {
    const top = Math.min(r1, r2);
    for (let r = top; r <= r1; r++) if (solid(c1, r)) return false;
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) if (solid(c, top)) return false;
    for (let r = top; r <= r2; r++) if (solid(c2, r)) return false;
    return true;
  };

  const coins: Cell[] = [];
  const bugs: BugPatrol[] = [];
  let spawn: Cell | null = null;
  let flag: Cell | null = null;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = at(c, r);
      if (ch === "$") coins.push([c, r]);
      else if (ch === "@") {
        if (spawn) err({ msg: `more than one spawn (@), second at ${c},${r}`, at: [c, r] });
        spawn = [c, r];
      } else if (ch === "F") {
        if (flag) err({ msg: `more than one flag (F), second at ${c},${r}`, at: [c, r] });
        flag = [c, r];
      } else if (ch === ">") {
        const walkable = (x: number) => !"=^~".includes(at(x, r)) && solid(x, r + 1);
        if (!walkable(c)) err({ msg: `bug at ${c},${r} has no floor under it`, at: [c, r] });
        let min = c;
        let max = c;
        while (c - min < BUG_PATROL_TILES && walkable(min - 1)) min--;
        while (max - c < BUG_PATROL_TILES && walkable(max + 1)) max++;
        bugs.push({ at: [c, r], min, max });
        if (max === min) warn({ msg: `bug at ${c},${r} is boxed in and cannot patrol`, at: [c, r] });
      }
    }
  }

  if (!spawn) err({ msg: "no spawn (@)" });
  if (!flag) err({ msg: "no flag (F)" });
  if (spawn && !standable(...spawn)) err({ msg: `spawn at ${spawn} has no floor under it`, at: spawn });
  if (flag && !standable(...flag)) err({ msg: `flag at ${flag} has no floor under it`, at: flag });

  // flood the level with everything the crab can walk, jump or fall onto
  const reach = new Set<string>();
  if (spawn && standable(...spawn)) {
    const queue: Cell[] = [spawn];
    reach.add(`${spawn[0]},${spawn[1]}`);
    while (queue.length) {
      const [c, r] = queue.pop()!;
      for (let dy = MIN_DY; dy <= rows; dy++) {
        const span = maxDx(dy);
        for (let dx = -span; dx <= span; dx++) {
          const c2 = c + dx;
          const r2 = r + dy;
          const key = `${c2},${r2}`;
          if (reach.has(key) || !standable(c2, r2) || !clear(c, r, c2, r2)) continue;
          reach.add(key);
          queue.push([c2, r2]);
        }
      }
    }
  }

  // a coin counts as reached if the crab can stand next to it, or pass through it on a jump
  const reachable = (c: number, r: number) => {
    for (let dr = 0; dr <= 3; dr++) {
      for (let dc = -2; dc <= 2; dc++) if (reach.has(`${c + dc},${r + dr}`)) return true;
    }
    return false;
  };

  if (flag && !reachable(...flag)) err({ msg: `flag at ${flag} cannot be reached from the spawn`, at: flag });
  for (const coin of coins) if (!reachable(...coin)) warn({ msg: `coin at ${coin} looks unreachable`, at: coin });

  return { errors, warnings, map, cols, rows, coins, bugs, rails, spawn, flag, reach };
}
