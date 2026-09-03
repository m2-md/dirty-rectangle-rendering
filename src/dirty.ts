import { type Rect, clipRect, expandRect, rectArea, snapRect } from "./rect";
import { mergeRects } from "./merge";

export interface DirtyOptions {
  pad?: number; // anti-aliasing payı (px)
  maxWaste?: number; // birleştirmede göze alınan boş alan (px²)
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
    if (this.fullyDirty) return; // zaten her şey kirli, kayıt tutmanın anlamı yok
    const clipped = clipRect(snapRect(expandRect(r, this.pad)), this.bounds);
    if (rectArea(clipped) > 0) this.rects.push(clipped);
  }

  // Hareket eden nesne İKİ yeri birden kirletir: bıraktığını ve gittiğini.
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
    // Birleştirme çift-çift tarar: girdi kabarınca kendi maliyeti çizimden
    // pahalıya patlar. Tavanın dört katını aştıysak hiç uğraşma.
    if (this.rects.length > this.maxRegions * 4) return [{ ...this.bounds }];
    const merged = mergeRects(this.rects, this.maxWaste);
    // Çok fazla parçaya bölündüyse tek tam çizim daha ucuzdur.
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

  // Birleştirilmemiş ham kirli dikdörtgenler: ölçüm ve hata ayıklama için.
  pending(): Rect[] {
    return this.rects.map((r) => ({ ...r }));
  }
}
