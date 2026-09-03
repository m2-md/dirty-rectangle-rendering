import type { Rect } from "./rect";
import { DirtyTracker } from "./dirty";
import { GridIndex } from "./query";
import { drawRegion } from "./render";
import type { Sprite } from "./scene";

const CANVAS: Rect = { x: 0, y: 0, w: 640, h: 360 };

export function makeFrame(
  ctx: CanvasRenderingContext2D,
  sprites: Sprite[],
  drawSprite: (ctx: CanvasRenderingContext2D, s: Sprite) => void,
) {
  const tracker = new DirtyTracker(CANVAS, { pad: 1, maxWaste: 2000 });
  const index = new GridIndex<Sprite>(64);

  return function frame(dt: number) {
    tracker.clear();

    // 1. Güncelle ve kirlet
    for (const sprite of sprites) {
      if (sprite.vx === 0 && sprite.vy === 0) continue;
      const prev = { ...sprite.bounds };
      sprite.bounds = {
        ...sprite.bounds,
        x: sprite.bounds.x + sprite.vx * dt,
        y: sprite.bounds.y + sprite.vy * dt,
      };
      tracker.markMoved(prev, sprite.bounds);
    }

    // 2. Uzamsal indeksi tazele (hepsi, sadece hareketliler değil:
    //    durağan nesneler de kirli bölgeye değebilir)
    index.clear();
    for (const sprite of sprites) index.insert(sprite);

    // 3. Sadece kirli bölgeleri çiz
    let drawn = 0;
    let dirtyPixels = 0;
    for (const region of tracker.regions()) {
      drawn += drawRegion(ctx, region, index, drawSprite);
      dirtyPixels += region.w * region.h;
    }

    return { drawn, dirtyPixels, total: sprites.length };
  };
}
