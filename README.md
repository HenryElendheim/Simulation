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
  and packs form, breed, and rise and fall like real predator/prey populations.
- **Simple animals** that just wander, eat and drink: **cows** (slow grazers),
  **chickens** (small peckers), and **fish** that swim and feed in the water.
- **Tribes**, each with its own colour and its own invented language.

## Selecting, dragging and editing

Pick the **🔍 Inspect** power and click **any creature — person or animal** to
select it. **Drag** it anywhere with the mouse to reposition it.

Selecting a **person** opens a full live editor: rename it, switch its **tribe**,
move it **surface ↔ cave**, drag sliders for **health / fullness / hydration /
energy / intellect**, set its **age** and **max age**, **teach it every word**
or wipe its vocabulary, or **smite** it. Animals get a simpler editor (health,
fullness, hydration, age, max age, smite).

### Intellect

Every person has an **intellect** (0–100%), editable on the slider. Cleverer
folk **learn and coin words faster** and **teach more readily**. Past a high
threshold they gain two abilities:

- **Building homes** — clever, settled adults raise huts (shown on the map).
- **Teaching other tribes** — when calm and willing, a clever person shares a
  concept with a stranger from another tribe, who then coins it in *their own*
  language. Knowledge crosses tribes while languages stay distinct.

Children inherit roughly the average of their parents' intellect.

### Emotions

Each person feels an **emotion** — happy, content, afraid, hungry, lonely,
miserable, or curious — derived from their needs, safety, company and home. It
shows in the inspector (with an emoji) and nudges behaviour: a frightened
creature won't mate, for instance.

## Language: starting from nothing

Creatures begin knowing **no words at all**. As they live and repeatedly meet
things — ground, water, a friend, a predator, death — a tribe gradually *coins*
its own word for each concept, and words spread person to person. Because every
tribe invents independently, distinct languages emerge over time. Watch the
**Languages** tab fill in slowly as the world ages.

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
| 🔍 Inspect | Click a creature to open its live **editor** (see above) |
| 🍒 Bless Food | Grow food bushes where you click |
| ✨ Create | Shape a new creature into the world |
| 👥 New People | Found a whole new tribe with its own language |
| 🦌 Grazer / 🐺 Predator | Place wild prey or a hunter-beast |
| 🐄 Cow / 🐔 Chicken / 🐟 Fish | Place simple animals (fish go in water) |
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
