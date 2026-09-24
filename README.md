# Crab vs Bugs 🦀

A tiny browser pixel platformer starring a little orange crab: **11 levels across five locations** — meadow, dunes, cavern, glacier and foundry. Opens from a link, plays in a couple of minutes, no install, no sign-up. Made for a post on X.

> **Disclaimer:** fan-made, non-commercial tribute. Not affiliated with or endorsed by Anthropic. The crab is our own pixel-art take on Anthropic's Clawd character.

## Play

- **Desktop:** `←`/`→` or `A`/`D` to move, `Space`/`↑`/`W` to jump (hold for a higher jump), `R` to restart a level, `Esc` for the level list, `M` to mute.
- **Phone:** on-screen buttons — slide your thumb between ◀ ▶, tap ▲ to jump.
- Stomp bugs from above, grab coins, reach the flag. Spikes, water, lava and bug bites send you back to the start of the level.
- Levels unlock one by one; each one keeps your best time.
- If your system asks for reduced motion, the game drops screen shake, parallax, weather and wipes — it plays exactly the same.

## Develop

```bash
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on http://localhost:5173 |
| `npm run build` | check levels + type-check + production build into `dist/` |
| `npm run preview` | serve `dist/` locally |
| `npm run levels` | validate every map (add `--map` to print them) |
| `npm run assets` | regenerate every PNG in `public/` from the ASCII art in `scripts/gen-assets.mjs` |

Stack: [Kaplay](https://kaplayjs.com) + TypeScript + Vite. No other runtime dependencies; sound effects and the music are synthesised with the Web Audio API — every world has its own chiptune loop, composed from hand-written chords with a seeded melody, and lighting is one small dithered shader. `npm run levels` imports the TypeScript level data directly, so it wants Node 22.18+ (24 is what CI and Vercel use).

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
  player.ts        momentum, coyote time, jump buffer, variable jump height, squash & stretch
  enemy.ts         patrolling bug
  platform.ts      plank that shuttles along a rail
  progress.ts      unlocked levels and best times (localStorage)
  ui.ts            parallax backdrop, labels, buttons, fades
  scenes/          start (with its little stomp loop), levels, game, win
scripts/
  gen-assets.mjs   pixel art as ASCII grids → public/sprites/*.png, favicon.png, og.png
  check-levels.mjs map validation: shape, legend, patrols, reachability
```

### Editing the levels

Levels live in `src/levels.ts` as 20×12 text chunks joined left to right. Rows may be written short — they're padded with sky.

```
=  solid        $  coin        ^  spikes      ~  lava / water
>  bug          @  spawn       F  finish      -  rail: moving platform, horizontal
                                              |  rail: moving platform, vertical
```

A rail is drawn where the plank travels: `-------` is a 2-tile plank shuttling along those seven tiles, `|` stacked down a column is the same thing vertically. Bugs walk up to 3 tiles each way from where they're placed and turn around at ledges, walls and hazards on their own.

Must-do jumps stay within **2 tiles up / 3 tiles across**; anything tighter belongs to an optional coin. `npm run levels` re-checks all of that — chunk shape, legend, bug patrols, and whether the flag and every coin can actually be reached — and `npm run build` refuses to build if a map is broken.

Each level names its location (`theme`), which picks the tile sheet, sky, stars and parallax strips from `src/themes.ts`.

### Editing the art

Everything visual is an ASCII grid in `scripts/gen-assets.mjs`. Change it, run `npm run assets`, reload. Pass `--preview <dir>` to also write an upscaled contact sheet for eyeballing.

## Deploy (Vercel)

1. Push the repo to GitHub.
2. Import it on [vercel.com/new](https://vercel.com/new) — the Vite preset is picked up from `vercel.json`, nothing else to configure.
3. Done. The production URL is read from Vercel's build environment (`VERCEL_PROJECT_PRODUCTION_URL`) and baked into the Open Graph tags, so the link unfurls into a card with `og.png` on X.

Deploying somewhere else? Set `SITE_URL=https://your.domain` when building so the OG tags get absolute URLs.

## Non-goals

No ads, no payments, no tokens, no analytics. Ever.
