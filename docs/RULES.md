# Combat rules and where each number comes from

All tuning lives in `packages/sim/src/rules.ts`. Blueprint values (each weapon's damage, shots, cooldown,
power, shield piercing, fire/breach/stun chance, ion, sysDamage/persDamage, flak pieces, charge levels,
chain boosts, prices, each system's max level and upgrade costs, hull, reactor, crew count) are read **at
runtime from your own blueprints** and aren't repeated here.

**Evidence levels:**
- **bp:** read from the owner's blueprints.
- **wiki:** community-documented value, not yet measured here.
- **est:** an estimate picked for playability.
- **measured:** timed in the real game (see the parity pass below).

| Rule | Value | Level |
|---|---|---|
| Tick | 30 Hz, fixed step, integer ticks | design |
| Tile | 35 px | wiki / bp layouts |
| Evasion by engine power 0-8 | 0, 5, 10, 15, 20, 25, 28, 31, 35 % | wiki |
| Manned helm / engines bonus by skill 0-2 | +5 / +7 / +10 % each | wiki |
| Autopilot (helm unmanned) by pilot level | L1 none, L2 50 %, L3 80 % of evasion | wiki |
| No evasion when | engines or helm unpowered/destroyed | wiki |
| Shield layers | floor(usable shield power / 2) | wiki |
| Shield layer recharge | 2.0 s per layer, manned +10/15/20 % | est |
| Projectile vs shields | each projectile blocked by a layer removes 1 layer; `sp` ignores that many layers | wiki |
| Beam vs shields | beam damage minus shield layers; layers aren't removed | wiki |
| Bombs | ignore shields and evasion, never hit the hull | wiki |
| Weapon charge | 1 s/s, manned weapons +10/15/20 %; unpowered drains at 3× | wiki / est |
| Volley spacing / flight time | 0.3 s between shots (each with its own sound and fire animation; FTL data has no field for it); laser 1.0 s, flak 1.1 s, missile 1.5 s, bomb 0.8 s, beam sweep 1.0 s | est |
| Crew damage | 15 HP per point of (damage + persDamage) to everyone in the room | wiki |
| Human HP | 100 | wiki |
| Fire / breach / stun chance | blueprint value × 10 % | wiki |
| Ion | each point locks a bar for 5 s (stacks refresh the timer) | wiki |
| Crew speed | 2.2 tiles/s | est |
| Repair | 1/6 bar per second per crew, +10/20 % by repair skill | est |
| Firefighting / breach repair | 28 / 20 fire or breach HP per second per crew (100 HP per tile) | est |
| Fire | spreads 5 %/s per burning tile (through open doors only), starves below 10 % O2, uses 1.2 % O2/s, burns crew 8 HP/s, one system bar per 10 burning-tile-seconds | est |
| O2 | refill 1.2 / 3 / 5 %/s by oxygen power (est); −1.2 %/s with the system off (wiki); breach −3 %/s per tile scaled to room size; open airlock −15 %/s; open doors equalise | est / wiki |
| Suffocation | below 5 % O2 (where FTL's warning stripes appear), 5 HP/s | wiki / est |
| Medbay | 6.4 / 9.6 / 19.2 HP/s by power; it heals crew fighting in it | wiki |
| Skill XP thresholds | pilot/engines 15/30, shields 55/110, weapons 65/130, repair 18/36 | wiki |
| Store prices | blueprint `cost`; missiles 6; crew from the race blueprint; sell refund 50 % | bp / wiki |
| Reactor price | 30 + 5 per 5 levels above 5 | est |

## Races
- **Traits:** `RACES` in `rules.ts`, all at wiki level.
  - Engi repair ×2. Mantis speed ×1.2, repair ×0.5. Rockman 150 HP, fire-immune, speed ×0.5.
  - Zoltan 70 HP, +1 power to the system in its room. Crystal 125 HP, suffocation ×0.5, speed ×0.8.
  - Lanius doesn't suffocate and drains 1.5 % O2/s from its room (est). Slug is telepathic: it sees enemy
    crew.
- **Repair multiplier:** it also scales firefighting and breach repair.
- **Combat multipliers:** recorded for boarding in v2.

## Rules specific to the arena (not in FTL)
- **No pause.** Both ships run in real time.
- **Simultaneous processing** alternates which ship goes first every tick, so neither side always wins
  ties. In bot-vs-bot mirrors this went from 20/20 for ship 0 to 7/13 over 20 seeds.
- **Charge weapons on autofire** wait for full charge. A manual target fires whatever is stored.
- **Kill-the-crew mode** floors hulls at 1.
- **Starting crew:** a hull's per-race `<crewCount>` entries give its starting crew, free. Hiring costs the race's
  blueprint `cost`.
- **Opening power plan:** shields, then engines, then 1 bar of oxygen, then weapons in slot order, then the medbay.

## Parity pass (to do)
Values marked **est** still need measuring against real single-player FTL:
1. `um backup` the saves.
2. Start a run and record combat with `um win record`.
3. Time charge, recharge, repair, fire and O2 from contact sheets.
4. Move the measured values here as **measured**.

Driving the real game needs the owner's go-ahead, because it takes over their mouse and keyboard.

## Crew, stations and sensing (round 6)
| Rule | Value | Source |
|---|---|---|
| Station refill | An idle crew member in the room steps onto a station when it's left empty | FTL behaviour |
| Telepathy / life scanner | Enemy crew appear as anonymous dots: location only, no race, health or action | FTL behaviour |
| Medbay / clone bay | Share one room; installing one removes the other, and removing a swapped-in bay restores the hull's original | FTL |

## Boarding (round 7, estimates unless noted)
| Rule | Value | Source |
|---|---|---|
| Teleporter recharge | 20 / 15 / 10 s at levels 1-3; drains when unpowered | est (wiki) |
| Teleport | Up to 4 own crew standing on the pad, into free tiles of the target room; retrieve brings own crew back from a room | FTL |
| Zoltan super shield | Blocks teleporting and boarding drones | FTL text ("super shields prevent teleporting") |
| Tiles | One crew member per side per tile, so a defender and an intruder can share a tile | FTL |
| Melee | 6 HP/s × race combat (Mantis 1.5, Engi 0.5) × (1 + 10%/20% combat skill) | est |
| Sabotage | A boarder alone in a system room breaks a bar every ~8 s (×race combat); boarding drones 2×; ion intruders ionise instead | est |
| Doors | Intruders break closed doors: 2 / 4 / 7 / 11 / 16 s for no doors system / levels 1-3 / super doors | est |
| Medbay | Heals only its own ship's crew | assumption |
| Dead boarders | Go home to their owner's ship, where its clone bay can bring them back | FTL |
| Crew-kill win | Counts a player's crew aboard either ship; drone units don't count | |
| Anti-personnel drone | 150 HP unit, hunts intruders on its own ship | est |
| System repair drone | 70 HP unit, repairs damaged systems, can't fight | est |
| Boarding drone | Flies 2.4 s (defense drones can shoot it down), breaches its landing room, then a 150 HP unit wrecks systems | est |

## Cloaking and hacking (round 8; effects from FTL's text, timings estimated)
| Rule | Value | Source |
|---|---|---|
| Cloak | +60 evasion; enemy weapons stop charging while it lasts | FTL tooltip text |
| Cloak duration / recharge | 5 / 10 / 15 s by level; 20 s recharge after | est ("Cloak: N seconds") |
| Hacking drone | Uses a drone part, flies 2.4 s (defense drones can shoot it), blocked by a Zoltan shield | FTL text + est |
| Attached drone | Locks the system's power ("SYSTEM LOCKED") and shows its room to the hacker | FTL |
| Pulse | 4 / 7 / 10 s by level, then a 15 s recharge | est |
| Pulse effects | shields drained, engines/helm evasion 0, sensors off, oxygen drains, medbay hurts its crew, weapons drain charge, drones frozen (1 in 3 destroyed), teleporter recalls the enemy's boarders, cloaking off, hacking off, clone bay queue killed, doors become blast doors for their own crew | FTL `hack_*` texts |
| Fog | Unseen rooms are flat #373737 (sampled from the real game); doors and room glyphs stay on top | measured |
| Ion display | The icon becomes a numbered blue badge (stacks left) inside one segmented timer ring | FTL art `icons/locking/s_ring_*` |

## Doors, locks and drone units (round 9)
| Rule | Value | Source |
|---|---|---|
| Enemy hull | Always visible; unseen rooms stay grey until sensors | user correction |
| Crew passing a door | Opens it while they cross (animation and sound), then it shuts | FTL |
| Broken door | Opens for 4 s (with the normal opening sound), then shuts again | est |
| Hacking drone (powered) | Locks its room's doors: the owner's crew must break them; the hacker's crew walk through whatever the door level | FTL |
| Hacked medbay | Never heals; hurts its own crew while pulsed | FTL |
| Drone units | Repair themselves in their own drone room, at medbay level-1 speed; go home below 40 % | user rule |
| Boarding drones | Never player-controlled. They land in a random room (breaching it), then wander system rooms wrecking (or ionising) them. They fight only what's in their room. | FTL |

## Final systems (round 10; effects from FTL's text, timings estimated)
| Rule | Value | Source |
|---|---|---|
| Enemy hull bar | Always visible and always green, whatever your sensors | user rule |
| Battery (subsystem) | +2 / +4 reactor bars for 30 s, then locked 30 s (Battery Charger halves the lock); bars come off the least vital systems when it ends | FTL text ("Provides N bonus power") + est |
| Hacked battery | Takes 2 bars off the reactor while pulsed | FTL `hack_battery` |
| Mind control | Pick a room: its healthiest hostile crew member fights for you for 14 / 20 / 28 s; levels 2 and 3 add +30 % / +60 % health and damage; 20 s recharge after; a Zoltan shield blocks it | FTL `mind_1..3` text + est |
| Mind-controlled crew | Only fight (no orders, no work); still count as their owner's crew for the win | FTL |
| Artillery | Fires its weapon by itself when charged, at the aimed room or a random one; the Fed beam charges in 40 / 32 / 26 / 20 s by level and pierces all shields | FTL tooltip + est |
| Beams vs shields | Each layer takes a point off a beam, less the weapon's piercing | FTL |
| Rebel flagship | Stages 1-3 as single-player enemies: four / three / two artillery guns at their listed cooldowns, stage 2's drones, 8 crew (est; FTL places them by event) | blueprints.xml |
| Shield Overcharger drone | +1 super-shield point every 15 s, up to 5 | est |
| Cloak fire | Each volley fired while cloaked takes 1.5 s off the cloak (Stealth Weapons prevents it) | FTL augment text + est |
| Augments | Reconstructive Teleport (full heal on teleport), Hacking Stun (stun for the pulse), Zoltan Shield Bypass (teleport, bombs and mind control through super shields) | FTL text |

## Round 11 fixes
| Rule | Value | Source |
|---|---|---|
| Repair progress | Kept while the ship's own crew stay in the room (fighting or firefighting pauses it); lost when the last of them leaves | FTL |
| Ion ring | 12 dashes; the current one fades out smoothly over its share of the stack | FTL art |

## Round 12
| Rule | Value | Source |
|---|---|---|
| Crew guns | Fighters shoot a target on another tile (and shoot doors they break); up close they punch | FTL |
| Teleporting | 1 s beam-out, then 1 s beam-in, using FTL's `<race>_teleport` animation; can't act meanwhile | FTL anim + est |
| Sabotage | ~20 s per system bar for a 1× race (was 8 s) | est, slowed per play |
| Lanius | Drains its room's oxygen like a one-square hull breach; moves 20% slower | FTL wiki |
| Hacked room | Breach and system repairs there take twice as long | FTL wiki |
| Drones | Launch 1.5 s after powering; a destroyed drone loses power, rebuilds for 10 s, then waits for the player to power it | est |
| System limit | At most 8 systems installed (subsystems don't count) | FTL |
| Cooldown locks | Cloaking, hacking, mind control and the battery show their recharge on the icon like ion (FTL's octagon art: number = 5 s rounds left) | FTL art |
| Mind control recharge | Starts when control ends | FTL |

## Round 13
Sources: the FTL wiki (read through its MediaWiki API) and xftl, an independent FTL rebuild whose author
documented the game's code (gitlab.com/znixian/xftl, its `doc/` notes and UI code).

| Rule | Value | Source |
|---|---|---|
| Crew fights | Each swing lasts 1-1.3 s, picks its target when it starts (whoever shares the tile, else anyone in the room) and keeps it; damage lands half-way. Sharing a tile is a punch (the ship's crew face down, intruders up); otherwise a shot. Drone units never punch. Average damage unchanged | xftl |
| Medbay / clone bay | The equipment blocks one tile (the blueprint `<slot>`, default 1; `-2` none), so a 2x2 bay holds 3 | xftl |
| Clone bay | One at a time, in the order they died; off for 3 s, it loses the last in its queue (Backup DNA keeps it); FTL's `<race>_clone` animation, `cloneArrive` sound | wiki / xftl |
| Drones | A deployed drone that loses power goes offline (stays, idle) until powered again, without a new part; clicking the drone system never launches one | xftl |
| Boarding drones | Land in a system room; then head for the nearest working system | wiki / user |
| Mind control | Controlled crew stay AI-driven: aboard their own ship they wreck the nearest working system and fight in the way; aboard the controller's they fight intruders and fix things | xftl notes ("standard intruder/crew AI") |
| Hacked weapons | Can't fire; the charge building up drains, stored charges are kept; the hacker sees the guns' charge | wiki |
| Enemy AI crew | FTL's CrewAI task priorities: heal (below 25 %) 0, shields repair 1, boarders and fires system + 16, breaches + 32, repairs + 48, stations 64-70; each task to the nearest free crew member | xftl `doc/crew-ai` |
| Enemy AI boarding | One party per fight; if it dies, no more are sent | user |
| Bot crew | The hangar bot hires up to 5; single-player hulls carry at most 6 (the flagship more), and bring their augments (Zoltan ships start with a full Zoltan shield) | user / blueprints |
| HUD | FTL's system row: shields, engines, medbay, clone bay, oxygen, teleporter, cloaking, artillery, mind, hacking, weapons (tray inline), drones (tray inline); button systems take 54 px. Cloak, hacking (after its drone lands) and battery buttons grow with power; the timer shows 2 + 3n bars; mind control's is always two high | xftl `PlayerShipUI`, `SystemPowerButton` |
| Subsystems | Piloting, sensors, doors, then the battery right-most | xftl |
| Chain / charge weapons | Their `<boost>` glow lights up on the gun; no pips in the tray | animations.xml |
| Death and repair sounds | Per race (`engiDeath`, `mantisDeath`, `rockDeath`, `crystalDeath`, `energyDeath`, `shrikeDeath` for Lanius, female names get `femaleDeath*`); Lanius repair `shrikeRepair`; Rockmen and Crystals hammer (`rockThud*`, a guess) | sounds.xml |

| Clone bay and the crew win | With every crew member dead, the player stays in while the clone bay has someone queued; once it's destroyed (no one left to repair it) they lose, Backup DNA or not | user |
| Unrestricted hangar | Weapons up to weapon slots × the hungriest weapon's power, drones up to drone slots × the hungriest drone's, and the reactor up to the hull's eight biggest systems at their maximum | user |

## Pausing (experimental; FTL itself is single player and pauses freely)
| Rule | Value | Source |
|---|---|---|
| Modes | Off; tactical timeouts; pause clock (lobby rules) | design |
| While paused | No time passes (the tick, the time limit and every timer stand still) but orders still go in: power, targets, doors, crew paths, abilities queued | design, like FTL's pause |
| Tactical timeout | Every 60 s of play (15-600) for 10 s (3-60), warned 5 s ahead (FTL's flagship surge warning, then a beep a second); ends early once both captains press Space; the practice bot is always ready | design |
| Pause clock | Space pauses everyone and spends your own 60 s (10-600); Space resumes; it resumes by itself when your clock is empty; the other captain can't resume it; unused time comes back at 5 s per minute of play (0-60) | design |
| Practice | Defaults to an unlimited clock (0), i.e. FTL's free pause | design |
| Time-stop effects | The world freezes under a cold blue wash with FTL's blinking PAUSED; the music winds down like a tape to half speed an octave lower and holds as a drone, other loops fall silent under a low hum; FTL's cloak whoosh on stopping, decloak on resuming | design |

## Boarding nits
| Rule | Value | Source |
|---|---|---|
| Doors vs intruders | No door system or level 1: intruders open the door and walk through; level 2+ (or a manned level 1) must be shot down; a hacking lock counts as level-3 blast doors | wiki |
| Shooting | Fights, door breaking and system wrecking all fire a shot each swing (~1-1.3 s): the gun's firing frames, a bolt, a spark at the console, and FTL's small-arms sound (`crewLaser1-3`); punching plays FTL's brawling loop | FTL sounds.xml + design |

## Round 15
| Rule | Value | Source |
|---|---|---|
| Flak | All pieces leave at once and spread over the target area | FTL |
| Autonomous ships (replaces kill-the-crew) | Only destruction wins. With none of its crew alive aboard, a ship runs itself: its helm flies without a pilot (no manning bonus) and damaged systems mend at 0.08 bar/s each, except in rooms with intruders | user, like FTL's drone ships and the flagship; repair rate est |
| Wrecked systems | A system destroyed by boarders or fire (not a weapon hit) costs its ship 1 hull | wiki |
| Door sieges | Intruders' shots at a door add up; a boarder sent to a room joins a siege already under way on a door into it | FTL / wiki |
| Consoles | A player hull's manned system with no interior named gets FTL's stock one for its room's shape, so its computer is drawn and the station sits at it | FTL default interiors |
| Saved stations | Default to where the crew start | user |

## Sensors (wiki)
| Level | Shows | Source |
|---|---|---|
| 1 | Your own interior | wiki |
| 2 | The enemy interior (crew, fires, O2); a cloaked enemy's interior is hidden, but its crew are still read | wiki |
| 3 | Enemy weapons' charge | wiki |
| 4 (manned 3) | Enemy systems' power, bars, ion and repair or sabotage progress (shown as bars over their icons) | wiki |
| Flagship | Holds sensors to level 2 | wiki |
| Telepathy (Slug, Lifeform Scanner) | Live crew in unseen rooms are sensed (never drones): Slugs as dots, the scanner as silhouettes with race and action; set per source in `RULES.senseStyle` | owner's memory (the wiki says they match) |
| Slug | Also sees into every room touching its own, walls or not, on whichever ship it stands | wiki |

## Round 16
| Rule | Value | Source |
|---|---|---|
| Automated ships | Repair each damaged system at a third of a human's speed (37.5 s a bar), never in a room with fire or a breach (a fire also loses the progress) or intruders; undamaged systems count as manned (skill 0), even hacked | wiki (AI-Controlled Rebel Ships, The Rebel Flagship) |
| Rebel flagship | When its crew are dead its AI takes over (it runs itself, as above); killing its crew doesn't win | wiki |
| Flagship layout | Normal difficulty's (boss_N_easy): the weapon rooms are isolated, one crew member in each; above 70 bot difficulty, Hard's (corridors to the laser and missile rooms) | wiki / game data |
| Flagship guns | Artillery N draws its weapon on mount N and fires from it | game data |
| Flagship stages 1-2 | Beaten, it takes a few blasts and jumps away instead of breaking up | FTL |
| Automated opponents | AUTO_BASIC and AUTO_ASSAULT, no crew, running themselves | game data |
| Bot difficulty | Caps fitted weapons (1-4), shield layers (1-4) and engines by difficulty; everything is bought within the match scrap plus the difficulty's bonus (single-player hulls too) | user |
| Sounds | Each weapon's own hit, shield and miss sounds; beams sizzle on contact; a weapon coming ready chimes (FTL's weaponReady) unless it's on autofire | game data |
| Beams | Drawn as a continuous beam from beyond the target view, its tip sweeping the aimed line, FTL's contact flare at the tip, stopped at the bubble by shields it can't pierce; aiming shows the line following the mouse | FTL |

## Hazards (lobby rule "Hazard"; wiki + xftl)
| Hazard | Effect, on both ships alike |
|---|---|
| Red giant | A solar flare every 28-34 s, warned 5 s ahead: 1-2 fires with shields up (any layer, or a Zoltan shield), 3-6 without, 1-2 per room; each such room has a 33 % (1 fire) / 66 % (2 fires) chance of 1 hull and system damage |
| Pulsar | An ion pulse every 11-18 s, warned 5 s ahead: 2 systems ionised by 1 + half their power (subsystems by their level), the shields always one while powered; a Zoltan shield soaks it (3-4 off it); Reverse Ion Field can resist it |
| Asteroid field | FTL's wave machine (lulls and two wave kinds) timed by each ship's own shield bubbles; each rock can be dodged, takes a shield layer, can be shot down by defense drones, else 1 hull and system damage with a small fire or breach chance |
| Nebula | Sensors off (Slugs and the Lifeform Scanner still sense crew) |
| Ion storm | A nebula, and both reactors at half (rounded up); battery and Zoltan power unaffected |
| Anti-ship batteries | Every 20-30 s, warned 5 s ahead, a 3-damage shot that pierces shields, goes through a Zoltan shield untouched and always breaches; evadable, can't be shot down. In 1v1 they take turns at each ship (left out of Random) |
| Random | One of the first five |

## Round 17 fixes
| Rule | Value | Source |
|---|---|---|
| Shield Overcharger | One super-shield point after 8 / 10 / 13 / 16 / 20 s with 0-4 points; the timer restarts when it gets power back; shown as FTL's green bubble and energy-shield bars | wiki |
| Missile weapons | Can't be powered (nor auto-powered at the start) without missiles to fire | FTL |

## Lobby
| Rule | Value | Source |
|---|---|---|
| Launch countdown | 5 s once both captains are ready, a beep each second (sharper on the last); Unready or Escape calls it off; Ready (and the countdown) also on the Launch page | user |

## Survival (single player; all values are first guesses, `SURVIVAL` in packages/sim/src/survival.ts)
| Rule | Value | Source |
|---|---|---|
| Ship | The chosen hull's stock FTL loadout, with its missiles; building and presets are off | user |
| Difficulty | Battle n: 5 + 5(n−1), capped at 95. The bot's skill comes from `difficultyToBot`. The enemy is a random single-player hull via `enemyLoadout`, with budget 150 + 5d (more above 60) | est |
| Bosses | The flagship every 25th battle: stages 1-3 at 25, 50 and 75, then the Hard layouts from 100 | user |
| Mini-bosses | Every other 5th battle (5, 10, 15, 20, 30…): a random player cruiser with 30 hull and a full crew, fitted out by the bot's hangar on 250 + 6d scrap; no hazard. Its hand has an extra gear card, and the first is a tier better. 250 points | user + est |
| Hazards | From battle 4: a 12% chance of a random hazard (never with a boss) | user (rare) |
| Carried over | Hull and max hull; live crew aboard with their HP and XP (anyone left on the wreck is lost); system damage; missiles; drone parts | user |
| Reset at the jump | Fires, breaches, ion, O2, weapon charge, deployed drones (boarding drones are lost with their ship) | est |
| Boarders | Enemy crew still alive aboard at the jump come along, in the same tiles with their HP, and fight for the next enemy | user |
| Aftermath | 15 s (60 s if enemy boarders or boarding drones are still aboard when the enemy ship goes; once they're all dead the clock drops to 15 s if more is left) of the winner's own ship (crew, systems, air, power); nothing fires; orders and pause work. Then the sim pauses for the cards | user |
| Cards | Gear (weapon 5 : drone 2 : augment 2 weight; drones only with a drone system), a ship card (weapon upgrade, system level or install, reactor +2, crew), and supplies. A boss win adds a 4th card and makes the gear rare | user + est |
| Tiers | From FTL's price and rarity: T1 ≤ 35, T2 ≤ 55, T3 ≤ 75, T4 (gold) ≥ 80 or rarity 5. Tier weights at difficulty d: [max(0.4, 3 − d/25), 2, 0.5 + d/40, 0.12 + d/60] | est |
| Supplies value | Matches the gear card (at least 30 + 3n): hull 3, missile 6 (8 a card at most), drone part 8, and +1 max hull (plating) 12 once the hull is full | est |
| Weapon upgrades | +1 damage, +1 shot (lasers, bursts, missiles), −20% charge time, −1 power (minimum 1); 3 per gun; worth 25 each | user + est |
| Can it be installed? | The card is applied to a copy and priced with unlimited scrap; any rule error (slots, max level, augment limit, crew limit) drops it | — |
| Augments offered | Only the ones the arena simulates (no campaign-only scrap or fleet effects) | — |
| Score | 100 per win, 500 per flagship, 250 per mini-boss, 10 per card, 25 per rare card | user (arbitrary) |
| Autonomous ships | A Rules checkbox (no longer a Game mode). Only the hull counts, and builds may launch with no crew. Off in Survival | user |
| Boarding drones on board | Walk at half crew speed | user |
| Wrecking a system | The progress is the system's: boarders working it add together, a fight in the room pauses it, and it's lost only when the last boarder leaves | user |
| Low crew health beep | Once below 30% health, re-armed above it | user |
| Repair rate | One bar per 12.5 s for an untrained human (Engi 6.25 s, Mantis 25 s), plus the repair-skill bonus | FTL wiki |
| Reinforced system (Survival card) | Each stack: every bar takes 10% more punishment (1 + 0.1 × stacks; weapons, flares, fire, boarders; fractions carry). Repeat stacks on a system are rarer (1/(stacks+1)²) | user |
| Card choices (Survival) | 3 per hand; +1 choice cards to 4 (30% of hands) and 5 (7%, rare), cap 5 | user + est |
| Re-rolls (Survival) | 2 to start, +1 per boss or mini-boss beaten | user |
| Teleported bombs | Appear 0.3 s after firing, beep about 2.1 s, go off at 2.4 s (damage then) | user + FTL sound length |
| Unpowered guns | Lose their target, however they lost the power | user (FTL) |
| Flak (BURST) flight | 4.4 s (a quarter of the old 1.1 s) | user (guess) |
| Crystal Lockdown | Seals a room's doors 12 s (crew power: the crystal's room, 50 s recharge, ready after a jump; bomb: the room hit). Own crew wait; intruders shatter it with 6 s of shooting (est). Airlocks unaffected | FTL wiki + est |
