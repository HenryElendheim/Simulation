import { Creature as C, Needs, SECONDS_PER_DAY, TILE } from "./config";
import { CONCEPTS } from "./language";
import type { ConceptId, Tribe } from "./language";
import type { Simulation } from "./sim";
import { isWater, Tile } from "./world";
import type { FoodSource } from "./resources";

export type Action =
  | "wander"
  | "seekFood"
  | "eat"
  | "seekWater"
  | "drink"
  | "sleep"
  | "socialize";

let NEXT_ID = 1;

export class Creature {
  id = NEXT_ID++;
  alive = true;

  // Position & motion in world pixels.
  vx = 0;
  vy = 0;

  // Needs in [0,1]: hunger/thirst rise (bad), energy/health fall (bad).
  hunger = 0.2;
  thirst = 0.2;
  energy = 1;
  health = 1;

  age = 0; // days
  maxAge: number;
  lastBreed = -999;

  action: Action = "wander";
  /**
   * What the creature is committed to right now. Using a sticky goal (instead of
   * re-deciding from scratch every tick) gives hysteresis: once they start
   * eating/drinking they finish until nearly full, so they don't have to go
   * fetch food/water again moments later.
   */
  private goal: "none" | "food" | "water" = "none";
  targetX = 0;
  targetY = 0;
  targetFood: FoodSource | null = null;

  /** Concepts this individual personally knows the word for. */
  vocabulary = new Set<ConceptId>();
  /** Current speech bubble: the spoken words and their plain meaning. */
  speech = "";
  speechGloss = "";
  private speechUntil = 0;
  private nextSpeak = 0;
  private wanderUntil = 0;

  constructor(public x: number, public y: number, public tribe: Tribe, maxAge: number) {
    this.maxAge = maxAge;
  }

  get isAdult(): boolean {
    return this.age >= C.adultAge;
  }

  update(sim: Simulation, dt: number): void {
    const dtDays = dt / SECONDS_PER_DAY;
    this.age += dtDays;

    // --- Needs ---
    this.hunger = clamp01(this.hunger + Needs.hungerRate * dt);
    this.thirst = clamp01(this.thirst + Needs.thirstRate * dt);
    if (this.action !== "sleep") this.energy = clamp01(this.energy - Needs.energyDrain * dt);

    const starving = this.hunger >= 1 || this.thirst >= 1 || this.energy <= 0;
    if (starving) this.health = clamp01(this.health - Needs.starveDamage * dt);
    else if (this.hunger < 0.5 && this.thirst < 0.5) this.health = clamp01(this.health + Needs.healRate * dt);

    if (this.health <= 0 || this.age >= this.maxAge) {
      sim.kill(this);
      return;
    }

    this.perceive(sim);
    this.decide(sim);
    this.act(sim, dt);
    this.tryBreed(sim);
    this.maybeSpeak(sim);

    if (this.speechUntil < sim.timeDays) {
      this.speech = "";
      this.speechGloss = "";
    }
  }

  /**
   * Notice the world around us and learn the words for what we sense. This is
   * where new concepts get *named*: sim.experience coins a tribe word the first
   * time anyone meets a concept.
   */
  private perceive(sim: Simulation): void {
    sim.experience(this, "ground");

    // Internal states become nameable once felt strongly.
    if (this.hunger > 0.6) sim.experience(this, "hunger");
    if (this.thirst > 0.6) sim.experience(this, "thirst");
    if (this.energy < 0.3) sim.experience(this, "tired");

    const tx = Math.floor(this.x / TILE);
    const ty = Math.floor(this.y / TILE);
    const here = sim.world.tileAt(tx, ty);
    if (here === Tile.Sand) sim.experience(this, "sand");
    if (here === Tile.Forest) sim.experience(this, "tree");
    if (here === Tile.Rock || here === Tile.Snow) sim.experience(this, "rock");

    if (sim.nearestWaterTile(this.x, this.y, C.senseRadius)) sim.experience(this, "water");
    if (sim.nearestFood(this.x, this.y, C.senseRadius)) sim.experience(this, "food");

    for (const other of sim.nearbyCreatures(this, C.senseRadius)) {
      if (other.tribe.id === this.tribe.id) {
        sim.experience(this, "friend");
        // Teach each other: spread one unknown word per encounter.
        this.teach(other, sim);
      } else {
        sim.experience(this, "stranger");
      }
    }
  }

  /** Share a known word the other tribe-mate lacks (language transmission). */
  private teach(other: Creature, sim: Simulation): void {
    if (!sim.rng.chance(0.5)) return;
    for (const concept of this.vocabulary) {
      if (!other.vocabulary.has(concept)) {
        other.vocabulary.add(concept);
        return;
      }
    }
  }

  /** Utility-style action selection with sticky goals (see `goal` field). */
  private decide(sim: Simulation): void {
    // Finish sleeping only once rested.
    if (this.action === "sleep" && this.energy < 0.95) return;

    // Drop a goal once the need is nearly fully topped up.
    if (this.goal === "water" && this.thirst <= C.satedThirst) this.goal = "none";
    if (this.goal === "food" && this.hunger <= C.satedHunger) this.goal = "none";

    // Pick up a new goal only when a need first crosses the "act now" line.
    if (this.goal === "none") {
      if (this.thirst > C.thirstUrge && this.thirst >= this.hunger) this.goal = "water";
      else if (this.hunger > C.hungerUrge) this.goal = "food";
    }

    // Pursue the active goal all the way to satiation.
    if (this.goal === "water") {
      const w = sim.nearestWaterTile(this.x, this.y, 800);
      if (w) {
        this.targetX = w.x;
        this.targetY = w.y;
        this.action = dist(this.x, this.y, w.x, w.y) < TILE * 1.5 ? "drink" : "seekWater";
        return;
      }
      this.goal = "none"; // nowhere to drink — give up for now
    }
    if (this.goal === "food") {
      const f = sim.nearestFood(this.x, this.y, 800);
      if (f) {
        this.targetFood = f;
        this.targetX = f.x;
        this.targetY = f.y;
        this.action = dist(this.x, this.y, f.x, f.y) < TILE ? "eat" : "seekFood";
        return;
      }
      this.goal = "none"; // no food in reach
    }

    if (this.energy < 0.25) {
      this.action = "sleep";
      return;
    }
    if (this.action === "sleep" && this.energy >= 0.95) this.action = "wander";

    if (this.action !== "wander" || sim.timeDays > this.wanderUntil) this.pickWander(sim);
  }

  private pickWander(sim: Simulation): void {
    this.action = "wander";
    const angle = sim.rng.range(0, Math.PI * 2);
    const r = sim.rng.range(TILE * 3, TILE * 10);
    this.targetX = this.x + Math.cos(angle) * r;
    this.targetY = this.y + Math.sin(angle) * r;
    this.wanderUntil = sim.timeDays + sim.rng.range(0.05, 0.2);
  }

  private act(sim: Simulation, dt: number): void {
    switch (this.action) {
      case "sleep":
        this.vx = this.vy = 0;
        this.energy = clamp01(this.energy + Needs.energyRest * dt);
        return;
      case "drink":
        // Keep drinking; decide() ends it once nearly fully hydrated.
        this.vx = this.vy = 0;
        this.thirst = clamp01(this.thirst - 2 * dt);
        return;
      case "eat": {
        this.vx = this.vy = 0;
        const f = this.targetFood;
        if (f && f.hasFood && dist(this.x, this.y, f.x, f.y) < TILE) {
          this.hunger = clamp01(this.hunger - f.bite() * 0.25);
          sim.experience(this, "eat");
        } else {
          // Bush empty or out of reach: drop it so decide() finds another while
          // still hungry, or moves on once nearly full.
          this.targetFood = null;
        }
        return;
      }
      default:
        this.moveToward(sim, this.targetX, this.targetY, dt);
    }
  }

  /** Steer toward a target, never stepping onto water tiles. */
  private moveToward(sim: Simulation, tx: number, ty: number, dt: number): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) {
      this.vx = this.vy = 0;
      return;
    }
    const speed = this.isAdult ? C.speed : C.speed * 0.7;
    const nx = this.x + (dx / d) * speed * dt;
    const ny = this.y + (dy / d) * speed * dt;
    // Block movement into water; nudge along the passable axis instead.
    const okX = !isWater(sim.world.tileAtPixel(nx, this.y));
    const okY = !isWater(sim.world.tileAtPixel(this.x, ny));
    if (okX) this.x = nx;
    if (okY) this.y = ny;
    if (!okX && !okY) this.pickWander(sim); // cornered against the sea
    this.vx = okX ? dx / d : 0;
    this.vy = okY ? dy / d : 0;
  }

  /** Pair with a well-fed tribe-mate to produce a child (population renewal). */
  private tryBreed(sim: Simulation): void {
    if (!this.eligibleToBreed(sim)) return;
    for (const other of sim.nearbyCreatures(this, C.senseRadius)) {
      if (other.tribe.id !== this.tribe.id) continue;
      if (!other.eligibleToBreed(sim)) continue;
      // Lowest id leads so the pair only breeds once.
      if (this.id > other.id) return;
      this.lastBreed = sim.timeDays;
      other.lastBreed = sim.timeDays;
      const child = sim.spawnCreature(this.tribe, this.x + sim.rng.range(-8, 8), this.y + sim.rng.range(-8, 8));
      if (child) {
        child.age = 0;
        sim.experience(this, "birth");
        sim.addLog(`A ${this.tribe.name} child is born.`, "life");
      }
      return;
    }
  }

  eligibleToBreed(sim: Simulation): boolean {
    return (
      this.isAdult &&
      this.hunger < C.breedHungerMax &&
      this.thirst < 0.5 &&
      this.energy > 0.4 &&
      sim.timeDays - this.lastBreed > C.breedCooldown
    );
  }

  /** Occasionally voice a short utterance from known words about the current focus. */
  private maybeSpeak(sim: Simulation): void {
    if (sim.timeDays < this.nextSpeak) return;
    this.nextSpeak = sim.timeDays + sim.rng.range(0.3, 1.2);

    const say = (...concepts: ConceptId[]): void => {
      const known = concepts.filter((c) => this.vocabulary.has(c) && this.tribe.lexicon.has(c));
      if (!known.length) return;
      this.speech = known.map((c) => this.tribe.lexicon.get(c)!).join(" ");
      this.speechGloss = known.map((c) => CONCEPTS[c].gloss).join(" ");
      this.speechUntil = sim.timeDays + 0.12;
    };

    switch (this.action) {
      case "seekFood": say("go", "food"); break;
      case "eat": say("eat", "food", "good"); break;
      case "seekWater": say("go", "water"); break;
      case "drink": say("drink", "water"); break;
      case "sleep": break;
      default:
        if (this.hunger > 0.6) say("hunger", "bad");
        else if (sim.rng.chance(0.3)) say("friend");
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
