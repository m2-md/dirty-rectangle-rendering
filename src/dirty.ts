import { type Rect, clipRect, expandRect, rectArea, snapRect } from "./rect";
import { mergeRects } from "./merge";

export interface DirtyOptions {
  pad?: number; // anti-aliasing padding margin (px)
  maxWaste?: number; // allowed wasted empty space budget during merge (px²)
  maxRegions?: number;
}

export class DirtyTracker {
  private rects: Rect[] = [];
  private fullyDirty = false;
  private readonly pad: number;
  private readonly maxWaste: number;
  private readonly maxRegions: number;

  constructor(
    private readonly bounds: Rect,
    options: DirtyOptions = {},
  ) {
    this.pad = options.pad ?? 1;
    this.maxWaste = options.maxWaste ?? 2000;
    this.maxRegions = options.maxRegions ?? 24;
  }

  markRect(r: Rect): void {
    if (this.fullyDirty) return; // already fully dirty, recording individual rects is redundant
    const clipped = clipRect(snapRect(expandRect(r, this.pad)), this.bounds);
    if (rectArea(clipped) > 0) this.rects.push(clipped);
  }

  // A moving object dirties TWO locations: where it left and where it arrived.
  markMoved(prev: Rect, next: Rect): void {
    this.markRect(prev);
    this.markRect(next);
  }

  markAll(): void {
    this.fullyDirty = true;
    this.rects = [{ ...this.bounds }];
  }

  regions(): Rect[] {
    if (this.fullyDirty) return [{ ...this.bounds }];
    // Pairwise merge scans all pairs: when inputs explode, merging costs
    // more than full redraw. If exceeding 4x the cap, bail out immediately.
    if (this.rects.length > this.maxRegions * 4) return [{ ...this.bounds }];
    const merged = mergeRects(this.rects, this.maxWaste);
    // If fragmented into too many pieces, a single full draw is cheaper.
    if (merged.length > this.maxRegions) return [{ ...this.bounds }];
    return merged;
  }

  clear(): void {
    this.rects.length = 0;
    this.fullyDirty = false;
  }

  get pendingCount(): number {
    return this.rects.length;
  }

  // Unmerged raw dirty rectangles: for measurement and debugging.
  pending(): Rect[] {
    return this.rects.map((r) => ({ ...r }));
  }
}
