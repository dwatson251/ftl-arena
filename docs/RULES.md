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
| O2 | refill 1.2 / 3 / 5 %/s by oxygen power; −0.35 %/s with none; breach −3 %/s per tile scaled to room size; open airlock −15 %/s; open doors equalise | est |
| Suffocation | below 5 % O2, 5 HP/s | est |
| Medbay | 6.4 / 16 / 25.6 HP/s by power | est |
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
