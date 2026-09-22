import { loadAssets } from "./assets";
import { bindTouchControls, onPress } from "./input";
import { k } from "./k";
import { registerGameScene } from "./scenes/game";
import { registerLevelsScene } from "./scenes/levels";
import { registerStartScene } from "./scenes/start";
import { registerWinScene } from "./scenes/win";
import { toggleMute } from "./sfx";

loadAssets();
bindTouchControls();
onPress("mute", toggleMute);

registerStartScene();
registerLevelsScene();
registerGameScene();
registerWinScene();

k.onLoad(() => k.go("start"));

// dev console access: __k.go("win", {...}), __k.debug.inspect = true, ...
if (import.meta.env.DEV) (window as unknown as { __k: typeof k }).__k = k;
