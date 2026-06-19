import { Creature as C, Dig, Needs, SECONDS_PER_DAY, TILE } from "./config";
import { CONCEPTS } from "./language";
import type { ConceptId, Tribe } from "./language";
import type { Simulation } from "./sim";
import type { Animal } from "./animal";
import { Layer, Tile, Under } from "./world";
import type { Edible } from "./resources";

export type Action =
  | "wander"
  | "seekFood"
  | "eat"
  | "seekWater"
  | "drink"
  | "sleep"
  | "flee"
  | "hunt"
  | "dig"
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
  /** Which map level the creature is currently on. */
  layer = Layer.Surface;
  targetX = 0;
  targetY = 0;
  targetFood: Edible | null = null;
  /** Prey being hunted (people are omnivores and may hunt herbivores). */
  private prey: Animal | null = null;
  /** Progress (seconds) toward breaking the current rock tile while digging. */
  private digEffort = 0;
  private digTX = 0;
  private digTY = 0;

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

    if (this.layer === Layer.Underground) {
      // The world below feels different and gets its own words.
      sim.experience(this, "cave");
      sim.experience(this, "dark");
      sim.experience(this, "rock");
    } else {
      const here = sim.world.tileAt(tx, ty);
      if (here === Tile.Sand) sim.experience(this, "sand");
      if (here === Tile.Forest) sim.experience(this, "tree");
      if (here === Tile.Rock || here === Tile.Snow) sim.experience(this, "rock");
      if (sim.nearestTree(this.x, this.y, C.senseRadius)) sim.experience(this, "tree");
    }

    if (sim.nearestWaterTile(this.x, this.y, C.senseRadius)) sim.experience(this, "water");
    if (sim.nearestFood(this.x, this.y, C.senseRadius, this.layer)) sim.experience(this, "food");

    // Beasts of the food chain: kin teach each other, predators are danger.
    const threat = sim.nearestThreat(this.x, this.y, C.senseRadius);
    if (threat) {
      sim.experience(this, "beast");
      sim.experience(this, "danger");
      sim.experience(this, "bad");
    }

    for (const other of sim.nearbyCreatures(this, C.senseRadius)) {
      if (other.layer !== this.layer) continue;
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

    // Survival first: run from any predator that's hunting nearby.
    const threat = sim.nearestThreat(this.x, this.y, C.fleeSense);
    if (threat) {
      this.action = "flee";
      this.targetX = this.x + (this.x - threat.x) * 4;
      this.targetY = this.y + (this.y - threat.y) * 4;
      return;
    }

    // Stuck underground while hungry/thirsty? Head for the nearest way up.
    if (this.layer === Layer.Underground && (this.hunger > C.hungerUrge || this.thirst > C.thirstUrge)) {
      const e = sim.nearestEntrance(this.x, this.y);
      if (e) {
        if (dist(this.x, this.y, e.x, e.y) < TILE) {
          this.layer = Layer.Surface;
        } else {
          this.action = "wander";
          this.targetX = e.x;
          this.targetY = e.y;
          return;
        }
      }
    }

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
      const f = sim.nearestFood(this.x, this.y, 800, this.layer);
      // Omnivores prefer gathering plants; they only hunt game as a fallback
      // when no plant food is nearby (keeps herbivore herds from being wiped).
      const foodFar = !f || dist(this.x, this.y, f.x, f.y) > C.senseRadius * 2;
      const game = this.layer === Layer.Surface && foodFar ? sim.nearestHuntable(this.x, this.y, C.senseRadius) : null;
      if (game) {
        this.prey = game;
        this.action = "hunt";
        this.targetX = game.x;
        this.targetY = game.y;
        return;
      }
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

    // Content and idle (well-fed, rested): sometimes explore caves or dig.
    const content = this.hunger < 0.4 && this.thirst < 0.4 && this.energy > 0.5;
    if (content && this.action !== "dig") {
      const tx = Math.floor(this.x / TILE);
      const ty = Math.floor(this.y / TILE);
      if (this.layer === Layer.Surface && sim.world.isEntrance(tx, ty) && sim.rng.chance(Dig.exploreUrge)) {
        this.layer = Layer.Underground; // climb down a known hole to explore
      } else if (sim.rng.chance(Dig.idleUrge)) {
        this.beginDig(sim, tx, ty);
        return;
      }
    }

    if (this.action !== "wander" && this.action !== "dig") this.pickWander(sim);
    if (this.action === "wander" && sim.timeDays > this.wanderUntil) this.pickWander(sim);
  }

  /** Choose a rock tile to break and switch to the dig action. */
  private beginDig(sim: Simulation, tx: number, ty: number): void {
    if (this.layer === Layer.Surface) {
      // Sink a shaft straight down from where we stand.
      this.digTX = tx;
      this.digTY = ty;
    } else {
      // Tunnel into an adjacent solid tile, if any.
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const solid = dirs
        .map(([dx, dy]) => [tx + dx, ty + dy] as const)
        .filter(([x, y]) => {
          const u = sim.world.underAt(x, y);
          return u === Under.Stone || u === Under.Ore;
        });
      if (!solid.length) return;
      const [x, y] = sim.rng.pick(solid);
      this.digTX = x;
      this.digTY = y;
    }
    this.digEffort = 0;
    this.action = "dig";
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
      case "hunt": {
        const p = this.prey;
        if (!p || !p.alive || p.health <= 0) {
          this.prey = null;
          this.action = "wander";
          return;
        }
        const d = dist(this.x, this.y, p.x, p.y);
        if (d < 12) {
          this.vx = this.vy = 0;
          p.health = clamp01(p.health - 1.0 * dt);
          sim.experience(this, "hunt");
          if (p.health <= 0) {
            sim.devour(this, p);
            this.hunger = clamp01(this.hunger - 0.6);
            sim.experience(this, "meat");
            sim.experience(this, "good");
            this.prey = null;
            this.goal = this.hunger <= C.satedHunger ? "none" : "food";
            this.action = "wander";
          }
        } else {
          this.moveToward(sim, p.x, p.y, dt);
        }
        return;
      }
      case "dig": {
        this.vx = this.vy = 0;
        this.digEffort += dt;
        sim.experience(this, "dig");
        sim.experience(this, "rock");
        if (this.digEffort >= Dig.effortPerTile) {
          const wasSurface = this.layer === Layer.Surface;
          const broke = sim.world.dig(this.layer, this.digTX, this.digTY);
          if (broke && wasSurface) {
            this.layer = Layer.Underground; // drop into the new shaft
            sim.experience(this, "cave");
            sim.experience(this, "dark");
          }
          this.digEffort = 0;
          this.action = "wander";
        }
        return;
      }
      default:
        this.moveToward(sim, this.targetX, this.targetY, dt);
    }
  }

  /** Steer toward a target, staying on tiles walkable for the current layer. */
  private moveToward(sim: Simulation, tx: number, ty: number, dt: number): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) {
      this.vx = this.vy = 0;
      return;
    }
    let speed = this.isAdult ? C.speed : C.speed * 0.7;
    if (this.action === "flee") speed *= C.fleeBoost; // sprint from predators
    const nx = this.x + (dx / d) * speed * dt;
    const ny = this.y + (dy / d) * speed * dt;
    // Block movement into impassable tiles (sea on the surface, rock below).
    const okX = sim.world.walkable(this.layer, nx, this.y);
    const okY = sim.world.walkable(this.layer, this.x, ny);
    if (okX) this.x = nx;
    if (okY) this.y = ny;
    if (!okX && !okY) this.pickWander(sim); // cornered: pick a new heading
    this.vx = okX ? dx / d : 0;
    this.vy = okY ? dy / d : 0;
  }

  /** Pair with a well-fed tribe-mate to produce a child (population renewal). */
  private tryBreed(sim: Simulation): void {
    if (!this.eligibleToBreed(sim)) return;
    // Carrying capacity: crowded areas don't breed (food gets stretched thin).
    let kin = 0;
    for (const n of sim.nearbyCreatures(this, C.crowdRadius)) {
      if (n.tribe.id === this.tribe.id && ++kin >= C.crowdCap) return;
    }
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
      case "flee": say("beast", "danger", "bad"); break;
      case "hunt": say("hunt", "meat"); break;
      case "dig": say("dig", "rock"); break;
      case "sleep": break;
      default:
        if (this.layer === Layer.Underground && sim.rng.chance(0.3)) say("cave", "dark");
        else if (this.hunger > 0.6) say("hunger", "bad");
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
