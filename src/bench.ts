import type { Rect } from "./rect";
import { DirtyTracker } from "./dirty";
import { GridIndex } from "./query";
import { mergeRectsRatio } from "./merge";
import type { Sprite } from "./scene";

export const CANVAS: Rect = { x: 0, y: 0, w: 640, h: 360 };

// mulberry32: tohumlu, hızlı, deterministik.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS = ["#38bdf8", "#f472b6", "#facc15", "#4ade80", "#a78bfa"];

// İlk `moving` sprite hareketli, geri kalanı durağan.
export function makeScene(total: number, moving: number, seed = 1): Sprite[] {
  const rand = makeRng(seed);
  const sprites: Sprite[] = [];
  for (let id = 0; id < total; id++) {
    const w = 6 + rand() * 18;
    const h = 6 + rand() * 18;
    const isMover = id < moving;
    sprites.push({
      id,
      bounds: {
        x: rand() * (CANVAS.w - w),
        y: rand() * (CANVAS.h - h),
        w,
        h,
      },
      vx: isMover ? (rand() * 2 - 1) * 60 : 0,
      vy: isMover ? (rand() * 2 - 1) * 60 : 0,
      color: COLORS[id % COLORS.length],
    });
  }
  return sprites;
}

// Duvardan seken hareket; sprite tuvalin içinde kalır.
export function stepSprite(s: Sprite, dt: number): void {
  let x = s.bounds.x + s.vx * dt;
  let y = s.bounds.y + s.vy * dt;
  if (x < 0) {
    x = -x;
    s.vx = -s.vx;
  } else if (x + s.bounds.w > CANVAS.w) {
    x = 2 * (CANVAS.w - s.bounds.w) - x;
    s.vx = -s.vx;
  }
  if (y < 0) {
    y = -y;
    s.vy = -s.vy;
  } else if (y + s.bounds.h > CANVAS.h) {
    y = 2 * (CANVAS.h - s.bounds.h) - y;
    s.vy = -s.vy;
  }
  s.bounds = { ...s.bounds, x, y };
}

export interface SimResult {
  regionsPerFrame: number;
  dirtyRatio: number; // 0..1
  drawnPerFrame: number;
  overheadMsPerFrame: number; // kirletme + birleştirme, çizim hariç
  total: number;
}

export interface SimOptions {
  strategy?: "waste" | "ratio"; // "ratio" = kartopu yapan ilk sürüm
  maxWaste?: number;
  maxRegions?: number;
  frames?: number;
  seed?: number;
  pad?: number;
  cellSize?: number;
  dt?: number;
}

// Çizim yok, sayım var: bölge sayısı, kirli piksel oranı ve
// kirli bölgelere değdiği için yeniden çizilmesi gereken nesne sayısı.
export function simulate(
  total: number,
  moving: number,
  options: SimOptions = {},
): SimResult {
  const frames = options.frames ?? 300;
  const dt = options.dt ?? 1 / 60;
  const sprites = makeScene(total, moving, options.seed ?? 1);
  const tracker = new DirtyTracker(CANVAS, {
    pad: options.pad ?? 1,
    maxWaste: options.maxWaste ?? 2000,
    maxRegions: options.maxRegions ?? 24,
  });
  const index = new GridIndex<Sprite>(options.cellSize ?? 64);

  let regionSum = 0;
  let dirtySum = 0;
  let drawnSum = 0;
  let overheadMs = 0;
  const canvasArea = CANVAS.w * CANVAS.h;

  for (let f = 0; f < frames; f++) {
    const t0 = performance.now();
    tracker.clear();
    for (let i = 0; i < moving; i++) {
      const s = sprites[i];
      const prev = { ...s.bounds };
      stepSprite(s, dt);
      tracker.markMoved(prev, s.bounds);
    }
    overheadMs += performance.now() - t0;

    index.clear();
    for (const s of sprites) index.insert(s);

    const t1 = performance.now();
    const regions =
      options.strategy === "ratio"
        ? mergeRectsRatio(tracker.pending(), 1.5)
        : tracker.regions();
    overheadMs += performance.now() - t1;
    regionSum += regions.length;
    for (const r of regions) {
      dirtySum += r.w * r.h;
      drawnSum += index.query(r).length;
    }
  }

  return {
    regionsPerFrame: regionSum / frames,
    dirtyRatio: dirtySum / (frames * canvasArea),
    drawnPerFrame: drawnSum / frames,
    overheadMsPerFrame: overheadMs / frames,
    total,
  };
}
