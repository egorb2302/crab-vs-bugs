import { k } from "./k";

// Players who ask the OS for less motion get no screen shake, no parallax, no weather,
// and plain fades instead of wipes. The game itself plays exactly the same.
const query = window.matchMedia("(prefers-reduced-motion: reduce)");
export let reducedMotion = query.matches;
query.addEventListener("change", (e) => (reducedMotion = e.matches));

export function shake(amount: number) {
  if (!reducedMotion) k.shake(amount);
}

let resume = 0;

/**
 * Freeze the whole game for a moment so a hit lands with some weight. Physics, animations,
 * timers and the level clock all stop; input still buffers, so nothing pressed is lost.
 * The wall-clock timeout brings time back even if the scene changes meanwhile.
 */
export function hitstop(seconds: number) {
  k.debug.timeScale = 0;
  window.clearTimeout(resume);
  resume = window.setTimeout(() => (k.debug.timeScale = 1), seconds * 1000);
}
