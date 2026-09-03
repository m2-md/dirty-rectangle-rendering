import type { Rect } from "./rect";
import type { Sprite } from "./scene";
import type { GridIndex } from "./query";

export function drawRegion(
  ctx: CanvasRenderingContext2D,
  region: Rect,
  index: GridIndex<Sprite>,
  drawSprite: (ctx: CanvasRenderingContext2D, s: Sprite) => void,
): number {
  ctx.save();
  ctx.beginPath();
  ctx.rect(region.x, region.y, region.w, region.h);
  ctx.clip(); // prevent overflow
  ctx.clearRect(region.x, region.y, region.w, region.h); // only this region is cleared

  const touching = index.query(region);
  for (const sprite of touching) drawSprite(ctx, sprite);

  ctx.restore(); // restore clip so next region sets its own clipping bounds
  return touching.length; // for stats: how many objects drawn in this region
}
