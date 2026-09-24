// Writes every static image asset of the game — the drawing itself lives in scripts/art.mjs:
//   public/sprites/*.png, public/favicon.png, public/og.png, public/icons/*.png
// Run: npm run assets            (add --preview <dir> to also dump an upscaled contact sheet)

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  C,
  Img,
  SKYLINES,
  THEMES,
  appIcon,
  bugSheet,
  caveCeiling,
  coinSheet,
  crabIdle1,
  crabSheet,
  encodePNG,
  flagSheet,
  hills,
  moonImg,
  ogImage,
  platformImg,
  sunImg,
  tileSheetFor,
} from "./art.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");

function save(path, img) {
  const file = join(PUBLIC, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePNG(img));
  console.log(`  ${path}  ${img.w}x${img.h}`);
}

// ---------------------------------------------------------------- write everything

console.log("generating assets:");
save("sprites/crab.png", crabSheet);
save("sprites/bug.png", bugSheet);
save("sprites/coin.png", coinSheet);
save("sprites/flag.png", flagSheet);
save("sprites/platform.png", platformImg());
save("sprites/moon.png", moonImg);
save("sprites/sun.png", sunImg);
save("sprites/cave-ceiling.png", caveCeiling);

// one tile sheet and two hill strips per location
for (const name of THEMES) {
  const [farColor, farBase, farWaves, nearColor, nearBase, nearWaves, tri] = SKYLINES[name];
  save(`sprites/tiles-${name}.png`, tileSheetFor(name));
  save(`sprites/hills-far-${name}.png`, hills(320, 96, farColor, farBase, farWaves, tri));
  save(`sprites/hills-near-${name}.png`, hills(320, 64, nearColor, nearBase, nearWaves, tri));
}

const favicon = new Img(64, 64);
favicon.blit(crabIdle1.crop(0, 2, 16, 14), 0, 4, 4);
save("favicon.png", favicon);
save("og.png", ogImage());
// home screen: Android and the manifest take 192 and 512, iOS wants 180
for (const size of [192, 512]) save(`icons/icon-${size}.png`, appIcon(size));
save("icons/apple-touch-icon.png", appIcon(180));

// optional upscaled contact sheet for eyeballing the art
const previewAt = process.argv.indexOf("--preview");
if (previewAt !== -1) {
  const dir = process.argv[previewAt + 1];
  const S = 8;
  const rows = [crabSheet, bugSheet, coinSheet, flagSheet, platformImg(), ...THEMES.map(tileSheetFor)];
  const out = new Img(Math.max(...rows.map((r) => r.w)) * S, rows.reduce((sum, r) => sum + r.h + 2, 0) * S);
  out.fill(0, 0, out.w, out.h, C.sky);
  let y = 0;
  for (const r of rows) {
    out.blit(r, 0, y, S);
    y += (r.h + 2) * S;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "contact-sheet.png"), encodePNG(out));
  console.log(`preview -> ${join(dir, "contact-sheet.png")}`);
}
