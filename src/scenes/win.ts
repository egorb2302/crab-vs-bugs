import { onPress, setPlaying } from "../input";
import { COLORS, k } from "../k";
import { LEVELS } from "../levels";
import { clearedCount, recordRun } from "../progress";
import { sfx } from "../sfx";
import { addBackdrop, addButton, addGroundStrip, addLabel, fadeIn, fadeTo, formatTime, menuOffsetY } from "../ui";

export interface RunResult {
  level: number;
  time: number;
  coins: number;
  totalCoins: number;
  bugs: number;
  totalBugs: number;
  deaths: number;
}

function share(result: RunResult, allDone: boolean) {
  const level = LEVELS[result.level];
  const text = allDone
    ? `Cleared all ${LEVELS.length} levels of Crab vs Bugs 🦀`
    : `Cleared ${level.name} in Crab vs Bugs — ${formatTime(result.time)}, ${result.coins}/${result.totalCoins} coins, ${result.bugs}/${result.totalBugs} bugs squashed 🦀`;
  const url = new URL("https://x.com/intent/post");
  url.searchParams.set("text", text);
  url.searchParams.set("url", location.origin + location.pathname);
  window.open(url, "_blank", "noopener");
}

export function registerWinScene() {
  k.scene("win", (result: RunResult) => {
    setPlaying(false);
    const W = k.width();
    const cx = W / 2;
    const oy = menuOffsetY();
    const groundY = oy + 148;
    const def = LEVELS[result.level];
    const next = result.level + 1 < LEVELS.length ? result.level + 1 : null;

    const previousBest = recordRun(def.id, result.time, result.coins);
    const allDone = clearedCount() === LEVELS.length;

    let scroll = 0;
    k.onUpdate(() => (scroll += 14 * k.dt()));
    addBackdrop(() => scroll, def.theme);
    addGroundStrip(groundY, def.theme);

    addLabel(allDone ? "ALL CLEAR!" : "LEVEL CLEAR!", cx, oy + 4, { size: 16, color: COLORS.green, anchor: "top" });
    addLabel(`${result.level + 1}. ${def.name}`, cx, oy + 24, { size: 8, color: COLORS.muted, anchor: "top" });

    const rows: [string, string][] = [
      ["TIME", formatTime(result.time)],
      ["COINS", `${result.coins}/${result.totalCoins}`],
      ["BUGS", `${result.bugs}/${result.totalBugs}`],
      ["DEATHS", String(result.deaths)],
    ];
    rows.forEach(([name, value], i) => {
      addLabel(name, cx - 60, oy + 40 + i * 10, { color: COLORS.muted });
      addLabel(value, cx + 60, oy + 40 + i * 10, { anchor: "topright" });
    });
    if (previousBest === null || result.time < previousBest.time) {
      addLabel("NEW BEST TIME!", cx, oy + 84, { color: COLORS.yellow, anchor: "top" });
    } else {
      addLabel(`BEST ${formatTime(previousBest.time)}`, cx, oy + 84, { color: COLORS.muted, anchor: "top" });
    }

    let leaving = false;
    const go = (scene: string, args?: unknown) => () => {
      if (leaving) return;
      leaving = true;
      sfx.select();
      fadeTo(scene, args);
    };
    const replay = go("game", { level: result.level, deaths: 0 });
    const onward = next === null ? go("levels", result.level) : go("game", { level: next, deaths: 0 });

    // one row, centred: whatever buttons this screen needs
    const row: [string, () => void, ReturnType<typeof k.rgb>][] = [
      [next === null ? "LEVELS" : "NEXT", onward, COLORS.orange],
      ["RETRY", replay, COLORS.white],
    ];
    if (next !== null) row.push(["LEVELS", go("levels", result.level), COLORS.white]);
    const widths = row.map(([text]) => text.length * 8 + 16);
    const total = widths.reduce((sum, w) => sum + w, 0) + (row.length - 1) * 8;
    let x = cx - total / 2;
    row.forEach(([text, action, color], i) => {
      addButton(text, x + widths[i] / 2, oy + 102, action, color);
      x += widths[i] + 8;
    });
    addButton("SHARE", cx, oy + 124, () => share(result, allDone), COLORS.yellow);

    // victory lap
    const crab = k.add([k.sprite("crab", { anim: "jump" }), k.pos(22, groundY), k.anchor("bot"), k.scale(2), k.fixed()]);
    crab.onUpdate(() => (crab.pos.y = groundY - Math.abs(Math.sin(k.time() * 5)) * 14));
    k.add([k.sprite("flag", { anim: "wave" }), k.pos(W - 20, groundY), k.anchor("bot"), k.scale(2), k.fixed()]);

    const off = [
      onPress("jump", onward),
      onPress("confirm", onward),
      onPress("restart", replay),
      onPress("back", go("levels", result.level)),
    ];
    k.onSceneLeave(() => off.forEach((fn) => fn()));

    fadeIn();
  });
}
