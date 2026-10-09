I can't create the file from here, because this side channel has no tools. Ask in the main conversation and it will be added to `~/Code/ftl-arena`. In the meantime, here's a README that matches the project as it stands, ready to drop in as `README.md`:

````markdown
# FTL Arena

Real-time 1v1 multiplayer combat in the style of *FTL: Faster Than Light*, rebuilt in TypeScript with a
Pixi.js client and an authoritative Node server. Each player spends a scrap budget in the hangar
(systems, reactor, weapons, crew, missiles) and then fights the other player. There is no pause. The host
picks the win condition: **destroy the ship** or **kill the crew**.

This is a clean reimplementation. It contains no FTL files. Ship layouts, blueprints, art and sound are
read from **your own** FTL install at setup time. Without one, the game runs on a small placeholder set.

## Requirements
- Node.js 20+ (developed on Node 24) and npm
- Optional: FTL: Faster Than Light 1.6+ (the version with `ftl.dat`) for the real ships, art and sound

## Setup
```bash
npm install
# Unpack your own ftl.dat into ./assets-local (gitignored, never committed):
npm run extract -- --ftl "/path/to/FTL Faster Than Light"
#   add --music to include the soundtrack (~200 MB)
```

## Run (development)
```bash
npm run dev          # server on :8787 + Vite client on :5173
# or separately:
npm run server       # authoritative game server (HTTP + WebSocket at /ws)
npm run client       # Vite dev server, proxies /ws and /assets to the game server
```
Open http://localhost:5173. Then:
- **Create match**, share the 4-letter code, and the other player clicks **Join**; or
- **Practice vs bot** to play solo.

To join a server on another machine: `http://localhost:5173/?server=HOST:8787`.

## Build and run (production)
```bash
npx vite build apps/client      # outputs apps/client/dist
npm run server -- --port 8787   # serves the built client, /assets and /ws
```
Each player's art comes from the `/assets` folder of the server they load the client from. Gameplay data
comes from the host's server.

## Controls
- **Weapons:** press 1-4 or click a weapon, then click an enemy room (beams: click a start point, then a
  direction). Right-click a weapon to power it off; A toggles autofire.
- **Crew:** click or drag to select, then right-click a room to move them. Tab selects all crew.
- **Systems:** click the power bars for +1, right-click for −1.
- **Doors:** click a door to toggle it; Z / X open or close all. M toggles sound.

## Tests and tools
```bash
npm test                         # vitest: data parsers, PKG round trip (if FTL installed), sim rules, fog
npm run typecheck
npm run bench -- --seed 3        # headless bot-vs-bot match, prints the result and a state hash
npx tsx tools/bench/netsmoke.ts  # two scripted WebSocket clients against a running server
npx tsx tools/bench/e2e.ts       # two Chromium pages play a match; screenshots go to traces/
```

## Layout
```
packages/sim        deterministic combat simulation (30 Hz, seeded RNG)
packages/data       tolerant XML reader, blueprint/layout parsers, placeholder data
packages/extract    ftl.dat (PKG) reader and extractor CLI
packages/protocol   client/server message types
apps/server         lobbies, loadout validation, tick loop, fogged snapshots
apps/client         Vite + Pixi.js v8: menu, hangar, battle
tools/bench         headless bench, network smoke test, browser e2e
```

## Status
v1 covers:
- shields, engines, piloting, oxygen, weapons, medbay, sensors and doors;
- lasers, missiles, ion, beams, bombs and flak;
- fire, breaches and O2;
- crew repair and firefighting.

v2 is planned to add drones, cloaking, teleporters and boarding, hacking, mind control, battery, clone bay,
non-human races and augments.

Many timings are still estimates. The table in `docs/RULES.md` is still to be written; it will list each
timing's source and track the checks against real single-player FTL.

## Legal
FTL: Faster Than Light is © Subset Games. This project is unaffiliated, ships no game files, and was
built with AI assistance (Claude Code).
````

A few caveats:
- `docs/RULES.md` and `docs/CONTRACT.md` were in the plan but haven't been written yet.
- The root `package.json` has no `build` script, so the README calls `npx vite build apps/client` directly.
- The e2e test needs Chromium's libraries. On this machine they were unpacked locally and passed through
  `LD_LIBRARY_PATH`, and a fresh setup may need `sudo npx playwright install-deps`. The README should
  mention this.