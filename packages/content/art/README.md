# Backup art

Art for anything the player's FTL install doesn't supply, at the same path it has under the extract's
`img/` folder, for example `img/ship/kestral_base.png` or `img/ship/interior/room_pilot.png`. The server serves
these files when the install has none, and lists them in `/assets/manifest.json` so the client asks for them.

Only art made without FTL's copyright belongs here: your own drawings, or generated art you have the rights
to. Never copy FTL's own files in.

Each content class names where its sprites live (`sprites` on ships; the animation names on weapons and
drones), so the path to draw is the class's `dir` plus its file stem.
