// After `vite build`: writes dist/sw.js from scripts/sw.js, with the list of files the game
// needs offline and a version that changes whenever any of them does — a changed sw.js is
// what tells browsers there's a new build to fetch.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

// the link-preview picture is for crawlers, and the worker must not cache itself
const SKIP = new Set(["og.png", "sw.js"]);

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const files = walk(DIST)
  .map((file) => relative(DIST, file).split(sep).join("/"))
  .filter((file) => !SKIP.has(file))
  .sort();
if (!files.includes("index.html")) throw new Error("build-sw: dist/index.html is missing — run vite build first");

const template = readFileSync(join(ROOT, "scripts", "sw.js"), "utf8");
const hash = createHash("sha256").update(template);
for (const file of files) hash.update(file).update(readFileSync(join(DIST, file)));
const version = hash.digest("hex").slice(0, 12);

const sw = template.replace('"__VERSION__"', JSON.stringify(version)).replace("/* __FILES__ */ []", JSON.stringify(files));
if (sw.includes("__VERSION__") || sw.includes("__FILES__")) throw new Error("build-sw: placeholders not found in scripts/sw.js");
writeFileSync(join(DIST, "sw.js"), sw);

const kb = files.reduce((sum, file) => sum + readFileSync(join(DIST, file)).length, 0) / 1024;
console.log(`sw.js ${version}: ${files.length} files, ${kb.toFixed(0)} KB precached`);
