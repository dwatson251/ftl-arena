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

## UI polish and bot difficulty (2026-10-09, second session)
- **FTL HUD art, verified by screenshot.**
  - `statusUI/top_hull_bar_mask.png` is 30 segments of 11 px with 1 px gaps. It sits at (8, 0) in
    `top_hull.png`.
  - Inside `combatUI/box_hostiles_mask.png`, the window interior is (14, 29)-(389, 532). The mask art is
    **black** inside, and Pixi sprite masks read red × alpha, so I used a polygon mask instead.
- **`people/<race>_color.png` is a white silhouette**, not a shirt layer. FTL uses it for the selection
  glow, and so does the arena now.
- **`effects/door_sheet.png`** is 5×5 frames of 35 px: the rows are door level (orange, grey blast
  levels 2-4, purple hacked) and the columns go from closed to open.
- **Enemy ships point up.** Their mounts are `rotate="false"` and weapon art points up. A player hull
  rotated by −90° matches that.
- **Gibs:** `<explosion><gibN>` has `velocity`/`direction`/`angular` ranges and an x,y offset from the
  hull image. Velocity ×20 px/s looks right.
- **Bot difficulty, measured.**
  - Mirror fights stop separating bot levels above about 0.5.
  - Measured with `ab.ts` at 40 seeds vs level 0.5:
    - "man stations": 33 % with it, 45 % without;
    - "missiles on shields": 51 % without.

    Both are off now.
  - The bot's hangar also wasted extra scrap on bars it couldn't power (17 bars of demand on an
    11-bar reactor). Now it buys reactor bars to match.
  - The difficulty slider then became monotonic: 0 → 0 %, 20 → 40 %, 40 → 75 %, 100 → 100 % vs a fixed
    level-0.6 player.
- **The debug drawer** is built once and updated in place. Re-creating it at 15 Hz detached buttons
  between mousedown and mouseup, so clicks were lost.
- **`names.xml`** includes localised names (Chinese, Russian). The parser keeps Latin-script ones.

## FTL fidelity pass (third session)
- **References:** the user's real 1280×720 FTL screenshots in `traces/real/` (gitignored with `traces/`).
  `tools/align/match.py` finds each UI image in them by masked SSD (via FFT).
  - Exact hits (error ≤ 0.004):
    - `top_hull` (0, 0); `top_shields4_on` (0, 43); shield squares (30 + 22i, 47);
    - fuel, missiles and drones boxes (122 / 188 / 258, 43);
    - `box_weapons_bottom4` (234, 607); door button (1122, 597);
    - system icons `s_*_green1` / `grey1` at (58 + 36i, 651); subsystems (1015 + 36i, 633);
    - `top_evade_oxygen_up_red` (1, 89).
  - The Kestrel hull is at (141, 137).
- **Room icons** in the real game are `s_<sys>_overlay.png` tinted grey, not the `_grey1` disc. Powered
  or not they look the same; they turn blue when ionised, orange when damaged, red when destroyed.
- **FTL `.font` format** (decoded here):
  - Header: "FONT", u8 version, u8 lineHeight, u8 baseline, then u32 glyph table offset (24), u16 count,
    u16 record size (16), u32 image offset, u32 image length.
  - Glyph: u32 code point, u16 x, u16 y, u8 w, u8 h, i8 bearingY, i8 bearingX, i8 advance extra, u8 ?,
    u8 spacing, u8 ?.
  - Image: "TEX\n" + a 32-byte header, then 8-bit coverage, 256 px wide.
  - Fonts: HL2 is the outlined label font (drawn at 2×), JustinFont8/10/11Bold/12Bold for text,
    num_font for the counters.
- **Sounds:** the UI sounds (`powerUpSystem`, `doorOpen`, …) are `.wav`. The sound parser kept only
  `.ogg`, which is why there was no power-up or power-down sound.
- **Enemy hulls:** art lives in `img/ships_glow/<img>_base.png` and gibs, with no floor image, and they
  share `ship/enemy_shields.png`.
  - Weapons come from `blueprintList` pools.
  - Systems have `power="a" max="b"`; crew has `amount..max`.
  - The `_DLC` variants are re-tunes. Auto ships have no crew.
- **Thrusters:** there's no thruster position data, because FTL hard-codes it. The client finds the
  nozzle banks as flat runs of 30-95 px on the hull art's rear edge.
- **Sim tuning:**
  - Venting was too slow: equalisation through doors was the bottleneck. It now has door flow 3/s and an
    airlock drain of 30 %/s, so an open Kestrel vents in about 15 s.
  - Crew suffocate below 10 % O2. At the old 5 %, the crewed rooms never got low enough.
  - Fire spreads at 0.16/s per tile, and through closed doors at half the chance.

## Round 4 polish
- **Bomb launchers** (17 frames): 0-5 load, 5 is charged, 6-15 teleport the bomb, 16 is empty.
  - The `bomb1` projectile strip is 4 spin frames, then 5 dissolve frames. Looping all 9 looked like the
    bomb exploding.
  - After firing, a weapon now plays frames chargedFrame+1 to the end (0.7 s for bombs).
- **Breaches:** `effects/breach.png` has 7 growth stages, drawn as a state that recedes as the breach is
  repaired. There's now at most one breach per room.
- **Crew art:** `people/healing_strip11.png` is the medbay crosses. `<race>_death_right` plays over 0.9 s
  before a crew member counts as dead, so wins wait for it.
- **Venting:** gradual door sharing (0.8/s) plus an airlock pull through open doors (12 %/s, weaker with
  distance). A single door evens out in about 4 s; an open Kestrel vents in about 12 s.
- **Charge ceiling:** manning and chain boosts lower the charge target (`w.cd`), and the charge rate stays
  1/s. The tray draws the lowered ceiling.
- **Manning:** manned sensors and doors work one level higher (`manBonus`).
- **Ion:** an ionised system is locked against power changes, and the HUD shows one countdown ring per
  ion stack.
- **Crew list names:** JustinFont8 at one size (about 8 px capitals, measured on the real crew list),
  clipped at the box edge.
- **Music:** `sounds.xml` `<music><track>` has explore/combat pairs. The title theme plays in the hangar;
  battle tracks are random or picked in the hangar. The extractor now includes music by default
  (`--no-music` to skip; 185 MB total).

## Round 5: augments, clone bay, drones
- **Sheet-name collisions in `animations.xml`:** `bomb_fire` and `bomb_breach` are each defined twice
  (the 17-frame launcher, then the 9-frame projectile). FTL resolves a sheet name at the point it's
  declared, so each anim/weaponAnim now keeps the `sheetDef` that existed when it was parsed. This
  fixed the bomb launcher art in the hangar and battle.
- **Station defaults:** `data/rooms.xml` `<roomLayout name=X><computerGlow x y dir>` gives the default
  station and facing for each interior image. Blueprints without a `<slot>` use the tile containing the
  computer point. On the Kestrel, shields, engines and weapons were all wrong before.
- **Burst Laser II strip:** frames 0 off, 1-4 red (charging), 5 green (ready), 6-8 recoil, 9-11 return.
  Each shot of a burst now replays 6 to 11, and the gun stays at frame 5 until the last shot leaves.
- **Asset serving through Vite's proxy:** hundreds of parallel HEAD requests got ERR_ABORTED.
  - The server streamed bodies to HEAD requests. Now it sends headers only.
  - The client loads with one GET per asset, so there's no HEAD probe at all.
- **Augments:** `augBlueprint` has `<value>`. Effects are implemented in the sim, with each one's arena
  meaning in `AUGMENT_EFFECTS` (rules.ts). Ids without an entry are kept, but have no effect in the arena.
- **Drones:**
  - `droneBlueprint` gives the type, power, cost, cooldown (ms), speed and weapon. Hulls have
    `<droneSlots>` and `<droneList drones="parts">`.
  - Combat drones fire every 3.2 x 15 / speed seconds (est).
  - Defense drones: DEFENSE_1 shoots missiles only, DEFENSE_2 also lasers and flak. ANTI_DRONE shoots
    drones.
  - SHIP_REPAIR heals 5 hull, then expires.

## Round 7: boarding
- **Data model:** each ship's `crew` list holds whoever is physically aboard, and each crew member has an
  `owner`. O2, fire, weapon hits and melee stay per ship; manning, crew lists, telepathy and the crew-kill
  win use ownership.
- **Not in FTL's data:** no teleporter or melee numbers exist in blueprints.xml; all are estimates
  (RULES.md). The interior drones have no `droneImage`. Their art is the crew sheets `battle`, `repair`
  and `boarder_ion` (people/), and the store icon is `systemUI/weapbox_icon_D_<iconImage>.png`.
- **Renderer bug found on the way:** crew drawing sat inside the `if (interior)` hazards block, so nothing
  was drawn on an enemy ship without sensors. Visibility is now per room (`visibleRooms`).
- **HUD:** FTL's tray fits five main systems; each extra system pushes the weapons and drone trays right
  by one system width.

## Round 8: cloaking, hacking, fog, ion
- **Hacking effects:** FTL's `text_misc.xml` lists every hack effect (`hack_shields` ... `hack_mind`),
  so the behaviour follows the game's own descriptions. Timings aren't in the data.
- **Countdown art:** the ion badge and timer ring are `icons/locking/s_ring_N_base.png` (N = 1-9) and
  `s_ring_timer.png`. The ring empties through a wedge mask.
- **Fog:** unseen rooms are solid #373737, sampled from the user's screenshots, not a tint. The fog layer
  now sits under the crew and doors layer.
- **Hangar:** it was a fixed list from round 1. It now has all 28 player hulls.

## Round 10: the last systems and the flagship
- **Flagship guns:** the flagship lists four `<artillery>` systems. They load as `artillery`,
  `artillery2`..`artillery4`, each a real system with its own room, power and damage. Art and rules key
  off `baseSystemId`.
- **Flagship blueprints:** BOSS_1..3 are in `blueprints.xml`, which the enemy scan skipped (it only read
  `*Blueprints.xml`). They have no crew or weapon list, so the crew is a fixed estimate. Their art is in
  `ships_glow/` and is vertical, like every other enemy's.
- **Fixed on the way:** beams ignored shield piercing.

## Round 11: many-systems fixes
- **Server crash:** a crew member killed aboard the other ship went home still holding a tile from that
  ship's layout, and `viewFor` crashed on the lookup. Bodies now get a home tile, view lookups are safe,
  and a lobby tick that throws no longer takes the server down.
- **Layout with every system fitted:**
  - The drone tray moves above the weapons tray's right end when it would hit the subsystems.
  - The battery leads the subsystems, with a compact panel beside it, clear of the target window.
- **Teleporter feedback:** every reason it won't fire now has a message (no power, charging, crew not on
  the pad, super shields, room full). Before, it failed silently.

## Round 12: nits from play
- **Bottom HUD:** a single per-frame layout. The weapons tray slides right per system past five, the drone
  tray sits flush to its right, and the subsystems move right as needed. FTL's 8-system cap keeps it
  on screen.
- **Lanius drain:** the wiki says "about as fast as a hull breach in a single square", so the drain reuses
  the breach formula.
- **Locks:** `icons/locking/s_octa_*` is the lock variant of the ion ring.

## Round 13: closer to the original
- **Research:** three read-only agents checked every estimate against the FTL wiki. Fandom blocks scripted
  page fetches, but its MediaWiki API (`api.php?action=parse&prop=wikitext`) answers through curl.
  xftl (gitlab.com/znixian/xftl) turned out to be the best single source: an independent rebuild whose
  author documented FTL's code, including the exact HUD layout (`PlayerShipUI.kt`, `SystemPowerButton`).
- **HUD:** FTL lays the bottom row out in one pass, the weapons and drone trays inline after their
  systems, and system buttons beside their bars. Copying that removed the round-12 layout heuristics.
- **The "medbay kills boarders" report:** a defender fighting in its own medbay healed 16 HP/s at level 2
  (an estimate) against 6 HP/s of melee. The wiki's 9.6 / 19.2 now apply. A boarder's door-breaking time
  could also carry over into sabotage and break a system at once; they're now separate.

## Next
- Parity pass against real FTL 1.6.14: needs the user's OK to drive the game (`um win record`).
- v2 systems: drones, cloak, teleporter + crew combat, hacking, mind control, battery, clone bay, races,
  augments.
