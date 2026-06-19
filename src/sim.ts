import { Creature as CC, Food, SECONDS_PER_DAY, TILE } from "./config";
import { Creature } from "./creature";
import {
  CONCEPTS,
  createTribe,
  nameConcept,
  type ConceptId,
  type Tribe,
} from "./language";
import { FoodSource } from "./resources";
import { RNG } from "./rng";
import { isLand, isWater, World } from "./world";

export interface LogEntry {
  day: number;
  text: string;
  kind: "life" | "lang" | "doom" | "divine";
}

/**
 * Owns the whole simulation: world, tribes, creatures, food, the clock, and the
 * event chronicle. Also exposes the perception helpers creatures query and the
 * god-power methods the UI calls.
 */
export class Simulation {
  world: World;
  rng: RNG;
  tribes: Tribe[] = [];
  creatures: Creature[] = [];
  foods: FoodSource[] = [];
  timeDays = 0;
  log: LogEntry[] = [];

  constructor(world: World, seed: number) {
    this.world = world;
    this.rng = new RNG(seed ^ 0x1234);
  }

  get day(): number {
    return Math.floor(this.timeDays) + 1;
  }

  // ---- World seeding -------------------------------------------------------

  seedLife(tribeCount: number, perTribe: number): void {
    this.tribes = [];
    this.creatures = [];
    this.foods = [];

    for (let i = 0; i < Food.startingBushes; i++) {
      const spot = this.randomBushSpot();
      if (spot) this.foods.push(new FoodSource(spot.x, spot.y));
    }

    for (let t = 0; t < tribeCount; t++) {
      const tribe = createTribe(t, this.rng.int(1, 1 << 30));
      this.tribes.push(tribe);
      // Cluster a tribe around one landfall so members actually meet & talk.
      const home = this.world.randomLand(this.rng) ?? { x: this.world.pixelW / 2, y: this.world.pixelH / 2 };
      for (let n = 0; n < perTribe; n++) {
        const c = this.spawnCreature(tribe, home.x + this.rng.range(-40, 40), home.y + this.rng.range(-40, 40));
        if (c) c.age = this.rng.range(0.5, 4);
      }
      this.addLog(`${tribe.name} awaken upon the island.`, "life");
    }
  }

  private randomBushSpot(): { x: number; y: number } | null {
    const w = this.world;
    for (let t = 0; t < 200; t++) {
      const tx = this.rng.int(0, w.width - 1);
      const ty = this.rng.int(0, w.height - 1);
      const tile = w.tileAt(tx, ty);
      if (tile === 3 /* Grass */ || tile === 4 /* Forest */) {
        return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
      }
    }
    return null;
  }

  // ---- Main loop -----------------------------------------------------------

  update(dt: number): void {
    this.timeDays += dt / SECONDS_PER_DAY;
    const dtDays = dt / SECONDS_PER_DAY;

    for (const f of this.foods) f.grow(dtDays);

    // Iterate over a snapshot so births/deaths during the tick are safe.
    const snapshot = this.creatures;
    for (let i = 0; i < snapshot.length; i++) {
      const c = snapshot[i];
      if (c.alive) c.update(this, dt);
    }
    if (this.deadThisFrame) {
      this.creatures = this.creatures.filter((c) => c.alive);
      this.deadThisFrame = false;
    }
  }

  // ---- Perception helpers (queried by creatures) ---------------------------

  nearestFood(x: number, y: number, radius: number): FoodSource | null {
    let best: FoodSource | null = null;
    let bestD = radius * radius;
    for (const f of this.foods) {
      if (!f.hasFood) continue;
      const d = (f.x - x) ** 2 + (f.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  /** Centre of the nearest water tile within radius (creatures drink at shore). */
  nearestWaterTile(x: number, y: number, radius: number): { x: number; y: number } | null {
    const w = this.world;
    const ctx = Math.floor(x / TILE);
    const cty = Math.floor(y / TILE);
    const r = Math.ceil(radius / TILE);
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let ty = cty - r; ty <= cty + r; ty++) {
      for (let tx = ctx - r; tx <= ctx + r; tx++) {
        if (!isWater(w.tileAt(tx, ty))) continue;
        const px = (tx + 0.5) * TILE;
        const py = (ty + 0.5) * TILE;
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: px, y: py };
        }
      }
    }
    return best;
  }

  *nearbyCreatures(self: Creature, radius: number): Generator<Creature> {
    const r2 = radius * radius;
    for (const c of this.creatures) {
      if (c === self || !c.alive) continue;
      if ((c.x - self.x) ** 2 + (c.y - self.y) ** 2 <= r2) yield c;
    }
  }

  // ---- Language bridge -----------------------------------------------------

  /**
   * A creature meets a concept: make sure its tribe has a word, log the coining
   * of a brand-new word, and record that this individual now knows it.
   */
  experience(c: Creature, concept: ConceptId): void {
    const { word, coined } = nameConcept(c.tribe, concept);
    if (coined) {
      this.addLog(`${c.tribe.name} coin "${word}" — meaning "${CONCEPTS[concept].gloss}".`, "lang");
    }
    c.vocabulary.add(concept);
  }

  // ---- Life events ---------------------------------------------------------

  private deadThisFrame = false;

  spawnCreature(tribe: Tribe, x: number, y: number): Creature | null {
    if (isWater(this.world.tileAtPixel(x, y))) {
      const land = this.world.randomLand(this.rng);
      if (!land) return null;
      x = land.x;
      y = land.y;
    }
    const maxAge = CC.maxAge * this.rng.range(0.7, 1.3);
    const c = new Creature(x, y, tribe, maxAge);
    this.creatures.push(c);
    return c;
  }

  kill(c: Creature): void {
    if (!c.alive) return;
    c.alive = false;
    this.deadThisFrame = true;
    // Witnesses learn the concept of death.
    for (const w of this.nearbyCreatures(c, CC.senseRadius)) this.experience(w, "death");
    this.addLog(`A ${c.tribe.name} falls still — death.`, "doom");
  }

  // ---- God powers (called from UI) -----------------------------------------

  /** Drop a cluster of food bushes at a world point. */
  blessFood(x: number, y: number): void {
    let placed = 0;
    for (let i = 0; i < 6; i++) {
      const fx = x + this.rng.range(-30, 30);
      const fy = y + this.rng.range(-30, 30);
      if (isLand(this.world.tileAtPixel(fx, fy))) {
        this.foods.push(new FoodSource(fx, fy));
        placed++;
      }
    }
    if (placed) this.addLog(`Manna appears from the sky.`, "divine");
  }

  /** Create a new creature; joins the nearest tribe or founds a new one. */
  divineSpawn(x: number, y: number): void {
    let tribe = this.tribes[0];
    if (!tribe) {
      tribe = createTribe(this.tribes.length, this.rng.int(1, 1 << 30));
      this.tribes.push(tribe);
    }
    const c = this.spawnCreature(tribe, x, y);
    if (c) {
      c.age = CC.adultAge;
      this.addLog(`The sky-being shapes a new ${tribe.name}.`, "divine");
    }
  }

  /** Found a brand-new tribe (its own language) at a point. */
  foundTribe(x: number, y: number, size = 4): void {
    const tribe = createTribe(this.tribes.length, this.rng.int(1, 1 << 30));
    this.tribes.push(tribe);
    for (let i = 0; i < size; i++) {
      const c = this.spawnCreature(tribe, x + this.rng.range(-30, 30), y + this.rng.range(-30, 30));
      if (c) c.age = this.rng.range(0.5, 3);
    }
    this.addLog(`A new people, the ${tribe.name}, are born.`, "divine");
  }

  /** Smite: kill creatures in a blast radius and scorch the land. Chaos. */
  smite(x: number, y: number, radius = 40): void {
    let toll = 0;
    for (const c of this.creatures) {
      if (!c.alive) continue;
      if ((c.x - x) ** 2 + (c.y - y) ** 2 <= radius * radius) {
        // Survivors at the edge learn "fire".
        if (this.rng.chance(0.5)) {
          c.health = 0;
          toll++;
        } else {
          this.experience(c, "fire");
        }
      }
    }
    this.addLog(toll ? `Fire from the sky takes ${toll}.` : `Fire scorches the earth.`, "doom");
  }

  /** Reshape terrain: dir = +1 raise, -1 lower. */
  shapeLand(x: number, y: number, dir: number): void {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    this.world.reshape(tx, ty, 4, dir * 0.12);
  }

  // ---- Utility -------------------------------------------------------------

  addLog(text: string, kind: LogEntry["kind"]): void {
    this.log.push({ day: this.day, text, kind });
    if (this.log.length > 200) this.log.shift();
  }
}
