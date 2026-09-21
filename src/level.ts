export const TILE = 16;

// The level is a strip of 20x12 chunks (one chunk ≈ one screen), joined left to right.
//
//   =  ground / platform      $  coin       ^  spikes
//   >  bug, patrols           @  player     F  finish flag
//
// Jump budget for must-do jumps: 2 tiles up, 3 tiles across. Anything harder should be an optional coin.
const CHUNKS: string[][] = [
  [
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "             $$$    ",
    "             ===    ",
    "  @     $$          ",
    "====================",
    "====================",
  ],
  [
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "        $$          ",
    "       $  $         ",
    "   >                ",
    "========  ==========",
    "========  ==========",
  ],
  [
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "          $$        ",
    "          ==        ",
    "    ^^    ==    >   ",
    "====================",
    "====================",
  ],
  [
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "         $$$        ",
    "     $   ===   $    ",
    "                    ",
    "    ===       ===   ",
    "                    ",
    "===              ===",
    "===              ===",
  ],
  [
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "         $ $ $      ",
    "           >        ",
    "       =========    ",
    "                    ",
    "   ==               ",
    "          >         ",
    "====================",
    "====================",
  ],
  [
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "              $     ",
    "          $  ===    ",
    "      $  ===        ",
    "  $  ===            ",
    " ==                 ",
    "    ^^^^^^^^^^^^^   ",
    "====================",
    "====================",
  ],
  [
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "           $        ",
    "      $       $     ",
    "          ===       ",
    "     ===            ",
    "                    ",
    "===             ====",
    "===             ====",
  ],
  [
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "                    ",
    "    $   $   $       ",
    "                    ",
    "    >      >     F  ",
    "====================",
    "====================",
  ],
];

const BUG_PATROL_TILES = 3; // how far a bug wanders from its spawn, if nothing stops it sooner

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Level {
  cols: number;
  rows: number;
  width: number;
  height: number;
  at(col: number, row: number): string;
  /** solid tiles merged into as few boxes as possible — no seams for the player to snag on */
  solids: Box[];
  spikes: Box[];
  /** tile centres */
  coins: Point[];
  /** bottom-centre of the tile, i.e. where feet go */
  bugs: (Point & { minX: number; maxX: number })[];
  spawn: Point;
  flag: Point;
}

function joinChunks(chunks: string[][]): string[] {
  const rows = chunks[0].length;
  chunks.forEach((chunk, i) => {
    const width = chunk[0].length;
    if (chunk.length !== rows || chunk.some((row) => row.length !== width)) {
      throw new Error(`level chunk ${i} is not a clean ${width}x${rows} block`);
    }
  });
  return Array.from({ length: rows }, (_, r) => chunks.map((chunk) => chunk[r]).join(""));
}

// horizontal runs of `ch`, then runs with identical extents in consecutive rows fused vertically
function mergeBoxes(map: string[], ch: string): Box[] {
  const boxes: Box[] = [];
  let open = new Map<string, Box>();
  map.forEach((row, r) => {
    const next = new Map<string, Box>();
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== ch) continue;
      const start = c;
      while (row[c + 1] === ch) c++;
      const key = `${start}:${c}`;
      const above = open.get(key);
      if (above) {
        above.h += TILE;
        next.set(key, above);
      } else {
        const box = { x: start * TILE, y: r * TILE, w: (c - start + 1) * TILE, h: TILE };
        boxes.push(box);
        next.set(key, box);
      }
    }
    open = next;
  });
  return boxes;
}

export function parseLevel(): Level {
  const map = joinChunks(CHUNKS);
  const rows = map.length;
  const cols = map[0].length;
  const at = (col: number, row: number) => map[row]?.[col] ?? " ";
  const feet = (col: number, row: number): Point => ({ x: col * TILE + TILE / 2, y: (row + 1) * TILE });

  // a bug may step onto a tile if it is free, not spiked, and has floor under it
  const walkable = (col: number, row: number) => at(col, row) !== "=" && at(col, row) !== "^" && at(col, row + 1) === "=";

  const coins: Point[] = [];
  const bugs: Level["bugs"] = [];
  let spawn: Point | undefined;
  let flag: Point | undefined;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = at(c, r);
      if (ch === "$") coins.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
      else if (ch === "@") spawn = feet(c, r);
      else if (ch === "F") flag = feet(c, r);
      else if (ch === ">") {
        let min = c;
        let max = c;
        while (c - min < BUG_PATROL_TILES && walkable(min - 1, r)) min--;
        while (max - c < BUG_PATROL_TILES && walkable(max + 1, r)) max++;
        bugs.push({ ...feet(c, r), minX: feet(min, r).x, maxX: feet(max, r).x });
      }
    }
  }

  if (!spawn || !flag) throw new Error("level needs both a spawn (@) and a flag (F)");

  return {
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    at,
    solids: mergeBoxes(map, "="),
    // only the lower, wide part of a spike hurts — grazing a tip is forgiven
    spikes: mergeBoxes(map, "^").map((b) => ({ x: b.x + 3, y: b.y + 9, w: b.w - 6, h: b.h - 9 })),
    coins,
    bugs,
    spawn,
    flag,
  };
}
