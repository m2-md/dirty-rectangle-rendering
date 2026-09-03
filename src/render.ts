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
  ctx.clip(); // dışarı taşma yok
  ctx.clearRect(region.x, region.y, region.w, region.h); // sadece bu kare temizlenir

  const touching = index.query(region);
  for (const sprite of touching) drawSprite(ctx, sprite);

  ctx.restore(); // clip'i geri al, bir sonraki bölge kendi kırpmasını kursun
  return touching.length; // ölçüm için: bu bölgede kaç nesne çizdik
}
