import { k } from "./k";

// Players who ask the OS for less motion get no screen shake, no parallax, no weather,
// and plain fades instead of wipes. The game itself plays exactly the same.
const query = window.matchMedia("(prefers-reduced-motion: reduce)");
export let reducedMotion = query.matches;
query.addEventListener("change", (e) => (reducedMotion = e.matches));

export function shake(amount: number) {
  if (!reducedMotion) k.shake(amount);
}

// Not zero on purpose: at a time scale of exactly 0 Kaplay's fixed step drops a body's
// interpolation state, and the first frame after the freeze that has no physics step
// reads it anyway and throws — which silently stops the game loop. A thousandth of
// normal speed looks just as frozen and keeps that state alive.
const FROZEN = 0.001;

let resume = 0;

/**
 * Freeze the whole game for a moment so a hit lands with some weight. Physics, animations,
 * timers and the level clock all stop; input still buffers, so nothing pressed is lost.
 * The wall-clock timeout brings time back even if the scene changes meanwhile.
 */
export function hitstop(seconds: number) {
  k.debug.timeScale = FROZEN;
  window.clearTimeout(resume);
  resume = window.setTimeout(() => (k.debug.timeScale = 1), seconds * 1000);
}
