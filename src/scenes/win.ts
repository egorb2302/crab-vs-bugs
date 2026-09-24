import { challengeFor, challengeUrl, versus } from "../challenge";
import { onPress, setPlaying } from "../input";
import { COLORS, k } from "../k";
import { LEVELS } from "../levels";
import { clearedCount, recordRun, recordSpeedrun } from "../progress";
import { sfx } from "../sfx";
import { canShareNatively, copyLink, postOnX, shareNatively } from "../share";
import { addBackdrop, addButton, addGroundStrip, addLabel, fadeIn, fadeTo, formatTime, menuOffsetY } from "../ui";

export interface RunResult {
  level: number;
  time: number;
  coins: number;
  totalCoins: number;
  bugs: number;
  totalBugs: number;
  deaths: number;
  /** all levels back to back: `time` and `deaths` are for the whole run, the rest is the last level */
  fullRun?: boolean;
}

type Row = [label: string, action: () => void, color: ReturnType<typeof k.rgb>];

/** One centred row of buttons. */
function addButtonRow(buttons: Row[], cx: number, y: number) {
  const widths = buttons.map(([text]) => text.length * 8 + 16);
  const total = widths.reduce((sum, w) => sum + w, 0) + (buttons.length - 1) * 8;
  let x = cx - total / 2;
  buttons.forEach(([text, action, color], i) => {
    addButton(text, x + widths[i] / 2, y, action, color);
    x += widths[i] + 8;
  });
}

export function registerWinScene() {
  k.scene("win", (result: RunResult) => {
    setPlaying(false);
    const W = k.width();
    const cx = W / 2;
    const oy = menuOffsetY();
    const groundY = oy + 148;
    const def = LEVELS[result.level];
    const full = result.fullRun === true;
    const next = !full && result.level + 1 < LEVELS.length ? result.level + 1 : null;
    const time = formatTime(result.time);

    // full-run levels were banked one by one as they were cleared
    const previousBest = full ? recordSpeedrun(result.time) : (recordRun(def.id, result.time, result.coins)?.time ?? null);
    const allDone = clearedCount() === LEVELS.length;
    const dare = challengeFor(full ? "all" : result.level);

    let scroll = 0;
    k.onUpdate(() => (scroll += 14 * k.dt()));
    addBackdrop(() => scroll, def.theme);
    addGroundStrip(groundY, def.theme);

    const heading = full ? "SPEEDRUN!" : allDone ? "ALL CLEAR!" : "LEVEL CLEAR!";
    addLabel(heading, cx, oy + 4, { size: 16, color: COLORS.green, anchor: "top" });
    addLabel(full ? `ALL ${LEVELS.length} LEVELS` : `${result.level + 1}. ${def.name}`, cx, oy + 24, {
      size: 8,
      color: COLORS.muted,
      anchor: "top",
    });

    const rows: [string, string][] = full
      ? [
          ["TIME", time],
          ["DEATHS", String(result.deaths)],
          ["BEST", formatTime(Math.min(previousBest ?? Infinity, result.time))],
        ]
      : [
          ["TIME", time],
          ["COINS", `${result.coins}/${result.totalCoins}`],
          ["BUGS", `${result.bugs}/${result.totalBugs}`],
          ["DEATHS", String(result.deaths)],
        ];
    rows.forEach(([name, value], i) => {
      addLabel(name, cx - 60, oy + 40 + i * 10, { color: COLORS.muted });
      addLabel(value, cx + 60, oy + 40 + i * 10, { anchor: "topright" });
    });

    // one line of verdict: the dare if there is one, otherwise the personal best
    const gap = dare ? versus(result.time, dare) : 0;
    const [verdict, verdictColor] = dare
      ? gap < 0
        ? [`YOU BEAT ${formatTime(dare.time)} BY ${(-gap).toFixed(1)}S!`, COLORS.green]
        : gap === 0
          ? [`DEAD HEAT WITH ${formatTime(dare.time)}!`, COLORS.yellow]
          : [`${gap.toFixed(1)}S SLOWER THAN ${formatTime(dare.time)}`, COLORS.red]
      : previousBest === null || result.time < previousBest
        ? ["NEW BEST TIME!", COLORS.yellow]
        : [`BEST ${formatTime(previousBest)}`, COLORS.muted];
    addLabel(verdict, cx, oy + 84, { color: verdictColor, anchor: "top" });

    let leaving = false;
    const go = (scene: string, args?: unknown) => () => {
      if (leaving) return;
      leaving = true;
      sfx.select();
      fadeTo(scene, args);
    };
    const replay = full ? go("game", { level: 0, deaths: 0, run: { elapsed: 0 } }) : go("game", { level: result.level, deaths: 0 });
    const toLevels = go("levels", result.level);
    const onward = next === null ? toLevels : go("game", { level: next, deaths: 0 });

    const buttons: Row[] = [
      [next === null ? "LEVELS" : "NEXT", onward, COLORS.orange],
      [full ? "AGAIN" : "RETRY", replay, COLORS.white],
    ];
    if (next !== null) buttons.push(["LEVELS", toLevels, COLORS.white]);
    addButtonRow(buttons, cx, oy + 102);

    // every shared result is a dare of its own: the link opens the same level with this time to beat
    const url = challengeUrl(full ? "all" : result.level, result.time);
    const text = full
      ? `All ${LEVELS.length} levels of Crab vs Bugs in ${time} (${result.deaths} deaths). Can you go faster? 🦀`
      : dare && gap < 0
        ? `Beat the ${def.name} dare in Crab vs Bugs: ${time} vs ${formatTime(dare.time)}. Your move 🦀`
        : `Cleared ${def.name} in Crab vs Bugs in ${time}, ${result.coins}/${result.totalCoins} coins. Can you beat it? 🦀`;

    let copiedAt = -10;
    addLabel(() => (k.time() - copiedAt < 1.8 ? "LINK COPIED!" : ""), cx, oy + 136, { size: 6, color: COLORS.green, anchor: "top" });
    const copy = () =>
      void copyLink(url).then((ok) => {
        if (!ok) return;
        copiedAt = k.time();
        sfx.select();
      });
    addButtonRow(
      canShareNatively
        ? [["SHARE", () => void shareNatively(text, url), COLORS.yellow]]
        : [
            ["POST ON X", () => postOnX(text, url), COLORS.yellow],
            ["COPY LINK", copy, COLORS.white],
          ],
      cx,
      oy + 124,
    );

    // victory lap
    const crab = k.add([k.sprite("crab", { anim: "jump" }), k.pos(22, groundY), k.anchor("bot"), k.scale(2), k.fixed()]);
    crab.onUpdate(() => (crab.pos.y = groundY - Math.abs(Math.sin(k.time() * 5)) * 14));
    k.add([k.sprite("flag", { anim: "wave" }), k.pos(W - 20, groundY), k.anchor("bot"), k.scale(2), k.fixed()]);

    const off = [
      onPress("jump", onward),
      onPress("confirm", onward),
      onPress("restart", replay),
      onPress("back", toLevels),
    ];
    k.onSceneLeave(() => off.forEach((fn) => fn()));

    fadeIn();
  });
}
