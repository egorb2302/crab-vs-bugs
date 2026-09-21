import { k } from "./k";
import { isDown, onPress } from "./input";
import { sfx } from "./sfx";

export const GRAVITY = 1300;
const SPEED = 110;
const JUMP_FORCE = 385; // ≈3.5 tiles high, ≈4 tiles far at full speed
const JUMP_CUT = 140; // upward speed kept when the button is released early → short hops
const STOMP_BOUNCE = 270;
const MAX_FALL = 420;
const COYOTE_TIME = 0.1; // can still jump this long after walking off a ledge
const JUMP_BUFFER = 0.1; // a press this early before landing still counts

export const PLAYER_H = 12;

export type Player = ReturnType<typeof addPlayer>;

export function addPlayer(x: number, y: number) {
  const player = k.add([
    k.sprite("crab", { anim: "idle" }),
    k.pos(x, y),
    k.anchor("bot"),
    // body only: the claws poke out of the hitbox on purpose
    k.area({ shape: new k.Rect(k.vec2(0, 0), 10, PLAYER_H) }),
    k.body(),
    k.z(10),
    "player",
    { frozen: false },
  ]);

  let coyote = 0;
  let buffer = 0;
  let rising = false; // in the upward half of a real jump (not a stomp bounce)
  let anim = "idle";

  player.onDestroy(onPress("jump", () => (buffer = JUMP_BUFFER)));

  player.onUpdate(() => {
    const dt = k.dt();
    const grounded = player.isGrounded();
    coyote = grounded ? COYOTE_TIME : coyote - dt;
    buffer -= dt;

    const dir = player.frozen ? 0 : Number(isDown("right")) - Number(isDown("left"));
    if (dir !== 0) player.move(dir * SPEED, 0);

    if (!player.frozen && buffer > 0 && coyote > 0) {
      player.jump(JUMP_FORCE);
      rising = true;
      buffer = 0;
      coyote = 0;
      sfx.jump();
    }

    if (player.vel.y >= 0) rising = false;
    if (rising && !isDown("jump") && player.vel.y < -JUMP_CUT) player.vel.y = -JUMP_CUT;
    if (player.vel.y > MAX_FALL) player.vel.y = MAX_FALL;

    const next = !grounded ? "jump" : dir !== 0 ? "walk" : "idle";
    if (next !== anim) player.play((anim = next));
  });

  return player;
}

/** Pop off a stomped bug; holding jump turns it into a full-height jump. */
export function stompBounce(player: Player) {
  player.jump(isDown("jump") ? JUMP_FORCE : STOMP_BOUNCE);
}
