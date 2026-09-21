# Crab vs Bugs 🦀

A tiny browser pixel platformer starring a little orange crab. Opens from a link, plays in a couple of minutes, no install, no sign-up. Made for a post on X.

> **Disclaimer:** fan-made, non-commercial tribute. Not affiliated with or endorsed by Anthropic. The crab is our own pixel-art take on Anthropic's Clawd character.

## Play

- **Desktop:** `←`/`→` or `A`/`D` to move, `Space`/`↑`/`W` to jump (hold for a higher jump), `M` to mute.
- **Phone:** on-screen buttons — slide your thumb between ◀ ▶, tap ▲ to jump.
- Stomp bugs from above, grab coins, reach the flag. Spikes and bug bites send you back to the start.

## Develop

```bash
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on http://localhost:5173 |
| `npm run build` | type-check + production build into `dist/` |
| `npm run preview` | serve `dist/` locally |
| `npm run assets` | regenerate every PNG in `public/` from the ASCII art in `scripts/gen-assets.mjs` |

Stack: [Kaplay](https://kaplayjs.com) + TypeScript + Vite. No other runtime dependencies; sound effects are synthesised with the Web Audio API.

### Layout

```
src/
  main.ts          boot: load assets, bind input, register scenes
  k.ts             Kaplay instance + palette
  assets.ts        sprite sheets and animations
  input.ts         keyboard + touch pad → one action state
  sfx.ts           tiny synth for jump / coin / stomp / death / win
  level.ts         ASCII level (20x12 chunks) → collision boxes, coins, bugs, spawn, flag
  player.ts        movement, coyote time, jump buffer, variable jump height
  enemy.ts         patrolling bug
  ui.ts            parallax backdrop, labels, buttons, fades
  scenes/          start, game, win
scripts/
  gen-assets.mjs   pixel art as ASCII grids → public/sprites/*.png, favicon.png, og.png
```

### Editing the level

The level lives in `src/level.ts` as a list of 20×12 text chunks joined left to right:

```
=  ground / platform     $  coin       ^  spikes
>  bug (patrols)         @  player     F  finish flag
```

Bugs walk up to 3 tiles each way from where they're placed and turn around at ledges, walls and spikes on their own. Must-do jumps should stay within 2 tiles up / 3 tiles across; anything harder belongs to an optional coin.

### Editing the art

Everything visual is an ASCII grid in `scripts/gen-assets.mjs`. Change it, run `npm run assets`, reload. Pass `--preview <dir>` to also write an upscaled contact sheet for eyeballing.

## Deploy (Vercel)

1. Push the repo to GitHub.
2. Import it on [vercel.com/new](https://vercel.com/new) — the Vite preset is picked up from `vercel.json`, nothing else to configure.
3. Done. The production URL is read from Vercel's build environment (`VERCEL_PROJECT_PRODUCTION_URL`) and baked into the Open Graph tags, so the link unfurls into a card with `og.png` on X.

Deploying somewhere else? Set `SITE_URL=https://your.domain` when building so the OG tags get absolute URLs.

## Non-goals

No ads, no payments, no tokens, no analytics. Ever.
