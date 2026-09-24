import type { Color } from "kaplay";
import { dust } from "./fx";
import { isDown, onPress } from "./input";
import { k } from "./k";
import { sfx } from "./sfx";

export const GRAVITY = 1300;
const SPEED = 110;
const JUMP_FORCE = 385; // ≈3.5 tiles high, ≈4 tiles far at full speed
const JUMP_CUT = 140; // upward speed kept when the button is released early → short hops
const STOMP_BOUNCE = 270;
const MAX_FALL = 420;
const COYOTE_TIME = 0.1; // can still jump this long after walking off a ledge
const JUMP_BUFFER = 0.1; // a press this early before landing still counts

// Horizontal momentum, px/s². Top speed is unchanged, so every jump the levels were
// designed around still works; what changes is how the crab gets there and stops.
const ACCEL = 1100; // ground: top speed in 0.1 s
const FRICTION = 800; // ground, nothing held: ~7 px of slide from top speed
const TURN = 2200; // ground, pushing the other way: a quick skid
const AIR_ACCEL = 850;
const AIR_DRAG = 260; // air, nothing held: a jump carries its momentum
const AIR_TURN = 1500; // air, pushing back: still steerable over a pit

export const PLAYER_H = 12;

export type Player = ReturnType<typeof addPlayer>;

const approach = (value: number, target: number, step: number) =>
  value < target ? Math.min(value + step, target) : Math.max(value - step, target);

// Kaplay's jump() replaces the whole velocity vector, which would throw the run-up away
function leap(player: Player, force: number) {
  const vx = player.vel.x;
  player.jump(force);
  player.vel.x = vx;
}

export function addPlayer(x: number, y: number, dustColor: Color) {
  // the body is an invisible box; the sprite rides on it as a child, so squash & stretch
  // can scale the picture without ever scaling the hitbox
  const player = k.add([
    k.pos(x, y),
    k.anchor("bot"),
    // body only: the claws poke out of the hitbox on purpose
    k.area({ shape: new k.Rect(k.vec2(0, 0), 10, PLAYER_H) }),
    k.body(),
    k.z(10),
    "player",
    {
      frozen: false,
      /** kick the sprite: positive stretches it tall, negative squashes it flat */
      squash(amount: number) {
        spring = amount;
        springVel = 0;
      },
    },
  ]);
  const look = player.add([k.sprite("crab", { anim: "idle" }), k.anchor("bot"), k.scale(1)]);

  let coyote = 0;
  let buffer = 0;
  let rising = false; // in the upward half of a real jump (not a stomp bounce)
  let anim = "idle";
  let fallSpeed = 0; // how fast we were coming down, for the landing
  let puff = 0; // countdown to the next running dust cloud
  let spring = 0;
  let springVel = 0;

  player.onDestroy(onPress("jump", () => (buffer = JUMP_BUFFER)));

  player.onGround(() => {
    if (fallSpeed < 90) return;
    const impact = Math.min(fallSpeed / MAX_FALL, 1);
    player.squash(-0.12 - impact * 0.22);
    dust(player.pos, dustColor, 2 + Math.round(impact * 3));
    sfx.land(impact);
  });

  // only a real wall stops the crab dead — not a seam where two floor boxes meet
  player.onPhysicsResolve((col) => {
    if (col.displacement.x * player.vel.x < 0 && col.target.pos.y < player.pos.y - 2) player.vel.x = 0;
  });

  player.onUpdate(() => {
    const dt = k.dt();
    const grounded = player.isGrounded();
    coyote = grounded ? COYOTE_TIME : coyote - dt;
    buffer -= dt;
    if (!grounded) fallSpeed = Math.max(player.vel.y, 0);

    const dir = player.frozen ? 0 : Number(isDown("right")) - Number(isDown("left"));
    const vx = player.vel.x;
    const turning = dir !== 0 && vx * dir < 0;
    const rate = dir === 0 ? (grounded ? FRICTION : AIR_DRAG) : turning ? (grounded ? TURN : AIR_TURN) : grounded ? ACCEL : AIR_ACCEL;
    player.vel.x = approach(vx, dir * SPEED, rate * dt);

    if (!player.frozen && buffer > 0 && coyote > 0) {
      if (grounded) dust(player.pos, dustColor, 3);
      leap(player, JUMP_FORCE);
      player.squash(0.25);
      rising = true;
      buffer = 0;
      coyote = 0;
      sfx.jump();
    }

    if (player.vel.y >= 0) rising = false;
    if (rising && !isDown("jump") && player.vel.y < -JUMP_CUT) player.vel.y = -JUMP_CUT;
    if (player.vel.y > MAX_FALL) player.vel.y = MAX_FALL;

    // dust: a skid when turning at speed, a small puff every few steps at a run
    puff -= dt;
    if (grounded && puff <= 0) {
      if (turning && Math.abs(vx) > 60) {
        dust(player.pos, dustColor, 1, Math.sign(vx));
        puff = 0.05;
      } else if (dir !== 0 && Math.abs(vx) > SPEED * 0.9) {
        dust(player.pos.sub(dir * 4, 0), dustColor, 1, -dir);
        puff = 0.2;
      }
    }

    // a damped spring pulls the sprite back to its real shape (small steps keep it stable)
    for (let left = Math.min(dt, 0.1); left > 0; left -= 1 / 120) {
      const h = Math.min(left, 1 / 120);
      springVel += (-700 * spring - 22 * springVel) * h;
      spring += springVel * h;
    }
    look.scale = k.vec2(1 - spring * 0.7, 1 + spring);

    const next = !grounded ? "jump" : dir !== 0 || Math.abs(player.vel.x) > 20 ? "walk" : "idle";
    if (next !== anim) look.play((anim = next));
  });

  return player;
}

/** Pop off a stomped bug; holding jump turns it into a full-height jump. */
export function stompBounce(player: Player) {
  leap(player, isDown("jump") ? JUMP_FORCE : STOMP_BOUNCE);
  player.squash(0.22);
}
