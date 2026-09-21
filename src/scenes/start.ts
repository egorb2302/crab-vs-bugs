import { COLORS, k } from "../k";
import { isTouchDevice, onPress, setPlaying } from "../input";
import { isMuted, sfx, toggleMute } from "../sfx";
import { addBackdrop, addButton, addGroundStrip, addLabel, fadeIn, fadeTo, menuOffsetY } from "../ui";

export function registerStartScene() {
  k.scene("start", () => {
    setPlaying(false);
    const W = k.width();
    const cx = W / 2;
    const oy = menuOffsetY();
    const groundY = oy + 132;

    let scroll = 0;
    k.onUpdate(() => (scroll += 14 * k.dt()));
    addBackdrop(() => scroll);
    addGroundStrip(groundY);

    // title: CRAB vs BUGS
    const big = W >= 320 ? 24 : 16;
    const gap = big / 2;
    const left = cx - (8 * big + 16 + 2 * gap) / 2;
    addLabel("CRAB", left, oy + 16, { size: big, color: COLORS.orange });
    addLabel("vs", left + 4 * big + gap, oy + 16 + big - 8, { color: COLORS.white });
    addLabel("BUGS", left + 4 * big + 16 + 2 * gap, oy + 16, { size: big, color: COLORS.red });

    // the cast, facing off
    const crab = k.add([k.sprite("crab", { anim: "idle" }), k.pos(cx - 72, groundY), k.anchor("bot"), k.scale(2), k.fixed()]);
    k.add([k.sprite("bug", { anim: "walk" }), k.pos(cx + 72, groundY), k.anchor("bot"), k.scale(2), k.fixed()]);
    k.loop(2.2, () => {
      crab.play("jump");
      k.tween(0, 1, 0.45, (t) => (crab.pos.y = groundY - Math.sin(t * Math.PI) * 18)).onEnd(() => crab.play("idle"));
    });

    let starting = false;
    const start = () => {
      if (starting) return;
      starting = true;
      sfx.select();
      fadeTo("game", { deaths: 0 });
    };

    addButton("PLAY", cx, oy + 68, start);
    addLabel(isTouchDevice ? "TAP TO PLAY" : "ARROWS / WASD + SPACE", cx, oy + 90, { size: 6, color: COLORS.muted, anchor: "center" });

    const sound = k.add([k.pos(W - 4, 4), k.anchor("topright"), k.area({ shape: new k.Rect(k.vec2(0, 0), 60, 12), cursor: "pointer" }), k.fixed()]);
    addLabel(() => (isMuted() ? "SOUND OFF" : "SOUND ON"), W - 4, 4, { size: 6, color: COLORS.muted, anchor: "topright" });
    sound.onClick(() => {
      if (!toggleMute()) sfx.select();
    });

    addLabel("FAN-MADE, NON-COMMERCIAL TRIBUTE.\nNOT AFFILIATED WITH OR ENDORSED BY ANTHROPIC.", cx, k.height() - 3, {
      size: 6,
      anchor: "bot",
      align: "center",
      width: W - 8,
      opacity: 0.85,
    });

    // anywhere on the screen starts the game — phones shouldn't have to hit a small button
    k.onMousePress(() => {
      if (!sound.isHovering()) start();
    });
    const off = [onPress("jump", start), onPress("confirm", start)];
    k.onSceneLeave(() => off.forEach((fn) => fn()));

    fadeIn();
  });
}
