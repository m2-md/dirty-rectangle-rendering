import { type Rect, rectIntersects } from "./rect";

export interface HasBounds {
  bounds: Rect;
}

// Referans doğru: her nesneyi tek tek kontrol et. Testlerde ölçüt olarak kullanılır.
export function queryBrute<T extends HasBounds>(items: T[], region: Rect): T[] {
  return items.filter((it) => rectIntersects(it.bounds, region));
}

export class GridIndex<T extends HasBounds> {
  private cells = new Map<string, number[]>();
  private items: T[] = [];

  constructor(public readonly cellSize: number) {}

  clear(): void {
    this.cells.clear();
    this.items.length = 0;
  }

  private cellOf(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  insert(item: T): void {
    const id = this.items.length;
    this.items.push(item);
    const b = item.bounds;
    // Nesneyi AABB'sinin dokunduğu HER hücreye yaz.
    for (let cx = this.cellOf(b.x); cx <= this.cellOf(b.x + b.w); cx++) {
      for (let cy = this.cellOf(b.y); cy <= this.cellOf(b.y + b.h); cy++) {
        const key = cx + "," + cy;
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(id);
      }
    }
  }

  query(region: Rect): T[] {
    const seen = new Set<number>();
    const out: T[] = [];
    for (
      let cx = this.cellOf(region.x);
      cx <= this.cellOf(region.x + region.w);
      cx++
    ) {
      for (
        let cy = this.cellOf(region.y);
        cy <= this.cellOf(region.y + region.h);
        cy++
      ) {
        const cell = this.cells.get(cx + "," + cy);
        if (!cell) continue;
        for (const id of cell) {
          if (seen.has(id)) continue; // aynı nesne birden çok hücrede olabilir
          seen.add(id);
          const item = this.items[id];
          if (rectIntersects(item.bounds, region)) out.push(item);
        }
      }
    }
    return out;
  }
}
