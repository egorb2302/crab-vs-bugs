// One input state for keyboard and the on-screen pad.
// Keys are matched by physical position (event.code), so WASD works on any layout.

export type Action = "left" | "right" | "jump" | "confirm" | "mute";

const KEYS: Record<string, Action> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Space: "jump",
  ArrowUp: "jump",
  KeyW: "jump",
  Enter: "confirm",
  NumpadEnter: "confirm",
  KeyM: "mute",
};

// an action is held while at least one source (a key code or "touch") holds it
const sources = new Map<Action, Set<string>>();
const listeners = new Map<Action, Set<() => void>>();

function press(action: Action, source: string) {
  const held = sources.get(action) ?? new Set();
  sources.set(action, held);
  const wasHeld = held.size > 0;
  held.add(source);
  if (!wasHeld) for (const cb of [...(listeners.get(action) ?? [])]) cb();
}

function release(action: Action, source: string) {
  sources.get(action)?.delete(source);
}

export function isDown(action: Action): boolean {
  return (sources.get(action)?.size ?? 0) > 0;
}

/** Fires once per press (no key repeat). Returns an unsubscribe function. */
export function onPress(action: Action, cb: () => void): () => void {
  const set = listeners.get(action) ?? new Set();
  listeners.set(action, set);
  set.add(cb);
  return () => set.delete(cb);
}

window.addEventListener("keydown", (e) => {
  const action = KEYS[e.code];
  if (!action || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  if (!e.repeat) press(action, e.code);
});

window.addEventListener("keyup", (e) => {
  const action = KEYS[e.code];
  if (action) release(action, e.code);
});

window.addEventListener("blur", () => sources.clear());

// ---------------------------------------------------------------- touch pad

export const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

function bindHold(el: HTMLElement, onChange: (e: PointerEvent | null) => void) {
  let pointer: number | null = null;
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pointer = e.pointerId;
    try {
      el.setPointerCapture(e.pointerId); // keep receiving the move even when the thumb drifts off
    } catch {
      // synthetic or already-released pointer — the window-level `end` below still closes the hold
    }
    onChange(e);
  });
  el.addEventListener("pointermove", (e) => {
    if (e.pointerId === pointer) onChange(e);
  });
  // released anywhere (or cancelled by the OS) ends the hold, so a button can never stick
  const end = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    onChange(null);
  };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

export function bindTouchControls() {
  if (isTouchDevice) document.documentElement.classList.add("touch");
  // also catches touch laptops/tablets that report a fine primary pointer
  window.addEventListener("touchstart", () => document.documentElement.classList.add("touch"), { once: true, passive: true });

  const pad = document.querySelector<HTMLElement>("#pad")!;
  const [leftKey, rightKey] = pad.querySelectorAll<HTMLElement>(".key");
  // the pad is one zone split down the middle, so a thumb can slide between directions
  bindHold(pad, (e) => {
    const rect = pad.getBoundingClientRect();
    const side = e ? (e.clientX < rect.left + rect.width / 2 ? "left" : "right") : null;
    for (const dir of ["left", "right"] as const) {
      if (side === dir) press(dir, "touch");
      else release(dir, "touch");
    }
    leftKey.classList.toggle("down", side === "left");
    rightKey.classList.toggle("down", side === "right");
  });

  const jump = document.querySelector<HTMLElement>("#jump")!;
  bindHold(jump, (e) => {
    if (e?.type === "pointermove") return;
    if (e) press("jump", "touch");
    else release("jump", "touch");
    jump.classList.toggle("down", e !== null);
  });
}

export function setPlaying(playing: boolean) {
  document.documentElement.classList.toggle("playing", playing);
}
