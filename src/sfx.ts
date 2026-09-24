// Tiny synth instead of audio files: every effect is one or two swept oscillators.

const MUTE_KEY = "crab-vs-bugs:muted";

let ctx: AudioContext | undefined;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  // storage can be blocked (private mode, embedded webviews) — sound just starts on
}

// iOS only lets an AudioContext start from inside a gesture handler
function unlock() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}
for (const type of ["pointerdown", "touchend", "keydown"]) {
  window.addEventListener(type, unlock, { passive: true });
}

// the game pauses in a background tab, so the music should too
document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend();
  else void ctx.resume();
});

/** The shared audio context, once a gesture has created it. */
export const audioContext = () => ctx;

function beep(from: number, to: number, duration: number, type: OscillatorType = "square", volume = 0.05, delay = 0) {
  if (muted || !ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export const sfx = {
  jump: () => beep(280, 620, 0.13),
  coin: () => {
    beep(988, 988, 0.07);
    beep(1319, 1319, 0.22, "square", 0.05, 0.07);
  },
  stomp: () => beep(240, 70, 0.14, "square", 0.07),
  /** a soft thud; `impact` 0..1 is how hard the crab came down */
  land: (impact: number) => beep(150, 55, 0.06, "triangle", 0.03 + impact * 0.05),
  death: () => beep(420, 50, 0.55, "sawtooth", 0.07),
  select: () => beep(520, 780, 0.09),
  win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, f, 0.16, "square", 0.05, i * 0.11)),
};

export const isMuted = () => muted;

export function toggleMute(): boolean {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // see above
  }
  return muted;
}
