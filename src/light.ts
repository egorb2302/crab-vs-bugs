import type { Vec2 } from "kaplay";
import { k } from "./k";
import { reducedMotion } from "./motion";
import { THEMES, type ThemeName } from "./themes";

// Darkness with holes in it: a full-screen quad above the world and below the HUD.
// The crab carries the big light; coins and the flag glow a little on their own.
// Output is posterised into dithered bands on the game's own pixel grid, so the light
// reads as pixel art rather than a smooth modern gradient.

const MAX_LIGHTS = 12;

const FRAG = `
uniform vec2 u_res;
uniform vec2 u_lights[${MAX_LIGHTS}];
uniform float u_count;
uniform float u_inner;
uniform float u_outer;
uniform float u_dark;
uniform vec3 u_shade;
uniform vec3 u_glow;
uniform float u_glowAmt;
uniform float u_glowH;
uniform float u_time;

// ordered dither; the pattern repeats every 4 px, so wrap first — phones run this at mediump,
// where the square of a raw screen coordinate would already be out of range
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { a = mod(floor(a), 4.0); return bayer2(0.5 * a) * 0.25 + bayer2(a); }

vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
  // pos is normalised device space; bring it back to game pixels, y down
  vec2 px = floor(vec2((pos.x + 1.0) * 0.5 * u_res.x, (1.0 - pos.y) * 0.5 * u_res.y));
  float dither = bayer4(px);

  float lit = smoothstep(u_inner, u_outer, distance(px, u_lights[0]));
  for (int i = 1; i < ${MAX_LIGHTS}; i++) {
    if (float(i) >= u_count) break;
    lit *= smoothstep(3.0, 24.0, distance(px, u_lights[i]));
  }
  float dark = min(floor(lit * u_dark * 5.0 + dither) / 5.0, u_dark);

  float rise = clamp(1.0 - (u_res.y - px.y) / (u_res.y * u_glowH), 0.0, 1.0);
  float flicker = 0.85 + 0.15 * sin(u_time * 2.3 + px.x * 0.045);
  float glow = floor(rise * rise * flicker * u_glowAmt * 6.0 + dither) / 6.0;

  // premultiplied: the shade darkens what's under it, the glow is added on top
  // (alpha never hits 0 exactly, or the fragment would be discarded)
  return vec4(u_shade / 255.0 * dark + u_glow / 255.0 * glow, max(dark, 0.002));
}
`;

export function loadLight() {
  k.loadShader("light", null, FRAG);
}

/**
 * Lights the level for its location. `crab` is where the crab is (null once it's gone — the
 * light then stays where it was); `extras` are the smaller glows, in world space.
 */
export function addLighting(theme: ThemeName, crab: () => Vec2 | null, extras: () => Vec2[]) {
  const light = THEMES[theme].light;
  let last = k.vec2(k.width() / 2, k.height() / 2);
  const offscreen = k.vec2(-9999, -9999);

  k.add([
    k.rect(k.width(), k.height()),
    k.pos(0, 0),
    k.fixed(),
    k.z(50),
    k.shader("light", () => {
      const at = crab();
      if (at) last = k.toScreen(at);
      const lights = [last];
      for (const p of extras()) {
        if (lights.length >= MAX_LIGHTS) break;
        const s = k.toScreen(p);
        if (s.x > -30 && s.x < k.width() + 30) lights.push(s);
      }
      const count = lights.length;
      while (lights.length < MAX_LIGHTS) lights.push(offscreen);
      return {
        u_res: k.vec2(k.width(), k.height()),
        u_lights: lights,
        u_count: count,
        u_inner: light.inner,
        u_outer: light.outer,
        u_dark: light.dark,
        u_shade: light.shade,
        u_glow: light.glow,
        u_glowAmt: light.glowAmount,
        u_glowH: 0.45,
        // wrapped to a whole number of flicker cycles, so it stays small enough for mediump
        u_time: reducedMotion ? 0 : k.time() % ((Math.PI * 20) / 2.3),
      };
    }),
  ]);
}
