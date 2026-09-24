import { onPress, setPlaying } from "../input";
import { COLORS, k } from "../k";
import { LEVELS } from "../levels";
import { playMusic } from "../music";
import { bestFor, bestSpeedrun, clearedCount, isUnlocked } from "../progress";
import { sfx } from "../sfx";
import { THEMES } from "../themes";
import { addBackdrop, addButton, addLabel, fadeIn, fadeTo, formatTime, menuOffsetY, openEditor } from "../ui";

const CARD_W = 56;
const CARD_H = 30;
const GAP = 8;

const LOCKED_BG = k.rgb("#1f2335");
const CARD_BG = k.rgb("#333c57");

export function registerLevelsScene() {
  k.scene("levels", (focus: number = 0) => {
    setPlaying(false);
    playMusic("meadow");
    const W = k.width();
    const cx = W / 2;
    const oy = menuOffsetY();

    let scroll = 0;
    k.onUpdate(() => (scroll += 10 * k.dt()));
    addBackdrop(() => scroll);

    const cols = W >= 300 ? 4 : 3;
    const rows = Math.ceil(LEVELS.length / cols);
    const gridW = cols * CARD_W + (cols - 1) * GAP;
    const left = Math.round(cx - gridW / 2);
    // portrait stacks the grid one row deeper: pull everything up so the buttons stay on screen
    const top = Math.min(oy + 32, k.height() - rows * (CARD_H + GAP) - 36);

    addLabel("PICK A LEVEL", cx, top - 26, { size: 10, anchor: "top" });
    const bestRun = bestSpeedrun();
    const summary = `${clearedCount()}/${LEVELS.length} CLEARED` + (bestRun === null ? "" : `   BEST SPEEDRUN ${formatTime(bestRun)}`);
    addLabel(summary, cx, top - 12, { size: 6, color: COLORS.muted, anchor: "top" });

    let selected = Math.min(Math.max(focus, 0), LEVELS.length - 1);
    let leaving = false;

    const play = (index: number) => {
      if (leaving || !isUnlocked(index)) {
        if (!leaving) sfx.death();
        return;
      }
      leaving = true;
      sfx.select();
      fadeTo("game", { level: index, deaths: 0 });
    };

    LEVELS.forEach((def, i) => {
      const x = left + (i % cols) * (CARD_W + GAP);
      const y = top + Math.floor(i / cols) * (CARD_H + GAP);
      const unlocked = isUnlocked(i);
      const best = bestFor(def.id);

      const card = k.add([
        k.pos(x, y),
        k.area({ shape: new k.Rect(k.vec2(0, 0), CARD_W, CARD_H), cursor: unlocked ? "pointer" : "default" }),
        k.fixed(),
        k.z(50),
        {
          draw() {
            const active = selected === i;
            k.drawRect({ pos: k.vec2(0, 2), width: CARD_W, height: CARD_H, color: COLORS.ink });
            k.drawRect({
              pos: k.vec2(0, active ? -1 : 0),
              width: CARD_W,
              height: CARD_H,
              color: unlocked ? CARD_BG : LOCKED_BG,
              outline: active ? { width: 1, color: COLORS.orange } : undefined,
            });
            const dy = active ? -1 : 0;
            k.drawText({
              text: unlocked ? String(i + 1) : "?",
              size: 12,
              pos: k.vec2(CARD_W / 2, 5 + dy),
              anchor: "top",
              color: best ? COLORS.green : unlocked ? COLORS.white : COLORS.muted,
            });
            k.drawText({
              text: best ? formatTime(best.time) : unlocked ? THEMES[def.theme].label : "LOCKED",
              size: 6,
              pos: k.vec2(CARD_W / 2, CARD_H - 8 + dy),
              anchor: "top",
              color: best ? COLORS.yellow : COLORS.muted,
            });
          },
        },
      ]);
      card.onHover(() => (selected = i));
      card.onClick(() => play(i));
    });

    // the selected level's name sits under the grid, where there's room to spell it out
    addLabel(() => LEVELS[selected].name, cx, top + rows * (CARD_H + GAP) + 2, { size: 8, anchor: "top" });
    // all levels back to back on one clock; open to everyone, locks or not — it starts at level 1
    const speedrun = () => {
      if (leaving) return;
      leaving = true;
      sfx.select();
      fadeTo("game", { level: 0, deaths: 0, run: { elapsed: 0 } });
    };
    const back = () => {
      if (leaving) return;
      leaving = true;
      sfx.select();
      fadeTo("start");
    };
    // make your own: the editor is a page of its own
    const editor = () => {
      if (leaving) return;
      leaving = true;
      sfx.select();
      openEditor();
    };
    const backW = 4 * 8 + 16;
    const runW = 8 * 8 + 16;
    const editW = 6 * 8 + 16;
    const buttonsY = top + rows * (CARD_H + GAP) + 22;
    const rowLeft = cx - (backW + runW + editW + 16) / 2;
    addButton("BACK", rowLeft + backW / 2, buttonsY, back, COLORS.white);
    addButton("SPEEDRUN", rowLeft + backW + 8 + runW / 2, buttonsY, speedrun, COLORS.yellow);
    addButton("EDITOR", rowLeft + backW + runW + 16 + editW / 2, buttonsY, editor, COLORS.white);

    const step = (by: number) => {
      selected = (selected + by + LEVELS.length) % LEVELS.length;
      sfx.select();
    };
    const off = [
      onPress("left", () => step(-1)),
      onPress("right", () => step(1)),
      onPress("jump", () => play(selected)),
      onPress("confirm", () => play(selected)),
      onPress("back", () => {
        if (leaving) return;
        leaving = true;
        fadeTo("start");
      }),
    ];
    k.onSceneLeave(() => off.forEach((fn) => fn()));

    fadeIn();
  });
}
