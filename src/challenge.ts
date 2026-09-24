import { LEVELS } from "./levels";

// A challenge is just a link: ?beat=<level id>&time=<seconds>, or ?beat=all for the full run
// (shared as /r/<level id>/<seconds>, which api/dare.js forwards here).
// Nothing is checked or stored anywhere — it's a friendly dare between two browsers.

export type Target = number | "all";

export interface Challenge {
  target: Target;
  /** seconds, to the tenth — what the challenger's screen showed */
  time: number;
}

const tenths = (seconds: number) => Math.floor(seconds * 10);

function parse(): Challenge | null {
  const params = new URLSearchParams(location.search);
  const beat = params.get("beat");
  const time = Number(params.get("time"));
  if (!beat || !Number.isFinite(time) || time <= 0 || time > 24 * 3600) return null;
  const target = beat === "all" ? "all" : LEVELS.findIndex((level) => level.id === beat);
  if (target === -1) return null;
  return { target, time: tenths(time) / 10 };
}

export const challenge = parse();

/** The challenge that applies to a run of this level (or of the full run), if any. */
export function challengeFor(target: Target): Challenge | null {
  return challenge && challenge.target === target ? challenge : null;
}

/** Negative: beaten by that many seconds. Zero: a tie. Positive: short by that many. */
export const versus = (time: number, against: Challenge) => (tenths(time) - tenths(against.time)) / 10;

/** What a dare link is made of: "hop-scotch" and "24.3". */
export function dareParts(target: Target, time: number) {
  return { beat: target === "all" ? "all" : LEVELS[target].id, seconds: (tenths(time) / 10).toFixed(1) };
}

/**
 * The link a result is shared as. On the live site it is the short /r/ form, which api/dare.js
 * gives a preview card of its own and forwards to the ?beat= form. `vite dev` has no functions,
 * so there it is the ?beat= form straight away.
 */
export function challengeUrl(target: Target, time: number): string {
  const { beat, seconds } = dareParts(target, time);
  if (import.meta.env.DEV) {
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set("beat", beat);
    url.searchParams.set("time", seconds);
    return url.toString();
  }
  return `${location.origin}/r/${beat}/${seconds}`;
}
