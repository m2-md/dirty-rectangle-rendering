import { CANVAS, makeScene, stepSprite } from "./bench";
import { DirtyTracker } from "./dirty";
import { GridIndex } from "./query";
import { drawRegion } from "./render";
import type { Rect } from "./rect";
import type { Sprite } from "./scene";
import { createLayers, paintDynamic, paintStatic } from "./layers";

type Mode = "dirty-rect" | "full-redraw" | "layered";

const bgCanvas = document.getElementById("bg") as HTMLCanvasElement;
const fgCanvas = document.getElementById("fg") as HTMLCanvasElement;
const layers = createLayers(bgCanvas, fgCanvas);
const ctx = layers.bg;

const modeEl = document.getElementById("mode") as HTMLSelectElement;
const movingEl = document.getElementById("moving") as HTMLInputElement;
const movingOut = document.getElementById("movingOut") as HTMLSpanElement;
const wasteEl = document.getElementById("maxWaste") as HTMLInputElement;
const wasteOut = document.getElementById("maxWasteOut") as HTMLSpanElement;
const visualizeEl = document.getElementById("visualize") as HTMLInputElement;
const padEl = document.getElementById("pad") as HTMLInputElement;
const hud = document.getElementById("hud") as HTMLDivElement;

const TOTAL = 2000;
const CELL = 64;
const CANVAS_AREA = CANVAS.w * CANVAS.h;

let sprites: Sprite[] = [];
let moving = Number(movingEl.value);
let tracker = new DirtyTracker(CANVAS, { pad: 1, maxWaste: 2000 });
const index = new GridIndex<Sprite>(CELL);
let overlay: Rect[] = []; // önceki karede çizilen çerçeveler
let needsFullRepaint = true;

function drawSprite(target: CanvasRenderingContext2D, s: Sprite): void {
  target.fillStyle = s.color;
  target.fillRect(s.bounds.x, s.bounds.y, s.bounds.w, s.bounds.h);
  // Yarım piksel kaydırılmış ince kenar: anti-aliasing'i kasten tetikler,
  // pad kapalıyken arkada kalan hayalet izi görünür kılar.
  target.strokeStyle = "rgba(226, 232, 240, 0.55)";
  target.lineWidth = 1;
  target.strokeRect(
    s.bounds.x + 0.5,
    s.bounds.y + 0.5,
    s.bounds.w - 1,
    s.bounds.h - 1,
  );
}

function rebuild(): void {
  moving = Number(movingEl.value);
  sprites = makeScene(TOTAL, moving, 1);
  tracker = new DirtyTracker(CANVAS, {
    pad: padEl.checked ? 1 : 0,
    maxWaste: Number(wasteEl.value),
  });
  overlay = [];
  needsFullRepaint = true;
  movingOut.textContent = String(moving);
  wasteOut.textContent = wasteEl.value;
}

for (const el of [modeEl, movingEl, wasteEl, padEl, visualizeEl]) {
  el.addEventListener("input", rebuild);
  el.addEventListener("change", rebuild);
}
rebuild();

function refreshIndex(): void {
  index.clear();
  for (const s of sprites) index.insert(s);
}

function outlineRegions(regions: Rect[]): void {
  ctx.strokeStyle = "#ff2d55";
  ctx.lineWidth = 1;
  for (const r of regions) {
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  }
}

interface FrameStats {
  drawn: number;
  dirtyPixels: number;
  regions: number;
}

function frameDirty(dt: number): FrameStats {
  tracker.clear();
  if (needsFullRepaint) {
    tracker.markAll();
    needsFullRepaint = false;
  }
  // Çerçeveler kalıcı piksel bıraktı: onları da kirli say.
  for (const r of overlay) tracker.markRect(r);
  overlay = [];

  for (let i = 0; i < moving; i++) {
    const s = sprites[i];
    const prev = { ...s.bounds };
    stepSprite(s, dt);
    tracker.markMoved(prev, s.bounds);
  }

  refreshIndex();

  const regions = tracker.regions();
  let drawn = 0;
  let dirtyPixels = 0;
  for (const region of regions) {
    drawn += drawRegion(ctx, region, index, drawSprite);
    dirtyPixels += region.w * region.h;
  }

  if (visualizeEl.checked) {
    outlineRegions(regions);
    overlay = regions;
  }
  return { drawn, dirtyPixels, regions: regions.length };
}

function frameFull(dt: number): FrameStats {
  for (let i = 0; i < moving; i++) stepSprite(sprites[i], dt);
  ctx.clearRect(0, 0, CANVAS.w, CANVAS.h);
  for (const s of sprites) drawSprite(ctx, s);
  needsFullRepaint = false;
  return { drawn: sprites.length, dirtyPixels: CANVAS_AREA, regions: 1 };
}

function frameLayered(dt: number): FrameStats {
  if (needsFullRepaint) {
    paintStatic(layers, sprites.slice(moving), drawSprite);
    needsFullRepaint = false;
  }
  for (let i = 0; i < moving; i++) stepSprite(sprites[i], dt);
  paintDynamic(layers, sprites.slice(0, moving), drawSprite);
  return { drawn: moving, dirtyPixels: CANVAS_AREA, regions: 1 };
}

let last = performance.now();
const samples: number[] = [];

function tick(now: number): void {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  const mode = modeEl.value as Mode;

  // Mod değişince tuvalleri sıfırla: modlar aynı iki canvas'ı paylaşıyor.
  if (needsFullRepaint) {
    ctx.clearRect(0, 0, CANVAS.w, CANVAS.h);
    layers.fg.clearRect(0, 0, CANVAS.w, CANVAS.h);
  }

  const t0 = performance.now();
  const stats =
    mode === "dirty-rect"
      ? frameDirty(dt)
      : mode === "full-redraw"
        ? frameFull(dt)
        : frameLayered(dt);
  const ms = performance.now() - t0;

  samples.push(ms);
  if (samples.length > 30) samples.shift();
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

  hud.innerHTML =
    `mod         <b>${mode}</b><br>` +
    `çizilen     <b>${stats.drawn}</b> / ${TOTAL} nesne<br>` +
    `kirli alan  <b>${((stats.dirtyPixels / CANVAS_AREA) * 100).toFixed(1)}%</b><br>` +
    `bölge       <b>${stats.regions}</b><br>` +
    `kare süresi <b>${avg.toFixed(2)} ms</b> (${(1000 / Math.max(avg, 0.001)).toFixed(0)} kare/s tavan)`;

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
