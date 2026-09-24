import "@fontsource/press-start-2p/latin-400.css";
import { parseLevel } from "../level";
import { MAX_CHUNKS, NAME_PATTERN, THEME_NAMES, decodeLevel, encodeLevel, levelRows, rowsToChunks } from "../levelcode";
import { LEVELS } from "../levels";
import type { ThemeName } from "../themes";
import { CHUNK_H, CHUNK_W, validateLevel, type Cell, type Report } from "../validate";

// The level editor: a page of its own, no game engine — the map is drawn on a plain canvas with
// the game's sprites, and every change runs the same check `npm run levels` does. The draft is
// kept in this browser; PLAY and SHARE LINK carry the whole map inside the link.

const TILE = 16;
const DRAFT_KEY = "crab-vs-bugs:editor";
const DEFAULT_NAME = "MY LEVEL";

// the same colours as src/themes.ts, which can't load here (it needs the game engine): change both
const LOOK: Record<ThemeName, { label: string; sky: string; underside: string }> = {
  meadow: { label: "MEADOW", sky: "#1a1c2c", underside: "#392d4f" },
  desert: { label: "DUNES", sky: "#5d275d", underside: "#5e3a2e" },
  cavern: { label: "CAVERN", sky: "#0d0e17", underside: "#1f2335" },
  frost: { label: "GLACIER", sky: "#29366f", underside: "#36486a" },
  magma: { label: "FOUNDRY", sky: "#23121e", underside: "#241722" },
};

const TOOLS: [tile: string, label: string][] = [
  ["=", "GROUND"],
  ["$", "COIN"],
  [">", "BUG"],
  ["^", "SPIKES"],
  ["~", "LIQUID"],
  ["@", "START"],
  ["F", "FLAG"],
  ["-", "RAIL ACROSS"],
  ["|", "RAIL DOWN"],
  [" ", "SKY"],
];

interface Draft {
  name: string;
  theme: ThemeName;
  /** CHUNK_H full-width rows; the width is always a whole number of screens */
  rows: string[];
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("map");
const ctx = canvas.getContext("2d")!;
const stage = $<HTMLDivElement>("stage");
const nameInput = $<HTMLInputElement>("name");
const themeSelect = $<HTMLSelectElement>("theme");
const templateSelect = $<HTMLSelectElement>("template");
const palette = $<HTMLDivElement>("palette");
const reportList = $<HTMLUListElement>("report");
const stats = $<HTMLParagraphElement>("stats");
const status = $<HTMLSpanElement>("status");
const buttons = {
  undo: $<HTMLButtonElement>("undo"),
  add: $<HTMLButtonElement>("add"),
  remove: $<HTMLButtonElement>("remove"),
  reach: $<HTMLButtonElement>("reach"),
  play: $<HTMLButtonElement>("play"),
  share: $<HTMLButtonElement>("share"),
  export: $<HTMLButtonElement>("export"),
};

// ---------------------------------------------------------------- the draft

function blank(): Draft {
  const rows = Array.from({ length: CHUNK_H }, () => " ".repeat(2 * CHUNK_W));
  rows[10] = rows[11] = "=".repeat(2 * CHUNK_W);
  rows[9] = "  @" + " ".repeat(34) + "F  ";
  return { name: DEFAULT_NAME, theme: "meadow", rows };
}

const fromLevel = (index: number): Draft => {
  const def = LEVELS[index];
  return { name: def.name, theme: def.theme, rows: levelRows(def) };
};

function loadDraft(): Draft {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null;
    if (saved && isDraft(saved)) return saved;
  } catch {
    // nothing saved, or storage is blocked
  }
  return blank();
}

function isDraft(d: Draft): boolean {
  return (
    typeof d.name === "string" &&
    THEME_NAMES.includes(d.theme) &&
    Array.isArray(d.rows) &&
    d.rows.length === CHUNK_H &&
    d.rows.every((row) => typeof row === "string" && row.length === d.rows[0].length && row.length % CHUNK_W === 0 && row.length > 0)
  );
}

let draft = loadDraft();
let undoStack: string[] = [];
let tool = "=";
let showReach = true;
let report: Report = validateLevel(rowsToChunks(draft.rows));
let hover: Cell | null = null;
let focus: { at: Cell; until: number } | null = null;

const cols = () => draft.rows[0].length;
const levelName = () => draft.name.trim() || DEFAULT_NAME;
const chunks = () => rowsToChunks(draft.rows);

function save() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // the draft just won't outlive the tab
  }
}

function remember() {
  undoStack.push(JSON.stringify(draft));
  if (undoStack.length > 200) undoStack.shift();
}

function undo() {
  const last = undoStack.pop();
  if (!last) return;
  draft = JSON.parse(last) as Draft;
  changed();
}

/** Everything after a change: keep it, re-check it, redraw it. */
function changed() {
  save();
  nameInput.value = draft.name;
  themeSelect.value = draft.theme;
  report = validateLevel(chunks());
  resize();
  showReport();
  draw();
}

function setTile(c: number, r: number, tile: string) {
  const row = draft.rows[r];
  draft.rows[r] = row.slice(0, c) + tile + row.slice(c + 1);
}

function paint(c: number, r: number, tile: string) {
  if (c < 0 || r < 0 || c >= cols() || r >= CHUNK_H || draft.rows[r][c] === tile) return false;
  // one start and one flag: placing one moves it
  if (tile === "@" || tile === "F") {
    draft.rows.forEach((row, y) => {
      for (let x = row.indexOf(tile); x !== -1; x = draft.rows[y].indexOf(tile, x + 1)) setTile(x, y, " ");
    });
  }
  setTile(c, r, tile);
  return true;
}

function addScreen() {
  if (cols() >= MAX_CHUNKS * CHUNK_W) return;
  remember();
  // the floor carries on into the new screen, the rest is sky
  draft.rows = draft.rows.map((row) => row + (row.at(-1) === "=" ? "=" : " ").repeat(CHUNK_W));
  changed();
  stage.scrollLeft = stage.scrollWidth;
}

function removeScreen() {
  if (cols() <= CHUNK_W) return;
  remember();
  draft.rows = draft.rows.map((row) => row.slice(0, -CHUNK_W));
  changed();
}

// ---------------------------------------------------------------- drawing

const images = new Map<string, HTMLImageElement>();
function sprite(name: string) {
  let img = images.get(name);
  if (!img) {
    img = new Image();
    img.src = `sprites/${name}.png`;
    img.onload = () => {
      draw();
      drawPalette();
    };
    images.set(name, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Frame `i` of a horizontal sheet with `frames` frames, bottom-centred on (x, bottom). */
function frame(target: CanvasRenderingContext2D, name: string, frames: number, i: number, x: number, bottom: number) {
  const img = sprite(name);
  if (!img) return;
  const w = img.naturalWidth / frames;
  const h = img.naturalHeight;
  target.drawImage(img, i * w, 0, w, h, Math.round(x - w / 2), bottom - h, w, h);
}

function drawTile(target: CanvasRenderingContext2D, at: (c: number, r: number) => string, c: number, r: number, theme: ThemeName) {
  const ch = at(c, r);
  const x = c * TILE;
  const y = r * TILE;
  const tiles = `tiles-${theme}`;
  if (ch === "=") {
    frame(target, tiles, 5, at(c, r - 1) === "=" ? 1 : 0, x + TILE / 2, y + TILE);
    if (r < CHUNK_H - 1 && at(c, r + 1) !== "=" && at(c, r + 1) !== "") {
      target.fillStyle = LOOK[theme].underside;
      target.fillRect(x, y + TILE - 2, TILE, 2);
    }
  } else if (ch === "^") frame(target, tiles, 5, 2, x + TILE / 2, y + TILE);
  else if (ch === "~") frame(target, tiles, 5, at(c, r - 1) === "~" ? 4 : 3, x + TILE / 2, y + TILE);
  else if (ch === "$") frame(target, "coin", 4, 0, x + TILE / 2, y + TILE);
  else if (ch === ">") frame(target, "bug", 3, 0, x + TILE / 2, y + TILE);
  else if (ch === "@") frame(target, "crab", 8, 0, x + TILE / 2, y + TILE);
  else if (ch === "F") frame(target, "flag", 2, 0, x + TILE / 2, y + TILE);
  else if (ch === "-" || ch === "|") {
    // the track as dots; the plank itself where the track starts
    target.fillStyle = "rgba(244, 244, 244, 0.35)";
    if (ch === "-") for (let i = 1; i < TILE; i += 4) target.fillRect(x + i, y + 3, 2, 2);
    else for (let i = 1; i < TILE; i += 4) target.fillRect(x + TILE - 1, y + i, 2, 2);
    const start = ch === "-" ? at(c - 1, r) !== "-" : at(c, r - 1) !== "|";
    const img = start ? sprite("platform") : null;
    if (img) target.drawImage(img, x, y);
  }
}

function resize() {
  const w = cols() * TILE;
  const h = CHUNK_H * TILE;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function outline(cell: Cell, color: string, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.strokeRect(cell[0] * TILE + width / 2, cell[1] * TILE + width / 2, TILE - width, TILE - width);
}

function draw() {
  const W = canvas.width;
  const H = canvas.height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = LOOK[draft.theme].sky;
  ctx.fillRect(0, 0, W, H);

  // grid, with a brighter line between screens
  for (let c = 0; c <= cols(); c++) {
    ctx.fillStyle = c % CHUNK_W === 0 ? "rgba(244, 244, 244, 0.28)" : "rgba(244, 244, 244, 0.06)";
    ctx.fillRect(c * TILE, 0, 1, H);
  }
  for (let r = 0; r <= CHUNK_H; r++) {
    ctx.fillStyle = "rgba(244, 244, 244, 0.06)";
    ctx.fillRect(0, r * TILE, W, 1);
  }

  if (showReach) {
    ctx.fillStyle = "rgba(167, 240, 112, 0.2)";
    for (const key of report.reach) {
      const [c, r] = key.split(",").map(Number);
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
    }
  }

  const at = (c: number, r: number) => (r < 0 || r >= CHUNK_H ? "" : (draft.rows[r][c] ?? ""));
  for (let r = 0; r < CHUNK_H; r++) for (let c = 0; c < cols(); c++) drawTile(ctx, at, c, r, draft.theme);

  // where each bug walks
  ctx.fillStyle = "rgba(224, 105, 124, 0.7)";
  for (const bug of report.bugs) ctx.fillRect(bug.min * TILE + 2, (bug.at[1] + 1) * TILE - 2, (bug.max - bug.min + 1) * TILE - 4, 1);

  for (const issue of report.warnings) if (issue.at) outline(issue.at, "#ffcd75");
  for (const issue of report.errors) if (issue.at) outline(issue.at, "#e0697c", 2);
  if (focus && performance.now() < focus.until) outline(focus.at, "#f4f4f4", 2);
  if (hover) outline(hover, "#d97757");
}

// ---------------------------------------------------------------- the check

function showReport() {
  const { errors, warnings, coins, bugs, rails } = report;
  const screens = cols() / CHUNK_W;
  stats.textContent = `${screens} SCREEN${screens === 1 ? "" : "S"} · ${coins.length} COINS · ${bugs.length} BUGS · ${rails.length} RAILS`;
  reportList.replaceChildren();
  const item = (kind: string, text: string, at?: Cell) => {
    const li = document.createElement("li");
    li.className = kind;
    li.textContent = text;
    if (at) {
      li.dataset.at = at.join(",");
      li.title = "Show it on the map";
    }
    reportList.append(li);
  };
  for (const e of errors) item("error", `ERROR  ${e.msg}`, e.at);
  for (const w of warnings) item("warn", `WARN  ${w.msg}`, w.at);
  if (!NAME_PATTERN.test(levelName())) item("error", "ERROR  the name can only use A-Z, 0-9, spaces and . , ! ? ' & : -");
  if (!errors.length && !warnings.length) item("ok", "ALL GOOD: THE FLAG CAN BE REACHED FROM THE START");

  buttons.play.disabled = !playable();
  buttons.share.disabled = errors.length > 0 || !NAME_PATTERN.test(levelName());
  buttons.undo.disabled = undoStack.length === 0;
  buttons.add.disabled = cols() >= MAX_CHUNKS * CHUNK_W;
  buttons.remove.disabled = cols() <= CHUNK_W;
}

/** The game can build it (a start, a flag, no broken rails) — reachable or not, it can be tried. */
function playable() {
  if (!NAME_PATTERN.test(levelName())) return false;
  try {
    parseLevel({ id: "custom", name: levelName(), theme: draft.theme, chunks: chunks() });
    return true;
  } catch {
    return false;
  }
}

reportList.addEventListener("click", (e) => {
  const li = (e.target as HTMLElement).closest<HTMLLIElement>("li[data-at]");
  if (!li) return;
  const at = li.dataset.at!.split(",").map(Number) as Cell;
  // bring the tile into view and flash it
  const x = ((at[0] + 0.5) / cols()) * canvas.clientWidth;
  stage.scrollTo({ left: x - stage.clientWidth / 2, behavior: "smooth" });
  focus = { at, until: performance.now() + 1600 };
  draw();
  setTimeout(draw, 1650);
});

// ---------------------------------------------------------------- painting

function cellAt(e: PointerEvent): Cell | null {
  const rect = canvas.getBoundingClientRect();
  const c = Math.floor(((e.clientX - rect.left) / rect.width) * cols());
  const r = Math.floor(((e.clientY - rect.top) / rect.height) * CHUNK_H);
  return c >= 0 && r >= 0 && c < cols() && r < CHUNK_H ? [c, r] : null;
}

// Mouse and pen paint while dragging (right button erases). A finger paints on a tap, so a
// swipe can still scroll the map sideways.
let stroke: { tile: string; touch: boolean; x: number; y: number; dirty: boolean; last: Cell | null } | null = null;

/** Every cell on the line between two cells, so a fast drag leaves no gaps. */
function paintLine(from: Cell, to: Cell, tile: string) {
  const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
  let any = false;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    any = paint(Math.round(from[0] + (to[0] - from[0]) * t), Math.round(from[1] + (to[1] - from[1]) * t), tile) || any;
  }
  return any;
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  const cell = cellAt(e);
  if (!cell) return;
  const touch = e.pointerType === "touch";
  stroke = { tile: e.button === 2 ? " " : tool, touch, x: e.clientX, y: e.clientY, dirty: false, last: cell };
  if (touch) return;
  canvas.setPointerCapture(e.pointerId);
  remember();
  stroke.dirty = paint(...cell, stroke.tile);
  if (stroke.dirty) changed();
});
canvas.addEventListener("pointermove", (e) => {
  hover = e.pointerType === "touch" ? null : cellAt(e);
  if (stroke && !stroke.touch) {
    const cell = cellAt(e);
    const from = stroke.last;
    if (cell) stroke.last = cell;
    if (cell && from && paintLine(from, cell, stroke.tile)) {
      stroke.dirty = true;
      changed();
      return;
    }
  }
  draw();
});
canvas.addEventListener("pointerup", (e) => {
  if (stroke?.touch && Math.hypot(e.clientX - stroke.x, e.clientY - stroke.y) < 10) {
    const cell = cellAt(e);
    remember();
    if (cell && paint(...cell, stroke.tile)) changed();
    else undoStack.pop();
  } else if (stroke && !stroke.dirty) undoStack.pop(); // a click that changed nothing
  stroke = null;
  showReport();
});
canvas.addEventListener("pointercancel", () => (stroke = null));
canvas.addEventListener("pointerleave", () => {
  hover = null;
  draw();
});

// ---------------------------------------------------------------- controls

const toolButtons = new Map<string, HTMLButtonElement>();
function selectTool(tile: string) {
  tool = tile;
  for (const [t, button] of toolButtons) button.setAttribute("aria-pressed", String(t === tile));
}

TOOLS.forEach(([tile, label], i) => {
  const button = document.createElement("button");
  const icon = document.createElement("canvas");
  icon.width = TILE;
  icon.height = TILE;
  button.append(icon, label);
  button.title = `${label} (key ${(i + 1) % 10})`;
  button.dataset.tile = tile;
  button.addEventListener("click", () => selectTool(tile));
  toolButtons.set(tile, button);
  palette.append(button);
});

function drawPalette() {
  for (const [tile, button] of toolButtons) {
    const icon = button.querySelector("canvas")!;
    const g = icon.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.fillStyle = LOOK[draft.theme].sky;
    g.fillRect(0, 0, TILE, TILE);
    // the flag is two tiles tall: show its top half
    if (tile === "F") {
      g.save();
      g.translate(0, TILE);
      drawTile(g, (c, r) => (c === 0 && r === 0 ? "F" : ""), 0, 0, draft.theme);
      g.restore();
    } else drawTile(g, (c, r) => (c === 0 && r === 0 ? tile : ""), 0, 0, draft.theme);
  }
}

for (const name of THEME_NAMES) themeSelect.add(new Option(LOOK[name].label, name));
themeSelect.addEventListener("change", () => {
  remember();
  draft.theme = themeSelect.value as ThemeName;
  changed();
  drawPalette();
});

templateSelect.add(new Option("CHOOSE...", ""));
templateSelect.add(new Option("A BLANK LEVEL", "blank"));
LEVELS.forEach((def, i) => templateSelect.add(new Option(`${i + 1}. ${def.name}`, String(i))));
templateSelect.addEventListener("change", () => {
  const value = templateSelect.value;
  templateSelect.value = "";
  if (!value) return;
  remember();
  draft = value === "blank" ? blank() : fromLevel(Number(value));
  changed();
  drawPalette();
  stage.scrollLeft = 0;
  tell("LOADED. UNDO BRINGS YOUR DRAFT BACK");
});

nameInput.addEventListener("input", () => {
  const clean = nameInput.value.toUpperCase().replace(/[^A-Z0-9 .,!?'&:-]/g, "");
  if (clean !== nameInput.value) nameInput.value = clean;
  draft.name = clean;
  save();
  showReport();
});

buttons.undo.addEventListener("click", undo);
buttons.add.addEventListener("click", addScreen);
buttons.remove.addEventListener("click", removeScreen);
buttons.reach.addEventListener("click", () => {
  showReach = !showReach;
  buttons.reach.setAttribute("aria-pressed", String(showReach));
  draw();
});

const level = () => ({ name: levelName(), theme: draft.theme, chunks: chunks() });
const gameUrl = (hash: string) => new URL(`./#${hash}`, location.href).href;

buttons.play.addEventListener("click", async () => {
  location.href = gameUrl(`test=${await encodeLevel(level())}`);
});

buttons.share.addEventListener("click", async () => {
  const url = gameUrl(`play=${await encodeLevel(level())}`);
  const text = `I made a Crab vs Bugs level: ${levelName()}. Can you beat it? 🦀`;
  if (matchMedia("(pointer: coarse)").matches && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Crab vs Bugs", text, url });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  if (await copy(url)) tell(`LINK COPIED (${url.length} CHARACTERS)`);
});

buttons.export.addEventListener("click", async () => {
  if (await copy(asLevelsTs())) tell("COPIED: PASTE IT INTO THE LEVELS LIST IN src/levels.ts");
});

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Copy this:", text);
    return false;
  }
}

let statusTimer = 0;
function tell(text: string, bad = false) {
  status.textContent = text;
  status.classList.toggle("bad", bad);
  clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => (status.textContent = ""), 4000);
}

/** The level written the way src/levels.ts writes them: leading sky rows on one line. */
function asLevelsTs(): string {
  const id = levelName().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-level";
  const chunkText = chunks().map((chunk) => {
    const lead = chunk.findIndex((row) => row !== "");
    const empties = lead === -1 ? chunk.length : lead;
    const lines = [];
    if (empties > 0) lines.push(Array(empties).fill('""').join(", ") + ",");
    for (const row of chunk.slice(empties)) lines.push(`${JSON.stringify(row)},`);
    return `      [\n${lines.map((line) => `        ${line}`).join("\n")}\n      ],`;
  });
  return [
    "  {",
    `    id: ${JSON.stringify(id)},`,
    `    name: ${JSON.stringify(levelName())},`,
    `    theme: ${JSON.stringify(draft.theme)},`,
    "    chunks: [",
    ...chunkText,
    "    ],",
    "  },",
  ].join("\n");
}

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
    e.preventDefault();
    undo();
    return;
  }
  const digit = e.code.match(/^Digit(\d)$/);
  if (digit && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const tile = TOOLS[(Number(digit[1]) + 9) % 10]?.[0];
    if (tile !== undefined) selectTool(tile);
  }
});

// ---------------------------------------------------------------- start

// #edit=<code>: opened from the game (EDIT after a homemade level) — load that level
async function openFromLink() {
  const match = location.hash.match(/^#edit=([A-Za-z0-9_-]+)$/);
  if (!match) return;
  history.replaceState(null, "", location.pathname);
  const def = await decodeLevel(match[1]);
  if (!def) return tell("THAT LINK HAS NO LEVEL IN IT", true);
  const incoming: Draft = { name: def.name, theme: def.theme, rows: levelRows(def) };
  if (JSON.stringify(incoming.rows) === JSON.stringify(draft.rows) && incoming.theme === draft.theme) return;
  remember();
  draft = incoming;
  changed();
  drawPalette();
  tell("OPENED THE LEVEL FROM THE LINK. UNDO BRINGS YOUR DRAFT BACK");
}

selectTool(tool);
changed();
drawPalette();
void openFromLink();
