import { Animal } from "./animal";
import { Creature as CC, Food, Language, SECONDS_PER_DAY, SPECIES, Trees, TILE, type SpeciesDef } from "./config";
import { Creature } from "./creature";
import {
  CONCEPTS,
  createTribe,
  nameConcept,
  type ConceptId,
  type Tribe,
} from "./language";
import { FoodSource, Tree, type Edible } from "./resources";
import { RNG } from "./rng";
import { isGrazable, isLand, isWater, Layer, World } from "./world";

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
  trees: Tree[] = [];
  animals: Animal[] = [];
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
    this.trees = [];
    this.animals = [];

    for (let i = 0; i < Food.startingBushes; i++) {
      const spot = this.randomBushSpot();
      if (spot) this.foods.push(new FoodSource(spot.x, spot.y));
    }
    for (let i = 0; i < Trees.startingTrees; i++) {
      const spot = this.randomBushSpot();
      if (spot) this.trees.push(new Tree(spot.x, spot.y, this.rng.range(0.5, 1)));
    }

    // Seed the food chain and the simple animals (cows, chickens, fish, ...).
    for (const sp of Object.values(SPECIES)) {
      for (let i = 0; i < sp.startCount; i++) {
        const spot = sp.habitat === "water" ? this.world.randomWater(this.rng) : this.world.randomLand(this.rng);
        if (spot) this.spawnAnimal(sp, spot.x, spot.y, this.rng.range(0, sp.maxAge * 0.6));
      }
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
    for (const t of this.trees) t.grow(dtDays);

    // Iterate over snapshots so births/deaths during the tick are safe.
    const cs = this.creatures;
    for (let i = 0; i < cs.length; i++) if (cs[i].alive) cs[i].update(this, dt);

    const as = this.animals;
    for (let i = 0; i < as.length; i++) if (as[i].alive) as[i].update(this, dt);

    if (this.deadThisFrame) {
      this.creatures = this.creatures.filter((c) => c.alive);
      this.animals = this.animals.filter((a) => a.alive);
      this.deadThisFrame = false;
    }
  }

  // ---- Perception helpers (queried by creatures) ---------------------------

  /** Nearest edible (bush or tree fruit). Food only exists on the surface. */
  nearestFood(x: number, y: number, radius: number, layer: Layer = Layer.Surface): Edible | null {
    if (layer !== Layer.Surface) return null;
    return this.nearestEdible(x, y, radius);
  }

  /** Nearest bush or fruiting tree with food available. */
  nearestEdible(x: number, y: number, radius: number): Edible | null {
    let best: Edible | null = null;
    let bestD = radius * radius;
    const scan = (list: Edible[]) => {
      for (const e of list) {
        if (!e.hasFood) continue;
        const d = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
    };
    scan(this.foods);
    scan(this.trees);
    return best;
  }

  /** Centre of the nearest grazable (grass/forest) tile — herbivore pasture. */
  nearestGrassTile(x: number, y: number, radius: number): { x: number; y: number } | null {
    const w = this.world;
    const ctx = Math.floor(x / TILE);
    const cty = Math.floor(y / TILE);
    const r = Math.ceil(radius / TILE);
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let ty = cty - r; ty <= cty + r; ty++) {
      for (let tx = ctx - r; tx <= ctx + r; tx++) {
        if (!isGrazable(w.tileAt(tx, ty))) continue;
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

  nearestTree(x: number, y: number, radius: number): Tree | null {
    let best: Tree | null = null;
    let bestD = radius * radius;
    for (const t of this.trees) {
      const d = (t.x - x) ** 2 + (t.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  /** Nearest living carnivore (a danger to herbivores and people). */
  nearestThreat(x: number, y: number, radius: number): Animal | null {
    return this.nearestAnimal(x, y, radius, (a) => a.species.diet === "carnivore");
  }

  /** Nearest living land herbivore (game a land predator can actually reach). */
  nearestHuntable(x: number, y: number, radius: number): Animal | null {
    return this.nearestAnimal(x, y, radius, (a) => a.species.diet === "herbivore" && a.species.habitat === "land");
  }

  /**
   * For carnivores: hunt herbivore game. The tribe people are the smart apex —
   * predators leave them be, so people are limited by food and breeding, not by
   * being eaten (which keeps a predator boom from wiping out the tribes).
   */
  nearestPrey(x: number, y: number, radius: number): Animal | Creature | null {
    return this.nearestHuntable(x, y, radius);
  }

  private nearestAnimal(x: number, y: number, radius: number, pred: (a: Animal) => boolean): Animal | null {
    let best: Animal | null = null;
    let bestD = radius * radius;
    for (const a of this.animals) {
      if (!a.alive || !pred(a)) continue;
      const d = (a.x - x) ** 2 + (a.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  /** Nearest adult of the same species (for finding a mate / forming packs). */
  nearestSameSpecies(self: Animal, radius: number): Animal | null {
    return this.nearestAnimal(self.x, self.y, radius, (a) => a.id !== self.id && a.isAdult && a.species.id === self.species.id);
  }

  *nearbyAnimals(self: Animal, radius: number): Generator<Animal> {
    const r2 = radius * radius;
    for (const a of this.animals) {
      if (a === self || !a.alive) continue;
      if ((a.x - self.x) ** 2 + (a.y - self.y) ** 2 <= r2) yield a;
    }
  }

  /** Pixel centre of the nearest cave entrance, or null if none exist. */
  nearestEntrance(x: number, y: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const i of this.world.entrances) {
      const tx = i % this.world.width;
      const ty = Math.floor(i / this.world.width);
      const px = (tx + 0.5) * TILE;
      const py = (ty + 0.5) * TILE;
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x: px, y: py };
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
    if (!c.tribe.lexicon.has(concept)) {
      // Brand-new idea: only sometimes does it click into a coined word, so
      // languages build up gradually from nothing as life goes on.
      if (!this.rng.chance(Language.nameChance)) return;
      const { word } = nameConcept(c.tribe, concept);
      this.addLog(`${c.tribe.name} coin "${word}" — meaning "${CONCEPTS[concept].gloss}".`, "lang");
      c.vocabulary.add(concept);
      return;
    }
    // The tribe has the word; this individual learns it gradually.
    if (!c.vocabulary.has(concept) && this.rng.chance(Language.learnChance)) {
      c.vocabulary.add(concept);
    }
  }

  /** Editor helper: give a creature (and its tribe) words for every concept. */
  teachAllWords(c: Creature): void {
    for (const concept of Object.keys(CONCEPTS) as ConceptId[]) {
      nameConcept(c.tribe, concept);
      c.vocabulary.add(concept);
    }
  }

  /** Editor helper: wipe an individual's known words (its tribe keeps theirs). */
  forgetAllWords(c: Creature): void {
    c.vocabulary.clear();
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

  spawnAnimal(species: SpeciesDef, x: number, y: number, age: number): Animal | null {
    const inWater = isWater(this.world.tileAtPixel(x, y));
    if (species.habitat === "water" && !inWater) {
      const spot = this.world.randomWater(this.rng);
      if (!spot) return null;
      x = spot.x;
      y = spot.y;
    } else if (species.habitat === "land" && inWater) {
      const land = this.world.randomLand(this.rng);
      if (!land) return null;
      x = land.x;
      y = land.y;
    }
    const maxAge = species.maxAge * this.rng.range(0.7, 1.3);
    const a = new Animal(x, y, species, maxAge);
    a.age = age;
    this.animals.push(a);
    return a;
  }

  killAnimal(a: Animal, _cause: "nature" | "eaten"): void {
    if (!a.alive) return;
    a.alive = false;
    this.deadThisFrame = true; // animal deaths are frequent, so we don't log them
  }

  /** A predator consumes prey: the prey dies; a slain person is a grim event. */
  devour(predator: Animal | Creature, prey: Animal | Creature): void {
    if (prey instanceof Animal) {
      this.killAnimal(prey, "eaten");
      return;
    }
    if (!prey.alive) return;
    const who = predator instanceof Animal ? `a ${predator.species.name}` : `the ${predator.tribe.name}`;
    prey.alive = false;
    this.deadThisFrame = true;
    for (const w of this.nearbyCreatures(prey, CC.senseRadius)) {
      this.experience(w, "death");
      this.experience(w, "danger");
    }
    this.addLog(`A ${prey.tribe.name} is slain by ${who}.`, "doom");
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

  /** Conjure a beast of the given species at a point. */
  divineBeast(x: number, y: number, speciesId: string): void {
    const sp = SPECIES[speciesId];
    if (!sp) return;
    const a = this.spawnAnimal(sp, x, y, sp.maxAge * 0.25);
    if (a) this.addLog(`The sky-being conjures a ${sp.name}.`, "divine");
  }

  /** Dig (or fill) at a point on the given layer — the divine "dig" power. */
  divineDig(x: number, y: number, layer: Layer): void {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    this.world.dig(layer, tx, ty);
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
