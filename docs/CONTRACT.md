# Contract: browser ⇄ server

## Ownership
- **The server owns all game state.** It runs the only `Match`, at 30 ticks/s (`TICK_HZ`).
- Browsers send **commands** and render the **views** they receive. They never simulate.
- Commands apply at the start of the next tick. They're validated there (power limits, door system up,
  legal targets), and invalid ones are dropped silently.

## Transport
- One WebSocket at `/ws`, JSON text frames, permessage-deflate enabled, max client frame 64 KB.
- `PROTOCOL_VERSION = 1` goes in `hello`. On a mismatch the server sends `error` and nothing else.

## Messages
- **Client → server:**
  - `hello {v, name, token?}`
  - `create {config?, practice?}`
  - `join {code}`
  - `leave`
  - `config {partial MatchConfig}` (host only, lobby phase)
  - `loadout {Loadout}`
  - `ready {bool}`
  - `cmd {Command}`
  - `rematch`
- **Server → client:**
  - `welcome {v, token, db}`: the gameplay DB, so both sides agree on the numbers.
  - `lobby {LobbyState | null}`
  - `start {you: 0|1}`
  - `snap {MatchView}`: every 2 ticks (15 Hz). It carries all events since the previous snap.
  - `error {msg}`

## Units
- **Positions:** tiles. 1 tile = 35 grid px, and grid px are the layout's own pixels. The grid origin is
  the layout's room (0, 0).
- Beam and flak points are grid px on the *target* ship.
- **Time:** ticks; seconds = ticks / 30.
- **Chances in blueprints:** tenths (1 = 10%). Evasion is a whole %.

## Fog (what a view may contain)
`viewFor()` copies the state and strips what the viewer's sensors can't see:
- **Enemy interior** (crew, fires, breaches, O2): only with sensor power ≥ 2.
- **Enemy weapon charge, system power and reactor:** only with sensor power ≥ 3. Otherwise these fields
  are sent as -1.
- **Enemy targets and autofire:** never sent.
- **Your own ship with sensor power 0:** only rooms holding your living crew are listed in
  `visibleRooms`.
- **Events:** fire, breach and crew-death events on a fogged enemy are dropped from the snap.
- **After the match:** everything is revealed.

## Lifecycle
- **Lobby:** lobby → (both ready) countdown 3 s → battle → over → (rematch) lobby.
- **Disconnects:** a disconnect mid-battle holds the seat for 20 s (the token in `hello` resumes it), then
  forfeits. Leaving on purpose forfeits at once.
- **Cleanup:** empty lobbies outside battle are removed within a second.
