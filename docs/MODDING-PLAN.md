# Modding support: notes for a later plan

The goal is player-made ships: rooms and their positions, the systems in them, and sprites. This waits
until gameplay is solid. What's already in place:

- **Hull data:** a hull is just data. A `shipBlueprint` (systems → rooms, weapon/drone slots, hull,
  reactor, crew) plus a layout `.txt` (rooms, doors, offsets) and `.xml` (image offsets, mounts, gibs,
  ellipse). `packages/data/src/parse.ts` already reads exactly FTL's formats.
- **Mod format:** a mod could be FTL's own format, i.e. a Slipstream-style `.ftl` zip with
  `data/*.xml.append` and `img/ship/*.png`. Hyperspace/Superluminal-made ships would then load unchanged.
- **Loading:** the server already ships the gameplay DB to clients. Mods would merge into it on the server
  (one source of truth), and their images get served next to `/assets`.
- **To decide in the plan:**
  - validation (connected rooms, a system per room, mount count);
  - a hull editor in the browser (we have the renderer) vs. using Superluminal 2;
  - sharing (both players need the mod's art; the server could serve it);
  - the licence and attribution rules for mod authors.
