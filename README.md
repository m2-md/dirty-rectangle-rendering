# Dirty Rectangle Technique — Canvas 2D

<!-- LINKS:BEGIN — üretildi: scripts/sync-repo-links.py · elle düzenleme -->
**▶ [Live demo](https://m2-md.github.io/dirty-rectangle-rendering/)** · [Source](https://github.com/m2-md/dirty-rectangle-rendering)
<!-- LINKS:END -->

Working code for the article "You Don't Have to Wipe the Whole Table: The Dirty
Rectangle Technique in Canvas 2D". Instead of calling `clearRect(0, 0, W, H)` every
frame, it clears only the regions that changed and redraws only the objects that
touch those regions.

`GridIndex` in `src/query.ts` is a differently purposed variant of the same idea
(uniform spatial hash) as `SpatialHashGrid` in the `broad-phase-collision-spatial-hash`
project: there it is "produce candidate collision pairs", here it is "which objects
touch this rectangle".

## Contents

- `src/rect.ts` — `Rect` + pure rectangle math: `rectIntersects` (half-open
  interval), `rectUnion`, `rectArea`, `rectIntersectionArea`, `expandRect`
  (anti-aliasing padding), `snapRect` (rounding outwards), `clipRect`.
- `src/merge.ts` — `mergeWaste` + `mergeRects`: each round merges the pair that
  wastes the least; overlapping ones are exempt from the threshold. `mergeRectsRatio`
  is the first version (ratio threshold) that lost in the measurements; it stays
  around only for the bench comparison.
- `src/dirty.ts` — `DirtyTracker`: `markRect`, `markMoved` (old + new position),
  the `markAll` escape hatch, `regions()`, `pending()`.
- `src/query.ts` — `queryBrute` (the reference truth) + the `GridIndex<T>` spatial index.
- `src/render.ts` — `drawRegion`: `save` → `clip` → `clearRect` → draw → `restore`.
- `src/loop.ts` — `makeFrame`: update+dirty → fill the index completely → draw the regions.
- `src/camera.ts`, `src/scroll.ts` — why the technique collapses when the camera
  scrolls, and strip scrolling with self-blit. Not used in the demo (the article
  does not recommend this route).
- `src/layers.ts` — the layered canvas alternative: `paintStatic` / `paintDynamic`.
- `src/bench.ts` + `src/bench-cli.ts` — seeded scene (mulberry32) and deterministic
  measurement; produces the tables in the article.
- `src/main.ts` + `index.html` — live demo, HUD and dirty region visualization.

## Setup

```bash
npm install
```

## Running

> ⚠️ **Don't double-click `index.html` and open it directly.** The page loads a
> TypeScript module (`<script type="module" src="/src/main.ts">`); with `file://`
> you get a blank screen. Running the Vite dev server is the only way.

### Live demo

```bash
npm run dev
```

`http://localhost:5173/` opens. A scene of 2,000 objects, 20 of them moving by
default. Controls:

- **mode** — `dirty-rect` / `full-redraw` / `layered`.
- **moving** — 0–400 moving objects.
- **maxWaste** — the empty-area budget tolerated during merging (px²).
- **outline dirty regions** — outlines every dirty region with a red frame.
- **AA padding (1px)** — inflates the dirty rectangle by 1px.

The HUD shows the mode, objects drawn / total, dirty area percentage, region count
and the average frame time over the last 30 frames.

Three things worth trying:

1. In `dirty-rect` mode with 20 moving: ~260 / 2000 drawn, ~5% dirty area.
   Switch to `full-redraw` and it becomes 2000 / 2000 and 100%.
2. Drag the **moving** slider to 100: dirty-rect collapses into a single
   full-screen region and the HUD shows 100% dirty. The system has switched itself
   off — the visual proof of the honesty claim in the article.
3. Uncheck the **AA padding** box: the dirty rectangle is clipped to the exact
   geometric bounds and a faint anti-aliasing artifact trail is left behind the
   moving objects.

Note: when outlining is on, the red boxes drawn write permanent pixels to the
canvas; that is why they are dirtied again with `markRect` on the next frame
(otherwise they would accumulate on screen).

### Tests

```bash
npm test
```

17 tests, all pure logic — no DOM or canvas needed. The two most critical ones:
that after merging every input rectangle stays **entirely inside** one of the
outputs (no dirty pixel escapes), and that the result of `GridIndex.query` is
**exactly** the same as `queryBrute`.

### Measurement

```bash
npm run bench
```

Produces the three tables in the article (seeded, deterministic; independent of
machine speed — the only machine-dependent column is `tracking ms/frame`). Actual
output:

```
merge strategy (2000 objects, 40 moving, 300 frames, 640x360)
  none     →  34.8 regions    6.3% dirty   415.8 draw
  ratio 1.5→  32.1 regions    8.4% dirty   446.5 draw

maxWaste sweep (2000 objects, 40 moving, 300 frames, 640x360)
  0        →  34.8 regions    6.3% dirty   415.8 draw
  500      →  31.9 regions    6.7% dirty   414.7 draw
  2000     →  20.9 regions   12.5% dirty   521.1 draw
  8000     →  10.4 regions   31.1% dirty   885.5 draw
  32000    →   1.4 regions   89.8% dirty  1899.5 draw
  Infinity →   1.0 regions   94.1% dirty  1965.1 draw

moving sweep (maxWaste 2000, maxRegions 24, 300 frames)
  5 (0.25%)→   4.6 regions    1.0% dirty    52.7 draw  vs full redraw 3%  tracking 0.006 ms/frame
  20 (1%)  →  14.6 regions    5.2% dirty   260.2 draw  vs full redraw 13%  tracking 0.254 ms/frame
  40 (2%)  →  20.9 regions   12.5% dirty   521.1 draw  vs full redraw 26%  tracking 1.903 ms/frame
  100 (5%) →   1.0 regions  100.0% dirty  2000.0 draw  vs full redraw 100%  tracking 0.015 ms/frame
  200 (10%)→   1.0 regions  100.0% dirty  2000.0 draw  vs full redraw 100%  tracking 0.029 ms/frame
  400 (20%)→   1.0 regions  100.0% dirty  2000.0 draw  vs full redraw 100%  tracking 0.058 ms/frame
  2000 (100%)→   1.0 regions  100.0% dirty  2000.0 draw  vs full redraw 100%  tracking 0.294 ms/frame
```

How to read it: up to a 2% moving ratio dirty-rect is a clear win. At 5% the
`maxRegions` escape hatch kicks in and the technique switches itself off; with 100%
moving dirty-rect **loses** — it does exactly the same work as a full redraw and on
top of that pays 0.29 ms of tracking cost per frame.

### Type checking and build

```bash
npm run typecheck   # tsc --noEmit, strict
npm run build       # tsc && vite build
```

## License

MIT
