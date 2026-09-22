import { k } from "./k";
import { PLATFORM_H, PLATFORM_W, type Platform } from "./level";

const SPEED = { x: 34, y: 26 }; // px/s — slow enough to time a jump, fast enough to feel alive

/**
 * A plank shuttling along its rail. It's a static body, so the player is carried by Kaplay's
 * sticky-platform logic — which compares the platform's pos object between frames, so the
 * position has to be *replaced* every frame, never mutated in place.
 */
export function addPlatform(rail: Platform) {
  const obj = k.add([
    k.sprite("platform"),
    k.pos(rail.x, rail.y),
    k.area({ shape: new k.Rect(k.vec2(0, 0), PLATFORM_W, PLATFORM_H) }),
    k.body({ isStatic: true }),
    k.z(6),
    "platform",
    { dir: 1 },
  ]);

  const speed = SPEED[rail.axis];
  obj.onUpdate(() => {
    const next = k.clamp(obj.pos[rail.axis] + obj.dir * speed * k.dt(), rail.min, rail.max);
    if (next === rail.min) obj.dir = 1;
    else if (next === rail.max) obj.dir = -1;
    obj.pos = rail.axis === "x" ? k.vec2(next, rail.y) : k.vec2(rail.x, next);
  });

  return obj;
}
