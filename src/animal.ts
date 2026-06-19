import { HERD_DENSITY_CAP, HERD_DENSITY_RADIUS, SECONDS_PER_DAY, TILE, type SpeciesDef } from "./config";
import type { Creature } from "./creature";
import type { Simulation } from "./sim";
import { Layer } from "./world";

type AnimalState = "wander" | "flee" | "seekFood" | "eat" | "drink" | "hunt";

let NEXT_ID = 1;

/**
 * A non-speaking animal in the food chain. Herbivores eat plants and flee
 * carnivores; carnivores hunt herbivores (and the tribe people). They have
 * simple needs and breed when well fed — so populations rise and fall.
 */
export class Animal {
  id = NEXT_ID++;
  alive = true;
  layer = Layer.Surface; // animals roam the surface for now
  vx = 0;
  vy = 0;

  hunger = 0.3;
  thirst = 0.3;
  health = 1;
  age = 0;
  maxAge: number;
  lastBreed = -999;

  state: AnimalState = "wander";
  private targetX = 0;
  private targetY = 0;
  private prey: Animal | Creature | null = null;
  private wanderUntil = 0;

  constructor(public x: number, public y: number, public species: SpeciesDef, maxAge: number) {
    this.maxAge = maxAge;
  }

  get isAdult(): boolean {
    return this.age >= this.maxAge * 0.25;
  }

  update(sim: Simulation, dt: number): void {
    const dtDays = dt / SECONDS_PER_DAY;
    this.age += dtDays;
    // Carnivores have a slower metabolism, so they can ride out lean stretches
    // between kills while waiting for catchable (young) prey.
    const hungerRate = this.species.diet === "carnivore" ? 0.006 : 0.012;
    this.hunger = clamp01(this.hunger + hungerRate * dt);
    // Land herbivores get thirsty and must drink. Carnivores get moisture from
    // prey, and fish live in the water — so neither tracks thirst.
    if (this.species.habitat === "land" && this.species.diet === "herbivore") {
      this.thirst = clamp01(this.thirst + 0.01 * dt);
    }

    if (this.hunger >= 1 || this.thirst >= 1) this.health = clamp01(this.health - 0.05 * dt);
    else if (this.hunger < 0.5 && this.thirst < 0.5) this.health = clamp01(this.health + 0.01 * dt);

    if (this.health <= 0 || this.age >= this.maxAge) {
      sim.killAnimal(this, "nature");
      return;
    }

    if (this.species.habitat === "water") this.fish(sim, dt);
    else if (this.species.diet === "herbivore") this.herbivore(sim, dt);
    else this.carnivore(sim, dt);

    this.tryBreed(sim);
  }

  // -- Herbivore: flee predators, graze plants ------------------------------

  private herbivore(sim: Simulation, dt: number): void {
    // Only bolt when a predator gets close, so there's time to graze in between.
    const threat = sim.nearestThreat(this.x, this.y, this.species.sense * 0.5);
    if (threat) {
      this.state = "flee";
      // Run directly away from the predator.
      this.targetX = this.x + (this.x - threat.x) * 3;
      this.targetY = this.y + (this.y - threat.y) * 3;
      // Healthy adults can outpace a chasing predator; the young get caught.
      this.moveToward(sim, this.targetX, this.targetY, dt, 1.25);
      return;
    }
    // Thirsty? Find the water's edge and drink.
    if (this.thirst > 0.5 && this.thirst >= this.hunger) {
      const w = sim.nearestWaterTile(this.x, this.y, 500);
      if (w) {
        if (dist(this.x, this.y, w.x, w.y) < TILE * 1.5) {
          this.state = "drink";
          this.vx = this.vy = 0;
          this.thirst = clamp01(this.thirst - 0.5 * dt);
        } else {
          this.state = "seekFood";
          this.moveToward(sim, w.x, w.y, dt);
        }
        return;
      }
    }
    if (this.hunger > 0.45) {
      // Graze the vegetation underfoot; otherwise head to the nearest pasture.
      // (Grazing grass, not berry bushes, keeps them from starving the people.)
      if (sim.world.isGrazableAtPixel(this.x, this.y)) {
        this.state = "eat";
        this.vx = this.vy = 0;
        this.hunger = clamp01(this.hunger - 0.25 * dt);
        return;
      }
      const g = sim.nearestGrassTile(this.x, this.y, 600);
      if (g) {
        this.state = "seekFood";
        this.moveToward(sim, g.x, g.y, dt);
        return;
      }
    }
    this.wander(sim, dt);
  }

  // -- Fish: drift through the water and nibble ------------------------------

  private fish(sim: Simulation, dt: number): void {
    if (this.hunger > 0.45) {
      // Plankton is everywhere in the water, so they just feed where they swim.
      this.state = "eat";
      this.vx = this.vy = 0;
      this.hunger = clamp01(this.hunger - 0.2 * dt);
      return;
    }
    this.wander(sim, dt);
  }

  // -- Carnivore: hunt prey -------------------------------------------------

  private carnivore(sim: Simulation, dt: number): void {
    if (this.hunger > 0.35) {
      if (!this.prey || !preyAlive(this.prey) || dist(this.x, this.y, this.prey.x, this.prey.y) > this.species.sense * 1.5) {
        this.prey = sim.nearestPrey(this.x, this.y, this.species.sense);
      }
      const p = this.prey;
      if (p) {
        this.state = "hunt";
        const d = dist(this.x, this.y, p.x, p.y);
        if (d < 15) {
          // Pounce: a decisive bite so fleeing prey can actually be brought down.
          p.health = clamp01(p.health - 4 * dt);
          if (p.health <= 0) {
            sim.devour(this, p);
            this.hunger = clamp01(this.hunger - this.species.meat);
            this.prey = null;
            this.state = "wander";
          }
        } else {
          this.moveToward(sim, p.x, p.y, dt, 1.1);
        }
        return;
      }
    }
    this.wander(sim, dt);
  }

  private wander(sim: Simulation, dt: number): void {
    this.state = "wander";
    // Social drift: when fed and ready to breed, move toward the nearest kin so
    // sparse packs (especially predators) can actually find each other to mate.
    if (this.isAdult && sim.timeDays - this.lastBreed > this.species.breedCooldown) {
      const mate = sim.nearestSameSpecies(this, this.species.sense * 3);
      if (mate && dist(this.x, this.y, mate.x, mate.y) > 18) {
        this.moveToward(sim, mate.x, mate.y, dt, 0.8);
        return;
      }
    }
    if (sim.timeDays > this.wanderUntil) {
      const a = sim.rng.range(0, Math.PI * 2);
      const r = sim.rng.range(20, 110);
      this.targetX = this.x + Math.cos(a) * r;
      this.targetY = this.y + Math.sin(a) * r;
      this.wanderUntil = sim.timeDays + sim.rng.range(0.05, 0.25);
    }
    this.moveToward(sim, this.targetX, this.targetY, dt, 0.6);
  }

  private tryBreed(sim: Simulation): void {
    if (!this.isAdult || this.hunger > 0.5 || sim.timeDays - this.lastBreed < this.species.breedCooldown) return;
    // Soft carrying capacity: don't breed where the herd is already crowded.
    let kin = 0;
    for (const n of sim.nearbyAnimals(this, HERD_DENSITY_RADIUS)) {
      if (n.species.id === this.species.id && ++kin >= HERD_DENSITY_CAP) return;
    }
    for (const other of sim.nearbyAnimals(this, this.species.sense * 0.6)) {
      if (other.species.id !== this.species.id || !other.isAdult) continue;
      if (other.hunger > 0.5 || sim.timeDays - other.lastBreed < other.species.breedCooldown) continue;
      if (this.id > other.id) return; // lowest id leads, breed once
      this.lastBreed = other.lastBreed = sim.timeDays;
      sim.spawnAnimal(this.species, this.x + sim.rng.range(-8, 8), this.y + sim.rng.range(-8, 8), 0);
      return;
    }
  }

  private moveToward(sim: Simulation, tx: number, ty: number, dt: number, speedScale = 1): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) {
      this.vx = this.vy = 0;
      return;
    }
    const speed = this.species.speed * (this.isAdult ? 1 : 0.7) * speedScale;
    const nx = this.x + (dx / d) * speed * dt;
    const ny = this.y + (dy / d) * speed * dt;
    // Fish stay in the water; land animals stay on land.
    const passable = (px: number, py: number): boolean =>
      this.species.habitat === "water"
        ? sim.world.isWaterAtPixel(px, py)
        : sim.world.walkable(Layer.Surface, px, py);
    const okX = passable(nx, this.y);
    const okY = passable(this.x, ny);
    if (okX) this.x = nx;
    if (okY) this.y = ny;
    if (!okX && !okY) this.wanderUntil = 0; // cornered: repick next tick
    this.vx = okX ? dx / d : 0;
    this.vy = okY ? dy / d : 0;
  }
}

function preyAlive(p: Animal | Creature): boolean {
  return p.alive && p.health > 0;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
