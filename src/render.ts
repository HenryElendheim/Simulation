import { Camera } from "./camera";
import type { Creature } from "./creature";
import type { Simulation } from "./sim";
import { TILE } from "./config";
import { Layer, TILE_COLORS, UNDER_COLORS, type Tile, type Under } from "./world";

/** Drawn radius per species (world units before zoom). */
const ANIMAL_SIZE: Record<string, number> = {
  cow: 6,
  hunter: 5,
  grazer: 4,
  fish: 3,
  chicken: 2.6,
};

/** Draws the world, entities and overlays to the canvas each frame. */
export class Renderer {
  /** Which map level is currently shown. Toggled from the UI. */
  layer: Layer = Layer.Surface;

  constructor(private ctx: CanvasRenderingContext2D, private cam: Camera) {}

  draw(sim: Simulation, selected: Creature | null): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, this.cam.viewW, this.cam.viewH);

    this.drawTerrain(sim);
    if (this.layer === Layer.Surface) {
      this.drawFood(sim);
      this.drawTrees(sim);
      this.drawAnimals(sim);
    }
    this.drawCreatures(sim, selected);
  }

  private drawTerrain(sim: Simulation): void {
    const { ctx, cam } = this;
    const w = sim.world;
    const surface = this.layer === Layer.Surface;
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
        const [sx, sy] = cam.worldToScreen(tx * TILE, ty * TILE);
        if (surface) {
          ctx.fillStyle = TILE_COLORS[w.tileAt(tx, ty) as Tile];
          ctx.fillRect(sx, sy, size, size);
          // Mark cave entrances with a dark dot.
          if (w.isEntrance(tx, ty)) {
            ctx.fillStyle = "#1a1622";
            const r = size * 0.28;
            ctx.beginPath();
            ctx.arc(sx + size / 2, sy + size / 2, r, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = UNDER_COLORS[w.underAt(tx, ty) as Under];
          ctx.fillRect(sx, sy, size, size);
        }
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

  private drawTrees(sim: Simulation): void {
    const { ctx, cam } = this;
    for (const t of sim.trees) {
      const [sx, sy] = cam.worldToScreen(t.x, t.y);
      if (sx < -16 || sy < -16 || sx > cam.viewW + 16 || sy > cam.viewH + 16) continue;
      const z = Math.max(0.5, cam.zoom);
      const trunkH = (5 + t.maturity * 5) * z;
      const crown = (3 + t.maturity * 5) * z;
      // Trunk.
      ctx.fillStyle = "#5b3d27";
      ctx.fillRect(sx - z, sy - z, Math.max(1, 2 * z), trunkH);
      // Canopy, with a hint of fruit when laden.
      ctx.fillStyle = t.hasFood ? "#2f7d3a" : "#27632f";
      ctx.beginPath();
      ctx.arc(sx, sy - crown * 0.4, crown, 0, Math.PI * 2);
      ctx.fill();
      if (t.fruit > 2 && cam.zoom > 0.7) {
        ctx.fillStyle = "#d65a7a";
        ctx.beginPath();
        ctx.arc(sx + crown * 0.4, sy - crown * 0.4, Math.max(1, z), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawAnimals(sim: Simulation): void {
    const { ctx, cam } = this;
    const z = Math.max(0.6, cam.zoom);
    for (const a of sim.animals) {
      const [sx, sy] = cam.worldToScreen(a.x, a.y);
      if (sx < -16 || sy < -16 || sx > cam.viewW + 16 || sy > cam.viewH + 16) continue;
      const r = ANIMAL_SIZE[a.species.id] ?? 4;
      const rr = r * z * (a.isAdult ? 1 : 0.7);
      ctx.fillStyle = a.species.color;
      ctx.globalAlpha = 0.4 + a.health * 0.6;
      if (a.species.habitat === "water") {
        // Fish: a little ellipse pointing the way it swims.
        ctx.beginPath();
        ctx.ellipse(sx, sy, rr * 1.4, rr * 0.7, Math.atan2(a.vy, a.vx), 0, Math.PI * 2);
        ctx.fill();
      } else if (a.species.diet === "carnivore") {
        // Predators: diamonds.
        ctx.beginPath();
        ctx.moveTo(sx, sy - rr);
        ctx.lineTo(sx + rr, sy);
        ctx.lineTo(sx, sy + rr);
        ctx.lineTo(sx - rr, sy);
        ctx.closePath();
        ctx.fill();
      } else {
        // Herbivores: circles.
        ctx.beginPath();
        ctx.arc(sx, sy, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawCreatures(sim: Simulation, selected: Creature | null): void {
    const { ctx, cam } = this;
    const baseR = 5 * Math.max(0.6, cam.zoom);
    for (const c of sim.creatures) {
      if (c.layer !== this.layer) continue; // only show this level's people
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
        this.drawBubble(sx, sy - r - 4, c.speech, c.speechGloss);
      }
    }
  }

  private drawBubble(sx: number, sy: number, text: string, gloss: string): void {
    const ctx = this.ctx;
    const wordFont = "11px ui-monospace, monospace";
    const glossFont = "9px ui-monospace, monospace";
    ctx.font = wordFont;
    const wordW = ctx.measureText(text).width;
    ctx.font = glossFont;
    const glossW = gloss ? ctx.measureText(gloss).width : 0;

    const pad = 6;
    const w = Math.max(wordW, glossW) + pad * 2;
    const h = gloss ? 26 : 15;
    const x = sx - w / 2;
    const y = sy - h - 1;

    ctx.fillStyle = "rgba(12,15,20,0.88)";
    ctx.strokeStyle = "rgba(111,211,199,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Spoken words.
    ctx.font = wordFont;
    ctx.fillStyle = "#cdeee9";
    ctx.fillText(text, sx, y + 8);
    // Meaning, dimmer, underneath.
    if (gloss) {
      ctx.font = glossFont;
      ctx.fillStyle = "#8190a3";
      ctx.fillText(gloss, sx, y + 18);
    }
    ctx.textAlign = "left";
  }
}
