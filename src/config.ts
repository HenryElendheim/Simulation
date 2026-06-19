/** Tunable constants. Tweak these to change the feel of the world. */
export const TILE = 16; // pixels per tile at zoom 1

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
  adultAge: 0.5, // days
  maxAge: 28, // days (with variance)
  breedCooldown: 6, // days
  breedHungerMax: 0.45, // must be reasonably fed to breed
} as const;

export const Food = {
  maxPerBush: 5,
  regrowPerDay: 1.2,
  biteSize: 1,
  startingBushes: 70,
} as const;
