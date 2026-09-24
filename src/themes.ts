import type { Color } from "kaplay";
import { k } from "./k";

// A location: one tile sheet, one sky, one set of parallax strips.
// Sprites come from scripts/art.mjs — a theme is just a name plus colours.
// The dare card (scripts/art.mjs, SKIES) and the level editor (src/editor/editor.ts, LOOK) keep their
// own copies of the colours: change them there too.

export type ThemeName = "meadow" | "desert" | "cavern" | "frost" | "magma";

export interface Theme {
  /** shown on the level-select card */
  label: string;
  sky: Color;
  /** shaded strip under floating platforms, so they read as solid */
  underside: Color;
  /** what the crab kicks up when it lands, runs or skids */
  dust: Color;
  stars: number;
  starColor: Color;
  celestial: "moon" | "sun" | null;
  /** rock hanging from the top of the screen, if the location has a roof */
  ceiling: boolean;
  light: Light;
}

/** How dark the level gets away from the crab, and any glow rising from below. */
export interface Light {
  /** 0..1 at the far edge of the light */
  dark: number;
  /** px from the crab: fully lit inside `inner`, fully dark beyond `outer` */
  inner: number;
  outer: number;
  shade: Color;
  glow: Color;
  /** 0 = no glow from below */
  glowAmount: number;
}

const light = (dark: number, inner: number, outer: number, glow = "#000000", glowAmount = 0): Light => ({
  dark,
  inner,
  outer,
  shade: k.rgb("#0d0e17"),
  glow: k.rgb(glow),
  glowAmount,
});

const rgb = (hex: string) => k.rgb(hex);

export const THEMES: Record<ThemeName, Theme> = {
  meadow: {
    label: "MEADOW",
    sky: rgb("#1a1c2c"),
    underside: rgb("#392d4f"),
    dust: rgb("#94b0c2"),
    stars: 46,
    starColor: rgb("#94b0c2"),
    celestial: "moon",
    ceiling: false,
    light: light(0.3, 90, 250),
  },
  desert: {
    label: "DUNES",
    sky: rgb("#5d275d"),
    underside: rgb("#5e3a2e"),
    dust: rgb("#ffcd75"),
    stars: 0,
    starColor: rgb("#ffcd75"),
    celestial: "sun",
    ceiling: false,
    light: light(0.2, 110, 280, "#ef7d57", 0.1),
  },
  cavern: {
    label: "CAVERN",
    sky: rgb("#0d0e17"),
    underside: rgb("#1f2335"),
    dust: rgb("#566c86"),
    stars: 34,
    starColor: rgb("#73eff7"), // crystals, not stars
    celestial: null,
    ceiling: true,
    light: light(0.66, 40, 135),
  },
  frost: {
    label: "GLACIER",
    sky: rgb("#29366f"),
    underside: rgb("#36486a"),
    dust: rgb("#f4f4f4"),
    stars: 40,
    starColor: rgb("#f4f4f4"),
    celestial: "moon",
    ceiling: false,
    light: light(0.28, 90, 250),
  },
  magma: {
    label: "FOUNDRY",
    sky: rgb("#23121e"),
    underside: rgb("#241722"),
    dust: rgb("#566c86"),
    stars: 26,
    starColor: rgb("#ef7d57"), // embers
    celestial: null,
    ceiling: false,
    light: light(0.42, 70, 200, "#ef7d57", 0.22),
  },
};

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

export const tileSprite = (theme: ThemeName) => `tiles-${theme}`;
export const hillSprites = (theme: ThemeName) => [`hills-far-${theme}`, `hills-near-${theme}`] as const;
