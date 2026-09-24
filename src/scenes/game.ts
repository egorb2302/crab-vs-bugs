import { TILE_FRAME } from "../assets";
import { challengeFor } from "../challenge";
import { startCapture, stopCapture } from "../clip";
import { BUG_H, addBug, squashBug, type Bug } from "../enemy";
import { addFx, burst, ring } from "../fx";
import { onPress, setPlaying } from "../input";
import { COLORS, k } from "../k";
import { TILE, parseLevel, type Box, type Level } from "../level";
import { LEVELS } from "../levels";
import { addLighting } from "../light";
import { hitstop, shake } from "../motion";
import { duckMusic, playMusic } from "../music";
import { addPlatform } from "../platform";
import { recordRun } from "../progress";
import { GRAVITY, addPlayer, stompBounce } from "../player";
import { sfx } from "../sfx";
import { THEMES, tileSprite } from "../themes";
import { addBackdrop, addLabel, fadeIn, fadeTo, formatTime } from "../ui";
import type { RunResult } from "./win";

export interface GameArgs {
  level: number;
  /** in a full run: deaths across the whole run */
  deaths: number;
  /** set while playing all levels back to back */
  run?: FullRun;
}

export interface FullRun {
  /** clock time carried over from the levels (and attempts) before this one */
  elapsed: number;
}

// Tiles are drawn straight from the map, only the columns in view — no game object per tile.
function addTilemap(level: Level, sprite: string, underside: ReturnType<typeof k.rgb>) {
  k.add([
    k.z(-10),
    {
      draw() {
        const camX = k.getCamPos().x;
        const first = Math.max(0, Math.floor((camX - k.width() / 2) / TILE) - 1);
        const last = Math.min(level.cols - 1, Math.ceil((camX + k.width() / 2) / TILE) + 1);
        for (let r = 0; r < level.rows; r++) {
          for (let c = first; c <= last; c++) {
            const ch = level.at(c, r);
            const pos = k.vec2(c * TILE, r * TILE);
            if (ch === "=") {
              const buried = level.at(c, r - 1) === "=";
              k.drawSprite({ sprite, frame: buried ? TILE_FRAME.body : TILE_FRAME.top, pos });
              // floating platforms get a shaded underside
              if (r < level.rows - 1 && level.at(c, r + 1) !== "=") {
                k.drawRect({ pos: k.vec2(c * TILE, (r + 1) * TILE - 2), width: TILE, height: 2, color: underside });
              }
            } else if (ch === "^") {
              k.drawSprite({ sprite, frame: TILE_FRAME.spikes, pos });
            } else if (ch === "~") {
              const deep = level.at(c, r - 1) === "~";
              k.drawSprite({ sprite, frame: deep ? TILE_FRAME.liquidBody : TILE_FRAME.liquidTop, pos });
            }
          }
        }
      },
    },
  ]);
}

function addSolid(box: Box) {
  k.add([k.pos(box.x, box.y), k.area({ shape: new k.Rect(k.vec2(0, 0), box.w, box.h) }), k.body({ isStatic: true })]);
}

const BUG_BITS = [k.rgb("#b13e53"), k.rgb("#e0697c"), k.rgb("#5d275d")];
const CRAB_BITS = [COLORS.orange, k.rgb("#eca184"), k.rgb("#a9522f")];
const CONFETTI = [COLORS.orange, COLORS.yellow, COLORS.green, k.rgb("#73eff7"), COLORS.white];

/** A HUD icon that jumps when its counter goes up. */
function addCounterIcon(sprite: string, x: number, y: number) {
  let kick = 0;
  const icon = k.add([k.sprite(sprite), k.pos(x, y), k.anchor("center"), k.scale(1), k.fixed(), k.z(100)]);
  icon.onUpdate(() => {
    kick = Math.max(0, kick - k.dt() * 5);
    icon.scale = k.vec2(1 + kick * 0.6);
  });
  return () => (kick = 1);
}

export function registerGameScene() {
  k.scene("game", (args: GameArgs = { level: 0, deaths: 0 }) => {
    const index = Math.min(Math.max(args.level, 0), LEVELS.length - 1);
    const def = LEVELS[index];
    const theme = THEMES[def.theme];

    setPlaying(true);
    playMusic(def.theme);
    startCapture();
    k.onSceneLeave(() => {
      setPlaying(false);
      stopCapture();
    });
    k.setGravity(GRAVITY);
    addFx();

    const level = parseLevel(def);
    const W = k.width();
    const camY = level.height - k.height() / 2; // bottom of the level sits on the bottom of the screen
    const camX = (x: number) => Math.min(Math.max(x, W / 2), level.width - W / 2);

    addBackdrop(() => k.getCamPos().x - W / 2, def.theme);
    addTilemap(level, tileSprite(def.theme), theme.underside);
    level.solids.forEach(addSolid);
    // invisible walls at both ends of the level
    addSolid({ x: -TILE, y: -level.height, w: TILE, h: level.height * 2 });
    addSolid({ x: level.width, y: -level.height, w: TILE, h: level.height * 2 });

    for (const h of level.hazards) {
      k.add([k.pos(h.x, h.y), k.area({ shape: new k.Rect(k.vec2(0, 0), h.w, h.h) }), "hazard"]);
    }
    for (const c of level.coins) {
      const coin = k.add([
        k.sprite("coin", { anim: "spin" }),
        k.pos(c.x, c.y),
        k.anchor("center"),
        k.area({ shape: new k.Rect(k.vec2(0, 0), 10, 10) }),
        k.z(4),
        "coin",
      ]);
      coin.onUpdate(() => (coin.pos.y = c.y + Math.sin(k.time() * 3 + c.x * 0.04) * 1.5));
    }
    // platforms go in before the player, so a ride is picked up on the same frame the plank moves
    level.platforms.forEach(addPlatform);
    for (const b of level.bugs) addBug(b.x, b.y, b.minX, b.maxX);
    k.add([
      k.sprite("flag", { anim: "wave" }),
      k.pos(level.flag.x, level.flag.y),
      k.anchor("bot"),
      k.area({ shape: new k.Rect(k.vec2(0, 0), 12, 32) }),
      k.z(3),
      "flag",
    ]);

    const player = addPlayer(level.spawn.x, level.spawn.y, theme.dust);
    // the camera trails the crab a little and looks ahead the way it's running
    const LOOK_AHEAD = 22;
    let look = 0;
    let cam = camX(player.pos.x);
    k.setCamPos(cam, camY);

    const flagGlow = k.vec2(level.flag.x + 4, level.flag.y - 24);
    addLighting(
      def.theme,
      () => (player.exists() ? player.pos.sub(0, 6) : null),
      () => [flagGlow, ...k.get("coin").map((c) => c.pos)],
    );

    let time = 0;
    let coins = 0;
    let bugs = 0;
    let over = false;
    let stompedAt = -1;
    const run = args.run ?? null;
    const dare = challengeFor(run ? "all" : index);
    // in a full run the clock keeps going across levels, deaths and restarts
    const clock = () => (run?.elapsed ?? 0) + time;
    const carry = (): FullRun | undefined => (run ? { elapsed: clock() } : undefined);

    // hud
    const coinKick = addCounterIcon("coin", 10, 8);
    addLabel(() => `${coins}/${level.coins.length}`, 18, 5);
    const bugKick = addCounterIcon("bug", 80, 3);
    addLabel(() => `${bugs}/${level.bugs.length}`, 91, 5);
    addLabel(() => formatTime(clock()), W - 4, 5, { anchor: "topright" });
    if (dare) {
      addLabel(`VS ${formatTime(dare.time)}`, W - 4, 15, {
        size: 6,
        anchor: "topright",
        color: () => (clock() > dare.time ? COLORS.red : COLORS.muted),
      });
    }
    const title = run ? `RUN ${index + 1}/${LEVELS.length} - ${def.name}` : `${index + 1}. ${def.name}`;
    addLabel(title, 3, k.height() - 3, { size: 6, color: COLORS.muted, anchor: "botleft" });

    function die() {
      if (over) return;
      over = true;
      sfx.death();
      duckMusic(0.8);
      shake(5);
      burst(player.pos.sub(0, 6), CRAB_BITS, 10, 80, 500);
      player.destroy();
      // the body gets the classic send-off: pop up, spin, drop off the screen
      const corpse = k.add([k.sprite("crab", { anim: "dead" }), k.pos(player.pos.sub(0, 8)), k.anchor("center"), k.rotate(0), k.z(20)]);
      let vy = -300;
      corpse.onUpdate(() => {
        vy += GRAVITY * 0.8 * k.dt();
        corpse.pos.y += vy * k.dt();
        corpse.angle += 540 * k.dt();
      });
      hitstop(0.09);
      k.wait(0.85, () => fadeTo("game", { level: index, deaths: args.deaths + 1, run: carry() }));
    }

    function win() {
      if (over) return;
      over = true;
      player.frozen = true;
      sfx.win();
      duckMusic(1.4);
      const top = k.vec2(level.flag.x + 4, level.flag.y - 28);
      burst(top, CONFETTI, 24, 110, 260);
      ring(top, COLORS.yellow, 16, 0.35);
      const result: RunResult = {
        level: index,
        time,
        coins,
        totalCoins: level.coins.length,
        bugs,
        totalBugs: level.bugs.length,
        deaths: args.deaths,
      };
      if (!run) {
        k.wait(0.9, () => {
          stopCapture(); // the clip ends on the confetti, not on the fade
          fadeTo("win", result);
        });
        return;
      }
      // full run: bank the level like any other clear, then straight on to the next one
      recordRun(def.id, time, coins);
      const next = index + 1;
      addLabel(`${next}/${LEVELS.length} DONE`, W / 2, k.height() / 2 - 20, { size: 8, color: COLORS.green, anchor: "center" });
      k.wait(0.9, () => {
        if (next < LEVELS.length) return fadeTo("game", { level: next, deaths: args.deaths, run: carry() });
        stopCapture();
        fadeTo("win", { ...result, time: clock(), fullRun: true });
      });
    }

    player.onCollide("coin", (coin) => {
      coin.destroy();
      coins++;
      sfx.coin();
      coinKick();
      burst(coin.pos, [COLORS.yellow, COLORS.white], 8, 60);
      ring(coin.pos, COLORS.yellow, 9);
    });
    player.onCollide("hazard", die);
    player.onCollide("flag", win);
    player.onCollide("bug", (obj) => {
      const bug = obj as Bug;
      if (over || !bug.alive) return;
      // where the feet were a frame ago, so fast falls still register as coming from above
      const feetBefore = player.pos.y - player.vel.y * k.dt();
      const fromAbove = player.vel.y > 0 && feetBefore <= bug.pos.y - BUG_H + 4;
      // two bugs stacked up: the first stomp already sent the crab upward, the second still counts
      const sameStomp = time - stompedAt < 0.05 && player.pos.y <= bug.pos.y - BUG_H / 2;
      if (fromAbove || sameStomp) {
        stompedAt = time;
        squashBug(bug);
        stompBounce(player);
        bugs++;
        sfx.stomp();
        bugKick();
        burst(bug.pos.sub(0, 4), BUG_BITS, 7, 70, 420);
        shake(1.5);
        hitstop(0.05);
      } else {
        die();
      }
    });

    k.onUpdate(() => {
      if (over) return;
      const dt = k.dt();
      time += dt;
      // keep the last direction while standing still, so the view doesn't swing back and forth
      if (Math.abs(player.vel.x) > 30) look += (Math.sign(player.vel.x) * LOOK_AHEAD - look) * (1 - Math.exp(-dt * 2.5));
      cam += (camX(player.pos.x + look) - cam) * (1 - Math.exp(-dt * 9));
      k.setCamPos(Math.round(cam), camY);
      // off the bottom — or, should the physics ever blow up, off the map entirely
      if (player.pos.y > level.height + 32 || !Number.isFinite(player.pos.x + player.pos.y)) die();
    });

    // quick keys: R starts the level over, Esc backs out to the level list
    const off = [
      onPress("restart", () => {
        if (over) return;
        over = true;
        fadeTo("game", { level: index, deaths: args.deaths, run: carry() }, 0.2);
      }),
      onPress("back", () => {
        if (over) return;
        over = true;
        fadeTo("levels", index, 0.15);
      }),
    ];
    k.onSceneLeave(() => off.forEach((fn) => fn()));

    fadeIn();
  });
}
