import type { Sprite } from "./scene";

export interface Layers {
  bg: CanvasRenderingContext2D;
  fg: CanvasRenderingContext2D;
  width: number;
  height: number;
}

export function createLayers(
  bgCanvas: HTMLCanvasElement,
  fgCanvas: HTMLCanvasElement,
): Layers {
  const bg = bgCanvas.getContext("2d");
  const fg = fgCanvas.getContext("2d");
  if (!bg || !fg) throw new Error("2d context alınamadı");
  return { bg, fg, width: bgCanvas.width, height: bgCanvas.height };
}

// Statik katman: sahne kurulunca ve resize'da BİR KEZ çizilir.
export function paintStatic(
  layers: Layers,
  statics: Sprite[],
  drawSprite: (ctx: CanvasRenderingContext2D, s: Sprite) => void,
): void {
  layers.bg.clearRect(0, 0, layers.width, layers.height);
  for (const sprite of statics) drawSprite(layers.bg, sprite);
}

// Hareketli katman: her kare tamamen temizlenir, ama içinde sadece
// birkaç nesne var; 2.000 değil.
export function paintDynamic(
  layers: Layers,
  movers: Sprite[],
  drawSprite: (ctx: CanvasRenderingContext2D, s: Sprite) => void,
): void {
  layers.fg.clearRect(0, 0, layers.width, layers.height);
  for (const sprite of movers) drawSprite(layers.fg, sprite);
}
