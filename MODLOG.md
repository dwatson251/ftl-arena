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

## Loading and caching
- **Loading screen:** FTL's `main_menus/Loading_main.png` and `Loading_bar.png`. Textures, fonts and
  sound effects load 48 at a time before the first menu.
- **Service worker:** `/assets/*` is cache-first. The page drops that cache when the manifest's
  `extractedAt` changes. Code is network-first.
- **Load to menu:** Vite dev takes about 14 s cold and 5.5 s warm; the built client about 4.4 s cold and
  2.3 s warm.
- **The production build never worked before this:**
  - Top-level await needs `target: es2022`.
  - The build's `assets/` folder clashed with the server's `/assets/` route, so it's now `app/`.
  - Pixi's renderer chunks deadlocked against the entry chunk's top-level await, so Pixi gets its own chunk.

## Desktop app (playtesting)
- **What it is:** Electron 33 via `@electron/packager`, producing a portable Windows zip built on Linux with
  no Wine. It bundles Node, so players need nothing installed.
- **Inside:** the server and extractor run in the main process from one esbuild CJS bundle
  (`apps/desktop/dist/server.cjs`, `ws` inlined). The window loads the built client from that in-process
  server.
- **First run:** pick the FTL folder. The app looks in Steam libraries (`libraryfolders.vdf`), GOG and macOS
  `FTL.app` paths, then runs `extractFtlAsync` with progress into userData (`assets.part`, renamed when
  done).
- **Hosting:** every copy hosts. A busy port moves to the next (the WebSocket server's own error on a taken
  port has to be swallowed, or the main process dies). UPnP is about 120 lines of SSDP + SOAP.
- **Verified here:**
  - Playwright `_electron` drove setup, extraction and a practice hangar.
  - Two copies on ports 9921 and 9931 played a match, B joining A by address.
  - The packaged zip has no FTL data, and `um publish check` passes apart from Chromium's own
    `resources.pak` warning.

## Menu redo, LAN discovery, dedicated server
- **The bug:** the first playtest failed. Pressing Connect for a new address cleared the game data, which
  disabled every button until a welcome arrived, and an unreachable address never sent one.
- **The fix:** one-step actions (`Net.connectTo` waits for the welcome, or times out and falls back to the
  page's own server).
- **LAN:** a UDP responder on 47878 (`reuseAddr`, so several servers can share one machine). Joiners
  broadcast "find CODE" with a nonce, and only holders reply. Answers heard over both loopback and LAN are
  deduplicated by server id.
- **Dedicated server:** Node SEA via `postject`. The Windows executable is the official `node.exe` of the
  same version, so it builds on Linux. The entry can't use top-level await, because SEA runs a CJS bundle.
- **Host-leave bugs:**
  - leaving mid-battle or after one kept a ghost seat ("full" or "already started" for anyone else);
  - reconnecting with a session token lost a held battle seat.

## Playtest 2 fixes
- **LAN search failed between two Windows PCs,** though TCP to the LAN address worked. Likely causes:
  - broadcasts dropped by the router or mesh Wi-Fi;
  - Windows sending `255.255.255.255` out a virtual adapter (Hyper-V/WSL/VPN);
  - the firewall allowing TCP but not UDP.
  The fix is a fallback: with no broadcast answer, the joiner's server sweeps its private /24 subnets over
  TCP (`/api/has?code=` on 8787-8789, 160 at a time, 900 ms timeout), which takes about 6 s. Both sides log
  what they found.
- **Healing crosses and sound** now follow a `healing` flag the sim sets. They had only checked power, not
  damage, hacking or crew owner.
- **Enemy guns:** whether they're powered stays in the fogged view (it's visible on the hull), so they slide
  in and out. Their charge is still hidden.
- **Super shield:** the hacking drone button is greyed with a warning. A boarding drone can be powered but
  waits, with a "super shield" status. The sim already refused both.
- **Shield Overcharger:** it holds still for the last 1.2 s of each charge cycle (`RULES.shieldDroneCharge`,
  so the timings are unchanged), with the `_glow` art pulsing and arcs into the ship. Its powered art is now
  `_charged` (it had shown `_off`).
- **Hacking their shields** shows their recharge bar (`shieldChargeKnown`).
- **Icon:** drawn from scratch by `tools/make-icon.py`. FTL's logo is just block letters, redrawn from
  rectangles, so no game art is shipped. A simpler design is used at 16-32 px. The packager embeds it with
  resedit (no Wine).
- **Menu bar:** hidden; Ctrl+Shift+F12 toggles it through `before-input-event`. Playwright key presses
  don't reach that hook, but `webContents.sendInputEvent` does.

## Ship presets
- **Steps:** a Presets step before Ship. It's the default only when presets exist. Step numbers now come from
  `STEPS`.
- **Storage:** `apps/client/src/presets.ts`.
  - In the desktop app, presets go through the preload bridge to `userData/presets.json` (written to a temp
    file, then renamed). localStorage is per origin, and the origin is `localhost:<port>`, so a busy-port
    fallback would strand them.
  - In a browser, they use localStorage.
  - Bad data reads as empty.
- **Snapshot:** `apps/client/src/snapshot.ts` uses a 2D canvas.
  - The background is a crop of a `stars/bg_*` image (offset and flip saved with the preset), plus an
    optional planet.
  - Charged guns are drawn on their mounts using ShipRenderer's maths, then the `_base` hull on top.
- **Unchanged detection:** `isSame` compares the chosen parts of a loadout. Saving always makes a new preset,
  named "<name> - Copy" after changes.

## Load from FTL (continue.sav)
- **Reader:** `apps/server/src/ftlsave.ts`, reimplemented from the field order of Vhati's FTL Profile Editor
  `SavedGameParser`.
  - Every value is a 4-byte little-endian int. Bools are 0/1, and strings are a length plus bytes (UTF-8 from
    format 11).
  - It reads only up to the end of the player ship. The room and door records are sized from the ship's
    layout (rooms by id, w×h×3 ints; every door, airlocks included).
- **Gotcha:** the format-7+ crew record ends with *three* bools before the teleport anim's 5 ints, then one
  more bool. Dropping one shifts everything, and it shows up a crew member later as "Not a bool: 5" (the
  next race string's length).
- **Checked against the real save:** this machine's Kestrel A run gave 8 missiles, 2 parts, Artemis and Burst
  II, and 3 crew with xp.
- **Skills:** `CrewPick.xp` carries skills into `buildShip`, clamped to `RULES.skillXp` maxima (FTL's own
  thresholds). Per the user, they're not priced.
- **Endpoint:** `/api/ftl-save` answers loopback requests only (`ftlSave` option: desktop and dev on,
  dedicated off), so LAN players can't read the host's save.

## Playtest round 19
- **Oxygen:** the source is xftl's `doc/oxygen` (FTL's `OxygenSystem` code). The FTL wiki's breach rate is an
  open "@to-do".
  - A breach drains 8 %/s per breach (a Lanius counts as one). Rooms joined through open doors lose that
    × 0.75^distance, so `breachDrain` goes from a guessed 3 to 8, plus `breachFalloff`.
  - Airlocks drain 16 %/s each, with the same falloff.
  - The refill is 1.2 %/s × 1/4/7 by level (not the UI's 1/3/6).
  - Within a group of rooms joined by open doors, each room moves 8 % of its gap to the group's average per
    second.
  - Only the breach and Lanius parts are applied for now.
- **Fog vs things you can see:** enemy engine glow (`thrust`) and ion (room icons blue) show whatever the
  sensors. Ion timers and sabotage progress stay level-4 only.
- **Sabotage progress:** it was per boarder (`c.sab`). Systems now carry `sabotage` (the furthest-along boarder)
  so the bars can draw it.
- **Crew AI order:** heal, then fight boarders (one more defender than boarders), fires, the medbay (if anyone
  is under 50 %), oxygen (if air is under 50 %), shields, weapons, breaches, other repairs, then man stations.
- **Explosions:** blasts on the whole hull for 1.4 s (`EXPLODE_PRE`), then the break-up.

## Hangar tidy-up
- **Steps:** Rules (host only, practice bot included) · Presets · Ship … Augments · Launch.
  - The host starts on Rules. Everyone else starts on Presets or Ship.
  - After a battle (`hangarAfterBattle()`), everyone starts on Launch.
- **Lobby column:** code, share, players, a read-only rules summary and Leave.
- **Ship summary column:** only on the building steps, without the Bill.
- **Launch:** full width.
  - The ship is shown in FTL's hangar (`customizeUI/custom_background.png`, cropped to the bay) by the
    battle's own `ShipRenderer` on a small Pixi app (`apps/client/src/bay.ts`). The canvas is kept across
    `innerHTML` renders and re-seated into `[data-bay]`.
  - Next to it, a pre-flight check (power, shields, evasion, weapon power, stores, what starts unpowered),
    plus Ready, the rules, music and the preset save.
- **Sounds:** every hangar sound is in the `SFX` table at the top of `hangar.ts`.
  - Spending uses `upgradeSystem` (bp_upgrade_1) and refunds use `undoUpgrades` (select_down2), as on FTL's
    upgrade screen.
  - FTL's store uses `buy`/`sell` (bp_purchase_1) to try instead.
- **Small screens:**
  - below 1150 px the summary column goes and Launch stacks;
  - below 900 px the lobby is a strip above the step;
  - the tabs wrap.

## Bring your own ship (rule: Ships → FTL saves only)
- **The rule:** `MatchConfig.ftlOnly`. A loadout carries `origin: "ftl"` from an FTL import. The client drops
  it on any change, since `change()` keeps it only while the loadout `isSame`s the import (`ftlBase`). A
  preset saved from an unchanged import keeps it.
- **Server:** `setReady` refuses non-`ftl` ships, and the scrap allowance is ignored (`Lobby.price()`). When
  the rule is switched on, every non-host build that isn't from FTL is reset to the default hull and
  unreadied.
- **Client:**
  - Only Rules, Presets and (with an FTL ship) Launch are open; everything else is greyed out and
    unreachable (tabs, nav, Next, Tab/Enter).
  - New ship and non-FTL presets are disabled.
  - Launch's back button goes to Presets.
  - Non-hosts are sent to Presets when the rule switches on.
  - The host is asked first if anyone else has started building or readied.
- **Not enforced:** the server can't tell a real save from a crafted `origin` tag. That's fine among
  friends.

## Round 20: ion flash, power that comes back
- **Ion icon:** an ionised system's room icon now flashes between blue and its usual colour (grey, orange or
  red) twice a second on the wall clock, instead of staying blue. This is from memory of FTL; not checked
  against a capture yet.
- **Power restore (sim):**
  - Each system now remembers the power the player last gave it (`SystemState.want`), and guns and drones
    remember whether the player wants them on (`want`).
  - Bars lost to damage, ion or a reactor shortage come back by themselves once repaired, once the ion wears
    off or once the reactor frees up. Vital systems come first: shields, engines, oxygen, medbay, then
    weapons, and drones last.
  - Only the player taking power off lowers the remembered value. Powering down a system that's at zero
    cancels one bar it would have got back.
  - A destroyed drone forgets: it has to be powered by hand after its rebuild.
  - The enemy's `want` is stripped from the view.
- Tests: `tests/round20.test.ts` (116 passing in total).

## Round 21: drones when a ship blows up
- **Drones going offline (client):** at a ship's first blast, every drone circling it goes offline, and so
  does every drone of its own. That covers its defense drones, the enemy's combat drones on it, and its
  combat drones on the enemy.
  - Offline means dark art, no turning, and no Shield Overcharger glow.
  - The sim already freezes at the end, so they hold still.
- **Hacking drones (client):** a hacking drone clamped to the dying ship, or one the dying ship sent,
  explodes when the ship breaks apart, with a small blast and a sound, and is no longer drawn. Its pulse
  lightning stops at the first blast.

## Round 22: forfeits when the host leaves, flagship gibs, sound effects back
- **Host leaving mid-battle:**
  - **Clean quit:** when the server shuts down cleanly (the desktop app's quit), it first ends any battle
    still running. The player on the server's own machine forfeits (`Client.local`, loopback): "Host closed
    the game: victory by forfeit". On a dedicated server going down, it's a draw. Sockets then close
    gracefully so the message gets out before the port is freed.
  - **Server vanishes without a word (crash):** the friend sees "Lost the connection to the host.
    Reconnecting… (8 s)", then a win by forfeit.
  - **Reconnect finds no match:** if they reconnect to a server that has no match for them, it's a win by
    forfeit straight away.
  - **Result screen:** offers only Leave, since there's no hangar to return to.
  - **Opponent disconnects but the server stays up:** a banner counts down the 20 s grace before their
    forfeit.
  - **Forfeit reasons** now name the player ("X left the battle: victory by forfeit").
- **End screen fix:** the end screen waited on a one-shot timer, but the battle clock only moves with
  rendered frames. With slow frames the timer fired early and the screen never came. It now fires from the
  frame loop.
- **Flagship:** the jump-away between stages is gone. Every stage blows apart like any other hull, with
  blasts and then its own gibs (`boss_N_gib1-4`).
- **Sound effects "stopped working":**
  - **Cause:** almost certainly the battle hotkey **M**. It switched effects off and saved that for good, so
    music, on its own key N, kept playing. I couldn't reproduce a code fault: blob and clone playback holds
    up past 1,500 plays in Chromium.
  - **Fix:** M is disabled, and any saved "off" is cleared at start-up.
- Tests: lobby shutdown forfeits (118 passing in total); `tools/align/forfeit.ts` (clean and crash) and
  `tools/align/flagship-gibs.ts`.

## Round 23: Survival mode, Autonomous ships as a checkbox
- **Survival (practice lobbies only):** a run of battles with one stock ship. See README and RULES.md.
  - **Sim:**
    - `survival.ts`: tiers, cards, weapon-upgrade ids, enemy plan, carry-over, score.
    - `Loadout.hullNow` and `damage`, `CrewPick.hp`, which `buildShip` starts from.
    - `Match.aftermathStep()`: the winner's ship only.
  - **Server:**
    - phases `aftermath`, `reward` and `jump`, and the `pick` message;
    - upgraded guns are registered in the db and sent to the client (`survival.weapons`);
    - the run survives a reload.
  - **Client:**
    - Game mode option; only Rules, Ship and Launch are open; Ship goes straight to Launch; no preset saving.
    - Battle HUD line; FTL's jump button charging over the aftermath; reward cards; the game-over tally
      with this computer's best score.
    - **The jump:** `jumpLeave`, engines flare, the ship creeps then streaks off right, then a white flash
      and black. The next beacon has a new backdrop and planet, and fades in with `jumpArrive` while the
      ship slides in from the left.
  - **Card balance from a first look at hands:**
    - Campaign-only augments are out (Distraction Buoys and the like).
    - Supplies follow the gear's value, not a system install's.
    - At full hull, leftover value becomes plating (+max hull) instead of a pile of missiles.
    - Difficulty climbs +5 a battle.
- **Autonomous ships:** now a checkbox on the Rules step, not a Game mode, and off for good in Survival.
  With it on, builds may launch with no crew (`priceLoadout(..., crewless)`; the crew ✕ allows the last
  one).
- **Fix:** checkboxes in the hangar no longer hold a re-render back. The focus guard is for fields being
  typed in, and a ticked box looked like "nothing happened".
- Tests: `survival.test.ts` (12) and `autonomous.test.ts` (3); 133 in total. Playwright:
  `tools/align/survival.ts`.

## Round 24: dropdowns repaint at once
- **Bug:** picking a dropdown option (Pausing, Game mode, Ships, Hazard, the bot's opponent, battle music)
  didn't repaint the page until another click. The hangar's focus guard holds renders back while a form
  field has focus, so typing isn't interrupted, and a picked dropdown kept focus.
- **Fix:** a changed `<select>` lets go of focus straight away and the page repaints. The value goes to the
  server as before, and its lobby update repaints again with nothing in the way.
- **Check:** `tools/align/dropdowns.ts` picks options with the select focused, as a mouse pick leaves it.
  It failed on the old build (no timeout fields, tabs still open) and passes now.

## Round 25: Survival, more time with boarders aboard
- If enemy boarders (crew or boarding drones) are still on your ship when the enemy ship is destroyed, the
  aftermath before the reward and jump runs **60 s** instead of 15 s (`SURVIVAL.aftermathBoarders`).
- The FTL charge bars fill over the longer time, and the banner reads "BOARDERS ABOARD · fight them off
  before the jump". The Rules text says so too.
- The full 60 s runs even if the boarders die early, as asked. It's easy to cut short later.
- Test: `survival.test.ts` (134 passing in total).

## Round 26: Survival boarders and the jump
- **Bug: boarders now carry over.** Enemy crew still alive on your ship at the jump come along into the
  next battle: same tiles, same HP and skills, now fighting for the new enemy (`Loadout.boarders`,
  placed by the `Match` constructor). Boarding drones don't come: their controlling ship is gone.
- **Long aftermath ends early:** once every boarder is dead, the 60 s clock drops to 15 s, or to what's
  left if that's less. The banner stops saying BOARDERS ABOARD.
- **Jump look:** the stretch, the creep and the slide-in are gone, since FTL's ship doesn't move. Now the
  ship stays put with its engines flaring and FTL's jump sound plays, then a white flash and black. The
  next beacon fades in with the ship already in place, engines flaring a moment longer.
- Tests: `survival.test.ts` gained 2 tests (boarders carried over, the clock dropping); 135 passing in
  total.

## Round 27: playtest batch (Survival, crew AI, flagship, warnings)
- **Survival:**
  - **Orders in the aftermath:** you can give orders after the enemy is destroyed. The battle screen used to
    ignore input once there was a winner. Pause and crew sounds follow the same rule (`Battle.live()`).
  - **Stranded boarders** (`CrewState.stranded`), left aboard when their ship died, never retreat: no
    teleporter can take them home, and the AI doesn't try.
  - **Crew positions and weapon order carry over:** each crew member's tile (or where they were walking
    to), and the weapon order as swapped in battle.
  - **Countdown text:** "Providing reward in: N s" ("Boarders aboard · …" while they're alive).
  - **FTL charge widget:** no "FTL" label; the bars are centred in the button and pulse when full. It's now
    drawn under the pause tint and PAUSED banner, and the countdown line hides while paused.
  - **Cards:** every hand now has a system-or-reactor card (reactor about a third of the time) and a
    separate weapon-upgrade-or-crew card, so hands are 4 cards (5 after a boss). Upgraded guns are named
    with "+" (Burst Laser II++).
- **Jump:**
  - The ship fades out under a soft gradient, tail to nose (left to right), while FTL's star flare
    (`effects/glowing_star.png` over a radial glow) swells at the rear. Then the screen fades to black, with
    no white flash.
  - The arrival just fades in.
- **Rebel flagship stages 1-2:** after the blasts, half the gibs break off and fly away. The rest escapes
  with the same fade, bottom to top, and the flare at its tail. Stage 3 still blows up.
- **Hostiles window:** once the beaten enemy has gone (wreck burned out, or the flagship's escape done),
  the whole window clears and your ship snaps to the centre of the screen.
- **Warnings (FTL's art and text):**
  - "INTRUDERS DETECTED" on the red warning glow whenever enemy crew are aboard.
  - The hazard's danger icon (`warnings/danger_*`) with "DANGER!", plus "SOLAR FLARE / ION PULSE IMMINENT!"
    or "ASB TARGET LOCKED!" just before it hits.
  - Warnings stack when several are up.
- **Super shield:**
  - Bug: a shot that dodged the super-shield check rolled evasion a second time and could hit the normal
    shields while the super shield was up.
  - Now there's one evasion roll per shot, then the super shield, then the shield layers. Tested: no layer
    lost while a super shield holds.
- **Reticles:** they clear when the enemy is beaten; the armed weapon and any teleport, hack or mind-control
  targeting are dropped.
- **Crew AI (bot and autopilot):**
  - Crew get out of rooms with critical air (under 20%). Badly hurt crew (under half health) leave fights and
    fires, going to the medbay if it's safe, otherwise the nearest safe room.
  - Until healed to 90% they aren't sent into burning rooms, rooms with critical air, or rooms with foes.
  - Boarders get the same rules on the enemy ship, including stranded ones whose ship has no teleporter.
- **Ion:** crew manning an ionised system freeze at the console.
- **Flagship art:**
  - Artillery sits on the mounts after the weapon system's slots (4-7), matching the shadows in the art;
    the muzzle points use the same mounts.
  - The shield is centred on the rooms, since the huge art canvas put it too high.
- **Deaths:** a dying ship shows only its exterior (rooms, crew and shields hidden) from the first blast.
- **Debug:** an "add boarder" button (practice) puts an enemy crew member aboard your ship.
- **Tests:** super-shield order, stranded boarders, crew AI (4), crew positions, weapon order and hands; 142
  passing in total. Playwright: `tools/align/survival2.ts`, `flagship-escape.ts`, `flagship-guns.ts`.

## Round 28: controller support (experimental)
- **Settings tab** (main menu): a "Controller support" switch, stored per browser. The tab shows the pad
  and the button map.
- **Driver:** the browser Gamepad API with the standard mapping (`controller.ts`), polled each frame with
  tap and hold (250 ms) and the stick angle. Xbox, DualSense/DS4 and Steam (via Steam Input) work with no
  drivers.
- **Menus** (`menunav.ts):**
  - The D-pad moves a gold focus ring to the nearest control that way. Controls straight ahead win over
    ones off to the side.
  - A presses, or edits numbers, sliders and dropdowns (D-pad steps, A submits, B cancels).
  - The ring survives hangar re-renders. Fields aren't focused until edited, so re-renders aren't held up.
- **Rules page** is now a table: labels left, every control the same width in one right-hand column, rows
  ruled off. The D-pad goes straight down it, as the user asked after their playtest.
- **Server:**
  - `{ t: "controller" }` sets `LobbyPlayer.controller`, which draws a gamepad icon in the lobby.
  - In battle that seat gets an assistant `Bot` (`Bot.think(m, me, assist)`). It runs crew, reactor,
    drones, cloak and battery, but never aims, boards, hacks or mind-controls.
  - It leaves the power of guns and systems the player has touched alone (`ownedWeapons`,
    `ownedSystems`), and crew they've claimed (`{ t: "controlCrew" }`). The teleporter powering down
    hands those crew back.
- **Battle** (`wheel.ts` plus the battle's controller section):
  - Hold-to-open **segmented wheels**: weapon targets (system rooms, crew grouped by room, an empty-room
    slot for hull weapons), hacking, teleport out (crew to the pad), teleport back, and mind control (one
    crew member each).
  - Release in the middle for "none". Picks autofire, and beams get a line through the room.
  - Taps clear a target, beam over, pulse, cloak or battery. LB + a button powers it down. Start pauses.
  - The wheel pauses the game when the pause rules allow it.
- **Tests:** `controller.test.ts` (the assistant never aims, respects owned power and claimed crew; lobby
  flag and claims); 146 passing in total. Playwright `tools/align/controller.ts` uses a scripted gamepad:
  Settings, the D-pad ring, editing scrap, the lobby icon, the wheel (pause, pick, autofire), tap to clear,
  LB + B power-down.

## Round 29: Survival bosses
- **The flagship** only comes every 25th battle: stages 1, 2 and 3 at 25, 50 and 75, then the Hard layouts
  from 100.
- **Mini-bosses** every other 5th battle: a random player cruiser (30 hull, full crew) fitted out by the
  bot's hangar with 250 + 6 scrap per difficulty point. Samples: a Kestrel with 2 shield layers at battle 5;
  an Osprey or Bravais with 3 layers and 4 guns by battles 20-30.
- **Mini-boss rewards and labels:**
  - Beating one gives 5 cards (an extra gear card, the first a tier better) and 250 points.
  - The HUD says MINI-BOSS (FLAGSHIP for the boss), the reward screen says "RIVAL DEFEATED", and the
    game-over tally counts both.
- Tests updated (146 passing).

## Round 30: playtest nits (drones and super shields, boarding drone pace, bomb blasts)
- **AI and super shields:** the AI (bot, autopilot and controller assistant) no longer powers a boarding
  drone into an enemy super shield, which it used to retry on every think. One waiting to launch stands
  down and frees its power; once the shield is gone it launches as normal. Test in `crew-ai.test.ts`
  (fails on the old bot).
- **Boarding drones** (and ion intruders) walk at half speed (`RACES.boarder.speed` 0.5), as the user
  asked. Their flight over (2.4 s) is unchanged: the blueprint's speed 18 is about half the missiles' and
  already matches.
- **Bombs:** the sprite spins until the bomb actually goes off. Its blast frames now play with the
  explosion (the "hit" event, `bombBurst`) instead of in the last 30% of the flight, so the art no longer
  explodes ahead of the blast.

## Round 31: window resize
- **Bug:** the battle only re-fitted to the window on the next resize. Pixi's `resizeTo` resizes the canvas on
  the next animation frame, but our resize handler laid out straight away against the old size.
- **Fix:** the handler calls `app.resize()` first, then lays out, and does both once more on the next frame.
- **Check:** `tools/align/resize.ts`. On the old build, one resize to 900x560 left the 1280x720 layout
  spilling past the canvas; now it fits at once.

## Round 32: reward sounds, the Escape menu, a quieter pause
- **Survival cards:**
  - FTL's crew level-up jingle (`levelup`, bp_SFX_LevelUp) plays once as the hand comes up.
  - The menu hover beep plays as the pointer or the controller ring lands on a card.
  - The store's buy sound (`buy`) plays when a card is taken.
- **Escape menu** (any mode; also Back/View on a controller, where B closes it): Resume or Quit match.
  - **Escape** still lets go of an aimed weapon or teleport/hack/mind first.
  - **Pausing:** the menu pauses only when the match allows it (a pause clock with time left; practice's is
    unlimited). The clock then counts down as usual, and the menu says how much is left. Otherwise it sits
    over the battle while it runs on. Closing it un-pauses only a pause it made.
  - **Quitting** goes to the main menu (in a versus match the menu says it forfeits).
  - **Fix found on the way:** the forfeit's last snapshot used to re-open the battle after quitting. It's
    now ignored until a new battle starts.
- **Pause sound:** pausing no longer plays the cloak/decloak sounds. The music winding down is enough.
- **Check:** `tools/align/escmenu.ts` (pauses in practice, runs on with pausing off, Quit reaches the main
  menu).

## Round 33: boarders' wrecking progress, low-health beep
- **Wrecking progress belongs to the system** (`SystemState.wreck`).
  - Before, each boarder carried its own progress. It reset whenever they took a step, and the bar showed
    nothing while a defender fought them.
  - Now every boarder working the room adds to the system's progress. A fight in the room pauses it, and
    the bar keeps showing it. It's lost only once the last boarder has left the room.
  - Breaking a door on the way in still doesn't count.
- **Low crew health beep:** once when a crew member drops below 30% (`LOW_HP_BEEP`), re-armed when healed
  back above it. It used to sound at 50% and again at 25%.
- **Tests:** 3 in `round19.test.ts` (the progress survives a step, pauses while contested, is lost when the
  room empties); 150 passing in total.
- **Flaky test fixed:** the Survival "boarders stretch the aftermath" test borrowed a crew member from a
  random enemy, which can be a crewless automated ship. It now falls back to a copy of one of ours (12/12
  runs pass).

## Round 34: repair pace, reinforced systems, shots after a win, steady pauses, saved stations
- **Repair is 2x slower:** 12.5 s per bar for an untrained human (the FTL wiki's figure, via search; the
  wikis block automated reads), so 6.25 s for an Engi and 25 s for a Mantis (`RULES.repairRate`). It was
  6 s.
  - The wiki gives no per-bar system health: FTL bars break by damage points.
  - I found no published rate for boarders wrecking a system, so that stays at 20 s per bar for one human
    boarder (`sabotageRate`).
- **Reinforced systems (Survival):**
  - A rare, gold card for one installed system. Its bars take 10% more punishment per bar the system has
    (`toughness = 1 + 0.1 × level`; a 4-bar shield takes 40% more).
  - Weapon damage, solar flares, fire and boarders are all divided by it, with fractions carried toward
    the next bar (`SystemState.armour`).
  - The card takes the system slot about 1 hand in 6.
- **Shots after a win:** projectiles in the air keep flying.
  - In Survival's aftermath the sim moves them: the beaten ship's last volleys can still land, and ours
    fizzle where the wreck was.
  - When a match ends, the client flies them on until they'd have arrived.
- **Pause wobble:** while paused, shots were carried forward between snapshots (which keep coming with the
  same positions) and snapped back each time. Paused, they now hold still.
- **Saved crew stations (Survival):** the stations the player saves now carry over from jump to jump (by
  crew name). Each new battle used to reset them to where the crew stood. A new run clears them.
- **Tests:** reinforcement (card, toughness, bars soaked) and aftermath shots (the enemy's land, ours
  don't); 152 passing in total.

## Round 35: bomb sequence, unpowered guns stop aiming
- **Teleported bombs** now play in FTL's order, one step after another:
  - the launcher's teleport (0.3 s, `RULES.bombAppear`);
  - then the bomb appears in the room, spinning, with FTL's bomb sound (its teleport-in and beeping, about
    2.1 s);
  - then it goes off at 2.4 s (`RULES.flight.BOMB`, was 0.8 s). The damage, its blast frames and the
    explosion all come at that moment.
  - The bomb sound used to play as it was fired, over a hit that had already landed.
- **Guns without power drop their target**, whether switched off by hand or knocked out by damage, ion or
  a power shortage (`weaponPower` off and `clampWeapons`). Test in `round20.test.ts`.

## Round 36: Survival reinforcement stacks, card choices, re-rolls
- **Reinforcement is per bar and stacks**, as the user specified. Each card gives every bar of one system
  10% more health (`toughness = 1 + 0.1 × stacks`), so a 4-bar system takes 40% more in total, but each bar
  only 10% more.
  - The same system can be reinforced again. Each further stack is rarer (weight 1/(stacks+1)²), and so is
  the card once the ship is well reinforced.
  - The card is named "Reinforced Shields +", "++"… for later stacks.
- **Choices:** hands start at **3 cards**, filled in order: gear, a system or reactor, a weapon upgrade or
  crew, more gear, with supplies always last.
  - A **"+1 choice"** card sometimes replaces one: commonly to 4 (30% of hands), rarely, and gold, to 5 (7%).
    The cap is 5.
  - Boss hands no longer add a card; their gear is rare (flagship) or a tier up (mini-boss).
- **Re-rolls:** 2 to start, plus 1 for every boss or mini-boss beaten. A button on the reward screen
  ("Re-roll (N left)") deals a fresh hand (`{ t: "reroll" }`).
- **Tests:** per-bar stacking, rarer repeats, hand sizes 3→4→5 with the cap, re-rolls (2, then refused),
  a mini-boss earning one; 156 passing in total.

## Round 37: progress carries over between jumps
- **Survival:** each system's half-finished work now survives the jump (`Loadout.progress`):
  - repairs toward the next mended bar;
  - boarders' wrecking toward the next broken bar. Carried-over boarders are still in the room, so it goes
    on from there instead of from zero;
  - damage a reinforced system has soaked toward its next bar.
- **Test** in `survival.test.ts` (fails on the old code: repair came back as 0); 157 passing in total.

## Next
- Parity pass against real FTL 1.6.14: needs the user's OK to drive the game (`um win record`).
- v2 systems: drones, cloak, teleporter + crew combat, hacking, mind control, battery, clone bay, races,
  augments.
