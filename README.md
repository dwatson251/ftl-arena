# FTL Arena

1v1 real-time multiplayer FTL: Faster Than Light combat, rebuilt in TypeScript with a Pixi.js renderer and
an authoritative Node server. Each player spends a scrap budget in the hangar:
- a hull;
- system levels and reactor;
- weapons;
- crew and missiles.

Then the two ships fight under FTL's combat rules, **with no pause**.

Before the match, the host picks the win condition:
- **Destroy the ship:** hull to 0. Losing your whole crew also loses, as in FTL.
- **Kill the crew:** hulls can't drop below 1, so only a dead crew ends it.

> This is a fan project and is not affiliated with Subset Games. It ships **no FTL files**. The ships, art,
> sounds and blueprint numbers come from **your own copy of FTL** through a local extractor. Without one,
> the arena runs on a small placeholder set of original ships and flat shapes.
> It was built with an AI coding agent (Claude Code); see `MODLOG.md` for how.

## Quick start
```bash
npm install
npm run extract -- --ftl "/path/to/FTL Faster Than Light"   # needs FTL 1.6+ (ftl.dat); writes ./assets-local (gitignored)
npm run server                                                  # authoritative server on :8787
npm run client                                                  # Vite dev client on :5173 (proxies /ws and /assets)
```
Open http://localhost:5173 in two browsers:
1. One player clicks **Create match** and shares the 4-letter code.
2. The other player clicks **Join**.
3. Both spend scrap and press **Ready**.

**Practice vs bot** gives you a solo opponent.

**LAN or internet:** one player runs the server and the client. The other opens
`http://<host>:5173/?server=<host>:8787`, or the host builds the client (`npx vite build apps/client`) and
the server serves it at `http://<host>:8787/`. To play with each player's own art, both players run
`npm run extract` and `npm run client`, and point `?server=` at the host.

## Controls (FTL's)
| Action | Input |
|---|---|
| Power a weapon / arm it for targeting | click its box, or `1`-`4` |
| Target | with a weapon armed, click an enemy room (beams: click a start point, then the direction) |
| Power a weapon off | right-click its box |
| Autofire | the button under the weapon, or `A` while armed |
| Select crew | click, drag a box, or `Tab` for all |
| Move crew | right-click a room on your ship |
| System power | click the system's bars for +1, right-click for −1 |
| Doors | click a door; `Z`/`X` open/close all (airlocks stay shut) |
| Sound | `M` |

## What's in v1
- **Systems:** shields, engines, piloting, oxygen, medbay, weapons, sensors and doors, with reactor power,
  system damage, ion and repair.
- **Weapons:** lasers, burst lasers, missiles, ion, beams, flak, bombs, chain weapons and charge weapons.
- **Hazards:** fires (spread, starve, burn systems and crew), breaches, O2 per room, venting through
  airlocks, suffocation.
- **Crew:** pathfinding, manning bonuses, skills, firefighting, repair and medbay healing.
- **Sensor fog**, enforced by the server: level 2 shows the enemy interior, level 3 shows enemy weapon
  charge, and with broken sensors you only see rooms your own crew stand in.
- **14 player hulls** from your install. In v1 every crew member is human.

Planned for v2: drones, cloaking, teleporter/boarding and crew combat, hacking, mind control, battery,
clone bay, non-human races and augments.

## Layout
| Path | What |
|---|---|
| `packages/sim` | Pure deterministic simulation (no DOM, no Node). Same seed + same commands = same state hash. |
| `packages/data` | Tolerant XML reader, blueprint/layout/animation/sound parsers, placeholder set. |
| `packages/extract` | `ftl.dat` (PKG) reader and extractor. |
| `packages/protocol` | Wire messages. See `docs/CONTRACT.md`. |
| `apps/server` | Lobbies, hangar validation, 30 Hz tick, per-player fogged snapshots. |
| `apps/client` | Vite + Pixi.js v8 client: menu, hangar, battle. |
| `tools/bench` | Headless bot-vs-bot bench, network smoke test, browser e2e and hull screenshots. |
| `docs/RULES.md` | Every combat number and where it came from, with the parity status. |

## Tests
```bash
npm test                      # vitest: parsers, PKG round trip (if FTL is installed), sim rules, hangar, fog
npm run bench -- --seed 3     # headless bot vs bot, prints winner + state hash
npx tsx tools/bench/netsmoke.ts ws://localhost:8787/ws 15
npx tsx tools/bench/e2e.ts --secs 60 [--win crew] [--limit 90] [--video]   # two Chromium pages, screenshots in traces/
```

## Credits
- FTL: Faster Than Light is by Subset Games. You need your own copy for the real ships, art and sound.
- The PKG layout was cross-checked against the community's notes (Slipstream Mod Manager); combat numbers
  come from the FTL wiki and your blueprints (see `docs/RULES.md`).
- Built with Pixi.js, ws, Vite, vitest and Playwright.
