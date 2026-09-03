import type { HasBounds } from "./query";

export interface Sprite extends HasBounds {
  id: number;
  vx: number;
  vy: number;
  color: string;
}
