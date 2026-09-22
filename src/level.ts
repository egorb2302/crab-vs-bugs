import type { LevelDef } from "./levels";

export const TILE = 16;
export const CHUNK_W = 20; // one chunk ≈ one screen
export const CHUNK_H = 12;

/** How far a bug wanders from its spawn, if a ledge, wall or hazard doesn't stop it sooner. */
const BUG_PATROL_TILES = 3;

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

export interface Bug extends Point {
  minX: number;
  maxX: number;
}

/** A plank that shuttles along the rail drawn in the map. 2 tiles wide, 8px thick. */
export interface Platform {
  x: number;
  y: number;
  axis: "x" | "y";
  min: number;
  max: number;
}

export interface Level {
  cols: number;
  rows: number;
  width: number;
  height: number;
  at(col: number, row: number): string;
  /** solid tiles merged into as few boxes as possible — no seams for the player to snag on */
  solids: Box[];
  /** spikes and liquid: anything that kills on touch */
  hazards: Box[];
  /** tile centres */
  coins: Point[];
  /** bottom-centre of the tile, i.e. where feet go */
  bugs: Bug[];
  platforms: Platform[];
  spawn: Point;
  flag: Point;
}

export const PLATFORM_W = 2 * TILE;
export const PLATFORM_H = 8;

const LEGEND = " =$^~><@F-|";

/** Chunks are 20x12; rows may be written short and are padded with sky. */
function joinChunks(chunks: string[][]): string[] {
  chunks.forEach((chunk, i) => {
    if (chunk.length !== CHUNK_H) throw new Error(`chunk ${i} has ${chunk.length} rows, expected ${CHUNK_H}`);
    chunk.forEach((row, r) => {
      if (row.length > CHUNK_W) throw new Error(`chunk ${i} row ${r} is ${row.length} wide, max ${CHUNK_W}: "${row}"`);
      const bad = [...row].find((ch) => !LEGEND.includes(ch));
      if (bad) throw new Error(`chunk ${i} row ${r}: "${bad}" is not part of the legend`);
    });
  });
  return Array.from({ length: CHUNK_H }, (_, r) => chunks.map((chunk) => chunk[r].padEnd(CHUNK_W)).join(""));
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

/** Rails: a run of `-` is a horizontal track, a run of `|` a vertical one. Both need 2+ tiles. */
function findPlatforms(map: string[]): Platform[] {
  const out: Platform[] = [];
  const rows = map.length;
  const cols = map[0].length;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (map[r][c] !== "-") continue;
      const start = c;
      while (map[r][c + 1] === "-") c++;
      if (c === start) throw new Error(`rail at ${start},${r} is one tile long — a platform needs 2+`);
      out.push({ x: start * TILE, y: r * TILE, axis: "x", min: start * TILE, max: (c - 1) * TILE });
    }
  }

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (map[r][c] !== "|") continue;
      const start = r;
      while (map[r + 1]?.[c] === "|") r++;
      if (r === start) throw new Error(`rail at ${c},${start} is one tile long — a platform needs 2+`);
      out.push({ x: c * TILE, y: start * TILE, axis: "y", min: start * TILE, max: r * TILE });
    }
  }

  return out;
}

export function parseLevel(def: LevelDef): Level {
  const map = joinChunks(def.chunks);
  const rows = map.length;
  const cols = map[0].length;
  const at = (col: number, row: number) => map[row]?.[col] ?? " ";
  const feet = (col: number, row: number): Point => ({ x: col * TILE + TILE / 2, y: (row + 1) * TILE });

  // a bug may step onto a tile if it is free, not a hazard, and has floor under it
  const walkable = (col: number, row: number) => !"=^~".includes(at(col, row)) && at(col, row + 1) === "=";

  const coins: Point[] = [];
  const bugs: Bug[] = [];
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

  if (!spawn || !flag) throw new Error(`level "${def.id}" needs both a spawn (@) and a flag (F)`);

  return {
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    at,
    solids: mergeBoxes(map, "="),
    hazards: [
      // only the lower, wide part of a spike hurts — grazing a tip is forgiven
      ...mergeBoxes(map, "^").map((b) => ({ x: b.x + 3, y: b.y + 9, w: b.w - 6, h: b.h - 9 })),
      // liquid: everything below the surface film
      ...mergeBoxes(map, "~").map((b) => ({ x: b.x, y: b.y + 5, w: b.w, h: b.h - 5 })),
    ],
    coins,
    bugs,
    platforms: findPlatforms(map),
    spawn,
    flag,
  };
}
