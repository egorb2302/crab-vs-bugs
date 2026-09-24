import fontUrl from "@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2?url";
import { k } from "./k";
import { loadLight } from "./light";
import { THEME_NAMES, hillSprites, tileSprite } from "./themes";

// Sprites come from scripts/art.mjs (npm run assets) — edit the ASCII grids there.
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
  k.loadSprite("platform", "sprites/platform.png");
  k.loadSprite("moon", "sprites/moon.png");
  k.loadSprite("sun", "sprites/sun.png");
  k.loadSprite("cave-ceiling", "sprites/cave-ceiling.png");
  loadLight();

  // one tile sheet and two parallax strips per location — all tiny, all loaded up front
  for (const theme of THEME_NAMES) {
    k.loadSprite(tileSprite(theme), `sprites/${tileSprite(theme)}.png`, { sliceX: 5 });
    for (const sprite of hillSprites(theme)) k.loadSprite(sprite, `sprites/${sprite}.png`);
  }
}

export const TILE_FRAME = { top: 0, body: 1, spikes: 2, liquidTop: 3, liquidBody: 4 };
