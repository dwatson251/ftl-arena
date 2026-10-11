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
npm run extract -- --ftl "/path/to/FTL Faster Than Light"   # needs FTL 1.6+ (ftl.dat); writes ./assets-local (gitignored), incl. music (--no-music to skip)
npm run server                                                  # authoritative server on :8787
npm run client                                                  # Vite dev client on :5173 (proxies /ws and /assets)
```
Or, for faster loads, build the client once (`npm run build`) and open http://localhost:8787: the server
serves the build itself. Rebuild after pulling changes, or the server keeps serving the old build.

Everything loads behind FTL's loading bar before the first menu. On https or localhost, a service worker keeps
the extracted art and sound in the browser's cache (cleared when you re-extract) and the code for when the
server can't be reached; the game itself still needs the server.

Open http://localhost:5173 in two browsers:
1. One player clicks **Create match** and shares the 4-letter code.
2. The other player clicks **Join**.
3. Both spend scrap and press **Ready**.

**Practice vs bot** gives you a solo opponent. Its **opponent** can be:
- any player cruiser (built with its own scrap);
- any of the **single-player enemy ships**, such as Rebel Fighter, Mantis Bomber or Zoltan Bomber. These
  fly with their own vertical art, crew and weapon pool, scaled by difficulty. In the lobby, a **difficulty slider (0-100)** sets it:
- **0-60:** raises its play skill: reaction time, mistakes, targeting, volley sync, beam timing, repairs,
  medbay and firefighting, and power swaps.
- **60-100:** skill is maxed, and the bot also gets up to +100% hangar scrap. It always spends that scrap on
  a powered build.

Measured against a steady mid-level player, the bot wins 0% at difficulty 0, 40% at 20, about 75-80% at
40-80, and 100% at 100 (`npx tsx tools/bench/difficulty.ts`). You can also choose the bot's hull.

**Debug tools** (practice lobbies; on by default) add a drawer on the right in battle:
- sim speed from pause to 8×, and single-tick or 1-second steps;
- restart the match;
- reveal the enemy, god mode, and "autopilot me" (a level-1 bot flies your ship, so you can watch bot vs
  bot);
- change the bot's difficulty live;
- quick sabotage on either ship: −5 hull, start a fire, break a system;
- the bot's reasoning log.

**LAN or internet:** one player runs the server and the client. The other opens
`http://<host>:5173/?server=<host>:8787`, or the host builds the client (`npx vite build apps/client`) and
the server serves it at `http://<host>:8787/`. To play with each player's own art, both players run
`npm run extract` and `npm run client`, and point `?server=` at the host.

## Playtesting with friends (desktop app and dedicated server)
- **Desktop app:** `npm run desktop:win` makes `release/FTL-Arena-win-x64.zip`. It's a portable folder with
  `FTL Arena.exe` and a `README.txt` for players, and friends install nothing.
  - `npm run desktop:dev` runs it from source.
  - `npm run desktop:mac` makes the macOS app. Build that on a Mac, then
    `hdiutil create -volname "FTL Arena" -srcfolder "release/FTL Arena-darwin-x64" FTL-Arena.dmg`.
- **Dedicated server:** `npm run server:dist` makes `release/server/FTL-Arena-Server-win-x64.zip` and
  `…-linux-x64.tar.gz`.
  - Each is a headless console program (a Node single-executable application) that logs to the terminal and
    hosts any number of matches.
  - Its options are `--port 8787`, `--ftl <FTL folder>`, `--data <folder>` and `--upnp`.
- **First start:** each player (and the server) picks their own FTL folder, and its `ftl.dat` is unpacked
  locally. No FTL file is in any package, and none is ever sent between players.
- **Menu, LAN tab:**
  - Create a match, and the friend joins with the code alone.
  - Their app asks the network over UDP on port 47878, and only the server holding that code answers.
  - If two matches on the network share a code, the app says so and doesn't guess.
- **Menu, Online tab:** the server address, used when you press Create or Join.
  - Blank means host on this computer. UPnP is tried, and the lobby shows the public and LAN addresses.
  - An address is a dedicated server or a friend's host, and the lobby shows it back.
  - A bad address or code just shows an error.
- **Host leaving:** the other captain takes over as host, and the seat frees up. After a battle, a newcomer
  joining puts the match back in the hangar. A dropped connection mid-battle reconnects into its seat.
- **Art and sound** always come from your own install; only the match itself runs on the server.

## Ship presets
- **Saving:** save a finished build from the hangar's **Launch** step, under a name of your choice.
- **Using:** the next lobby opens on **Presets**. Each card shows the name, the ship and the cost, plus a
  snapshot of the hull and guns on its own random backdrop. Picking one goes straight to Launch.
  Over-budget presets are flagged but can still be picked.
- **Deleting:** the ✕ on a card, after a confirmation.
- **New ship:** clears the build and any loaded preset, back to the default hull. It asks first if the
  build has unsaved changes.
- **Load from FTL:** appears on Presets when FTL has a run in progress on this computer (`continue.sav`).
  It brings in that run's ship: hull, systems, reactor, weapons, drones, augments, missiles, drone parts, and
  crew with their skills. It isn't saved until you save it from Launch. Scrap, fuel, hull damage and cargo
  stay in FTL. Only your own app reads your save; the server never offers it to other players.
- **Where they live:** this computer only: the desktop app's data folder (`presets.json`), or the
  browser's storage.

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
| Doors | click a door; `Z`/`X` open/close all. Opening again when every inner door is open opens the airlocks and vents the ship |
| Stations | the two buttons under the crew list save positions and return crew to them |
| Music on/off | `N` |
| Reorder weapons | drag a weapon box onto another slot (the guns swap mounts) |
| Autofire | the AUTOFIRE button sets the default for new targets (yellow reticle); Shift-click a target to do the opposite |
| Weapons system | click its icon to power the next weapon, right-click to unpower the last |

## The hangar
Ship creation runs in steps: **Ship → Systems → Weapons → Drones → Crew → Augments → Launch**.
1. **Ship:** pick a hull from FTL's ship-select thumbnails.
2. **Systems:** buy system levels, reactor bars and missiles.
3. **Weapons:** buy weapons from a store that shows each weapon's art and stats.
4. **Drones:** fit drones and buy drone parts. Combat, defense and ship-repair drones fly; interior
   drones are listed but wait for boarding.
5. **Augments:** up to 3, with FTL's prices. Each card says what it does in the arena; augments that only
   matter in the campaign (FTL jumps, the map, scrap) are kept and marked as having no effect.
6. **Crew:** hire named crew of any race (Human, Engi, Mantis, Rockman, Slug, Zoltan, Crystal, Lanius), each
   at its blueprint price. Rename them or roll a name from FTL's name list.

## What's in v1
- **Systems:** shields, engines, piloting, oxygen, medbay, weapons, sensors and doors, with reactor power,
  system damage, ion and repair.
- **Weapons:** lasers, burst lasers, missiles, ion, beams, flak, bombs, chain weapons and charge weapons.
- **Hazards:** fires (spread, starve, burn systems and crew), breaches, O2 per room, venting through
  airlocks, suffocation.
- **Crew:** pathfinding, manning bonuses, skills, firefighting, repair and medbay healing.
- **Sensor fog**, enforced by the server: level 2 shows the enemy interior, level 3 shows enemy weapon
  charge, and with broken sensors you only see rooms your own crew stand in.
- **14 player hulls** from your install, with their starting crews.
- **Races:**
  - Engi: repairs twice as fast.
  - Mantis: fast but repairs slowly.
  - Rockman: 150 HP and immune to fire.
  - Zoltan: 70 HP and powers the system it stands in.
  - Slug: telepathic, so it sees enemy crew without sensors.
  - Crystal: 125 HP and suffocates slowly.
  - Lanius: doesn't breathe and drains O2 from its room.

  Boarding isn't in v1, so combat strength doesn't matter yet.
- **FTL's own fonts:** the extractor converts `fonts/*.font` (a bitmap format, decoded in
  `packages/extract/src/font.ts`) to atlases, and the client turns them into web fonts. HL2 is used for
  labels, JustinFont for text and num_font for counters.
- **FTL's UI**, placed by matching each art piece against real 1280×720 screenshots (`tools/align/match.py`):
  - the hull bar and frame, shield squares, the evade/O2 panel and the missile counter;
  - the reactor wire and system power columns (repair progress fills the damaged bar);
  - the weapon tray, whose charge lights fill as weapons ready;
  - doors from FTL's door sheet, green destination tiles and selection glow;
  - the enemy ship standing vertically in the hostiles window.
- **Shots:** they leave one view, vanish, and enter the other view a moment later. Missed shots fly past.
- **Destroyed ships** break into their gibs before the result screen.

- **Clone bay:** dead crew are cloned back while it's powered. Backup DNA keeps the queue through power
  loss. Losing every crew member still ends the match.
- **Drones:** combat drones orbit and fire at the enemy; defense drones shoot down missiles (Defense II
  also lasers); anti-drone drones knock out drones; ship-repair drones patch the hull. Launching uses a
  drone part, and unpowering a drone loses it.

- **Boarding:** the teleporter sends up to four crew from its pad into an enemy room and brings them back.
  Crew fight hostiles in the same room, boarders wreck systems and break closed doors, and dead boarders
  can be cloned at home. Anti-personnel, system repair and boarding drones work as units inside ships.

- **Cloaking:** +60 evasion, and enemy weapons stop charging while it lasts.
- **Hacking:** launch the drone at a room to lock that system, then pulse it for the system's FTL effect.
- **Hulls:** all 28 player hulls, including the C variants, Zoltan, Stealth and Crystal ships.

- **Battery, mind control, artillery:** the Zoltan C battery, the Slug C / Lanius B mind control, and
  the Federation artillery beam.
- **The Rebel flagship:** stages 1-3 can be picked as single-player opponents.

Every FTL system is in. Campaign-only augments (scrap, FTL jumps, the map) are kept and marked as having
no effect in the arena.

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
npx tsx tools/bench/practice-e2e.ts [--gibs] [--burst]                      # practice walkthrough: hangar steps, debug drawer, explosion
npx tsx tools/bench/ladder.ts --levels 0,0.5,1                              # bot level vs bot level win matrix
npx tsx tools/bench/difficulty.ts                                           # the 0-100 slider vs a fixed player
npx tsx tools/bench/ab.ts                                                   # A/B one bot behaviour against level 0.5
```

## Credits
- FTL: Faster Than Light is by Subset Games. You need your own copy for the real ships, art and sound.
- The PKG layout was cross-checked against the community's notes (Slipstream Mod Manager); combat numbers
  come from the FTL wiki and your blueprints (see `docs/RULES.md`).
- Built with Pixi.js, ws, Vite, vitest and Playwright.
