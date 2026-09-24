import { defineConfig, type Plugin } from "vite";

// X only unfurls cards with absolute image URLs, so OG tags need the real origin.
// SITE_URL wins; on Vercel the production domain is picked up automatically.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const siteUrl = (
  env.SITE_URL ?? (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
).replace(/\/$/, "");

// Fixes to Kaplay 3001.0.19 itself, applied to its bundle as it's loaded. Each must match
// exactly once — a Kaplay upgrade that changes the code fails the build instead of silently
// dropping a fix.
const KAPLAY_FIXES: [what: string, from: string, to: string][] = [
  [
    // A body's render interpolation reads the snapshot its last physics step took, but that step
    // skips the snapshot when it sees no leftover time — at a time scale of 0, or when the frame's
    // time lands exactly on a step boundary. The next frame then throws on `null.x` and the game
    // freezes. Without a snapshot there's nothing to interpolate: just skip it.
    "body interpolation without a snapshot",
    "let u=un();u&&(",
    "let u=un();u&&s&&(",
  ],
  [
    // The collision grid walks every cell an object's box covers. A box at ±Infinity (or so far out
    // that +1 no longer changes the number) makes that walk endless and hangs the tab for good.
    // Such an object can't touch anything anyway, so it's left out of the grid.
    "collision grid walk over a non-finite box",
    "wn=new Set;for(let Xe=dr;Xe<=hr;Xe++)",
    "wn=new Set;if(Number.isFinite(dr+fr+hr+gr)&&hr-dr<1e4&&gr-fr<1e4)for(let Xe=dr;Xe<=hr;Xe++)",
  ],
  [
    // After an uncaught error Kaplay restarts its loop to draw an error screen, but the restart
    // resets its clock to 0, so the screen only appears once as much time has passed as the page
    // had been open: after ten minutes of play, ten minutes of a frozen picture. Keep the clock.
    "error screen waiting out the page's age",
    "e.loopID=requestAnimationFrame(te)};te(0)}",
    "e.loopID=requestAnimationFrame(te)};te(e.realTime*1e3)}",
  ],
  [
    // Tell the page when Kaplay gives up, so src/main.ts can start the game over.
    "error signal for the page",
    "function xn(F){console.error(F),",
    'function xn(F){globalThis.dispatchEvent(new CustomEvent("kaplay-error",{detail:F})),console.error(F),',
  ],
];

function kaplayFixes(): Plugin {
  return {
    name: "kaplay-fixes",
    enforce: "pre",
    transform(code, id) {
      if (!/kaplay[\/]dist[\/]kaplay\.mjs/.test(id)) return;
      for (const [what, from, to] of KAPLAY_FIXES) {
        const count = code.split(from).length - 1;
        if (count !== 1) throw new Error(`kaplay-fixes: "${what}" matched ${count} times, expected 1 — check vite.config.ts`);
        code = code.replace(from, to);
      }
      return { code, map: null };
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    kaplayFixes(),
    {
      name: "site-url",
      transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", siteUrl),
    },
  ],
  // two pages: the game, and the level editor (which doesn't load the engine at all)
  build: { rolldownOptions: { input: { main: "index.html", editor: "editor.html" } } },
  // pre-bundled dependencies skip plugin transforms, and the fixes above must apply in dev too
  optimizeDeps: { exclude: ["kaplay"] },
});
