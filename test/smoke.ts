// Headless sanity check of the core sim (no DOM). Run: npx tsx test/smoke.ts
import { Simulation } from "../src/sim";
import { Layer, Under, World } from "../src/world";

const seed = 12345;
const world = new World(90, 90, seed);
const sim = new Simulation(world, seed);
sim.seedLife(3, 6);

const caveTiles0 = world.under.reduce((n, u) => n + (u === Under.Cave ? 1 : 0), 0);
const entrances0 = world.entrances.size;

const startPop = sim.creatures.length;
let births = 0;
let deaths = 0;
let coins = 0;
const seen = new Set<string>();
for (const e of sim.log) seen.add(e.text);

const STEP = 0.05;
for (let i = 0; i < 30000; i++) {
  sim.update(STEP);
  for (const e of sim.log) {
    if (seen.has(e.text)) continue;
    seen.add(e.text);
    if (e.kind === "lang") coins++;
    if (e.text.includes("born")) births++;
    if (e.kind === "doom") deaths++;
  }
}

const herb = sim.animals.filter((a) => a.species.diet === "herbivore").length;
const carn = sim.animals.filter((a) => a.species.diet === "carnivore").length;
const underground = sim.creatures.filter((c) => c.layer === Layer.Underground).length;
const caveTiles1 = world.under.reduce((n, u) => n + (u === Under.Cave ? 1 : 0), 0);

console.log(`Days elapsed:     ${sim.day}`);
console.log(`Population:       ${startPop} -> ${sim.creatures.length}`);
console.log(`Births logged:    ${births}`);
console.log(`Deaths logged:    ${deaths}`);
console.log(`Words coined:     ${coins}`);
console.log(`Animals:          ${herb} herbivores, ${carn} carnivores`);
console.log(`People below:     ${underground}`);
console.log(`Cave tiles:       ${caveTiles0} -> ${caveTiles1} (dug ${caveTiles1 - caveTiles0})`);
console.log(`Entrances:        ${entrances0} -> ${world.entrances.size}`);
console.log("");
for (const t of sim.tribes) {
  const sample = [...t.lexicon.entries()].slice(0, 6).map(([id, w]) => `${w}=${id}`);
  console.log(`${t.name}: ${t.lexicon.size} words | ${sample.join(", ")}`);
}

if (sim.creatures.length === 0) {
  console.error("\nWARN: everyone died — needs/food balance may be too harsh.");
}
