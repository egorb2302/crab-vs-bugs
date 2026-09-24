import { LEVELS } from "./levels";

// What the player has cleared, kept in localStorage under stable level ids.
// Storage can be blocked (private mode, embedded webviews) — then every run is simply a first run.

const KEY = "crab-vs-bugs:progress";

export interface Best {
  time: number;
  coins: number;
}

type Saved = Record<string, [time: number, coins: number]>;

function read(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Saved) : {};
  } catch {
    return {};
  }
}

function write(data: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // nothing to do — the run just won't be remembered
  }
}

export function bestFor(id: string): Best | null {
  const row = read()[id];
  return Array.isArray(row) && row[0] > 0 ? { time: row[0], coins: row[1] ?? 0 } : null;
}

export const isCleared = (id: string) => bestFor(id) !== null;

/** Levels open one after another; the first one is always open, and so is one beaten on a dare. */
export const isUnlocked = (index: number) =>
  index === 0 || isCleared(LEVELS[index - 1]?.id ?? "") || isCleared(LEVELS[index]?.id ?? "");

/** The level the CONTINUE button should drop you into: the first one not cleared yet. */
export function currentLevel(): number {
  const next = LEVELS.findIndex((level) => !isCleared(level.id));
  return next === -1 ? LEVELS.length - 1 : next;
}

export const clearedCount = () => LEVELS.filter((level) => isCleared(level.id)).length;

/** Saves the run (best time wins, best coin haul wins) and returns what was there before. */
export function recordRun(id: string, time: number, coins: number): Best | null {
  const data = read();
  const previous = bestFor(id);
  data[id] = [previous ? Math.min(previous.time, time) : time, Math.max(previous?.coins ?? 0, coins)];
  write(data);
  return previous;
}

// ---------------------------------------------------------------- full run

const RUN_KEY = "crab-vs-bugs:speedrun";

export function bestSpeedrun(): number | null {
  try {
    const time = Number(localStorage.getItem(RUN_KEY));
    return time > 0 ? time : null;
  } catch {
    return null;
  }
}

/** Saves an all-levels time if it's a new best; returns the best from before. */
export function recordSpeedrun(time: number): number | null {
  const previous = bestSpeedrun();
  if (previous === null || time < previous) {
    try {
      localStorage.setItem(RUN_KEY, String(time));
    } catch {
      // not remembered, same as levels
    }
  }
  return previous;
}
