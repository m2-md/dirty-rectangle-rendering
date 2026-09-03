// Shift canvas by dx, only marking newly exposed strip dirty.
// Fractional dx accumulates anti-aliasing errors; integer shift required.
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
  ctx.globalCompositeOperation = "copy"; // exact copy, no blending
  ctx.drawImage(ctx.canvas, -shift, 0);
  ctx.restore();

  return shift > 0
    ? { x: width - shift, y: 0, w: shift, h: height } // new strip from right
    : { x: 0, y: 0, w: -shift, h: height }; // new strip from left
}
