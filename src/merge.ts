import {
  type Rect,
  rectArea,
  rectIntersectionArea,
  rectIntersects,
  rectUnion,
} from "./rect";

// How many empty pixels would be redundantly cleared if merged?
export function mergeWaste(a: Rect, b: Rect): number {
  const covered = rectArea(a) + rectArea(b) - rectIntersectionArea(a, b);
  return rectArea(rectUnion(a, b)) - covered;
}

export function mergeRects(rects: Rect[], maxWaste = 0): Rect[] {
  const out: Rect[] = rects.map((r) => ({ ...r }));

  let changed = true;
  while (changed) {
    changed = false;
    let bi = -1;
    let bj = -1;
    let best = Infinity;

    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        // Overlapping rects merge unconditionally: no point clearing twice.
        if (rectIntersects(out[i], out[j])) {
          bi = i;
          bj = j;
          best = -1;
          break;
        }
        const waste = mergeWaste(out[i], out[j]);
        if (waste <= maxWaste && waste < best) {
          best = waste;
          bi = i;
          bj = j;
        }
      }
      if (best === -1) break;
    }

    if (bi >= 0) {
      out[bi] = rectUnion(out[bi], out[bj]);
      out.splice(bj, 1);
      changed = true;
    }
  }
  return out;
}

// Naive legacy version: ratio threshold. Kept in repo only for
// benchmark comparison — use mergeRects in production.
export function mergeRectsRatio(rects: Rect[], maxGrowth = 1.5): Rect[] {
  const out: Rect[] = rects.map((r) => ({ ...r }));

  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const union = rectUnion(out[i], out[j]);
        // Snowball: as merged rectangle grows, this threshold also grows.
        if (
          rectArea(union) <=
          maxGrowth * (rectArea(out[i]) + rectArea(out[j]))
        ) {
          out[i] = union;
          out.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return out;
}
