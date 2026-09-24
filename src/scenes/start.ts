import { challenge } from "../challenge";
import { addFx, dust } from "../fx";
import { isTouchDevice, onPress, setPlaying } from "../input";
import { canInstall, install } from "../install";
import { COLORS, k } from "../k";
import { LEVELS } from "../levels";
import { reducedMotion } from "../motion";
import { playMusic } from "../music";
import { clearedCount, currentLevel } from "../progress";
import { isMuted, sfx, toggleMute } from "../sfx";
import { THEMES } from "../themes";
import { addBackdrop, addButton, addGroundStrip, addLabel, fadeIn, fadeTo, formatTime, menuOffsetY } from "../ui";
import type { CustomLevel } from "./game";

const BUG_SPEED = 30;
const BUG_GAP = 120;
const HOP_TIME = 0.5;
const HOP_HEIGHT = 26;

/** CRAB vs BUGS, letter by letter, riding a slow wave. */
function addTitle(cx: number, y: number) {
  const big = k.width() >= 320 ? 24 : 16;
  const gap = big / 2;
  const left = cx - (8 * big + 16 + 2 * gap) / 2;
  const letters = [
    ...[..."CRAB"].map((ch, i) => ({ ch, x: left + i * big, color: COLORS.orange })),
    ...[..."BUGS"].map((ch, i) => ({ ch, x: left + 4 * big + 16 + 2 * gap + i * big, color: COLORS.red })),
  ];
  const shadow = Math.round(big / 8);
  k.add([
    k.fixed(),
    k.z(100),
    {
      draw() {
        letters.forEach(({ ch, x, color }, i) => {
          const bob = reducedMotion ? 0 : Math.round(Math.sin(k.time() * 3 - i * 0.55) * 1.5);
          const pos = k.vec2(x, y + bob);
          k.drawText({ text: ch, size: big, pos: pos.add(shadow, shadow), color: COLORS.ink });
          k.drawText({ text: ch, size: big, pos, color });
        });
      },
    },
  ]);
  addLabel("vs", left + 4 * big + gap, y + big - 8, { color: COLORS.white });
}

/** The whole game in one loop: bugs march in from the flag, the crab hops on each one. */
function addStompLoop(cx: number, groundY: number) {
  const dustColor = THEMES.meadow.dust;
  const crab = k.add([k.sprite("crab", { anim: "idle" }), k.pos(cx - 72, groundY), k.anchor("bot"), k.scale(2), k.fixed()]);
  const bugs = [0, 1, 2].map((i) => {
    const obj = k.add([k.sprite("bug", { anim: "walk" }), k.pos(cx + 40 + i * BUG_GAP, groundY), k.anchor("bot"), k.scale(2), k.opacity(1), k.fixed()]);
    return { obj, alive: true, fade: 0 };
  });

  let hop = -1; // seconds into the current hop, -1 when standing
  let target: (typeof bugs)[number] | null = null;
  let squash = 0;

  k.onUpdate(() => {
    const dt = k.dt();
    for (const bug of bugs) {
      if (bug.alive) {
        bug.obj.pos.x -= BUG_SPEED * dt;
        // near enough that a hop lands right on it
        if (hop < 0 && bug.obj.pos.x - crab.pos.x <= BUG_SPEED * HOP_TIME) {
          hop = 0;
          target = bug;
          crab.play("jump");
          dust(crab.pos, dustColor, 3);
        }
      } else if ((bug.fade += dt) > 0.4) {
        // back of the queue, off to the right
        const last = Math.max(...bugs.map((b) => b.obj.pos.x));
        bug.obj.pos.x = Math.max(last, k.width()) + BUG_GAP;
        bug.obj.opacity = 1;
        bug.obj.play("walk");
        bug.alive = true;
      } else {
        bug.obj.opacity = 1 - bug.fade / 0.4;
      }
    }

    if (hop >= 0) {
      hop += dt;
      const t = Math.min(hop / HOP_TIME, 1);
      crab.pos.y = groundY - Math.sin(t * Math.PI) * HOP_HEIGHT;
      if (t > 0.8 && target?.alive) {
        target.alive = false;
        target.fade = 0;
        target.obj.play("squash");
      }
      if (t >= 1) {
        hop = -1;
        target = null;
        squash = 1;
        crab.play("idle");
        dust(crab.pos, dustColor, 4);
      }
    }
    squash = Math.max(0, squash - dt * 6);
    crab.scale = k.vec2(2 * (1 + squash * 0.25), 2 * (1 - squash * 0.2));
  });
}

export function registerStartScene() {
  // with a homemade level from a link, PLAY plays that one
  k.scene("start", (custom?: CustomLevel) => {
    setPlaying(false);
    playMusic("meadow");
    const W = k.width();
    const cx = W / 2;
    const oy = menuOffsetY();
    const groundY = oy + 132;

    let scroll = 0;
    k.onUpdate(() => (scroll += 14 * k.dt()));
    addBackdrop(() => scroll);
    addGroundStrip(groundY);
    addFx();

    addTitle(cx, oy + 14);

    const cleared = clearedCount();
    // opened from someone's shared result: their time is the dare, and PLAY takes it up
    const dare = custom ? null : challenge;
    const subtitle = custom
      ? `HOMEMADE LEVEL: ${custom.def.name}`
      : dare
      ? `DARE: ${dare.target === "all" ? `ALL ${LEVELS.length} LEVELS` : LEVELS[dare.target].name} IN ${formatTime(dare.time)}`
      : cleared > 0
        ? `${cleared}/${LEVELS.length} LEVELS CLEARED`
        : `${LEVELS.length} LEVELS`;
    addLabel(subtitle, cx, oy + 44, { size: 6, color: dare || custom ? COLORS.yellow : COLORS.muted, anchor: "top" });

    k.add([k.sprite("flag", { anim: "wave" }), k.pos(W - 20, groundY), k.anchor("bot"), k.scale(2), k.fixed()]);
    addStompLoop(cx, groundY);

    let starting = false;
    const start = () => {
      if (starting) return;
      starting = true;
      sfx.select();
      if (custom) fadeTo("game", { level: 0, deaths: 0, custom });
      else if (dare?.target === "all") fadeTo("game", { level: 0, deaths: 0, run: { elapsed: 0 } });
      else fadeTo("game", { level: dare ? dare.target : currentLevel(), deaths: 0 });
    };
    const openList = () => {
      if (starting) return;
      starting = true;
      sfx.select();
      fadeTo("levels", currentLevel());
    };

    const playText = custom ? "PLAY" : dare ? "ACCEPT" : cleared > 0 ? "CONTINUE" : "PLAY";
    const playW = playText.length * 8 + 16;
    const listW = 6 * 8 + 16;
    const total = playW + 10 + listW;
    const play = addButton(playText, cx - total / 2 + playW / 2, oy + 62, start);
    const list = addButton("LEVELS", cx + total / 2 - listW / 2, oy + 62, openList, COLORS.white);

    addLabel(isTouchDevice ? "TAP TO PLAY" : "ARROWS / WASD + SPACE", cx, oy + 84, { size: 6, color: COLORS.muted, anchor: "center" });

    const sound = k.add([k.pos(W - 4, 4), k.anchor("topright"), k.area({ shape: new k.Rect(k.vec2(0, 0), 60, 12), cursor: "pointer" }), k.fixed()]);
    addLabel(() => (isMuted() ? "SOUND OFF" : "SOUND ON"), W - 4, 4, { size: 6, color: COLORS.muted, anchor: "topright" });
    sound.onClick(() => {
      if (!toggleMute()) sfx.select();
    });

    // shows up once the browser says the game can be installed, which may be a moment after load
    const installer = k.add([k.pos(4, 4), k.area({ shape: new k.Rect(k.vec2(0, 0), 48, 12), cursor: "pointer" }), k.fixed()]);
    addLabel(() => (canInstall() ? "INSTALL" : ""), 4, 4, { size: 6, color: COLORS.muted });
    // as of the last frame: a tap on INSTALL clears the offer before the start-anywhere check sees it
    let installShown = false;
    k.onUpdate(() => (installShown = canInstall()));
    installer.onClick(() => {
      if (!canInstall()) return;
      sfx.select();
      install();
    });

    addLabel("FAN-MADE, NON-COMMERCIAL TRIBUTE.\nNOT AFFILIATED WITH OR ENDORSED BY ANTHROPIC.", cx, k.height() - 3, {
      size: 6,
      anchor: "bot",
      align: "center",
      width: W - 8,
      opacity: 0.85,
    });

    // anywhere else on the screen starts the game — phones shouldn't have to hit a small button
    k.onMousePress(() => {
      if (sound.isHovering() || play.isHovering() || list.isHovering()) return;
      if (installShown && installer.isHovering()) return;
      start();
    });
    const off = [onPress("jump", start), onPress("confirm", start), onPress("back", openList)];
    k.onSceneLeave(() => off.forEach((fn) => fn()));

    fadeIn();
  });
}
