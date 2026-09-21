import type { Vec2 } from "kaplay";
import { TILE_FRAME } from "../assets";
import { BUG_H, addBug, squashBug, type Bug } from "../enemy";
import { setPlaying } from "../input";
import { COLORS, k } from "../k";
import { TILE, parseLevel, type Box, type Level } from "../level";
import { GRAVITY, addPlayer, stompBounce } from "../player";
import { sfx } from "../sfx";
import { addBackdrop, addLabel, fadeIn, fadeTo, formatTime } from "../ui";
import type { RunResult } from "./win";

const UNDERSIDE = k.rgb(57, 45, 79);

// Tiles are drawn straight from the map, only the columns in view — no game object per tile.
function addTilemap(level: Level) {
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
            if (ch === "=") {
              const buried = level.at(c, r - 1) === "=";
              k.drawSprite({ sprite: "tiles", frame: buried ? TILE_FRAME.dirt : TILE_FRAME.grass, pos: k.vec2(c * TILE, r * TILE) });
              // floating platforms get a shaded underside
              if (r < level.rows - 1 && level.at(c, r + 1) !== "=") {
                k.drawRect({ pos: k.vec2(c * TILE, (r + 1) * TILE - 2), width: TILE, height: 2, color: UNDERSIDE });
              }
            } else if (ch === "^") {
              k.drawSprite({ sprite: "tiles", frame: TILE_FRAME.spikes, pos: k.vec2(c * TILE, r * TILE) });
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

function sparkle(at: Vec2) {
  for (let i = 0; i < 6; i++) {
    k.add([
      k.rect(1, 1),
      k.pos(at),
      k.color(COLORS.yellow),
      k.opacity(1),
      k.move(i * 60 + k.rand(0, 40), k.rand(30, 70)),
      k.lifespan(0.3, { fade: 0.2 }),
      k.z(30),
    ]);
  }
}

export function registerGameScene() {
  k.scene("game", (run: { deaths: number } = { deaths: 0 }) => {
    setPlaying(true);
    k.onSceneLeave(() => setPlaying(false));
    k.setGravity(GRAVITY);

    const level = parseLevel();
    const W = k.width();
    const camY = level.height - k.height() / 2; // bottom of the level sits on the bottom of the screen
    const camX = (x: number) => Math.min(Math.max(x, W / 2), level.width - W / 2);

    addBackdrop(() => k.getCamPos().x - W / 2);
    addTilemap(level);
    level.solids.forEach(addSolid);
    // invisible walls at both ends of the level
    addSolid({ x: -TILE, y: -level.height, w: TILE, h: level.height * 2 });
    addSolid({ x: level.width, y: -level.height, w: TILE, h: level.height * 2 });

    for (const s of level.spikes) {
      k.add([k.pos(s.x, s.y), k.area({ shape: new k.Rect(k.vec2(0, 0), s.w, s.h) }), "spike"]);
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
    for (const b of level.bugs) addBug(b.x, b.y, b.minX, b.maxX);
    k.add([
      k.sprite("flag", { anim: "wave" }),
      k.pos(level.flag.x, level.flag.y),
      k.anchor("bot"),
      k.area({ shape: new k.Rect(k.vec2(0, 0), 12, 32) }),
      k.z(3),
      "flag",
    ]);

    const player = addPlayer(level.spawn.x, level.spawn.y);
    k.setCamPos(camX(player.pos.x), camY);

    let time = 0;
    let coins = 0;
    let bugs = 0;
    let over = false;

    // hud
    k.add([k.sprite("coin"), k.pos(2, 0), k.fixed(), k.z(100)]);
    addLabel(() => `${coins}/${level.coins.length}`, 18, 5);
    k.add([k.sprite("bug"), k.pos(72, -5), k.fixed(), k.z(100)]);
    addLabel(() => `${bugs}/${level.bugs.length}`, 91, 5);
    addLabel(() => formatTime(time), W - 4, 5, { anchor: "topright" });

    function die() {
      if (over) return;
      over = true;
      sfx.death();
      k.shake(5);
      player.destroy();
      // the body gets the classic send-off: pop up, spin, drop off the screen
      const corpse = k.add([k.sprite("crab", { anim: "dead" }), k.pos(player.pos.sub(0, 8)), k.anchor("center"), k.rotate(0), k.z(20)]);
      let vy = -300;
      corpse.onUpdate(() => {
        vy += GRAVITY * 0.8 * k.dt();
        corpse.pos.y += vy * k.dt();
        corpse.angle += 540 * k.dt();
      });
      k.wait(0.85, () => fadeTo("game", { deaths: run.deaths + 1 }));
    }

    function win() {
      if (over) return;
      over = true;
      player.frozen = true;
      sfx.win();
      const result: RunResult = {
        time,
        coins,
        totalCoins: level.coins.length,
        bugs,
        totalBugs: level.bugs.length,
        deaths: run.deaths,
      };
      k.wait(0.9, () => fadeTo("win", result));
    }

    player.onCollide("coin", (coin) => {
      coin.destroy();
      coins++;
      sfx.coin();
      sparkle(coin.pos);
    });
    player.onCollide("spike", die);
    player.onCollide("flag", win);
    player.onCollide("bug", (obj) => {
      const bug = obj as Bug;
      if (over || !bug.alive) return;
      // where the feet were a frame ago, so fast falls still register as coming from above
      const feetBefore = player.pos.y - player.vel.y * k.dt();
      if (player.vel.y > 0 && feetBefore <= bug.pos.y - BUG_H + 4) {
        squashBug(bug);
        stompBounce(player);
        bugs++;
        sfx.stomp();
      } else {
        die();
      }
    });

    k.onUpdate(() => {
      if (over) return;
      time += k.dt();
      k.setCamPos(camX(player.pos.x), camY);
      if (player.pos.y > level.height + 32) die();
    });

    fadeIn();
  });
}
