import fontUrl from "@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2?url";
import { k } from "./k";

// Sprites come from scripts/gen-assets.mjs (npm run assets) — edit the ASCII grids there.
export function loadAssets() {
  // Press Start 2P sits on an 8px grid: rasterise it small and let nearest-neighbour scale it up
  // like any other sprite, instead of squeezing a big atlas down into mush
  k.loadFont("pixel", fontUrl, { filter: "nearest", size: 16 });

  k.loadSprite("crab", "sprites/crab.png", {
    sliceX: 8,
    anims: {
      idle: { from: 0, to: 1, speed: 2, loop: true },
      walk: { from: 2, to: 5, speed: 14, loop: true },
      jump: 6,
      dead: 7,
    },
  });
  k.loadSprite("bug", "sprites/bug.png", {
    sliceX: 3,
    anims: {
      walk: { from: 0, to: 1, speed: 6, loop: true },
      squash: 2,
    },
  });
  k.loadSprite("coin", "sprites/coin.png", {
    sliceX: 4,
    anims: { spin: { from: 0, to: 3, speed: 8, loop: true } },
  });
  k.loadSprite("flag", "sprites/flag.png", {
    sliceX: 2,
    anims: { wave: { from: 0, to: 1, speed: 3, loop: true } },
  });
  k.loadSprite("tiles", "sprites/tiles.png", { sliceX: 3 });
  k.loadSprite("hills-far", "sprites/hills-far.png");
  k.loadSprite("hills-near", "sprites/hills-near.png");
  k.loadSprite("moon", "sprites/moon.png");
}

export const TILE_FRAME = { grass: 0, dirt: 1, spikes: 2 };
