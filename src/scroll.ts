// Tuvali dx kadar kaydır, sadece açılan şeridi kirlet.
// Kesirli dx'te anti-aliasing hatası birikir; tam sayı şart.
export function scrollCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dx: number,
): { x: number; y: number; w: number; h: number } | null {
  if (dx === 0 || Math.abs(dx) >= width) return null;
  const shift = Math.trunc(dx);
  if (shift === 0) return null;

  ctx.save();
  ctx.globalCompositeOperation = "copy"; // harmanlama yok, birebir kopya
  ctx.drawImage(ctx.canvas, -shift, 0);
  ctx.restore();

  return shift > 0
    ? { x: width - shift, y: 0, w: shift, h: height } // sağdan yeni şerit
    : { x: 0, y: 0, w: -shift, h: height }; // soldan yeni şerit
}
