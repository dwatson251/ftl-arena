# Changelog

## 0.1.0-alpha.3
- **Menus and lobby:**
  - an FTL-style main menu (Single player goes straight to a practice lobby);
  - a first-launch prompt for your captain's name;
  - the lobby without its sidebar: the code, "Player vs Player" with Ready / Building / Waiting, and Leave;
  - everyone can read the Rules (two columns on wide screens);
  - FTL's hangar shown behind the builder.
- **Chat in battle:** press Enter, type, Enter. Messages appear briefly above the weapons.
- **Rule modifiers** (Arena): Bare, No drones, No augments, No missiles, Crew combat only.
- **Tournament:** big builds cost more and more. Weapons are dearer, every extra weapon, augment or crew
  member costs more than the last, and system levels and reactor bars rise steeply. Crystal crew only come
  with a hull.
- **Survival:**
  - enemies grow along two tracks (scrap or skill each battle, never far apart);
  - power settings carry between jumps;
  - losing the crew after a battle ends the run;
  - ordinary battles no longer all bring the same ship.
- **Crew AI:**
  - crew finish what they start and heal to full;
  - defenders are matched to the boarders' strength, leaving the least important stations first;
  - enemy crew always defend and repair;
  - boarders go for shields, weapons and piloting.
- **Controller:**
  - L1 systems wheel with D-pad power;
  - doors on D-pad up/down, mind control on R3;
  - button icons beside the HUD;
  - L1/R1 and the left stick in menus;
  - Survival cards picked by button;
  - your own crew orders respected (a quiet room's computer is manned for 5 s);
  - no wheel for a gun that can't be powered.
- **Fixes:**
  - the teleporter is ready at the start, and sends everyone on the pad;
  - Zoltan Shield Bypass works through super shields;
  - the Ion Stunner and Stun Bomb stun, with FTL's stun stars;
  - mind control reveals the room;
  - the medbay heals anyone in it;
  - hacking needs a drone part;
  - the intruder alert works without sensors;
  - a dying ship shows only its exterior;
  - Type C hulls get their floor art;
  - smoother repair bars;
  - saving a preset under a taken name asks first, then overwrites.
- **Servers need no FTL:** each player's own app draws the game.
  - The dedicated server runs straight from the download, configured with an optional
    `ftl-arena-server.json`, environment variables or arguments.
  - It has an admin web page and API (status, lobbies and players, logs, settings).
  - New **FTL Arena Server** app (Windows, Linux): a window to set up, start and watch a server.
- **Under the hood:** the game's content (ships, layouts, loadouts, weapons, augments, crew, systems, FTL's
  text and crew names) now lives in the project. Only art and sound come from your FTL install.

## 0.1.0-alpha.1
The first public playtest build.
- **Multiplayer:** real-time 1v1 FTL combat over LAN (4-letter codes) or the internet, hosted from the app
  or a dedicated server.
- **Combat:** every FTL system, weapon type, drone and crew race, and all 28 player cruisers, all under FTL's
  combat rules.
- **The hangar:** build your ship step by step, save presets, or load the ship from your current FTL run.
- **Single player:** bots from difficulty 0 to 100, single-player enemies, and the Rebel flagship.
- **Survival:** endless battles with reward cards between jumps, mini-bosses, the flagship, and hazards.
- **Rules:** win conditions, time limits, hazards, pause rules, and scrap-cost modes (None, Ship expenses,
  Tournament).
- **Controller support** (experimental), including the Steam Deck.
- **Downloads:** Windows (zip), Linux (tar.gz), and an AppImage for the Steam Deck and other Linux systems.
