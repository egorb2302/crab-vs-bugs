import { loadAssets } from "./assets";
import { bindTouchControls, onPress } from "./input";
import { registerOffline } from "./install";
import { k } from "./k";
import { parseLevel } from "./level";
import { decodeLevel, levelFromHash } from "./levelcode";
import type { CustomLevel } from "./scenes/game";
import { registerGameScene } from "./scenes/game";
import { registerLevelsScene } from "./scenes/levels";
import { registerStartScene } from "./scenes/start";
import { registerWinScene } from "./scenes/win";
import { toggleMute } from "./sfx";

loadAssets();
bindTouchControls();
registerOffline();
onPress("mute", toggleMute);

registerStartScene();
registerLevelsScene();
registerGameScene();
registerWinScene();

// A homemade level rides in the link (#play=… shared, #test=… from the editor's PLAY button).
// One that doesn't decode, or that the game couldn't build, just opens the game as usual.
async function customFromLink(): Promise<CustomLevel | null> {
  const link = levelFromHash();
  const def = link && (await decodeLevel(link.code));
  if (!link || !def) return null;
  try {
    parseLevel(def);
  } catch {
    return null;
  }
  return { def, code: link.code, test: link.test };
}
const custom = customFromLink();

k.onLoad(() =>
  void custom.then((level) => {
    // straight from the editor: no title screen in between, it's a test run
    if (level?.test) k.go("game", { level: 0, deaths: 0, custom: level });
    else k.go("start", level ?? undefined);
  }),
);

// An uncaught error stops Kaplay for good, and on a player's screen that just looks like the game
// froze. Start over instead — progress lives in localStorage. If the game already started over
// for this a moment ago, stop there and leave Kaplay's error screen up rather than loop.
// In dev the error screen stays, so the error can be read. (The event comes from a patch to
// Kaplay in vite.config.ts.)
const RECOVERED_KEY = "crab-vs-bugs:recovered-at";
let recovering = false;
window.addEventListener("kaplay-error", () => {
  if (recovering || import.meta.env.DEV) return;
  recovering = true;
  try {
    if (Date.now() - Number(sessionStorage.getItem(RECOVERED_KEY)) < 30_000) return;
    sessionStorage.setItem(RECOVERED_KEY, String(Date.now()));
  } catch {
    return; // no storage, no way to tell a first failure from a loop
  }
  location.reload();
});

// dev console access: __k.go("win", {...}), __k.debug.inspect = true, ...
if (import.meta.env.DEV) (window as unknown as { __k: typeof k }).__k = k;
