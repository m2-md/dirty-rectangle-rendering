import { describe, it, expect } from "vitest";
import {
  type Rect,
  expandRect,
  rectArea,
  rectIntersectionArea,
  rectIntersects,
  rectUnion,
} from "../src/rect";
import { mergeRects } from "../src/merge";
import { DirtyTracker } from "../src/dirty";
import { GridIndex, queryBrute, type HasBounds } from "../src/query";

describe("rect math", () => {
  it("edge-touching rectangles are not considered intersecting", () => {
    const a: Rect = { x: 0, y: 0, w: 10, h: 10 };
    expect(rectIntersects(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectIntersects(a, { x: 9, y: 0, w: 10, h: 10 })).toBe(true);
  });

  it("union covers both rectangles", () => {
    const a: Rect = { x: 0, y: 0, w: 10, h: 10 };
    const b: Rect = { x: 20, y: 5, w: 10, h: 10 };
    expect(rectUnion(a, b)).toEqual({ x: 0, y: 0, w: 30, h: 15 });
    expect(rectArea(rectUnion(a, b))).toBeGreaterThanOrEqual(
      rectArea(a) + rectArea(b),
    );
  });

  it("expandRect expands 1px in each direction for anti-aliasing padding", () => {
    expect(expandRect({ x: 10, y: 10, w: 5, h: 5 }, 1)).toEqual({
      x: 9,
      y: 9,
      w: 7,
      h: 7,
    });
  });

  it("rectIntersectionArea returns 0 for non-intersecting pairs", () => {
    const a: Rect = { x: 0, y: 0, w: 10, h: 10 };
    expect(rectIntersectionArea(a, { x: 20, y: 0, w: 10, h: 10 })).toBe(0);
    expect(rectIntersectionArea(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(25);
  });
});

describe("mergeRects", () => {
  it("merges overlapping rectangles into one", () => {
    const merged = mergeRects(
      [
        { x: 0, y: 0, w: 20, h: 20 },
        { x: 10, y: 10, w: 20, h: 20 },
      ],
      0,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({ x: 0, y: 0, w: 30, h: 30 });
  });

  it("leaves distant rectangles separate", () => {
    const merged = mergeRects(
      [
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 500, y: 500, w: 10, h: 10 },
      ],
      2000,
    );
    expect(merged).toHaveLength(2);
    expect(merged.reduce((s, r) => s + rectArea(r), 0)).toBe(200);
  });

  it("merged regions fully contain all input rectangles", () => {
    const input: Rect[] = [
      { x: 0, y: 0, w: 12, h: 12 },
      { x: 8, y: 4, w: 12, h: 12 },
      { x: 300, y: 200, w: 30, h: 30 },
    ];
    const merged = mergeRects(input, 0);
    for (const r of input) {
      // Every input must be completely contained inside an output: no dirty pixels missed.
      expect(
        merged.some((m) => rectIntersectionArea(m, r) === rectArea(r)),
      ).toBe(true);
    }
  });

  it("merges only overlapping rectangles when waste budget is 0", () => {
    const near: Rect[] = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 12, y: 0, w: 10, h: 10 }, // 2px gap -> 20px² waste
    ];
    expect(mergeRects(near, 0)).toHaveLength(2);
    expect(mergeRects(near, 20)).toHaveLength(1);
  });
});

describe("DirtyTracker", () => {
  const bounds: Rect = { x: 0, y: 0, w: 640, h: 360 };

  it("markMoved dirties both previous and new positions", () => {
    const t = new DirtyTracker(bounds, { pad: 1, maxWaste: 0 });
    t.markMoved(
      { x: 10, y: 10, w: 20, h: 20 },
      { x: 300, y: 200, w: 20, h: 20 },
    );
    const regions = t.regions();
    expect(regions).toHaveLength(2);
    expect(
      regions.some((r) => rectIntersects(r, { x: 10, y: 10, w: 20, h: 20 })),
    ).toBe(true);
    expect(
      regions.some((r) => rectIntersects(r, { x: 300, y: 200, w: 20, h: 20 })),
    ).toBe(true);
  });

  it("merges previous and new positions into single region on small steps", () => {
    const t = new DirtyTracker(bounds, { pad: 1, maxWaste: 0 });
    t.markMoved(
      { x: 100, y: 100, w: 20, h: 20 },
      { x: 103, y: 100, w: 20, h: 20 },
    );
    expect(t.regions()).toHaveLength(1);
  });

  it("regions do not overflow outside canvas bounds", () => {
    const t = new DirtyTracker(bounds, { maxWaste: 0 });
    t.markRect({ x: -50, y: -50, w: 100, h: 100 });
    const [r] = t.regions();
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.x + r.w).toBeLessThanOrEqual(640);
  });

  it("falls back to full redraw when region count exceeds cap", () => {
    const t = new DirtyTracker(bounds, { pad: 0, maxWaste: 0, maxRegions: 3 });
    for (let i = 0; i < 8; i++)
      t.markRect({ x: i * 70, y: i * 40, w: 10, h: 10 });
    expect(t.regions()).toEqual([bounds]);
  });

  it("markAll dirties everything and swallows subsequent markRects", () => {
    const t = new DirtyTracker(bounds, { maxWaste: 0 });
    t.markAll();
    t.markRect({ x: 5, y: 5, w: 5, h: 5 });
    expect(t.regions()).toEqual([bounds]);
    expect(t.pendingCount).toBe(1);
  });

  it("leaves no dirty regions after clear", () => {
    const t = new DirtyTracker(bounds);
    t.markRect({ x: 5, y: 5, w: 5, h: 5 });
    t.clear();
    expect(t.regions()).toHaveLength(0);
  });
});

interface TestSprite extends HasBounds {
  id: number;
}

function scene(n: number, seed: number): TestSprite[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  return Array.from({ length: n }, (_, id) => ({
    id,
    bounds: {
      x: rand() * 620,
      y: rand() * 340,
      w: 4 + rand() * 40,
      h: 4 + rand() * 40,
    },
  }));
}

describe("spatial query for objects touching dirty regions", () => {
  it("grid query matches brute-force set exactly", () => {
    const items = scene(400, 9);
    const grid = new GridIndex<TestSprite>(64);
    for (const it of items) grid.insert(it);

    const regions: Rect[] = [
      { x: 0, y: 0, w: 50, h: 50 }, // corner
      { x: 200, y: 120, w: 90, h: 40 }, // middle
      { x: 610, y: 330, w: 30, h: 30 }, // overflowing edge
      { x: 0, y: 0, w: 640, h: 360 }, // full screen
    ];
    for (const region of regions) {
      const fromGrid = grid
        .query(region)
        .map((s) => s.id)
        .sort((a, b) => a - b);
      const brute = queryBrute(items, region)
        .map((s) => s.id)
        .sort((a, b) => a - b);
      expect(fromGrid).toEqual(brute);
    }
  });

  it("matches brute-force even with negative coordinate regions", () => {
    const items = scene(300, 17);
    const grid = new GridIndex<TestSprite>(48);
    for (const it of items) grid.insert(it);
    const region: Rect = { x: -80, y: -40, w: 200, h: 150 };
    const fromGrid = grid
      .query(region)
      .map((s) => s.id)
      .sort((a, b) => a - b);
    const brute = queryBrute(items, region)
      .map((s) => s.id)
      .sort((a, b) => a - b);
    expect(fromGrid).toEqual(brute);
  });

  it("does not return duplicate objects", () => {
    const items = scene(200, 3);
    const grid = new GridIndex<TestSprite>(32);
    for (const it of items) grid.insert(it);
    const ids = grid.query({ x: 0, y: 0, w: 640, h: 360 }).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
