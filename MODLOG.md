# MODLOG: FTL Arena

## Setup (2026-10-09)
- FTL: Faster Than Light, Steam 212680, at `/mnt/e/SteamLibrary/steamapps/common/FTL Faster Than Light`.
  It's a native x86 `FTLGame.exe` with no anti-cheat and no loader. Data is in `ftl.dat`, which is PKG
  format.
- Saves are backed up with `um backup create ".../Documents/My Games/FasterThanLight" --name ftl-saves`, to
  `~/.universal-modder/backups/ftl-saves/20261009-194339.zip`. The arena never touches them.
- **Route:** a clean reimplementation (mashup-mods Pattern 4/5). The real game is never run or modified by
  the arena; it is only the oracle for parity timings.

## ftl.dat PKG (verified)
- Header, big-endian: `PKG\n`, u16 headerSize = 16, u16 entrySize = 20, u32 count = 3219, u32 nameRegionSize.
- Entry: u32 hash, u32 (flags << 24 | nameOffset), u32 dataOffset, u32 packedSize, u32 unpackedSize.
- In this build all 3219 entries have flags = 0, so they're stored uncompressed. The deflate path is still
  in the code.
- **Hash:** for each char of the lower-cased path, `h = rotl(h, 27) ^ c`. This holds for 3219/3219 entries.
- **Round trip:** rebuilding the name region from the parsed entries reproduces the original bytes
  (`tests/data.test.ts`).
- The extract (without music, loc, ipad or map) comes to 2500 files, 54 MB.

## Data quirks
- `blueprints.xml` holds commented-out duplicate shipBlueprints, such as a 28-power Kestrel, so the parser
  must drop comments.
- Some tags are written `<maxPower amount ="8"/>`, with a space before `=`.
- Text comes through ids: `<title id="..."/>` maps to `text_blueprints.xml` `<text name="...">`.
- `upgradeCost/level[i]` is the price to go from level i+1 to i+2. The comment "level 2" in the file means
  the target level.
- Flak (`BURST`) has `<shots>1</shots>`. Its real pieces are `<projectiles><projectile count=N fake=..>`;
  the fake pieces are cosmetic.
- Chain weapons use `<boost><type>cooldown</type><amount>3</amount><count>3</count>`.
- The Kestrel A has 8 reactor bars against 9 bars of starting systems, so the medbay starts unpowered.

## Sim notes
- Mirror bot-vs-bot matches snowballed toward whichever ship was processed first. The fix alternates
  processing order per tick. It now gives 7/13 over 20 seeds, which is within noise.

## Client and server (verified 2026-10-09)
- **Art placement:** on all 14 hulls, with the grid's top-left tile as the origin, the hull goes at
  `<img x y>`, the floor at `<img>` + `<floor>`, and mounts relative to the hull image. Checked on the
  contact sheet `tools/bench/hulls.ts`.
- **Anim rows count from the bottom.** Checked against `human_base.png` (13 rows).
- **Network:** 30.0 ticks/s, 15.1 snaps/s, about 6 KB per snap before deflate. Fog is enforced by the
  server.
- **Browser e2e:** two headless Chromium players, lobby → hangar → battle → end overlay. Runs covered crew
  mode, a time limit, and a 4-minute hull-mode match. The trimmed clip is
  `traces/showcase-alice-50s.webm`; traces aren't committed.
- **Bugs found by e2e:**
  - `null ?? "not in a lobby"` sent false errors;
  - `<select data-ship>` has an empty dataset value;
  - the DOM panel hid the Pixi preview;
  - per-race crewCount entries weren't summed.
- **Publish check:** `um publish check` on a `git archive` export passed, 56 files.

## Next
- Parity pass against real FTL 1.6.14: needs the user's OK to drive the game (`um win record`).
- v2 systems: drones, cloak, teleporter + crew combat, hacking, mind control, battery, clone bay, races,
  augments.
