import type { Color, Vec2 } from "kaplay";
import { COLORS, k } from "./k";

// Throwaway particles — dust, sparkles, bug bits. One pool per scene, drawn by two layer
// objects (behind and in front of the cast) instead of a game object per speck.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  /** size at the end of its life, for puffs that shrink away */
  endSize: number;
  gravity: number;
  drag: number;
  color: Color;
  front: boolean;
  ring: boolean;
}

const pool: Particle[] = [];

function layer(front: boolean) {
  k.add([
    k.z(front ? 30 : 9),
    {
      draw() {
        for (const p of pool) {
          if (p.front !== front) continue;
          const t = p.age / p.life;
          const size = p.size + (p.endSize - p.size) * t;
          const opacity = 1 - t * t;
          if (p.ring) {
            k.drawCircle({
              pos: k.vec2(Math.round(p.x), Math.round(p.y)),
              radius: size,
              fill: false,
              outline: { width: 1, color: p.color },
              opacity,
            });
          } else {
            const s = Math.max(1, Math.round(size));
            k.drawRect({ pos: k.vec2(Math.round(p.x - s / 2), Math.round(p.y - s / 2)), width: s, height: s, color: p.color, opacity });
          }
        }
      },
    },
  ]);
}

/** Call once at the top of a scene that wants particles. */
export function addFx() {
  pool.length = 0;
  layer(false);
  layer(true);
  k.add([
    {
      update() {
        const dt = k.dt();
        for (let i = pool.length - 1; i >= 0; i--) {
          const p = pool[i];
          p.age += dt;
          if (p.age >= p.life) {
            pool.splice(i, 1);
            continue;
          }
          const slow = Math.exp(-p.drag * dt);
          p.vx *= slow;
          p.vy = p.vy * slow + p.gravity * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      },
    },
  ]);
}

type Spawn = Partial<Particle> & { x: number; y: number };

function spawn(p: Spawn) {
  if (pool.length > 400) return;
  pool.push({
    vx: 0,
    vy: 0,
    age: 0,
    life: 0.4,
    size: 1,
    endSize: 1,
    gravity: 0,
    drag: 0,
    color: COLORS.white,
    front: true,
    ring: false,
    ...p,
  });
}

/** Little clouds kicked up at the crab's feet. `dir` pushes them one way; 0 spreads them both ways. */
export function dust(at: Vec2, color: Color, count: number, dir = 0) {
  for (let i = 0; i < count; i++) {
    const side = dir !== 0 ? dir : i % 2 === 0 ? -1 : 1;
    spawn({
      x: at.x + k.rand(-3, 3),
      y: at.y - k.rand(0, 2),
      vx: side * k.rand(18, 52),
      vy: -k.rand(6, 26),
      drag: 6,
      life: k.rand(0.25, 0.42),
      size: k.rand(2, 3),
      endSize: 0.5,
      color,
      front: false,
    });
  }
}

/** Radial pop: coins, stomps, the flag. */
export function burst(at: Vec2, colors: Color[], count: number, speed = 70, gravity = 0) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + k.rand(-0.3, 0.3);
    const v = speed * k.rand(0.6, 1.2);
    spawn({
      x: at.x,
      y: at.y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v - (gravity ? speed * 0.6 : 0),
      drag: gravity ? 1.5 : 5,
      gravity,
      life: k.rand(0.3, gravity ? 0.8 : 0.45),
      size: 1,
      color: colors[i % colors.length],
    });
  }
}

/** An expanding outline — reads as a flash without covering anything. */
export function ring(at: Vec2, color: Color, radius = 10, life = 0.22) {
  spawn({ x: at.x, y: at.y, life, size: 2, endSize: radius, color, ring: true });
}
