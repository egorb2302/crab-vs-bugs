import type { Color } from "kaplay";
import { k } from "./k";
import { reducedMotion } from "./motion";
import type { ThemeName } from "./themes";

// Ambient specks in front of the tiles and behind the cast: fireflies, blown sand, cave dust,
// snow, rising embers. Screen-space, wrapping, with a bit of parallax so they sit in the world.

interface Weather {
  count: number;
  colors: string[];
  /** px/s at full depth; each speck gets a random value in the range */
  vx: [number, number];
  vy: [number, number];
  /** sideways wobble, px */
  sway: number;
  /** a speck is [length, height] px; depth 0..1 picks bigger ones for nearer specks */
  size: (depth: number) => [number, number];
  opacity: [number, number];
  /** blink rate for fireflies and embers; 0 = steady */
  flicker: number;
  /** only fill the lower part of the screen (fireflies stay near the grass) */
  top: number;
  /** fade out towards the top of the screen, like cooling embers */
  fadeUp?: boolean;
}

const WEATHER: Record<ThemeName, Weather> = {
  meadow: {
    count: 12,
    colors: ["#a7f070", "#ffcd75"],
    vx: [-7, 7],
    vy: [-4, 4],
    sway: 7,
    size: (d) => (d > 0.75 ? [2, 2] : [1, 1]),
    opacity: [0, 1],
    flicker: 1.6,
    top: 0.35,
  },
  desert: {
    count: 26,
    colors: ["#ffcd75", "#ef7d57"],
    vx: [-170, -110],
    vy: [-4, 10],
    sway: 3,
    size: (d) => [2 + Math.round(d * 4), 1],
    opacity: [0.2, 0.55],
    flicker: 0,
    top: 0.1,
  },
  cavern: {
    count: 22,
    colors: ["#73eff7", "#94b0c2"],
    vx: [-3, 3],
    vy: [2, 8],
    sway: 4,
    size: () => [1, 1],
    opacity: [0.15, 0.7],
    flicker: 0.7,
    top: 0,
  },
  frost: {
    count: 46,
    colors: ["#f4f4f4", "#94b0c2"],
    vx: [-14, -2],
    vy: [14, 32],
    sway: 5,
    size: (d) => (d > 0.75 ? [2, 2] : [1, 1]),
    opacity: [0.5, 0.95],
    flicker: 0,
    top: 0,
  },
  magma: {
    count: 28,
    colors: ["#ef7d57", "#ffcd75", "#b13e53"],
    vx: [-6, 6],
    vy: [-36, -14],
    sway: 5,
    size: (d) => (d > 0.8 ? [2, 2] : [1, 1]),
    opacity: [0.35, 1],
    flicker: 3,
    top: 0,
    fadeUp: true,
  },
};

const MARGIN = 8;
const wrap = (v: number, period: number) => ((v % period) + period) % period;

interface Speck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  depth: number;
  phase: number;
  color: Color;
}

/** `scrollX` is how far the world has scrolled — the camera's left edge in a level. */
export function addWeather(scrollX: () => number, theme: ThemeName) {
  if (reducedMotion) return;
  const w = WEATHER[theme];
  const specks: Speck[] = Array.from({ length: w.count }, (_, i) => {
    const depth = k.rand(0.4, 1);
    return {
      x: k.rand(0, k.width()),
      y: k.rand(0, k.height()),
      vx: k.rand(...w.vx) * depth,
      vy: k.rand(...w.vy) * depth,
      depth,
      phase: k.rand(0, Math.PI * 2),
      color: k.rgb(w.colors[i % w.colors.length]),
    };
  });

  k.add([
    k.fixed(),
    k.z(2),
    {
      update() {
        const dt = k.dt();
        for (const s of specks) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
        }
      },
      draw() {
        const W = k.width() + MARGIN * 2;
        const H = k.height() + MARGIN * 2;
        const top = k.height() * w.top;
        const scroll = scrollX();
        const t = k.time();
        for (const s of specks) {
          const x = wrap(s.x - scroll * (0.5 + 0.5 * s.depth) + Math.sin(t * 1.3 + s.phase) * w.sway, W) - MARGIN;
          const y = top + wrap(s.y, H - top) - MARGIN;
          let opacity = w.opacity[0] + (w.opacity[1] - w.opacity[0]) * (w.flicker ? 0.5 + 0.5 * Math.sin(t * w.flicker + s.phase * 3) : s.depth);
          if (w.fadeUp) opacity *= Math.min(1, Math.max(0, y / k.height()) * 1.4);
          if (opacity <= 0.02) continue;
          const [sw, sh] = w.size(s.depth);
          k.drawRect({ pos: k.vec2(Math.round(x), Math.round(y)), width: sw, height: sh, color: s.color, opacity });
        }
      },
    },
  ]);
}
