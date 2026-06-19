# God Sim

A 2D god-simulation. You hover over an island as a divine being — bring chaos or
support — while creatures live, learn, and **invent their own languages**.

This is the v0.1 foundation: a runnable world with the core loop in place,
designed to grow.

## Run it

```bash
npm install
npm run dev      # open the printed localhost URL
```

Other scripts: `npm run build` (typecheck + production build),
`npm run typecheck`, and `npx tsx test/smoke.ts` (headless sanity check).

## What's in the world

- **A two-layer island** generated from a seed. The **surface** has deep water,
  shallows, sand, grass, forest, rock and snow; the **underground** is a cave
  layer of stone, caverns, underground pools and ore. Toggle ☀ Surface / ⛏ Below
  in the top bar to look above or below ground. Resizable — bump
  `DEFAULT_WORLD_W/H` in `src/config.ts` for a bigger play area.
- **Trees** dot the grass and forest, bearing fruit (food) and holding wood.
- **People** (the speaking tribes) with needs (hunger, thirst, energy, health)
  and a utility AI: they top up on food and water, rest, wander, breed, flee
  predators, hunt game when plants are scarce, and — when they feel like it —
  **dig** shafts and tunnels to explore the caves below.
- **A food chain of base creatures:** plants → **grazers** (herbivores that eat
  grass and flee) → **hunter-beasts** (carnivores that stalk and pounce). Herds
  and packs form, breed, and rise and fall the way predator/prey populations do.
- **Tribes**, each with its own colour and its own invented language.

## Emergent language (the headline feature)

The world defines a fixed set of *concepts* (water, food, tree, friend, death,
fire, …). The **first** time any member of a tribe encounters a concept, that
tribe coins a brand-new word for it from its own sound system. Because every
tribe invents independently, the same meaning gets different words across tribes
— so distinct languages emerge.

Words then spread person-to-person: tribe-mates teach each other words the other
doesn't know yet. Open the **Languages** tab to read each tribe's growing
dictionary (word → meaning), and watch creatures speak in little bubbles.

## Divine powers (left panel)

| Power | Effect |
|-------|--------|
| 🔍 Inspect | Click a creature to study its needs, mind and known words |
| 🍒 Bless Food | Grow food bushes where you click |
| ✨ Create | Shape a new creature into the world |
| 👥 New People | Found a whole new tribe with its own language |
| 🦌 Herbivore | Place a grazer (prey) |
| 🐺 Carnivore | Place a hunter-beast (predator) |
| ⛏️ Dig | Carve rock on the layer you're viewing (Surface opens a cave shaft) |
| ⚡ Smite | Call down fire — creatures may die (chaos) |
| ⛰️ Raise / 🌊 Lower | Reshape the land itself |

Drag to pan, scroll to zoom. Use the speed buttons (top) to pause or fast-forward
time, the ☀/⛏ toggle to switch between surface and underground, and the
**Chronicle** tab to read the history of the world.

## Where this can go next

Building structures from wood/stone, cave-dwelling species and ore mining,
weather and seasons, grammar (multi-word sentences from learned words), trade and
conflict between tribes, saving/loading worlds, and larger maps.

## Project layout

See `CLAUDE.md` for the module-by-module architecture.
