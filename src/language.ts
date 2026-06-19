import { RNG } from "./rng";

/**
 * Emergent language.
 *
 * The world exposes a fixed set of *concepts* (semantic primitives like WATER,
 * EAT, DANGER). Each tribe invents its OWN spoken form for a concept the first
 * time one of its members experiences it. Because every tribe has a distinct
 * phoneme inventory and coins independently, the same concept ends up with
 * different words across tribes — i.e. different languages.
 *
 * Words then spread person-to-person: when two tribe-mates meet, they can teach
 * each other words the other doesn't yet know (see creature.ts). The player can
 * read each tribe's growing dictionary (word -> meaning) in the UI.
 */

export type ConceptId =
  | "water" | "food" | "tree" | "rock" | "ground" | "sand"
  | "person" | "friend" | "stranger"
  | "hunger" | "thirst" | "tired"
  | "eat" | "drink" | "sleep" | "go" | "good" | "bad"
  | "fire" | "death" | "birth" | "rain" | "god"
  | "cave" | "dark" | "dig" | "danger" | "beast" | "hunt" | "meat";

export interface ConceptDef {
  id: ConceptId;
  /** Plain-English gloss shown to the player. */
  gloss: string;
  category: "thing" | "being" | "state" | "action" | "event";
}

export const CONCEPTS: Record<ConceptId, ConceptDef> = {
  water: { id: "water", gloss: "water", category: "thing" },
  food: { id: "food", gloss: "food", category: "thing" },
  tree: { id: "tree", gloss: "tree", category: "thing" },
  rock: { id: "rock", gloss: "rock", category: "thing" },
  ground: { id: "ground", gloss: "ground", category: "thing" },
  sand: { id: "sand", gloss: "sand", category: "thing" },
  person: { id: "person", gloss: "person", category: "being" },
  friend: { id: "friend", gloss: "kin / friend", category: "being" },
  stranger: { id: "stranger", gloss: "stranger", category: "being" },
  hunger: { id: "hunger", gloss: "hunger", category: "state" },
  thirst: { id: "thirst", gloss: "thirst", category: "state" },
  tired: { id: "tired", gloss: "tiredness", category: "state" },
  eat: { id: "eat", gloss: "to eat", category: "action" },
  drink: { id: "drink", gloss: "to drink", category: "action" },
  sleep: { id: "sleep", gloss: "to sleep", category: "action" },
  go: { id: "go", gloss: "to go", category: "action" },
  good: { id: "good", gloss: "good", category: "state" },
  bad: { id: "bad", gloss: "bad", category: "state" },
  fire: { id: "fire", gloss: "fire", category: "event" },
  death: { id: "death", gloss: "death", category: "event" },
  birth: { id: "birth", gloss: "birth", category: "event" },
  rain: { id: "rain", gloss: "rain", category: "event" },
  god: { id: "god", gloss: "the sky-being (you)", category: "event" },
  cave: { id: "cave", gloss: "cave", category: "thing" },
  dark: { id: "dark", gloss: "darkness", category: "state" },
  dig: { id: "dig", gloss: "to dig", category: "action" },
  danger: { id: "danger", gloss: "danger", category: "state" },
  beast: { id: "beast", gloss: "beast", category: "being" },
  hunt: { id: "hunt", gloss: "to hunt", category: "action" },
  meat: { id: "meat", gloss: "meat", category: "thing" },
};

export const ALL_CONCEPTS = Object.keys(CONCEPTS) as ConceptId[];

/** Per-tribe sound system, so each language has a recognisable flavour. */
interface Phonology {
  onsets: string[];
  vowels: string[];
  codas: string[];
  /** Syllable count weights, e.g. [1,2] favours 1-2 syllable words. */
  minSyll: number;
  maxSyll: number;
}

const CONSONANTS = "ptkbdgmnsfhlrwjzvʃθ".split("");
const VOWELS = "aeiou".split("");
const CODA_POOL = ["", "", "", "n", "m", "k", "s", "t", "l", "r", "ng"];

function makePhonology(rng: RNG): Phonology {
  const sub = <T,>(pool: readonly T[], min: number, max: number): T[] => {
    const n = rng.int(min, Math.min(max, pool.length));
    const copy = [...pool];
    const out: T[] = [];
    for (let i = 0; i < n && copy.length; i++) {
      out.push(copy.splice(rng.int(0, copy.length - 1), 1)[0]);
    }
    return out;
  };
  return {
    onsets: sub(CONSONANTS, 6, 10),
    vowels: sub(VOWELS, 3, 5),
    codas: sub(CODA_POOL, 3, 6),
    minSyll: 1,
    maxSyll: rng.chance(0.5) ? 2 : 3,
  };
}

function coinFromPhonology(ph: Phonology, rng: RNG): string {
  const syll = rng.int(ph.minSyll, ph.maxSyll);
  let w = "";
  for (let s = 0; s < syll; s++) {
    w += rng.pick(ph.onsets) + rng.pick(ph.vowels);
    if (rng.chance(0.4)) w += rng.pick(ph.codas);
  }
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export interface Tribe {
  id: number;
  name: string;
  color: string;
  rng: RNG;
  phonology: Phonology;
  /** The tribe's shared dictionary: concept -> coined word. */
  lexicon: Map<ConceptId, string>;
}

const TRIBE_COLORS = ["#e0a86f", "#6fa8e0", "#a86fe0", "#e06f9c", "#9ce06f", "#6fe0c9"];

export function createTribe(id: number, seed: number): Tribe {
  const rng = new RNG(seed);
  const ph = makePhonology(rng);
  const tribe: Tribe = {
    id,
    name: "",
    color: TRIBE_COLORS[id % TRIBE_COLORS.length],
    rng,
    phonology: ph,
    lexicon: new Map(),
  };
  // The tribe's name is itself a coined word meaning "people".
  tribe.name = coinFromPhonology(ph, rng) + coinFromPhonology(ph, rng).toLowerCase();
  return tribe;
}

/**
 * Ensure the tribe has a word for `concept`. Returns the word and whether it
 * was just invented (so callers can log the coining event).
 */
export function nameConcept(tribe: Tribe, concept: ConceptId): { word: string; coined: boolean } {
  const existing = tribe.lexicon.get(concept);
  if (existing) return { word: existing, coined: false };
  let word = coinFromPhonology(tribe.phonology, tribe.rng);
  let guard = 0;
  const taken = new Set(tribe.lexicon.values());
  while (taken.has(word) && guard++ < 20) {
    word = coinFromPhonology(tribe.phonology, tribe.rng);
  }
  tribe.lexicon.set(concept, word);
  return { word, coined: true };
}
