import { k } from "./k";

const BUG_SPEED = 26;
export const BUG_H = 9;

export type Bug = ReturnType<typeof addBug>;

// Bugs don't use physics: they shuttle between bounds the level parser worked out
// (platform edges, walls, spikes), which keeps them cheap and impossible to knock off course.
export function addBug(x: number, y: number, minX: number, maxX: number) {
  const bug = k.add([
    k.sprite("bug", { anim: "walk" }),
    k.pos(x, y),
    k.anchor("bot"),
    k.area({ shape: new k.Rect(k.vec2(0, 0), 12, BUG_H) }),
    k.opacity(1),
    k.z(5),
    "bug",
    { dir: -1, alive: true },
  ]);

  bug.onUpdate(() => {
    if (!bug.alive) return;
    bug.pos.x += bug.dir * BUG_SPEED * k.dt();
    if (bug.pos.x <= minX) {
      bug.pos.x = minX;
      bug.dir = 1;
    } else if (bug.pos.x >= maxX) {
      bug.pos.x = maxX;
      bug.dir = -1;
    }
    bug.flipX = bug.dir > 0; // the sprite is drawn facing left
  });

  return bug;
}

export function squashBug(bug: Bug) {
  bug.alive = false;
  bug.unuse("area");
  bug.play("squash");
  bug.use(k.lifespan(0.35, { fade: 0.15 }));
}
