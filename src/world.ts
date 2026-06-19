import { fbm, RNG } from "./rng";
import { Cave, TILE } from "./config";

/** The two stacked top-down maps the world is made of. */
export enum Layer {
  Surface = 0,
  Underground = 1,
}

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

/** Underground tile types (the cave layer). */
export enum Under {
  Stone = 0, // solid, diggable
  Cave = 1, // open, walkable
  CaveWater = 2, // underground pool, drinkable
  Bedrock = 3, // solid, too hard to dig
  Ore = 4, // solid, diggable, valuable flavour
}

export const UNDER_COLORS: Record<Under, string> = {
  [Under.Stone]: "#3a3640",
  [Under.Cave]: "#15121a",
  [Under.CaveWater]: "#1f4a63",
  [Under.Bedrock]: "#26242c",
  [Under.Ore]: "#6a5a3a",
};

/** Tiles a land creature can walk on. */
export function isLand(t: Tile): boolean {
  return t >= Tile.Sand;
}
export function isWater(t: Tile): boolean {
  return t <= Tile.Water;
}
/** Vegetated ground that herbivores can graze on. */
export function isGrazable(t: Tile): boolean {
  return t === Tile.Grass || t === Tile.Forest;
}
export function isCaveOpen(u: Under): boolean {
  return u === Under.Cave;
}
export function isSolidUnder(u: Under): boolean {
  return u === Under.Stone || u === Under.Bedrock || u === Under.Ore;
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
  /** The underground cave layer, parallel grid to `tiles`. */
  under: Uint8Array;
  /** Tile indices where a creature can pass between surface and underground. */
  entrances = new Set<number>();
  seed: number;
  /** Continuous elevation [0,1], kept so god tools can raise/lower terrain. */
  elevation: Float32Array;

  constructor(width: number, height: number, seed: number) {
    this.width = width;
    this.height = height;
    this.seed = seed;
    this.tiles = new Uint8Array(width * height);
    this.under = new Uint8Array(width * height);
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

  underAt(tx: number, ty: number): Under {
    if (!this.inBounds(tx, ty)) return Under.Bedrock;
    return this.under[this.idx(tx, ty)] as Under;
  }

  /** World pixel -> tile coordinate. */
  tileAtPixel(px: number, py: number): Tile {
    return this.tileAt(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  isGrazableAtPixel(px: number, py: number): boolean {
    return isGrazable(this.tileAtPixel(px, py));
  }

  isWaterAtPixel(px: number, py: number): boolean {
    return isWater(this.tileAtPixel(px, py));
  }

  /** Find a random water tile (pixel centre), for spawning fish. */
  randomWater(rng: RNG, tries = 300): { x: number; y: number } | null {
    for (let t = 0; t < tries; t++) {
      const tx = rng.int(0, this.width - 1);
      const ty = rng.int(0, this.height - 1);
      if (isWater(this.tileAt(tx, ty))) {
        return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
      }
    }
    return null;
  }

  /** Whether a creature on `layer` can stand on the tile at the given pixel. */
  walkable(layer: Layer, px: number, py: number): boolean {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (layer === Layer.Surface) return isLand(this.tileAt(tx, ty));
    return isCaveOpen(this.underAt(tx, ty));
  }

  isEntrance(tx: number, ty: number): boolean {
    return this.entrances.has(this.idx(tx, ty));
  }

  regenerate(width: number, height: number, seed: number): void {
    this.width = width;
    this.height = height;
    this.seed = seed;
    this.tiles = new Uint8Array(width * height);
    this.under = new Uint8Array(width * height);
    this.elevation = new Float32Array(width * height);
    this.entrances.clear();
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

    this.genUnderground(rng);
  }

  /** Carve the cave layer with noise, add water pools, ore, and entrances. */
  private genUnderground(rng: RNG): void {
    const caveSeed = rng.int(1, 1 << 30);
    const poolSeed = rng.int(1, 1 << 30);
    const w = this.width;
    const h = this.height;
    // Centre the open band around the target openness fraction.
    const half = Cave.openness / 2;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = this.idx(x, y);
        // Hard bedrock shell around the very edge.
        if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) {
          this.under[i] = Under.Bedrock;
          continue;
        }
        const c = fbm(x, y, 16, 4, caveSeed);
        if (c > 0.5 - half && c < 0.5 + half) {
          // Open cavern; deepest spots flood into underground pools.
          const pool = fbm(x, y, 12, 3, poolSeed);
          this.under[i] = pool < 0.28 ? Under.CaveWater : Under.Cave;
        } else {
          this.under[i] = rng.chance(0.04) ? Under.Ore : Under.Stone;
        }
      }
    }

    // Natural sinkholes: pick land tiles and ensure an open cave beneath.
    let made = 0;
    for (let t = 0; t < 600 && made < Cave.naturalEntrances; t++) {
      const tx = rng.int(3, w - 4);
      const ty = rng.int(3, h - 4);
      if (!isLand(this.tileAt(tx, ty))) continue;
      this.carveRoom(tx, ty, rng.int(1, 2));
      this.entrances.add(this.idx(tx, ty));
      made++;
    }
  }

  /** Open up a small cave room around a tile (used for entrances). */
  private carveRoom(tx: number, ty: number, r: number): void {
    for (let y = ty - r; y <= ty + r; y++) {
      for (let x = tx - r; x <= tx + r; x++) {
        if (!this.inBounds(x, y)) continue;
        if (Math.hypot(x - tx, y - ty) > r + 0.3) continue;
        const i = this.idx(x, y);
        if (this.under[i] !== Under.Bedrock) this.under[i] = Under.Cave;
      }
    }
  }

  /**
   * Dig out a tile. On the surface this sinks a shaft, opening the cave below and
   * registering an entrance. Underground it tunnels through stone/ore into cave.
   * Returns true if rock was actually removed. Bedrock can't be dug.
   */
  dig(layer: Layer, tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    const i = this.idx(tx, ty);
    if (layer === Layer.Surface) {
      if (!isLand(this.tiles[i] as Tile)) return false;
      if (isSolidUnder(this.under[i] as Under) && this.under[i] !== Under.Bedrock) {
        this.under[i] = Under.Cave;
      }
      this.entrances.add(i);
      return true;
    }
    const u = this.under[i] as Under;
    if (u === Under.Stone || u === Under.Ore) {
      this.under[i] = Under.Cave;
      return true;
    }
    return false;
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
