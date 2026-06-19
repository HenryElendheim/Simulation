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

- **An island** generated from a seed (radial falloff + fractal noise), with
  deep water, shallows, sand, grass, forest, rock and snow. Resizable — bump
  `DEFAULT_WORLD_W/H` in `src/config.ts` for a bigger play area.
- **Creatures** with needs (hunger, thirst, energy, health) driven by a simple
  utility AI: they seek food and water, rest, wander, pair up and breed, and
  eventually die of starvation, thirst or old age.
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
| ⚡ Smite | Call down fire — creatures may die (chaos) |
| ⛰️ Raise / 🌊 Lower | Reshape the land itself |

Drag to pan, scroll to zoom. Use the speed buttons (top) to pause or fast-forward
time, and the **Chronicle** tab to read the history of the world.

## Where this can go next

Hunting and predators, gathering & building structures, weather and seasons,
grammar (multi-word sentences from learned words), trade and conflict between
tribes, saving/loading worlds, and larger maps.

## Project layout

See `CLAUDE.md` for the module-by-module architecture.
