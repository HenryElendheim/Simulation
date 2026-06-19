import { Camera } from "./camera";
import type { Creature } from "./creature";
import type { Simulation } from "./sim";
import { TILE } from "./config";
import { TILE_COLORS, type Tile } from "./world";

/** Draws the world, entities and overlays to the canvas each frame. */
export class Renderer {
  constructor(private ctx: CanvasRenderingContext2D, private cam: Camera) {}

  draw(sim: Simulation, selected: Creature | null): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, this.cam.viewW, this.cam.viewH);

    this.drawTerrain(sim);
    this.drawFood(sim);
    this.drawCreatures(sim, selected);
  }

  private drawTerrain(sim: Simulation): void {
    const { ctx, cam } = this;
    const w = sim.world;
    // Only draw the tiles inside the viewport.
    const [wx0, wy0] = cam.screenToWorld(0, 0);
    const [wx1, wy1] = cam.screenToWorld(cam.viewW, cam.viewH);
    const tx0 = Math.max(0, Math.floor(wx0 / TILE));
    const ty0 = Math.max(0, Math.floor(wy0 / TILE));
    const tx1 = Math.min(w.width - 1, Math.ceil(wx1 / TILE));
    const ty1 = Math.min(w.height - 1, Math.ceil(wy1 / TILE));
    const size = TILE * cam.zoom + 1; // +1 avoids seams between tiles

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = w.tileAt(tx, ty) as Tile;
        const [sx, sy] = cam.worldToScreen(tx * TILE, ty * TILE);
        ctx.fillStyle = TILE_COLORS[tile];
        ctx.fillRect(sx, sy, size, size);
      }
    }
  }

  private drawFood(sim: Simulation): void {
    const { ctx, cam } = this;
    for (const f of sim.foods) {
      if (f.amount < 0.2) continue;
      const [sx, sy] = cam.worldToScreen(f.x, f.y);
      if (sx < -10 || sy < -10 || sx > cam.viewW + 10 || sy > cam.viewH + 10) continue;
      const r = (2 + f.amount * 0.6) * Math.max(0.6, cam.zoom);
      ctx.fillStyle = "#c0426a";
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCreatures(sim: Simulation, selected: Creature | null): void {
    const { ctx, cam } = this;
    const baseR = 5 * Math.max(0.6, cam.zoom);
    for (const c of sim.creatures) {
      const [sx, sy] = cam.worldToScreen(c.x, c.y);
      if (sx < -20 || sy < -20 || sx > cam.viewW + 20 || sy > cam.viewH + 20) continue;
      const r = c.isAdult ? baseR : baseR * 0.65;

      // Body, tinted by health.
      ctx.fillStyle = c.tribe.color;
      ctx.globalAlpha = 0.35 + c.health * 0.65;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Facing tick.
      if (c.vx || c.vy) {
        ctx.strokeStyle = "#0b0e12";
        ctx.lineWidth = Math.max(1, cam.zoom);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + c.vx * r * 1.6, sy + c.vy * r * 1.6);
        ctx.stroke();
      }

      if (c === selected) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (c.speech && cam.zoom > 0.55) {
        this.drawBubble(sx, sy - r - 4, c.speech);
      }
    }
  }

  private drawBubble(sx: number, sy: number, text: string): void {
    const ctx = this.ctx;
    ctx.font = "11px ui-monospace, monospace";
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = "rgba(12,15,20,0.85)";
    ctx.strokeStyle = "rgba(111,211,199,0.6)";
    ctx.lineWidth = 1;
    const x = sx - w / 2;
    const y = sy - 16;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 15, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#cdeee9";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, sx, y + 8);
    ctx.textAlign = "left";
  }
}
