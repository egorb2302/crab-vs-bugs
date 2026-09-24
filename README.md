# Crab vs Bugs 🦀

A tiny browser pixel platformer starring a little orange crab: **11 levels across five locations** — meadow, dunes, cavern, glacier and foundry. Opens from a link, plays in a couple of minutes, no install, no sign-up. Made for a post on X.

> **Disclaimer:** fan-made, non-commercial tribute. Not affiliated with or endorsed by Anthropic. The crab is our own pixel-art take on Anthropic's Clawd character.

## Play

- **Desktop:** `←`/`→` or `A`/`D` to move, `Space`/`↑`/`W` to jump (hold for a higher jump), `R` to restart a level, `Esc` for the level list, `M` to mute.
- **Phone:** on-screen buttons — slide your thumb between ◀ ▶, tap ▲ to jump.
- Stomp bugs from above, grab coins, reach the flag. Spikes, water, lava and bug bites send you back to the start of the level.
- Levels unlock one by one; each one keeps your best time.
- **Speedrun:** all 11 levels back to back on one clock (deaths and restarts keep it running) — the button is on the level list.
- **Dares:** every result you share is a link like `/r/hop-scotch/24.3` (or `/r/all/…` for a speedrun). It unfurls into a card of its own — that level's location, your time, the level's name — and opens the game at `/?beat=hop-scotch&time=24.3`. Whoever opens it gets your time to beat on the start screen and in the HUD, and a verdict at the flag. Nothing is stored anywhere — the dare lives in the link.
- Sharing uses the phone's own share sheet; on desktop it's a post on X or a copied link.
- **Clips:** after the flag, **CLIP** turns the last six seconds of the run into a short video with an end card — your time, the level, the address — ready to post: MP4 where the browser can record one, WebM where it can't. While you play, those seconds are only kept as small snapshots in memory; nothing is recorded unless you press the button, and nothing leaves your device unless you share it. A browser that can't record video gets the end card as a PNG (**PIC**).
- **Level editor:** **EDITOR** on the level list (or `/editor.html`). Paint tiles, pick a location, and the same check the build runs tells you live whether the flag can be reached — the green tint is everywhere the crab can stand. **PLAY** tries it at once; **SHARE LINK** puts the whole level inside a link (`/#play=…`, a few hundred characters), so whoever opens it gets your level on the start screen and can hit **EDIT** after the flag to remix it. Nothing is uploaded: there's no server behind it and no account. Homemade levels don't touch your progress or best times.
- **Install & offline:** it's a web app — **INSTALL** on the start screen (Chrome, Edge, Android) or Share → *Add to Home Screen* (iPhone, iPad) puts it on your home screen, full screen, with its own icon. Once it has been opened, the whole game (265 KB) is cached and plays without a connection; progress stays on the device as always, and dare links opened offline still bring their dare along.
- If your system asks for reduced motion, the game drops screen shake, parallax, weather and wipes — it plays exactly the same.

## Develop

```bash
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on http://localhost:5173 |
| `npm run build` | check levels + type-check + production build into `dist/`, then the offline service worker |
| `npm run preview` | serve `dist/` locally |
| `npm run levels` | validate every map (add `--map` to print them) and refresh `api/_levels.js` |
| `npm run assets` | regenerate every PNG in `public/` from the ASCII art in `scripts/art.mjs` |

Stack: [Kaplay](https://kaplayjs.com) + TypeScript + Vite. No other runtime dependencies; sound effects and the music are synthesised with the Web Audio API — every world has its own chiptune loop, composed from hand-written chords with a seeded melody, and lighting is one small dithered shader. `npm run levels` imports the TypeScript level data directly, so it wants Node 22.18+ (24 is what CI and Vercel use).

`vite.config.ts` also patches a few bugs in Kaplay 3001.0.19 as the bundle is loaded (a physics-interpolation crash, a collision-grid hang on a runaway object, a long-delayed error screen); each patch must match exactly, so a Kaplay upgrade fails the build rather than quietly losing one. If anything still throws, the game reloads itself instead of freezing — progress is kept.

### Layout

```
src/
  main.ts          boot: load assets, bind input, register scenes
  k.ts             Kaplay instance + palette
  assets.ts        sprite sheets and animations
  themes.ts        the five locations: sky, stars, parallax, tile sheet
  input.ts         keyboard + touch pad → one action state
  sfx.ts           tiny synth for jump / land / coin / stomp / death / win
  music.ts         per-world chiptune loops, scheduled on the audio clock
  light.ts         darkness, the crab's light and glows, as a dithered shader
  fx.ts            particle pool: dust, sparkles, bug bits, confetti
  motion.ts        reduced-motion switch, screen shake, hitstop
  weather.ts       fireflies, sand, cave dust, snow and embers per location
  levels.ts        all 11 maps, as ASCII chunks
  level.ts         one map → collision boxes, hazards, coins, bugs, rails, spawn, flag
  validate.ts      the map check: shape, legend, rails, patrols, reachability (build + editor)
  levelcode.ts     a level ⇄ the code in a #play= link (deflated JSON, URL-safe base64)
  editor/          the level editor page (editor.html): a plain canvas, no game engine
  player.ts        momentum, coyote time, jump buffer, variable jump height, squash & stretch —
                   movement runs on the fixed 50 Hz physics step, so it feels the same at any refresh rate
  enemy.ts         patrolling bug
  platform.ts      plank that shuttles along a rail
  progress.ts      unlocked levels, best times, best speedrun (localStorage)
  challenge.ts     dare links: parse ?beat=…&time=…, build them for sharing
  install.ts       the INSTALL link (beforeinstallprompt) and service worker registration
  share.ts         share sheet on phones, X intent and copy-link on desktop, saving a clip
  clip.ts          the run clip: a ring of snapshots while playing, replayed into a MediaRecorder
  ui.ts            parallax backdrop, labels, buttons, fades
  scenes/          start (with its little stomp loop), levels, game, win
scripts/
  art.mjs          all the pixel art as ASCII grids, a tiny raster + PNG encoder, the OG and dare cards
  gen-assets.mjs   writes public/sprites/*.png, icons/*.png, favicon.png, og.png
  sw.js            the service worker, as a template: precache, network-first pages, offline dares
  build-sw.mjs     fills it in after vite build (file list + version) and writes dist/sw.js
  check-levels.mjs runs src/validate.ts over every level, plus the dare-card checks (id, font)
api/
  dare.js          Vercel function behind /r/…: a page with the dare's link preview, and the card PNG
  _levels.js       ids, names and locations for it, generated by npm run levels
```

### Editing the levels

The easy way is the editor: `npm run dev`, open http://localhost:5173/editor.html, draw, and **COPY FOR levels.ts** gives you the level in the exact format below, ready to paste into the list.

Levels live in `src/levels.ts` as 20×12 text chunks joined left to right. Rows may be written short — they're padded with sky.

```
=  solid        $  coin        ^  spikes      ~  lava / water
>  bug          @  spawn       F  finish      -  rail: moving platform, horizontal
                                              |  rail: moving platform, vertical
```

A rail is drawn where the plank travels: `-------` is a 2-tile plank shuttling along those seven tiles, `|` stacked down a column is the same thing vertically. Bugs walk up to 3 tiles each way from where they're placed and turn around at ledges, walls and hazards on their own.

Must-do jumps stay within **2 tiles up / 3 tiles across**; anything tighter belongs to an optional coin. `npm run levels` re-checks all of that — chunk shape, legend, bug patrols, and whether the flag and every coin can actually be reached — and `npm run build` refuses to build if a map is broken. The check itself is `src/validate.ts`, the same code the editor runs on every stroke.

Each level names its location (`theme`), which picks the tile sheet, sky, stars and parallax strips from `src/themes.ts`.

### Editing the art

Everything visual is an ASCII grid in `scripts/art.mjs`. Change it, run `npm run assets`, reload. Pass `--preview <dir>` to also write an upscaled contact sheet for eyeballing.

## Deploy (Vercel)

1. Push the repo to GitHub.
2. Import it on [vercel.com/new](https://vercel.com/new) — the Vite preset is picked up from `vercel.json`, nothing else to configure.
3. Done. The production URL is read from Vercel's build environment (`VERCEL_PROJECT_PRODUCTION_URL`) and baked into the Open Graph tags, so the link unfurls into a card with `og.png` on X. Dare links (`/r/…`) are served by `api/dare.js`, which Vercel deploys on its own; it draws each card on the fly with the game's own pixel art and caches it on the CDN.

Deploying somewhere else? Set `SITE_URL=https://your.domain` when building so the OG tags get absolute URLs. Without the function, shared links still work in their long `/?beat=…` form — that's what `npm run dev` hands out.

## Non-goals

No ads, no payments, no tokens, no analytics. Ever.
