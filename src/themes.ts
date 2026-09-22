import type { Color } from "kaplay";
import { k } from "./k";

// A location: one tile sheet, one sky, one set of parallax strips.
// Sprites come from scripts/gen-assets.mjs — a theme is just a name plus colours.

export type ThemeName = "meadow" | "desert" | "cavern" | "frost" | "magma";

export interface Theme {
  /** shown on the level-select card */
  label: string;
  sky: Color;
  /** shaded strip under floating platforms, so they read as solid */
  underside: Color;
  stars: number;
  starColor: Color;
  celestial: "moon" | "sun" | null;
  /** rock hanging from the top of the screen, if the location has a roof */
  ceiling: boolean;
}

const rgb = (hex: string) => k.rgb(hex);

export const THEMES: Record<ThemeName, Theme> = {
  meadow: {
    label: "MEADOW",
    sky: rgb("#1a1c2c"),
    underside: rgb("#392d4f"),
    stars: 46,
    starColor: rgb("#94b0c2"),
    celestial: "moon",
    ceiling: false,
  },
  desert: {
    label: "DUNES",
    sky: rgb("#5d275d"),
    underside: rgb("#5e3a2e"),
    stars: 0,
    starColor: rgb("#ffcd75"),
    celestial: "sun",
    ceiling: false,
  },
  cavern: {
    label: "CAVERN",
    sky: rgb("#0d0e17"),
    underside: rgb("#1f2335"),
    stars: 34,
    starColor: rgb("#73eff7"), // crystals, not stars
    celestial: null,
    ceiling: true,
  },
  frost: {
    label: "GLACIER",
    sky: rgb("#29366f"),
    underside: rgb("#36486a"),
    stars: 40,
    starColor: rgb("#f4f4f4"),
    celestial: "moon",
    ceiling: false,
  },
  magma: {
    label: "FOUNDRY",
    sky: rgb("#23121e"),
    underside: rgb("#241722"),
    stars: 26,
    starColor: rgb("#ef7d57"), // embers
    celestial: null,
    ceiling: false,
  },
};

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

export const tileSprite = (theme: ThemeName) => `tiles-${theme}`;
export const hillSprites = (theme: ThemeName) => [`hills-far-${theme}`, `hills-near-${theme}`] as const;
