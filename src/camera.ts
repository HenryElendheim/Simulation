/** Pan/zoom camera mapping world pixels <-> screen pixels. */
export class Camera {
  x = 0; // world coords at screen centre
  y = 0;
  zoom = 1;
  minZoom = 0.25;
  maxZoom = 4;

  constructor(public viewW: number, public viewH: number) {}

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx;
    this.y = wy;
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [
      (wx - this.x) * this.zoom + this.viewW / 2,
      (wy - this.y) * this.zoom + this.viewH / 2,
    ];
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [
      (sx - this.viewW / 2) / this.zoom + this.x,
      (sy - this.viewH / 2) / this.zoom + this.y,
    ];
  }

  /** Pan by a screen-space delta (e.g. mouse drag). */
  panByScreen(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  /** Zoom toward a screen point so it stays under the cursor. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const [nx, ny] = this.screenToWorld(sx, sy);
    this.x += wx - nx;
    this.y += wy - ny;
  }
}
