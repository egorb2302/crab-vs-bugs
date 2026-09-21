import { COLORS, k } from "../k";
import { onPress, setPlaying } from "../input";
import { sfx } from "../sfx";
import { addBackdrop, addButton, addGroundStrip, addLabel, fadeIn, fadeTo, formatTime, menuOffsetY } from "../ui";

export interface RunResult {
  time: number;
  coins: number;
  totalCoins: number;
  bugs: number;
  totalBugs: number;
  deaths: number;
}

const BEST_KEY = "crab-vs-bugs:best";

/** Stores the time if it beats the saved one. Returns the previous best, if any. */
function recordBest(time: number): number | null {
  try {
    const saved = Number(localStorage.getItem(BEST_KEY));
    const previous = Number.isFinite(saved) && saved > 0 ? saved : null;
    if (previous === null || time < previous) localStorage.setItem(BEST_KEY, time.toFixed(2));
    return previous;
  } catch {
    return null; // storage blocked — just don't show a best time
  }
}

function share(result: RunResult) {
  const text = `Beat Crab vs Bugs in ${formatTime(result.time)} — ${result.coins}/${result.totalCoins} coins, ${result.bugs}/${result.totalBugs} bugs squashed 🦀`;
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

    let scroll = 0;
    k.onUpdate(() => (scroll += 14 * k.dt()));
    addBackdrop(() => scroll);
    addGroundStrip(groundY);

    addLabel("LEVEL CLEAR!", cx, oy + 10, { size: 16, color: COLORS.green, anchor: "top" });

    const previousBest = recordBest(result.time);
    const rows: [string, string][] = [
      ["TIME", formatTime(result.time)],
      ["COINS", `${result.coins}/${result.totalCoins}`],
      ["BUGS", `${result.bugs}/${result.totalBugs}`],
      ["DEATHS", String(result.deaths)],
    ];
    rows.forEach(([name, value], i) => {
      addLabel(name, cx - 60, oy + 38 + i * 11, { color: COLORS.muted });
      addLabel(value, cx + 60, oy + 38 + i * 11, { anchor: "topright" });
    });
    if (previousBest === null || result.time < previousBest) {
      addLabel("NEW BEST TIME!", cx, oy + 84, { color: COLORS.yellow, anchor: "top" });
    } else {
      addLabel(`BEST ${formatTime(previousBest)}`, cx, oy + 84, { color: COLORS.muted, anchor: "top" });
    }

    let leaving = false;
    const restart = () => {
      if (leaving) return;
      leaving = true;
      sfx.select();
      fadeTo("game", { deaths: 0 });
    };
    addButton("PLAY AGAIN", cx - 32, oy + 108, restart);
    addButton("SHARE", cx + 56, oy + 108, () => share(result), COLORS.white);

    // victory lap
    const crab = k.add([k.sprite("crab", { anim: "jump" }), k.pos(22, groundY), k.anchor("bot"), k.scale(2), k.fixed()]);
    crab.onUpdate(() => (crab.pos.y = groundY - Math.abs(Math.sin(k.time() * 5)) * 14));
    k.add([k.sprite("flag", { anim: "wave" }), k.pos(W - 20, groundY), k.anchor("bot"), k.scale(2), k.fixed()]);

    const off = [onPress("jump", restart), onPress("confirm", restart)];
    k.onSceneLeave(() => off.forEach((fn) => fn()));

    fadeIn();
  });
}
