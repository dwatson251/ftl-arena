# Design: clone bay, drones and hacking (next round)

These are the three systems still missing from the arena. All three need the same groundwork first:
**a second kind of thing that moves through space** (drones) and **crew that can die and come back**
(cloning). Teleporter/boarding and crew-vs-crew combat come after, because hacking and boarding drones
both lean on them.

Every number below is to be read from the owner's blueprints where FTL has one. Constants that aren't in
the data go in `rules.ts` with an evidence level, as today.

## 1. Clone bay (replaces the medbay in the same room)
**Data:** `<clonebay>` already sits in each hull's `systemList`, sharing the medbay's room. In
`systemBlueprint name="clonebay"`, levels 1-3 set clone time and the skill loss.

**Hangar:** medbay and clone bay are exclusive. The Systems step gets a toggle on that room ("Medbay ↔
Clone bay"), priced like an install.

**Sim:**
- When a crew member dies, the ship gets a `cloneQueue` entry `{crewId, progress}`. Instead of `dead`, the
  crew member is `cloning`.
- With the clone bay powered, progress advances at 1/(clone time) per second.
  - It pauses while unpowered or destroyed.
  - If the bay is destroyed, the queue keeps its progress. That's FTL's rule, checked in the parity pass.
- On completion the crew member respawns in the clone bay room with full HP, minus the skill-XP penalty
  for the bay's level.
- Win conditions: "crew lost" now means no living crew and no crew that can still clone, i.e. the queue
  is empty or the bay can't run. This is the main rules change. The crew-kill mode becomes harder against
  clone-bay ships, as in FTL.
- Out of combat, FTL's clone bay also heals a little each jump. The arena has no jumps, so that's skipped.

**Client:**
- `img/ship/interior/clone_*` art: the bay's top and bottom pieces plus the gas effect while cloning.
- The crew list shows the clone progress with `systemUI/clonebar_small_*`.
- `cloning_death_mask` on the portrait.

**Bot:** keep the clone bay powered. Above level 0.5, accept higher-risk repairs in burning or
suffocating rooms when the bay is up.

## 2. Drones
**Data:**
- `droneBlueprint`: type (COMBAT, DEFENSE, BATTLE (anti-personnel), REPAIR, BOARDER, HACKING, SHIP_REPAIR),
  power, cost, speed and cooldown, and `droneImage`.
- `droneList` / `droneSlots` on hulls, drone parts (`drones="N"`), the `drones` system with levels 1-8.

**Sim, a new `DroneState`:**
- `{id, owner, bp, deployed, power, x, y (space or ship coords), targetId, cooldown, hp}`. The drones
  system's power bars are spent like weapon power. Deploying a drone costs one drone part.
- **Combat drones:** they orbit the enemy ship on a fixed ellipse, the window's shield ellipse. On their
  own cooldown they fire a projectile like their weapon (laser: dmg 1). That projectile uses the existing
  projectile and hit pipeline, so evasion and shields apply.
- **Defense drones:** they orbit their own ship. Each tick, an enemy projectile with
  `drone_targetable=1` (missiles; lasers too for the Defense II drone) within range, and not yet
  targeted, gets a shot that destroys it after a short travel time. This is the first time
  projectiles can be shot down: projectiles get an `intercepted` flag, plus a "drone shot" event for the
  client.
- **Anti-ship hacking drone** (the Hacking system's drone): see below.
- **Interior drones** (system repair, anti-personnel, boarder) need crew-style movement inside a ship. They
  reuse `CrewState` with a `drone` flag (no O2, no medbay, "repair" or "fight" behaviour only). They come
  with boarding.
- **Losing a drone:** when the drones system loses power or bars, drones are recalled or destroyed in
  power order, as FTL does with weapons.

**Hangar:** a fifth step, **Drones** (weapons-style store, drone slots, drone parts). The hull list
shows each hull's starting drones (the Engi hulls depend on them).

**Client:**
- `img/ship/drones/*` sprites; combat drones orbit the enemy view and defense drones orbit ours.
- The drone tray is FTL's drone box next to the weapons tray, using `weapbox_icon_D_*` icons.
- The defense drone's interception beam reuses the beam line.

**Bot:** at level 0.3 and up, deploy whatever is powered; prefer defense drones when the opponent carries
missiles. At 0.6 and up, power drones before the second weapon when it's a combat drone.

## 3. Hacking
**Data:** `systemBlueprint name="hacking"`; levels 1-3 set the hack pulse duration.

**Sim:**
- **Launch:** the hacking drone is a projectile that can be shot down by defense drones and is blocked by
  layers it can't pierce (FTL: shields stop it only while it travels; check in the parity pass). On
  arrival it latches onto the targeted enemy room's system for the rest of the match.
- **Passive effect** while the hacking system is powered (purple tint): the system can't be repaired
  faster than normal, and its doors are locked.
- **Pulse:** the active button triggers it. Each system type gets its own effect for N seconds by level:
  - shields: −1 layer per second;
  - weapons: charge drains;
  - engines/pilot: evasion 0;
  - O2: drains;
  - medbay: damages crew;
  - doors: all doors lock, enemy crew can't open them;
  - sensors: blind;
  - drones: recalled;
  - clone bay: progress drains.

  Then a cooldown.
- **Commands:** `launchHack(room)` and `hackPulse()`.
- **View:** the hacked system shows `s_hacked*` on both sides.

**Client:**
- `systemUI/button_hack*` for the hacking button.
- `combatUI/box_hostiles_shield2_hacked*`.
- The purple door row in `door_sheet.png` (row 5).
- `warnings/danger_hacking.png` for the victim.

**Bot:** hack shields if the opponent has more than 2 layers, otherwise weapons. Pulse when its own
weapons are about to fire.

## Order of work and tests
1. Clone bay, with tests for respawn, the crew-loss rule and pausing when unpowered.
2. Drone system and parts, then defense drones (projectile interception test), combat drones (orbit and
   fire test) and the hangar Drones step.
3. Hacking: drone launch, latch, pulse effects (one test per system), and fog rules.
4. Teleporter, boarding, crew-vs-crew combat and interior drones.

For each one, the bench ladder (`tools/bench/ladder.ts`) checks the bot still scales, and
`tools/align/compare.ts` checks the new UI against a real FTL screenshot of that system.
