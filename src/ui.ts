import type { Anchor, Color } from "kaplay";
import { TILE_FRAME } from "./assets";
import { COLORS, k } from "./k";
import { TILE } from "./level";

// ---------------------------------------------------------------- backdrop

const STRIP_W = 320; // width of the tileable hill sprites

const wrap = (x: number, period: number) => ((x % period) + period) % period;

/** Night sky with parallax layers. `scrollX` is how far the world has scrolled, in px. */
export function addBackdrop(scrollX: () => number) {
  // fixed seed: the sky should look the same on every run
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const stars = Array.from({ length: 46 }, () => ({
    x: rnd() * STRIP_W,
    y: rnd() * 120,
    size: rnd() > 0.85 ? 2 : 1,
    twinkle: rnd() * 6,
  }));

  const layer = (sprite: string, y: number, factor: number) => {
    for (let x = -wrap(scrollX() * factor, STRIP_W); x < k.width(); x += STRIP_W) {
      k.drawSprite({ sprite, pos: k.vec2(Math.round(x), y) });
    }
  };

  k.add([
    k.fixed(),
    k.z(-100),
    {
      draw() {
        const scroll = scrollX();
        for (const s of stars) {
          k.drawRect({
            pos: k.vec2(Math.round(wrap(s.x - scroll * 0.03, STRIP_W)), Math.round(s.y)),
            width: s.size,
            height: s.size,
            color: s.size > 1 ? COLORS.white : COLORS.muted,
            opacity: 0.55 + 0.45 * Math.sin(k.time() * 1.5 + s.twinkle),
          });
        }
        const H = k.height();
        k.drawSprite({ sprite: "moon", pos: k.vec2(Math.round(k.width() - 50 - scroll * 0.01), H - 136) });
        layer("hills-far", H - 122, 0.12);
        layer("hills-near", H - 82, 0.3);
      },
    },
  ]);
}

/** Decorative ground along the bottom of menu screens. */
export function addGroundStrip(topY: number) {
  k.add([
    k.fixed(),
    k.z(-10),
    {
      draw() {
        for (let y = topY; y < k.height(); y += TILE) {
          for (let x = 0; x < k.width(); x += TILE) {
            k.drawSprite({ sprite: "tiles", frame: y === topY ? TILE_FRAME.grass : TILE_FRAME.dirt, pos: k.vec2(x, y) });
          }
        }
      },
    },
  ]);
}

// ---------------------------------------------------------------- text

export interface LabelOpt {
  size?: number;
  color?: Color;
  anchor?: Anchor;
  align?: "left" | "center" | "right";
  width?: number;
  opacity?: number;
}

/** Menu screens are laid out for 180px of height; on taller (portrait) screens, centre that block. */
export const menuOffsetY = () => Math.floor((k.height() - 180) / 2);

/** Screen-space text with a hard 1px-style drop shadow. `text` may be a getter for live values. */
export function addLabel(text: string | (() => string), x: number, y: number, opt: LabelOpt = {}) {
  const size = opt.size ?? 8;
  const shadow = Math.max(1, Math.round(size / 8));
  return k.add([
    k.pos(x, y),
    k.fixed(),
    k.z(100),
    {
      draw() {
        const base = {
          text: typeof text === "function" ? text() : text,
          size,
          anchor: opt.anchor ?? "topleft",
          align: opt.align,
          width: opt.width,
          lineSpacing: 2,
          opacity: opt.opacity,
        };
        k.drawText({ ...base, pos: k.vec2(shadow, shadow), color: COLORS.ink });
        k.drawText({ ...base, color: opt.color ?? COLORS.white });
      },
    },
  ]);
}

// ---------------------------------------------------------------- buttons

export function addButton(text: string, x: number, y: number, onClick: () => void, color: Color = COLORS.orange) {
  const w = text.length * 8 + 16;
  const h = 18;
  const btn = k.add([
    k.pos(x, y),
    k.anchor("center"),
    k.area({ shape: new k.Rect(k.vec2(0, 0), w, h + 3), cursor: "pointer" }),
    k.fixed(),
    k.z(100),
    {
      draw() {
        const hover = btn.isHovering();
        const lift = hover ? -1 : 0;
        k.drawRect({ pos: k.vec2(-w / 2, -h / 2 + 3), width: w, height: h, color: COLORS.ink });
        k.drawRect({ pos: k.vec2(-w / 2, -h / 2 + lift), width: w, height: h, color: hover ? color.lighten(30) : color });
        k.drawText({ text, size: 8, pos: k.vec2(0, 1 + lift), anchor: "center", color: COLORS.ink });
      },
    },
  ]);
  btn.onClick(onClick);
  return btn;
}

// ---------------------------------------------------------------- transitions

function addCover(opacity: number) {
  return k.add([k.rect(k.width(), k.height()), k.color(COLORS.sky), k.opacity(opacity), k.fixed(), k.z(1000)]);
}

export function fadeIn(duration = 0.25) {
  const cover = addCover(1);
  k.tween(1, 0, duration, (v) => (cover.opacity = v)).onEnd(() => cover.destroy());
}

export function fadeTo(scene: string, args?: unknown, duration = 0.25) {
  const cover = addCover(0);
  k.tween(0, 1, duration, (v) => (cover.opacity = v)).onEnd(() => k.go(scene, args));
}

// ---------------------------------------------------------------- misc

/** 83.42 → "1:23.4" */
export function formatTime(seconds: number): string {
  const tenths = Math.floor(seconds * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor(tenths / 10) % 60;
  return `${m}:${String(s).padStart(2, "0")}.${tenths % 10}`;
}
