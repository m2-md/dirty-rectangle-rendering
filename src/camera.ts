import type { DirtyTracker } from "./dirty";

export interface Camera {
  x: number;
  y: number;
}

export class CameraWatcher {
  private lastX: number;
  private lastY: number;

  constructor(camera: Camera) {
    this.lastX = camera.x;
    this.lastY = camera.y;
  }

  // Kamera kıpırdadıysa dirty-rect'in söyleyecek bir şeyi yok: hepsi kirli.
  sync(camera: Camera, tracker: DirtyTracker): boolean {
    const moved = camera.x !== this.lastX || camera.y !== this.lastY;
    this.lastX = camera.x;
    this.lastY = camera.y;
    if (moved) tracker.markAll();
    return moved;
  }
}
