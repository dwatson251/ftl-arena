# Developing FTL Arena

Everything about building, running and testing from source. The design notes are in this folder:
- `CONTRACT.md`: the wire protocol;
- `RULES.md`: every combat number and where it came from;
- `V2-SYSTEMS.md`: how the later systems were added;
- `MODLOG.md`: the development journal.

## Quick start (from source)
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

**Bot difficulty:** measured against a steady mid-level player, the bot wins 0% at difficulty 0, 40% at 20, about 75-80% at
40-80, and 100% at 100 (`npx tsx tools/bench/difficulty.ts`). You can also choose the bot's hull.

**LAN or internet:** one player runs the server and the client. The other opens
`http://<host>:5173/?server=<host>:8787`, or the host builds the client (`npx vite build apps/client`) and
the server serves it at `http://<host>:8787/`. To play with each player's own art, both players run
`npm run extract` and `npm run client`, and point `?server=` at the host.

**Debug tools** exist only in a dev build (`npm run dev`, or `npm run server` with `npm run client`). Release
builds compile them out (`__RELEASE__` in the server bundles, Vite's `import.meta.env.DEV` in the client).
In practice lobbies, they add a drawer on the right in battle:
- sim speed from pause to 8×, and single-tick or 1-second steps;
- restart the match;
- reveal the enemy, god mode, and "autopilot me" (a level-1 bot flies your ship);
- change the bot's difficulty live;
- quick sabotage on either ship: −5 hull, start a fire, break a system;
- the bot's reasoning log.

## Packaging
- `npm run desktop:dev` runs the desktop app (Electron) from source.
- **Windows:** `node tools/build-desktop.mjs --win` makes `release/FTL-Arena-win-x64.zip`, a portable folder
  with `FTL Arena.exe` and a `README.txt` for players. Build it on Windows, which is needed to set the .exe's
  icon and details.
- **Linux:** `node tools/build-desktop.mjs --linux` makes:
  - `release/FTL-Arena-linux-x64.tar.gz`;
  - `release/FTL-Arena-x86_64.AppImage`, when `appimagetool` is on PATH (or `APPIMAGETOOL=<path>`).

  The AppImage is the Steam Deck build. It runs Chromium without its setuid sandbox, which can't work from an
  AppImage mount. In Steam's Gaming Mode (`SteamDeck=1` / `SteamGamepadUI=1`) it opens fullscreen with
  `?deck=1`, which turns controller support on until the player switches it off.
- **macOS:** `npm run desktop:mac`, built on a Mac. Then run
  `hdiutil create -volname "FTL Arena" -srcfolder "release/FTL Arena-darwin-x64" FTL-Arena.dmg`.
- **Dedicated server:** `node tools/build-server.mjs [--win|--linux]` makes
  `release/server/FTL-Arena-Server-win-x64.zip` and `…-linux-x64.tar.gz`. These are Node single-executable
  applications, so the machine running them needs nothing installed.
- **No FTL art or audio in any package:** each player's app unpacks their own copy on first start. Ship
  layouts, stock loadouts and blueprint numbers are part of the arena's content (`packages/content`).

## Versions and releases
- **The version** shows top right in red ("Alpha 0.1.0-alpha.1"). It's set at build time
  (`apps/client/vite.config.ts`), from the first of these that exists:
  1. `FTL_ARENA_VERSION`;
  2. the tag on this commit;
  3. the last 7 characters of the commit hash.
- **CI** (`.github/workflows/ci.yml`) runs the typecheck and tests on every push to `main` and every pull
  request. CI has no FTL data, so the tests fall back to the placeholder set, and tests that need real
  FTL content skip.
- **Releases** (`.github/workflows/release.yml`): pushing a tag `v*` runs four jobs.
  1. The tests.
  2. The Windows desktop app and server, on `windows-latest`.
  3. The Linux tar.gz, AppImage and server, on `ubuntu-latest`.
  4. A GitHub release with all five files. Its notes are the version's `CHANGELOG.md` section, and tags
     containing `alpha`, `beta` or `rc` are marked as pre-releases.

  ```bash
  # add a "## 0.1.0-alpha.2" section to CHANGELOG.md, commit, then:
  git tag -a v0.1.0-alpha.2 -m "FTL Arena 0.1.0-alpha.2" && git push origin main v0.1.0-alpha.2
  ```
- **README screenshots:** `npx tsx tools/align/readme-shots.ts`, run against a Vite dev client, writes them
  to `docs/images/`.

## Layout
| Path | What |
|---|---|
| `packages/content` | The game's content: one config class per blueprint (ships with their room layouts, systems and stock loadouts, weapons, drones, augments, crew races, systems) and `buildDb()`. See "Content" below. |
| `packages/sim` | Pure deterministic simulation (no DOM, no Node). Same seed + same commands = same state hash. |
| `packages/data` | GameDB types, a tolerant XML reader, and the presentation layer (FTL's text, animation sheets, sounds, names from the install). The blueprint parsers now only feed the content generator. |
| `packages/extract` | `ftl.dat` (PKG) reader and extractor: art, sound, music, fonts and the presentation data files. |
| `packages/protocol` | Wire messages. See `docs/CONTRACT.md`. |
| `apps/server` | Lobbies, hangar validation, 30 Hz tick, per-player fogged snapshots. |
| `apps/client` | Vite + Pixi.js v8 client: menu, hangar, battle. |
| `tools/bench` | Headless bot-vs-bot bench, network smoke test, browser e2e and hull screenshots. |
| `docs/RULES.md` | Every combat number and where it came from, with the parity status. |

## Content
The ships, weapons, drones, augments, crew and systems are the arena's own, in `packages/content/src/`, with
one class per blueprint.
- **Ships** (`ships/<ID>.ts`) hold the hull and reactor, the systems with their rooms and stations, the
  stock loadout and the layout (`layouts/<id>.ts`: rooms, doors, mounts, hull image box, shield ellipse,
  gibs).
  - Each also has a `sprites` block naming where its art lives. Type C hulls borrow the A hull's floor and
    shields.
  - Each has an `enemy` section for how it appears as the opponent. `enemy.scale` sizes it in the target
    window (1.1 is 10% bigger) and `enemy.shieldNudge` moves its shield bubble.
- **Numbers** (weapons, drones, augments, crew traits, systems) are in their classes.
- **The registry** is `registry.ts`: it lists every class, plus the hangar's and the enemy list's order. A
  new blueprint is a new class added there.
- **What the player's install still supplies:**
  - art and sound;
  - the animation sheets (which frames make a sprite);
  - the crew name pool;
  - FTL's own prose: descriptions and level lines. The classes keep FTL's text ids, and we write our own
    words where FTL has none.
- **Without an install,** the same ships and rules run with flat shapes, and tests and CI run on the real
  content.
- **Backup art:** `packages/content/art/img/...` serves files the install doesn't have, at the same paths.
  Only art made without FTL's copyright goes there.
- **Regenerating:** the classes were bootstrapped from FTL's data files by
  `npx tsx tools/content/generate.ts`, which needs an extract made with `npm run extract -- --all-data`. Hand
  edits are overwritten if you re-run it. `tests/content.test.ts` checks that the classes still rebuild the DB
  the old parser produced.

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
