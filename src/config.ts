/** Tunable constants. Tweak these to change the feel of the world. */
export const TILE = 16; // pixels per tile at zoom 1

/** Emergent-language pacing. They start knowing nothing and name things slowly. */
export const Language = {
  /** Per-encounter chance an unmet concept gets a brand-new word coined. */
  nameChance: 0.0035,
  /** Per-encounter chance a creature picks up a word its tribe already has. */
  learnChance: 0.04,
} as const;

/** Intellect-driven abilities (learning speed, teaching, building). */
export const Mind = {
  /** Language chances are multiplied by this range as intellect goes 0 -> 1. */
  minLangMul: 0.35,
  maxLangMul: 3.0,
  /** Minimum intellect to build homes / teach other tribes. */
  buildIntellect: 0.78,
  teachOtherTribeIntellect: 0.7,
  /** Per-idle-decision chance a qualifying builder starts a home. */
  buildUrge: 0.01,
  buildEffort: 4, // seconds of work to raise a home
  buildCooldown: 10, // days before building another
} as const;

/** Default island dimensions in tiles. Bump these for a bigger play area. */
export const DEFAULT_WORLD_W = 160;
export const DEFAULT_WORLD_H = 160;

/** One simulated "day" in seconds of real time at speed 1. */
export const SECONDS_PER_DAY = 24;

export const Needs = {
  /** How fast hunger/thirst rise and energy drains per simulated second. */
  hungerRate: 0.012,
  thirstRate: 0.018,
  energyDrain: 0.008,
  energyRest: 0.06, // recovery per second while sleeping
  starveDamage: 0.04, // health lost per second when a need is maxed
  healRate: 0.01,
} as const;

export const Creature = {
  speed: 26, // world px / sec
  radius: 5,
  senseRadius: 70, // how far they perceive food/water/others
  fleeSense: 120, // spot predators from further so they can run in time
  fleeBoost: 1.5, // people sprint when fleeing a predator
  // Need management with hysteresis: act once a need passes the "urge" line,
  // then keep going until it's topped up below the "sated" line. This makes
  // them eat/drink to near-full so they don't have to fetch again soon.
  hungerUrge: 0.5,
  thirstUrge: 0.5,
  satedHunger: 0.08,
  satedThirst: 0.08,
  adultAge: 0.5, // days
  maxAge: 28, // days (with variance)
  breedCooldown: 8, // days
  breedHungerMax: 0.45, // must be reasonably fed to breed
  crowdCap: 4, // won't breed if this many tribe-mates are within crowdRadius
  crowdRadius: 130,
} as const;

export const Food = {
  maxPerBush: 5,
  regrowPerDay: 2.0,
  biteSize: 1,
  startingBushes: 110,
} as const;

export const Trees = {
  maxFruit: 8,
  fruitRegrowPerDay: 1.2,
  startingTrees: 110, // scattered on grass/forest
} as const;

/** Underground cave-layer generation. */
export const Cave = {
  /** Fraction of underground that ends up as open cave (roughly). */
  openness: 0.32,
  naturalEntrances: 10,
} as const;

/** How creatures dig through rock. */
export const Dig = {
  /** Seconds of effort to break one rock tile. */
  effortPerTile: 3,
  /** Chance per idle decision that a content creature decides to dig (rare). */
  idleUrge: 0.0002,
  /** Chance an idle creature standing on a known hole climbs down to explore. */
  exploreUrge: 0.01,
} as const;

/** Base animals forming the food chain (plants -> herbivores -> carnivores). */
export interface SpeciesDef {
  id: string;
  name: string;
  color: string;
  diet: "herbivore" | "carnivore";
  /** Where it lives/moves: dry land, or in the water (fish). */
  habitat: "land" | "water";
  speed: number;
  sense: number;
  maxAge: number; // days
  /** Nutrition a carnivore gains from eating one of these. */
  meat: number;
  breedCooldown: number; // days
  startCount: number;
}

export const SPECIES: Record<string, SpeciesDef> = {
  // Wild herbivore that flees and is the staple of the food chain.
  grazer: {
    id: "grazer", name: "grazer", color: "#d8c48a", diet: "herbivore", habitat: "land",
    speed: 32, sense: 95, maxAge: 16, meat: 0.8, breedCooldown: 2.5, startCount: 36,
  },
  // Apex predator.
  hunter: {
    id: "hunter", name: "hunter-beast", color: "#a8584a", diet: "carnivore", habitat: "land",
    speed: 33, sense: 115, maxAge: 26, meat: 1.0, breedCooldown: 6, startCount: 8,
  },
  // Simple animals: they just wander, graze and drink (and get hunted).
  cow: {
    id: "cow", name: "cow", color: "#cdb59a", diet: "herbivore", habitat: "land",
    speed: 15, sense: 70, maxAge: 24, meat: 1.4, breedCooldown: 4, startCount: 18,
  },
  chicken: {
    id: "chicken", name: "chicken", color: "#e6dcc6", diet: "herbivore", habitat: "land",
    speed: 22, sense: 55, maxAge: 10, meat: 0.4, breedCooldown: 2.5, startCount: 20,
  },
  // Fish live in the water, swimming and nibbling.
  fish: {
    id: "fish", name: "fish", color: "#79aec7", diet: "herbivore", habitat: "water",
    speed: 26, sense: 60, maxAge: 10, meat: 0.5, breedCooldown: 2.5, startCount: 36,
  },
} as const;

/** Soft carrying capacity for herds: an animal won't breed when this many of
 * its own kind are already within HERD_DENSITY_RADIUS px. Caps grass-grazers. */
export const HERD_DENSITY_CAP = 5;
export const HERD_DENSITY_RADIUS = 150;
