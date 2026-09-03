export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Kenardan değmek kesişmek sayılmaz: yarı-açık aralık [x, x+w).
export function rectIntersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

// İkisini birden kapsayan en küçük dikdörtgen.
export function rectUnion(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: right - x, h: bottom - y };
}

export function rectArea(r: Rect): number {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

export function rectIntersectionArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function expandRect(r: Rect, pad = 1): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

// Kesirli koordinatları dışa doğru tam sayıya yuvarla:
// yarım piksel bile dışarıda kalmasın.
export function snapRect(r: Rect): Rect {
  const x = Math.floor(r.x);
  const y = Math.floor(r.y);
  return { x, y, w: Math.ceil(r.x + r.w) - x, h: Math.ceil(r.y + r.h) - y };
}

// Tuvalin dışına taşan kısmı kırp.
export function clipRect(r: Rect, bounds: Rect): Rect {
  const x = Math.max(r.x, bounds.x);
  const y = Math.max(r.y, bounds.y);
  const right = Math.min(r.x + r.w, bounds.x + bounds.w);
  const bottom = Math.min(r.y + r.h, bounds.y + bounds.h);
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}
