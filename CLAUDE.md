# Project: God Sim

A 2D god-simulation game. You observe an island, wield divine powers (chaos or
support), and watch creatures live, learn, and invent their own languages.

## Owner's standing rules (do not violate)

- **Attribution:** Never add yourself (the AI) as a contributor, co-author, or
  anywhere in the repo. No `Co-Authored-By` trailers, no `Claude-Session`
  trailers, no AI mentions in commit messages, PR text, code comments, or docs.
- **Commit identity:** Commit and push only as the owner
  (`Henry Elendheim <henskielendheim@gmail.com>`). Never commit as "Claude" or
  any AI identity.
- **Branches:** Never create a branch named after the AI or with AI-style
  naming. Use plain, descriptive branch names.
- **Pushing:** Never `git push` or open a PR without the owner's explicit
  consent. Commit locally as work progresses; wait for the go-ahead to push.
- **Default branch:** Push all changes to `main`. (`god-sim` is left as-is.)

## Tech stack

- TypeScript + Vite, rendered to an HTML5 `<canvas>` (no game-engine deps).
- `npm run dev` — local dev server. `npm run build` — typecheck + production
  build. `npm run typecheck` — types only.

## Architecture (`src/`)

- `config.ts` — tunable constants (world size, needs rates, breeding, food).
- `rng.ts` — seedable PRNG (mulberry32) + value/fractal noise for terrain.
- `world.ts` — `World`: tile grid, island generation (radial falloff + noise),
  terrain reshaping. Resizable for a bigger play area.
- `camera.ts` — pan/zoom and world<->screen mapping.
- `language.ts` — concepts, per-tribe phonology, word coining. **The core
  feature:** each tribe invents its own word for a concept on first contact, so
  tribes develop distinct languages.
- `resources.ts` — `FoodSource` (berry bushes that regrow).
- `creature.ts` — `Creature`: needs, utility-based AI, perception that drives
  language learning, word teaching, breeding, speech bubbles.
- `sim.ts` — `Simulation`: owns world/tribes/creatures/food/clock/log, exposes
  perception helpers and god-power methods.
- `render.ts` — canvas renderer (terrain culling, entities, bubbles).
- `ui.ts` — god toolbar, inspector, dictionary, chronicle panels.
- `main.ts` — entry: canvas setup, input, fixed-timestep loop.

## Design notes

- The sim is deterministic given a seed; keep new randomness routed through
  `RNG` so worlds stay reproducible.
- Language is intentionally extensible: add a `ConceptId` to `language.ts` and
  call `sim.experience(creature, concept)` where it's encountered.
