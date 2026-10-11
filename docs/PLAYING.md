# Playing FTL Arena

The full player's guide: hosting and joining, the hangar, presets, the game modes and rules, and the controls.
For installing, see the [README](../README.md).

## Hosting and joining
- **First start:** pick your FTL folder (the one with `ftl.dat`; on Linux and the Steam Deck it's in `data/`).
  The app finds Steam installs by itself, including other Steam libraries and SD cards. Its data is unpacked
  on your computer. Nothing from FTL is in the download, and nothing is ever sent to other players.
- **Single player → Create a match:** you against a bot. In the lobby's Rules you pick its ship (any player
  cruiser, a single-player enemy such as a Rebel Fighter or Mantis Bomber, or the Rebel flagship) and its
  **difficulty (0-100)**.
  - **0-60:** raises how well it plays: reactions, aim, volley timing, repairs, firefighting and power swaps.
  - **60-100:** it plays its best, and also gets up to +100% scrap to build with.
- **LAN tab:** Create a match, and your friend types the 4-letter code and joins.
  - Their app asks the network over UDP on port 47878, and only the computer holding that code answers.
  - If a code isn't found straight away, the app checks each address on the network directly (a few
    seconds).
- **Online tab:** the server address, used when you press Create or Join.
  - Blank means host on this computer. The app tries UPnP to open the port, and the lobby shows the public
    and LAN addresses to give your friend.
  - If your friend can't connect, forward TCP port 8787 on your router to your computer.
  - The address can also be a dedicated server.
- **Dedicated server:** a headless console program that hosts any number of matches (the
  `FTL-Arena-Server-*` downloads). Its options are `--port 8787`, `--ftl <FTL folder>`, `--data <folder>` and
  `--upnp`. Everyone types its address on the Online tab.
- **Host leaving:**
  - Mid-battle, the other captain wins by forfeit.
  - In the hangar, the other captain takes over as host.
  - A dropped connection mid-battle reconnects into its seat.

## Steam Deck
- **Download:** `FTL-Arena-x86_64.AppImage` (in Desktop Mode).
- **Make it runnable:** right-click → Properties → Permissions → *Is executable*, or `chmod +x`.
- **Add it to Steam:** Steam → *Add a Non-Steam Game* → browse to the AppImage.
- **In Gaming Mode** it starts fullscreen with controller support on, and the controller is read through Steam
  Input.
- **FTL:** the Steam version of FTL must be installed on the Deck (or its data copied there), so the first
  start can unpack it.

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
- **Per Scrap costs mode:** presets saved under one Scrap costs rule only show in lobbies with the same rule
  (ships from an FTL save show everywhere).
- **Where they live:** this computer only: the desktop app's data folder (`presets.json`), or the
  browser's storage.

## Scrap costs (Arena)
- **None:** the stock hull is free; only what you add costs scrap.
- **Ship expenses:** hulls cost scrap. The price is their stock crew, weapons and systems, plus a premium
  for how late FTL unlocks them (Kestrel A 725).
- **Tournament:** hull prices, plus weapons and augments priced by FTL rarity, and only items a normal run
  can give you (stock fits excepted).
- **Allowance:** switching to either raises the allowance to 1500.
- **Unobtainable items:** a separate rule, "Allow unobtainable crew, weapons and augments", gives the same
  ban in any Arena match.
- **Tuning:** all the numbers are in `packages/sim/src/pricing.ts`.

## Survival (single player)
- **Starting a run:** in a practice lobby, set **Game mode** to *Survival* on the Rules step. Pick a ship
  on the Ship step and you go straight to Launch. You fly its stock FTL loadout: no building and no
  presets.
- **The run:** battles come one after another against random single-player enemies that get tougher each
  jump. Every 5th battle is a mini-boss (a rival player cruiser, fully fitted out), the Rebel flagship turns up every 25th, and hazards now and then. Hull, crew (health,
  skills and losses), system damage, missiles and drone parts carry over, and so do enemy boarders you
  didn't finish off.
- **After a win:** the ship carries on for 15 s (60 s if enemy boarders are still aboard, dropping to 15 s once they're dead), so the crew can repair, put out fires and deal with
  boarders while FTL's jump drive charges. Then time stops and you pick one of 3 reward cards ("+1 choice" cards raise it to 5; re-rolls, 2 to start and 1 per boss or mini-boss, deal a fresh hand):
  - gear (white, green, blue, or **gold** for rare finds);
  - a weapon upgrade (damage, shots, charge time or power);
  - a system level, reactor or crew;
  - repairs and supplies, worth about the same as the gear on offer.

  Gear the ship can't take never shows up. Picking a card makes the jump.
- **Losing the ship** ends the run with a score: battles, bosses and rewards. The best score is kept on
  this computer.
- **Tuning:** the numbers live in `packages/sim/src/survival.ts` (`SURVIVAL`) and are first guesses.

## Controller (experimental)
- **Turning it on:** in the main menu, **Settings** → *Controller support*. It's off by default. The tab
  shows the connected pad and its button map.
- **Pads:** any pad the browser reports with the standard mapping works: Xbox, DualSense/DS4, Steam
  Controller / Deck (through Steam Input).
- **What you control:** with it on, the AI runs your crew and reactor, but leaves alone any gun or system
  you've powered up or down yourself, and crew you've sent to the teleporter. You aim, board, hack and
  mind-control with **selector wheels**: hold the button, point the left stick at a segment, and let go.
- **Pausing:** the wheel pauses the game when the lobby's pause rules allow (practice and Survival always).
- **Buttons** (in battle, each button's icon sits beside what it works):
  - **A/B/X/Y**: weapons 1-4.
    - Tap to power the gun up.
    - Hold for the room wheel: crew are grouped by room, and there's an empty-room slot. A pick always
      autofires. The middle ("None") clears the target and still powers the gun.
  - **RB**: teleport. Hold to send a crew member to the pad, tap to beam over.
  - **LT**: hold to bring a boarder back.
  - **RT**: hacking. Hold to aim the drone, tap to pulse.
  - **D-pad:**
    - **↑**: mind control (hold);
    - **←**: cloak;
    - **→**: battery;
    - **↓**: doors. Once opens the interior doors; again opens the airlocks too.
  - **LB:**
    - **Hold** for the systems wheel. Point the stick at a system, then **D-pad ↑/↓** powers it up or down
      (weapons and drones one at a time).
    - **LB + a button**: powers that gun or system down. The teleporter going off hands its crew back to the
      AI.
    - **LB + ↓**: closes the doors round your crew; again, every door.
  - **Start**: pause.
  - **AUTOFIRE:** with a controller there's no AUTOFIRE button: wheel picks always autofire.
- **Menus:** the D-pad moves a gold ring; **A** presses, or edits a number or list (D-pad to change, A to
  submit, B to cancel).
- **Lobby:** a gamepad icon shows beside players on a controller.

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
| Match menu (resume / quit) | `Escape` |
| Reorder weapons | drag a weapon box onto another slot (the guns swap mounts) |
| Autofire | the AUTOFIRE button sets the default for new targets (yellow reticle); Shift-click a target to do the opposite |
| Weapons system | click its icon to power the next weapon, right-click to unpower the last |

## What's in the game
Every FTL system, under FTL's combat rules, in real time.
- **Systems:** shields, engines, piloting, oxygen, medbay and clone bay, weapons, drones, sensors, doors,
  teleporter, cloaking, hacking, mind control, the battery and the Federation artillery. All of them run on
  reactor power, and all take system damage, ion and repairs.
- **Weapons:** lasers, burst lasers, missiles, ion, beams, flak, bombs, and chain and charge weapons. Each
  flies at its FTL speed.
- **Drones:** combat, defense, anti-drone and hull-repair drones outside; anti-personnel, system-repair and
  boarding drones inside.
- **Crew:** all eight races with their traits, skills, manning bonuses, firefighting, repair, healing,
  boarding and hand-to-hand fights.
- **Hazards:** fires, breaches, O2 per room, venting through airlocks, suffocation, plus optional battle
  hazards (Rules).
- **Sensors and fog,** enforced by the server: you see only what your sensors would show in FTL.
- **Hulls:** all 28 player cruisers, including the C variants. Single-player enemies and the Rebel flagship
  (stages 1-3) are opponents.
- **Augments:** FTL's prices. Campaign-only ones (scrap, FTL jumps, the map) are kept and marked as having no
  effect in the arena.

Every combat number and where it comes from is in [RULES.md](RULES.md).
