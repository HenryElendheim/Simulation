import { fbm, RNG } from "./rng";
import { TILE } from "./config";

export enum Tile {
  DeepWater = 0,
  Water = 1,
  Sand = 2,
  Grass = 3,
  Forest = 4,
  Rock = 5,
  Snow = 6,
}

export const TILE_COLORS: Record<Tile, string> = {
  [Tile.DeepWater]: "#1b3a5c",
  [Tile.Water]: "#2d6e9e",
  [Tile.Sand]: "#d9c89a",
  [Tile.Grass]: "#5a8f4e",
  [Tile.Forest]: "#356b3a",
  [Tile.Rock]: "#76757a",
  [Tile.Snow]: "#e8edf2",
};

/** Tiles a land creature can walk on. */
export function isLand(t: Tile): boolean {
  return t >= Tile.Sand;
}
export function isWater(t: Tile): boolean {
  return t <= Tile.Water;
}

/**
 * The terrain grid. Stored as a flat Uint8Array for cache-friendliness; large
 * worlds (e.g. 400x400) stay cheap. `regenerate` rebuilds an island using a
 * radial falloff (so the map is surrounded by sea) modulated by fractal noise.
 */
export class World {
  width: number;
  height: number;
  tiles: Uint8Array;
  seed: number;
  /** Continuous elevation [0,1], kept so god tools can raise/lower terrain. */
  elevation: Float32Array;

  constructor(width: number, height: number, seed: number) {
    this.width = width;
    this.height = height;
    this.seed = seed;
    this.tiles = new Uint8Array(width * height);
    this.elevation = new Float32Array(width * height);
    this.regenerate(width, height, seed);
  }

  get pixelW(): number {
    return this.width * TILE;
  }
  get pixelH(): number {
    return this.height * TILE;
  }

  idx(tx: number, ty: number): number {
    return ty * this.width + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  tileAt(tx: number, ty: number): Tile {
    if (!this.inBounds(tx, ty)) return Tile.DeepWater;
    return this.tiles[this.idx(tx, ty)] as Tile;
  }

  /** World pixel -> tile coordinate. */
  tileAtPixel(px: number, py: number): Tile {
    return this.tileAt(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  regenerate(width: number, height: number, seed: number): void {
    this.width = width;
    this.height = height;
    this.seed = seed;
    this.tiles = new Uint8Array(width * height);
    this.elevation = new Float32Array(width * height);
    const rng = new RNG(seed);
    const noiseSeed = rng.int(1, 1 << 30);
    const moistSeed = rng.int(1, 1 << 30);
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) * 0.5;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Radial falloff: 1 at centre, 0 at the rim -> guarantees an island.
        const dx = (x - cx) / maxR;
        const dy = (y - cy) / maxR;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const falloff = Math.max(0, 1 - dist * dist);

        const n = fbm(x, y, 22, 5, noiseSeed);
        const e = falloff * 0.75 + n * 0.45 - 0.12;
        const moist = fbm(x, y, 30, 3, moistSeed);

        const i = this.idx(x, y);
        this.elevation[i] = e;
        this.tiles[i] = this.classify(e, moist);
      }
    }
  }

  /** Map an elevation + moisture pair to a tile type. */
  classify(e: number, moist: number): Tile {
    if (e < 0.12) return Tile.DeepWater;
    if (e < 0.22) return Tile.Water;
    if (e < 0.28) return Tile.Sand;
    if (e < 0.6) return moist > 0.55 ? Tile.Forest : Tile.Grass;
    if (e < 0.78) return Tile.Rock;
    return Tile.Snow;
  }

  /** Raise (+) or lower (-) terrain in a circle — the "shape land" god power. */
  reshape(tx: number, ty: number, radius: number, delta: number): void {
    for (let y = ty - radius; y <= ty + radius; y++) {
      for (let x = tx - radius; x <= tx + radius; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = Math.hypot(x - tx, y - ty);
        if (d > radius) continue;
        const i = this.idx(x, y);
        const fall = 1 - d / radius;
        this.elevation[i] = Math.max(0, Math.min(1, this.elevation[i] + delta * fall));
        // Re-derive moisture roughly from current tile so re-classify is stable.
        const moist = this.tiles[i] === Tile.Forest ? 0.7 : 0.4;
        this.tiles[i] = this.classify(this.elevation[i], moist);
      }
    }
  }

  /** Find a random walkable land tile (pixel centre). Returns null if none found. */
  randomLand(rng: RNG, tries = 200): { x: number; y: number } | null {
    for (let t = 0; t < tries; t++) {
      const tx = rng.int(0, this.width - 1);
      const ty = rng.int(0, this.height - 1);
      if (isLand(this.tileAt(tx, ty))) {
        return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
      }
    }
    return null;
  }
}
