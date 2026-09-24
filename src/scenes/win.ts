import { challengeFor, challengeUrl, dareParts, versus } from "../challenge";
import { canRecord, clipName, hasClip, makeStill, makeVideo, type Card } from "../clip";
import { onPress, setPlaying } from "../input";
import { COLORS, k } from "../k";
import { LEVELS } from "../levels";
import { clearedCount, recordRun, recordSpeedrun } from "../progress";
import { sfx } from "../sfx";
import { canShareNatively, copyLink, postOnX, shareFile, shareNatively } from "../share";
import { addBackdrop, addButton, addGroundStrip, addLabel, fadeIn, fadeTo, formatTime, menuOffsetY, openEditor } from "../ui";
import type { CustomLevel } from "./game";

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
  /** a level from the editor or a shared link: nothing is saved, and the link is the level's own */
  custom?: CustomLevel;
}

/** `live` replaces the label as drawn; the button is sized for `label`. */
type Row = [label: string, action: () => void, color: ReturnType<typeof k.rgb>, live?: () => string];

/** One centred row of buttons. */
function addButtonRow(buttons: Row[], cx: number, y: number) {
  const widths = buttons.map(([text]) => text.length * 8 + 16);
  const total = widths.reduce((sum, w) => sum + w, 0) + (buttons.length - 1) * 8;
  let x = cx - total / 2;
  buttons.forEach(([text, action, color, live], i) => {
    addButton(text, x + widths[i] / 2, y, action, color, live);
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
    const custom = result.custom;
    const def = custom?.def ?? LEVELS[result.level];
    const full = result.fullRun === true;
    const next = !full && !custom && result.level + 1 < LEVELS.length ? result.level + 1 : null;
    const time = formatTime(result.time);

    // full-run levels were banked one by one as they were cleared
    const previousBest = custom ? null : full ? recordSpeedrun(result.time) : (recordRun(def.id, result.time, result.coins)?.time ?? null);
    const allDone = !custom && clearedCount() === LEVELS.length;
    const dare = custom ? null : challengeFor(full ? "all" : result.level);

    let scroll = 0;
    k.onUpdate(() => (scroll += 14 * k.dt()));
    addBackdrop(() => scroll, def.theme);
    addGroundStrip(groundY, def.theme);

    const heading = full ? "SPEEDRUN!" : allDone ? "ALL CLEAR!" : "LEVEL CLEAR!";
    addLabel(heading, cx, oy + 4, { size: 16, color: COLORS.green, anchor: "top" });
    const subtitle = full ? `ALL ${LEVELS.length} LEVELS` : custom ? def.name : `${result.level + 1}. ${def.name}`;
    addLabel(subtitle, cx, oy + 24, {
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
    const [verdict, verdictColor] = custom
      ? ["A HOMEMADE LEVEL", COLORS.muted]
      : dare
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
    const replay = full
      ? go("game", { level: 0, deaths: 0, run: { elapsed: 0 } })
      : go("game", { level: result.level, deaths: 0, custom });
    const toLevels = custom ? go("start", custom) : go("levels", result.level);
    const onward = custom ? replay : next === null ? toLevels : go("game", { level: next, deaths: 0 });
    const edit = () => {
      if (leaving || !custom) return;
      leaving = true;
      sfx.select();
      openEditor(custom.code);
    };

    const buttons: Row[] = custom
      ? [
          ["RETRY", replay, COLORS.orange],
          ["EDIT", edit, COLORS.white],
          ["MENU", toLevels, COLORS.white],
        ]
      : [
          [next === null ? "LEVELS" : "NEXT", onward, COLORS.orange],
          [full ? "AGAIN" : "RETRY", replay, COLORS.white],
        ];
    if (next !== null) buttons.push(["LEVELS", toLevels, COLORS.white]);
    addButtonRow(buttons, cx, oy + 102);

    // every shared result is a dare of its own: the link opens the same level with this time to beat
    // a homemade level is shared as itself: the whole map rides in the link
    const url = custom ? `${location.origin}${location.pathname}#play=${custom.code}` : challengeUrl(full ? "all" : result.level, result.time);
    const text = custom
      ? `Cleared ${def.name}, a homemade Crab vs Bugs level, in ${time}. Your turn 🦀`
      : full
      ? `All ${LEVELS.length} levels of Crab vs Bugs in ${time} (${result.deaths} deaths). Can you go faster? 🦀`
      : dare && gap < 0
        ? `Beat the ${def.name} dare in Crab vs Bugs: ${time} vs ${formatTime(dare.time)}. Your move 🦀`
        : `Cleared ${def.name} in Crab vs Bugs in ${time}, ${result.coins}/${result.totalCoins} coins. Can you beat it? 🦀`;

    // one line under the buttons for news: link copied, clip progress, clip saved
    let note = "";
    let noteAt = -10;
    let noteHolds = false;
    const tell = (text: string, holds = false) => {
      note = text;
      noteAt = k.time();
      noteHolds = holds;
    };
    addLabel(() => (noteHolds || k.time() - noteAt < 2.2 ? note : ""), cx, oy + 136, { size: 6, color: COLORS.green, anchor: "top" });
    const copy = () =>
      void copyLink(url).then((ok) => {
        if (!ok) return;
        tell("LINK COPIED!");
        sfx.select();
      });

    // the run clip: the last seconds before the flag plus an end card, made on request.
    // A phone's share sheet needs a fresh tap, and a video takes longer to make than a tap lasts,
    // so there it's tap to make, tap again to share; a desktop just saves it when it's done.
    const card: Card = { heading, subtitle, time };
    const { beat, seconds } = custom ? { beat: "custom", seconds: result.time.toFixed(1) } : dareParts(full ? "all" : result.level, result.time);
    const abort = new AbortController();
    k.onSceneLeave(() => abort.abort());
    let clip: File | null = null;
    let making: number | null = null; // 0…1 while the clip is being made
    const deliver = (file: File) =>
      void shareFile(file, text, url).then((ok) => {
        if (ok && !canShareNatively) tell(file.type === "image/png" ? "PICTURE SAVED!" : "CLIP SAVED!");
      });
    const onClip = () => {
      if (making !== null) return;
      sfx.select();
      if (clip) return deliver(clip);
      making = 0;
      const tappedAt = performance.now();
      if (canRecord) tell("MAKING THE CLIP...", true);
      const made = canRecord
        ? makeVideo(card, (share) => (making = share), abort.signal).catch((e) => {
            if (abort.signal.aborted) throw e;
            return makeStill(card); // recording fell over: the end card still makes a picture
          })
        : makeStill(card);
      made.then(
        (blob) => {
          making = null;
          // the bare type: share sheets match "video/mp4", not "video/mp4;codecs=avc1"
          clip = new File([blob], clipName(beat, seconds, blob), { type: blob.type.split(";")[0] });
          if (canShareNatively && performance.now() - tappedAt > 3000) tell("READY - TAP CLIP AGAIN", true);
          else {
            tell("");
            deliver(clip);
          }
        },
        () => {
          making = null;
          if (!abort.signal.aborted) tell("NO CLIP, SORRY", true);
        },
      );
    };
    const clipLabel = canRecord ? "CLIP" : "PIC";
    const clipRow: Row[] = hasClip()
      ? [[clipLabel, onClip, COLORS.white, () => (making === null ? clipLabel : `${Math.floor(making * 100)}%`)]]
      : [];

    addButtonRow(
      canShareNatively
        ? [["SHARE", () => void shareNatively(text, url), COLORS.yellow], ...clipRow]
        : [
            ["POST ON X", () => postOnX(text, url), COLORS.yellow],
            // a square screen has no room for the long label next to the clip
            [W < 260 && clipRow.length ? "COPY" : "COPY LINK", copy, COLORS.white],
            ...clipRow,
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
