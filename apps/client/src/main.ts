import { Application } from "pixi.js";
import { baseSystemId, type GameDB } from "@ftl/data";
import { PROTOCOL_VERSION, type DebugInfo, type DebugOp, type LobbyState, type ServerMsg } from "@ftl/protocol";
import { parseUpgraded, type Card, type MatchView } from "@ftl/sim";
import { artReady, BACKDROPS, loadPresentation, PLANETS, preload, registerOfflineCache } from "./assets.ts";
import { loadFtlFonts } from "./ftlfonts.ts";
import { music, play, preloadSounds } from "./audio.ts";
import { presets } from "./presets.ts";

// Saved ship presets: read now (the loading screen also waits for them).
void presets.init();
import { Battle, LOGICAL } from "./battle.ts";
import { Hangar, hangarAfterBattle } from "./hangar.ts";
import { Net } from "./net.ts";
import { BTN, controllerEnabled, onPad, pad, setControllerEnabled, startPad } from "./controller.ts";
import { focusOn, isEditing, menuNav } from "./menunav.ts";
import { Chat } from "./chat.ts";
import { droneArtHtml, portraitHtml, sysIconHtml, weaponArtHtml } from "./art.ts";
import { applyPresentation } from "@ftl/content";
import { APP_VERSION, DEV_TOOLS } from "./version.ts";

const ui = document.getElementById("ui")!;
// The build tag, top right on every screen.
const buildTag = document.createElement("div");
buildTag.className = "build-tag";
buildTag.textContent = `Alpha ${APP_VERSION}`;
document.body.appendChild(buildTag);
document.title = `FTL Arena (Alpha ${APP_VERSION})`;
registerOfflineCache();

/** The loading screen (index.html): fill FTL's bar to k (0..1); done removes it. */
function loadingProgress(k: number, note?: string): void {
  const fill = document.getElementById("ld-fill");
  if (fill) fill.style.width = `${16 + Math.round(174 * Math.max(0, Math.min(1, k)))}px`;
  const plain = document.getElementById("ld-plain-fill");
  if (plain) plain.style.width = `${Math.round(100 * k)}%`;
  const n = document.getElementById("ld-note");
  if (n && note !== undefined) n.textContent = note;
}
function loadingDone(): void {
  document.getElementById("loading")?.remove();
}
const params = new URLSearchParams(location.search);
/**
 * The game server: ?server= in the address, else the last one typed in the menu, else this page's own (the
 * built-in one). Art and sound always come from this page's own server, i.e. the player's own extract; only the
 * match runs on the chosen server.
 */
let serverAddr = params.get("server") ?? "";
try {
  serverAddr ||= localStorage.getItem("ftl-arena-server") ?? "";
} catch {}
/** "1.2.3.4:8787", "myhost", "ws://…" or "" (this page's own server) → the WebSocket URL. */
function wsFor(addr: string): string {
  const a = addr.trim();
  if (!a) return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  if (/^wss?:\/\//.test(a)) return a.endsWith("/ws") ? a : `${a.replace(/\/$/, "")}/ws`;
  const hostPort = a.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return `ws://${hostPort.includes(":") ? hostPort : `${hostPort}:8787`}/ws`;
}
// The first connection is always to this page's own server (its game data feeds the loading screen); the address
// in the menu is only used when you create or join.
let wsUrl = wsFor("");
let netStatus = "connecting";
let name = "";
try {
  name = localStorage.getItem("ftl-arena-name") ?? "";
} catch {}

const app = new Application();
await app.init({ resizeTo: window, background: 0x07090f, antialias: true });
document.getElementById("game")!.appendChild(app.canvas);
app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

let db: GameDB | null = null;
let token = "";
let lobby: LobbyState | null = null;
let battle: Battle | null = null;
let hangar: Hangar | null = null;
let lastView: MatchView | null = null;
let debugInfo: DebugInfo | null = null;
let debugOpen = true;
let error = "";
let hasArt = false;
/** Mid-battle troubles: when the connection to the server dropped, and when the opponent's did. */
let lostAt: number | null = null;
let oppGoneAt: number | null = null;
/** The battle was ended here, not by the server (it's gone): only Leave makes sense afterwards. */
let localEnd = false;
/** How long a lost connection mid-battle waits for the server before calling it a forfeit by the host. */
const LOST_FORFEIT_S = 8;
/** The server's grace period for a disconnected captain (lobby.ts GRACE_MS). */
const GRACE_S = 20;

const net = new Net(wsUrl, name || "Captain");
const chat = new Chat((text) => net.send({ t: "chat", text }));
artReady.push(() => render());
net.on(onMsg);

/** The game's data has come (with our own presentation laid over it): load what it needs, then the menus. */
function welcomed(d: GameDB): void {
  db = d;
  // Survival: upgraded guns the run has fitted (a reconnect mid-run).
  if (lobby?.survival) Object.assign(db.weapons, lobby.survival.weapons);
  if (document.getElementById("loading")) {
    // Everything (art, fonts, sound effects) loads behind FTL's loading bar before the first menu.
    let fonts = false;
    loadingProgress(0, "");
    void preload(db, (k) => loadingProgress(k), [async () => (fonts = await loadFtlFonts()), () => presets.init().then(() => true), ...preloadSounds(db)]).then((ok) => {
      hasArt = ok;
      document.body.classList.toggle("ftl-fonts", fonts);
      loadingProgress(1);
      loadingDone();
      render();
    });
  } else render();
}

function onMsg(m: ServerMsg): void {
  switch (m.t) {
    case "welcome":
      token = m.token;
      // Controller play is per player: the server shows the icon and runs our crew and reactor.
      if (controllerEnabled()) net.send({ t: "controller", on: true });
      // The server sends only the game's data; how it looks is ours: FTL's art and words from our own
      // install when there is one, else flat shapes (or backup art).
      void loadPresentation().then((pres) => welcomed(pres ? applyPresentation(m.db, pres) : m.db));
      break;
    case "lobby": {
      const was = lobby?.phase;
      lobby = m.lobby;
      // A new Survival run (or none): its saved crew stations start over.
      if (!lobby?.survival || lobby.phase === "lobby") Battle.keptStations = null;
      // Survival: upgraded guns the run has fitted, so their names and art resolve here too.
      if (db && lobby?.survival) Object.assign(db.weapons, lobby.survival.weapons);
      if (battle) battle.survival = lobby?.survival ? { s: lobby.survival, phase: lobby.phase, at: performance.now() } : null;
      // The reward is picked: the FTL jump (the next battle's "start" ends it).
      if (battle && lobby?.phase === "jump" && was !== "jump") jumpOut();
      // Back in touch, but the server has no match for us any more (the host's game closed and came back,
      // or we reached a different server): the battle can't go on, and it wasn't us who left.
      if (battle && !lobby && lastView && lastView.winner === null) {
        endLocally("The host's game closed: victory by forfeit");
        break;
      }
      if (battle && (!lobby || lobby.phase === "lobby") && !localEnd) endBattle();
      const opp = battle && lastView && lobby?.players[1 - lastView.you];
      oppGoneAt = opp && !opp.connected && !opp.bot && lastView!.winner === null ? (oppGoneAt ?? performance.now()) : null;
      break;
    }
    case "start":
      quitMatch = false;
      if (battle) endBattle(); // debug restart, or Survival's next battle
      startBattle(m.you);
      if (battle && lobby?.survival) {
        battle.survival = { s: lobby.survival, phase: "battle", at: performance.now() };
        // Each battle is a new beacon: a fresh backdrop, sometimes with a planet.
        const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
        battle.backdrop = { bg: pick(BACKDROPS), planet: Math.random() < 0.6 ? pick(PLANETS) : undefined, px: 0.1 + Math.random() * 0.25, py: 0.2 + Math.random() * 0.6 };
      }
      if (jumpVeil) arrive();
      break;
    case "snap": {
      const wasOver = lastView?.winner != null;
      // The match menu says whether the game is paused: redraw it when that changes.
      if (escMenu && !!lastView?.pause !== !!m.view.pause) setTimeout(render, 0);
      lastView = m.view;
      debugInfo = DEV_TOOLS ? m.debug ?? null : null;
      // Quit out of a battle: its last snapshots (the forfeit) mustn't bring it back.
      if (!battle && quitMatch) return;
      if (!battle) startBattle(m.view.you);
      battle!.onSnapshot(m.view);
      if (debugInfo) {
        const had = !!document.getElementById("debug");
        renderDebug();
        if (!had) layoutBattle();
      }
      if (wasOver === (m.view.winner !== null)) return;
      break;
    }
    case "chat":
      chat.add(m.from, m.text);
      if (db) play(db, ["hoverBeep"], 0.4);
      break;
    case "error":
      error = m.msg;
      setTimeout(() => {
        error = "";
        render();
      }, 4000);
      break;
  }
  render();
}

/** Survival's jump: the ship fades out under its rear flare (battle.ts), then the view fades to black until the next battle. */
let jumpVeil: HTMLDivElement | null = null;
function jumpOut(): void {
  battle?.jumpOut();
  jumpVeil?.remove();
  const v = document.createElement("div");
  v.className = "jump-veil";
  document.body.appendChild(v);
  jumpVeil = v;
  setTimeout(() => v.classList.add("black"), 2100);
}

/** Out of the jump at the next beacon: the new battle fades in from black. */
function arrive(): void {
  const v = jumpVeil;
  if (!v) return;
  jumpVeil = null;
  v.classList.add("black");
  play(db!, ["jumpArrive"], 1);
  battle?.arriveIn();
  requestAnimationFrame(() => {
    v.classList.add("out");
    setTimeout(() => v.remove(), 1400);
  });
}

/** Which Survival hand has had its fanfare. */
let rewardJingleFor = -1;

/** The match menu (Escape, or the controller's Back/View): resume or quit to the main menu. */
let escMenu = false;
/** The menu paused the game (and so un-pauses it when it closes). */
let menuPaused = false;
/** We quit the battle from the menu: ignore its snapshots until a new one starts. */
let quitMatch = false;

function openMenu(): void {
  if (!battle || escMenu) return;
  escMenu = true;
  const v = lastView;
  // Pause only if this match lets us (a pause clock with time left; practice's is unlimited). Otherwise the
  // menu sits over the battle while it carries on.
  if (v && v.winner === null && !v.pause && v.config.pause === "clock" && (v.pauseBank?.[v.you] ?? 0) !== 0) {
    net.send({ t: "cmd", cmd: { c: "pause", on: true } });
    menuPaused = true;
  }
  play(db!, ["hoverBeep"], 0.8);
  render();
}

function closeMenu(): void {
  if (!escMenu) return;
  escMenu = false;
  if (menuPaused && lastView?.pause?.by === lastView?.you && lastView) net.send({ t: "cmd", cmd: { c: "pause", on: false } });
  menuPaused = false;
  render();
}

function menuOverlay(): HTMLDivElement {
  const o = document.createElement("div");
  o.className = "overlay esc-menu";
  const v = lastView;
  const versus = !!lobby && !lobby.practice && v?.winner === null;
  const bank = v?.pauseBank?.[v.you];
  const status = v?.pause || menuPaused
    ? bank !== undefined && bank >= 0 && v?.pause?.by === v?.you ? `Paused: your pause clock is running (${Math.ceil(bank)} s left).` : "Paused."
    : "The battle carries on behind this menu (this match doesn't allow pausing now).";
  o.innerHTML = `<div class="menu"><h1>MENU</h1>
    <p class="note">${esc(status)}</p>
    <div class="row" style="justify-content:center"><button class="primary" id="resume">Resume</button><button id="quit">Quit match</button></div>
    <p class="note">${versus ? "Quitting now forfeits the battle." : "Quitting goes back to the main menu."} Escape closes this menu.</p></div>`;
  o.querySelector("#resume")!.addEventListener("click", closeMenu);
  o.querySelector("#quit")!.addEventListener("click", () => {
    escMenu = menuPaused = false;
    quitMatch = true;
    net.send({ t: "leave" });
    endBattle();
    render();
  });
  return o;
}

/** What a reward card gives, as FTL's art: the gun, drone, system, crew member or supplies (badges for the rest). */
function cardIcon(c: Card): string {
  if (!db) return "";
  const badge = (t: string, cls = "") => `<span class="rbadge ${cls}">${esc(t)}</span>`;
  const box = (img: string, n: number) => (hasArt ? `<span class="rbox" style="background-image:url('/assets/img/statusUI/${img}')"><b>+${n}</b></span>` : badge(`+${n}`));
  switch (c.kind) {
    case "weapon":
      return c.id ? weaponArtHtml(db, c.id, hasArt, 1) : "";
    case "upgrade":
      return c.id ? `${weaponArtHtml(db, parseUpgraded(c.id).base, hasArt, 1)}${badge("+", "up")}` : "";
    case "drone":
      return c.id ? droneArtHtml(db, c.id, hasArt) : "";
    case "system":
      return c.system ? `${sysIconHtml(baseSystemId(c.system), hasArt)}${badge("▲", "up")}` : "";
    case "reinforce":
      return c.system ? `${sysIconHtml(baseSystemId(c.system), hasArt)}${badge("⛨", "up")}` : "";
    case "crew":
      return c.race ? portraitHtml(db, c.race, hasArt, 1.4) : "";
    case "reactor":
      return `<span class="rreactor"><i></i><i></i></span>${badge("+2")}`;
    case "supplies":
      return [c.hull || c.maxHull ? badge(`+${c.hull || c.maxHull} hull`, "hull") : "", c.missiles ? box("top_missiles_on.png", c.missiles) : "", c.parts ? box("top_drones_on.png", c.parts) : ""].join("");
    case "augment":
      return badge("AUG", "aug");
    case "options":
      return badge("+1", "aug");
    default:
      return "";
  }
}

/** The reward cards after a Survival win (the sim is paused until one is picked). */
function rewardOverlay(sv: NonNullable<LobbyState["survival"]>): HTMLDivElement {
  const o = document.createElement("div");
  o.className = "overlay reward";
  const kind: Record<string, string> = { weapon: "Weapon", upgrade: "Weapon upgrade", drone: "Drone", augment: "Augment", system: "System", reactor: "Reactor", crew: "Crew", supplies: "Supplies", reinforce: "Reinforcement", options: "More choices" };
  // With a controller, each card shows the button that picks it.
  const padKey = (i: number) => (controllerEnabled() ? `<span class="padbtn pb${i}">${["A", "B", "X", "Y", "LB"][i] ?? ""}</span>` : "");
  const cards = (sv.offer ?? []).map((c, i) => `<button class="rcard tier${c.tier}" data-pick="${i}">
      ${padKey(i)}<span class="ricon">${cardIcon(c)}</span>
      <span class="rkind">${esc(kind[c.kind] ?? c.kind)}${c.tier === 4 ? " · RARE" : ""}</span>
      <span class="rtitle">${esc(c.title)}</span>
      <span class="rblurb">${esc(c.blurb)}</span></button>`).join("");
  o.innerHTML = `<div class="menu reward-menu"><h1>${sv.boss ? "FLAGSHIP DOWN" : sv.mini ? "RIVAL DEFEATED" : `BATTLE ${sv.battle} WON`}</h1>
    <p class="note">Choose one. Your ship jumps to the next fight as soon as you do.</p>
    <div class="rcards">${cards}</div>
    <div class="row" style="justify-content:center"><button id="reroll" ${sv.rerolls > 0 ? "" : "disabled"}>${controllerEnabled() ? `<span class="padbtn">RB</span> ` : ""}Re-roll (${sv.rerolls} left)</button></div>
    <p class="note">A re-roll deals a fresh hand. Earn one for every boss or mini-boss beaten.</p>
    <p class="note">Score ${sv.score} · ${sv.won} won${sv.bosses ? ` · ${sv.bosses} boss${sv.bosses > 1 ? "es" : ""}` : ""}</p></div>`;
  o.querySelector<HTMLButtonElement>("#reroll")?.addEventListener("click", (e) => {
    (e.currentTarget as HTMLButtonElement).disabled = true;
    play(db!, ["powerUpSystem"], 1);
    net.send({ t: "reroll" });
  });
  o.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((b) => {
    // FTL's menu hover beep as the pointer (or the controller's ring) lands on a card; the store's buy sound
    // when one is taken.
    const hover = () => !b.disabled && play(db!, ["hoverBeep"], 0.7);
    b.addEventListener("mouseenter", hover);
    b.addEventListener("focus", hover);
    b.addEventListener("click", () => {
      o.querySelectorAll("button").forEach((x) => (x.disabled = true));
      b.classList.add("picked");
      play(db!, ["buy"], 1);
      net.send({ t: "pick", card: Number(b.dataset.pick) });
    });
  });
  return o;
}

/** This computer's best Survival score (a convenience: lost with the browser's storage). */
let bestSeen: { score: number; best: number; isNew: boolean } | null = null;
function bestScore(score: number): { best: number; isNew: boolean } {
  // Once per finished run (the overlay re-renders; the "new best" mark must survive that).
  if (bestSeen?.score === score) return bestSeen;
  let best = 0;
  try {
    best = Number(localStorage.getItem("ftl-arena-survival-best")) || 0;
    if (score > best) localStorage.setItem("ftl-arena-survival-best", String(score));
  } catch {}
  bestSeen = { score, best: Math.max(best, score), isNew: score > best };
  return bestSeen;
}

function gameOverOverlay(sv: NonNullable<LobbyState["survival"]>): HTMLDivElement {
  const o = document.createElement("div");
  o.className = "overlay";
  const b = bestScore(sv.score);
  o.innerHTML = `<div class="menu"><h1>SHIP DESTROYED</h1>
    <p>Survival ended in battle ${sv.battle}.</p>
    <div class="score-rows">
      <div class="kv"><span>Battles won</span><b>${sv.won}</b></div>
      <div class="kv"><span>Mini-bosses</span><b>${sv.minis}</b></div>
      <div class="kv"><span>Flagships</span><b>${sv.bosses}</b></div>
      <div class="kv"><span>Rewards taken</span><b>${sv.picks.length}${sv.rare ? ` (${sv.rare} rare)` : ""}</b></div>
      <div class="kv score-total"><span>Score</span><b>${sv.score}</b></div>
      <div class="kv"><span>Best on this computer</span><b>${b.best}${b.isNew ? " · new best!" : ""}</b></div>
    </div>
    <div class="row" style="justify-content:center"><button class="primary" id="rematch">New run</button><button id="leave">Leave</button></div></div>`;
  return o;
}

function startBattle(you: 0 | 1): void {
  if (battle || !db) return;
  hangar?.destroy();
  hangar?.el.remove();
  hangar = null;
  hangarAfterBattle();
  battle = new Battle(app, db, (cmd) => net.send({ t: "cmd", cmd }), you);
  document.body.classList.add("in-battle");
  battle.onEndReady = () => render();
  battle.onMenu = () => (escMenu ? closeMenu() : openMenu());
  battle.onControlCrew = (crew, on) => net.send({ t: "controlCrew", crew, on });
  battle.onStations = (rooms) => net.send({ t: "stations", rooms });
  app.stage.addChild(battle.stage);
  layoutBattle();
}

/**
 * End the battle on this side, with a win by forfeit, when the server that ran it is gone (it lived in the
 * host's app, and they closed it). The server says so itself when it shuts down cleanly; this covers the rest.
 */
function endLocally(reason: string): void {
  if (!battle || !lastView || lastView.winner !== null) return;
  localEnd = true;
  lostAt = oppGoneAt = null;
  const you = lastView.you;
  lastView = { ...lastView, winner: you, endReason: reason, events: [{ e: "end", winner: you, reason }] };
  battle.onSnapshot(lastView);
  render();
}

function endBattle(): void {
  localEnd = false;
  escMenu = menuPaused = false;
  lostAt = oppGoneAt = null;
  if (!battle) return;
  app.stage.removeChild(battle.stage);
  battle.destroy();
  battle = null;
  document.body.classList.remove("in-battle");
  lastView = null;
  debugInfo = null;
}

/** The debug drawer docks on the right; the battle scales into what's left. */
const DEBUG_W = 330;
function layoutBattle(): void {
  if (!battle) return;
  const side = debugInfo && debugOpen ? DEBUG_W : 0;
  const w = app.screen.width - side;
  const s = Math.min(w / LOGICAL.W, app.screen.height / LOGICAL.H);
  battle.stage.scale.set(s);
  battle.stage.position.set((w - LOGICAL.W * s) / 2, (app.screen.height - LOGICAL.H * s) / 2);
}
window.addEventListener("resize", () => {
  // Pixi's own resize (resizeTo) waits for the next frame, so the canvas would still have its old size here
  // and the layout would lag a resize behind. Resize it now, lay out, and once more next frame to be sure.
  app.resize();
  layoutBattle();
  render();
  requestAnimationFrame(() => {
    app.resize();
    layoutBattle();
  });
});

app.ticker.add((t) => battle?.frame(Math.min(0.1, t.deltaMS / 1000)));

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const dbg = (d: DebugOp) => net.send({ t: "debug", d });

/**
 * The debug drawer (practice lobbies with debug tools on): speed, pause, step, reveal, god mode,
 * autopilot, live bot difficulty, quick sabotage, and the bot's reasoning log. Built once; only the live
 * parts are updated per snapshot, so clicks never land on a re-created button.
 */
let debugBuiltOpen: boolean | null = null;
function renderDebug(): void {
  let el = document.getElementById("debug");
  const d = debugInfo;
  if (!d || !battle) {
    el?.remove();
    debugBuiltOpen = null;
    return;
  }
  if (!el) {
    debugBuiltOpen = null; // a fresh element needs its contents built
    el = document.createElement("div");
    el.id = "debug";
    el.className = "debug";
    ui.appendChild(el);
    el.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (!b) return;
      const a = b.dataset;
      if (a.toggle !== undefined) {
        debugOpen = !debugOpen;
        renderDebug();
        layoutBattle();
        return;
      }
      const you = lastView?.you ?? 0;
      const them = (1 - you) as 0 | 1;
      const who = a.who === "me" ? you : them;
      if (a.speed !== undefined) dbg({ op: "speed", value: Number(a.speed) });
      else if (a.stepTicks) dbg({ op: "step", ticks: Number(a.stepTicks) });
      else if (a.op === "reveal") dbg({ op: "reveal", on: !debugInfo?.reveal });
      else if (a.op === "god") dbg({ op: "god", on: !debugInfo?.god });
      else if (a.op === "autopilot") dbg({ op: "autopilot", on: !debugInfo?.autopilot, level: 1 });
      else if (a.op === "hull") dbg({ op: "hull", ship: who, delta: Number(a.delta ?? -5) });
      else if (a.op === "breach") dbg({ op: "breach", ship: who });
      else if (a.op === "boarder") dbg({ op: "boarder", ship: who });
      else if (a.op === "fire") dbg({ op: "fire", ship: who });
      else if (a.op === "damage") dbg({ op: "damage", ship: who });
      else if (a.op === "ion") dbg({ op: "ion", ship: who });
      else if (a.op === "hurt") dbg({ op: "hurt", ship: who });
      else if (a.op === "kill") dbg({ op: "kill", ship: who });
      else if (a.op === "missiles") dbg({ op: "missiles", ship: who });
      else if (a.op === "parts") dbg({ op: "parts", ship: who });
      else if (a.op === "fixall") dbg({ op: "fixall", ship: who });
      else if (a.op === "restart") dbg({ op: "restart" });
    });
    el.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.diff !== undefined) el!.querySelector("[data-diffval]")!.textContent = t.value;
    });
    el.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.diff !== undefined) dbg({ op: "difficulty", value: Number(t.value) });
    });
  }
  el.classList.toggle("closed", !debugOpen);
  if (debugBuiltOpen !== debugOpen) {
    debugBuiltOpen = debugOpen;
    const sp = (v: number, label: string) => `<button class="small" data-speed="${v}">${label}</button>`;
    el.innerHTML = debugOpen
      ? `<div class="debug-head"><b>DEBUG</b> <span class="note" data-tick></span><button class="small" data-toggle title="Hide">⟩</button></div>
        <div class="dlabel">Sim speed</div>
        <div class="row">${sp(0, "❚❚")}${sp(0.25, "¼×")}${sp(0.5, "½×")}${sp(1, "1×")}${sp(2, "2×")}${sp(4, "4×")}${sp(8, "8×")}</div>
        <div class="row"><button class="small" data-step-ticks="1">+1 tick</button><button class="small" data-step-ticks="30">+1 s</button><button class="small" data-step-ticks="300">+10 s</button><button class="small" data-op="restart">Restart match</button></div>
        <div class="dlabel">Cheats</div>
        <div class="row"><button class="small" data-op="reveal">Reveal enemy</button><button class="small" data-op="god">God mode</button><button class="small" data-op="autopilot">Autopilot me</button></div>
        <div class="dlabel">Bot difficulty <b data-diffval></b></div>
        <input type="range" min="0" max="100" step="5" data-diff style="width:100%">
        <div class="note" data-skill></div>
        <div class="row"><span class="note">Enemy</span><button class="small" data-op="hull" data-who="them" data-delta="-5">−5 hull</button><button class="small" data-op="hull" data-who="them" data-delta="5">+5 hull</button><button class="small" data-op="breach" data-who="them">breach</button><button class="small" data-op="fire" data-who="them">fire</button><button class="small" data-op="damage" data-who="them">break system</button><button class="small" data-op="ion" data-who="them">ion</button><button class="small" data-op="hurt" data-who="them">hurt crew</button></div>
        <div class="row"><span class="note">Me</span><button class="small" data-op="hull" data-who="me" data-delta="-5">−5 hull</button><button class="small" data-op="hull" data-who="me" data-delta="5">+5 hull</button><button class="small" data-op="breach" data-who="me">breach</button><button class="small" data-op="fire" data-who="me">fire</button><button class="small" data-op="damage" data-who="me">break system</button><button class="small" data-op="ion" data-who="me">ion</button><button class="small" data-op="hurt" data-who="me">hurt crew</button><button class="small" data-op="kill" data-who="me">kill one</button><button class="small" data-op="boarder" data-who="me">add boarder</button><button class="small" data-op="missiles" data-who="me">+5 missiles</button><button class="small" data-op="parts" data-who="me">+5 drone parts</button><button class="small" data-op="fixall" data-who="me">fix all systems</button></div>
        <div class="debug-log" data-log></div>`
      : `<button class="small" data-toggle title="Debug">⟨ DEBUG</button>`;
  }
  if (!debugOpen) return;
  const q = (sel: string) => el!.querySelector(sel) as HTMLElement | null;
  q("[data-tick]")!.textContent = `tick ${d.tick} · ${(d.tick / 30).toFixed(1)} s${d.speed === 0 ? " · paused" : d.speed !== 1 ? ` · ${d.speed}×` : ""}`;
  el.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((b) => b.classList.toggle("on", Number(b.dataset.speed) === d.speed));
  q('[data-op="reveal"]')!.classList.toggle("on", d.reveal);
  q('[data-op="god"]')!.classList.toggle("on", d.god);
  q('[data-op="autopilot"]')!.classList.toggle("on", d.autopilot);
  const slider = q("[data-diff]") as HTMLInputElement;
  if (document.activeElement !== slider) {
    slider.value = String(d.difficulty);
    q("[data-diffval]")!.textContent = String(d.difficulty);
  }
  q("[data-skill]")!.textContent = `play skill ${Math.round(d.botLevel * 100)}% (applies now) · scrap +${Math.round(d.scrapBonus * 100)}% (applies at the next hangar)`;
  const log = `<b>Bot reasoning</b>${d.botLog.slice().reverse().map((l) => `<div>${esc(l)}</div>`).join("") || "<div class='note'>(nothing yet)</div>"}` +
    (d.autopilot ? `<b>Autopilot (you)</b>${d.autopilotLog.slice().reverse().map((l) => `<div>${esc(l)}</div>`).join("")}` : "");
  const logEl = q("[data-log]")!;
  if (logEl.dataset.v !== log) {
    logEl.dataset.v = log;
    logEl.innerHTML = log;
  }
}

function render(): void {
  chat.setMode(battle ? "battle" : "off");
  if (battle) {
    for (const n of [...ui.children]) if (n.id !== "debug") n.remove();
    const v = lastView;
    const sv = lobby?.survival;
    if (sv && lobby?.phase === "reward" && sv.offer) {
      const ro = rewardOverlay(sv);
      ui.appendChild(ro);
      // With a controller, the first card has the focus as soon as the cards come up.
      if (controllerEnabled()) focusOn(ro.querySelector<HTMLElement>(".rcard"));
      // A short fanfare as the cards come up (FTL's crew level-up jingle), once per hand.
      if (rewardJingleFor !== sv.battle) {
        rewardJingleFor = sv.battle;
        play(db!, ["levelup"], 1);
      }
    }
    if (sv && sv.over && v && v.winner !== null && battle.endReady()) {
      const o = gameOverOverlay(sv);
      ui.appendChild(o);
      o.querySelector("#rematch")!.addEventListener("click", () => net.send({ t: "rematch" }));
      o.querySelector("#leave")!.addEventListener("click", () => {
        net.send({ t: "leave" });
        endBattle();
        render();
      });
    } else if (!sv && v && v.winner !== null && battle.endReady()) {
      const won = v.winner === v.you;
      // The server that ran it is gone (the host's game closed): there's no hangar to go back to.
      const stranded = localEnd || !net.connected;
      const s = v.ships[v.you].stats;
      const o = document.createElement("div");
      o.className = "overlay";
      o.innerHTML = `<div class="menu"><h1>${v.winner === -1 ? "DRAW" : won ? "VICTORY" : "DEFEAT"}</h1>
        <p>${esc(v.endReason)}</p>
        <p class="note">You fired ${s.shotsFired} shots: ${s.hits} hit, ${s.misses} missed, ${s.blocked} blocked · ${s.damageDealt} hull damage dealt</p>
        <div class="row" style="justify-content:center">${stranded ? "" : `<button class="primary" id="rematch">Back to hangar</button>`}<button id="leave"${stranded ? ` class="primary"` : ""}>Leave</button></div></div>`;
      ui.appendChild(o);
      o.querySelector("#rematch")?.addEventListener("click", () => net.send({ t: "rematch" }));
      o.querySelector("#leave")!.addEventListener("click", () => {
        net.send({ t: "leave" });
        endBattle();
        render();
      });
    }
    if (escMenu) ui.appendChild(menuOverlay());
    if (error) ui.insertAdjacentHTML("beforeend", `<div class="toast">${esc(error)}</div>`);
    const left = (at: number, of: number) => Math.max(0, Math.ceil(of - (performance.now() - at) / 1000));
    if (lostAt !== null) ui.insertAdjacentHTML("beforeend", `<div class="toast">Lost the connection to the host. Reconnecting… (${left(lostAt, LOST_FORFEIT_S)} s)</div>`);
    else if (oppGoneAt !== null) {
      const opp = lobby?.players[1 - (lastView?.you ?? 0)];
      ui.insertAdjacentHTML("beforeend", `<div class="toast">${esc(opp?.name ?? "Your opponent")} disconnected. They forfeit in ${left(oppGoneAt, GRACE_S)} s unless they come back.</div>`);
    }
    renderDebug();
    return;
  }
  document.getElementById("debug")?.remove();
  if (lobby && db) {
    // FTL's title theme while building ships.
    const title = db.music.find((t) => t.name === "title")?.explore;
    if (title) music(title);
    if (!hangar) {
      ui.innerHTML = "";
      hangar = new Hangar(db, () => token, {
        setLoadout: (l) => net.send({ t: "loadout", loadout: l }),
        setConfig: (c) => net.send({ t: "config", config: c }),
        setPractice: (p) => net.send({ t: "practice", practice: p }),
        ready: (r) => net.send({ t: "ready", ready: r }),
        leave: () => net.send({ t: "leave" }),
        // Whoever is host (the creator, or a friend who took over) sees how to invite someone.
        share: () => {
          if (!share && lobby?.host === token) {
            // (Not from inside this render: shareFor re-renders.)
            share = { addresses: [], note: "" };
            queueMicrotask(() => void shareFor(matchAddr));
          }
          return share;
        },
      }, () => hasArt);
      ui.appendChild(hangar.el);
    }
    hangar.update(lobby);
    ui.querySelector(".toast")?.remove();
    if (error) ui.insertAdjacentHTML("beforeend", `<div class="toast">${esc(error)}</div>`);
    return;
  }
  hangar?.destroy();
  hangar?.el.remove();
  hangar = null;
  share = null;
  renderMenu();
}

/**
 * The "FTL" title, drawn by us in the same place and shape as the one painted into FTL's splash: solid white
 * blocks with a soft glow, in the splash's own 1280×720 coordinates (the stage is that box, so it lines up
 * whatever the window size).
 */
const MENU_LOGO = `<svg class="mm-logo" viewBox="0 0 1280 720" preserveAspectRatio="none" aria-label="FTL">
  <defs><filter id="mm-glow" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/>
    <feColorMatrix in="b" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.75 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g fill="#fff" filter="url(#mm-glow)">
    <rect x="850" y="80" width="36" height="150"/><rect x="850" y="80" width="104" height="37"/><rect x="850" y="138" width="80" height="33"/>
    <rect x="974" y="80" width="122" height="37"/><rect x="1016" y="80" width="35" height="150"/>
    <rect x="1123" y="80" width="35" height="150"/><rect x="1123" y="192" width="83" height="38"/>
  </g>
</svg>`;

/** The main menu's background picture (swap it here): our own art, shipped with the client
 *  (apps/client/public/menu/, a web-sized copy of art/main-menu-bg.png), so it shows with or without FTL.
 *  The "FTL" title is drawn over it by us. */
const MENU_SPLASH = "/menu/main-menu-bg.webp";

/** The main menu: FTL's title screen with our four buttons; each opens its own panel (Back returns). */
const MENU_ITEMS: [typeof mode, string][] = [["single", "Single player"], ["lan", "LAN"], ["online", "Online"], ["settings", "Settings"]];
function renderMenu(): void {
  // FTL's title theme on the main menu, as in the lobby (it starts on the first click or key if the browser
  // holds autoplay back).
  const title = db?.music.find((t) => t.name === "title")?.explore;
  if (title) music(title);
  const lan = mode === "lan";
  const titles: Record<string, string> = { single: "Single player", lan: "LAN", online: "Online", settings: "Settings" };
  // First launch: ask the captain's name once (it lives in Settings afterwards).
  const askName = !nameAsked && !name;
  const body =
    mode === "settings"
      ? `<label class="note" for="name">Captain name</label><div class="row"><input id="name" placeholder="Captain" maxlength="24" value="${esc(name)}"></div>${settingsBody()}`
      : mode === "single"
        ? `<div class="note">Play against the computer on this machine: Arena against a bot (pick its ship and difficulty in the rules), or a Survival run.</div>
    <div class="row"><button class="primary" id="practice" ${busy ? "disabled" : ""}>Create a match</button></div>`
        : `${lan
          ? `<div class="note">Same network (home Wi-Fi, LAN party). Create a match and tell your friend the code; they only need the code.</div>`
          : `<label class="note" for="server">Server address</label>
    <div class="row"><input id="server" placeholder="IP:port (blank = host on this computer)" value="${esc(serverAddr)}"></div>
    <div class="note">For a dedicated server, or a friend hosting over the internet. Leave it blank to host here yourself.</div>`}
    <div class="row"><button class="primary" id="create" ${busy ? "disabled" : ""}>Create match</button></div>
    <h2 style="margin-top:14px">Join a match</h2>
    <div class="row"><input id="code" placeholder="CODE" maxlength="4" value="${esc(joinCode)}" style="text-transform:uppercase;max-width:110px"><button class="primary" id="join" ${busy ? "disabled" : ""}>Join</button></div>
    <div class="note">${lan ? "Enter the host's code: the game finds their match on your network." : "Enter the server address above and the match code."}</div>`;
  const panel = askName
    ? `<div class="mm-panel menu"><h1>Captain</h1><div class="note">What should your crew call you? (You can change it in Settings.)</div>
        <div class="row"><input id="firstname" placeholder="Captain" maxlength="24"><button class="primary" id="nameok">OK</button></div></div>`
    : menuOpen
      ? `<div class="mm-panel menu"><div class="mm-head"><h1>${titles[mode]}</h1><button class="small" data-back>Back</button></div>
        <div class="tab-body">${body}</div>
        <div class="note">${esc(busyNote)}</div><div class="err">${esc(error)}</div></div>`
      : "";
  ui.innerHTML = `<div class="mainmenu art ${menuOpen || askName ? "dim" : ""}">
    <div class="mm-stage" style="background-image:url('${MENU_SPLASH}')">
      ${MENU_LOGO}
      <div class="mm-arena">ARENA</div>
      <div class="mm-buttons">${MENU_ITEMS.map(([m, label]) => `<button class="mm-btn" data-open="${m}">${label}</button>`).join("")}</div>
      ${db?.source === "ftl" && !hasArt ? `<div class="mm-note note">No local art found: drawing placeholders.</div>` : ""}
      ${!menuOpen && error ? `<div class="mm-note err">${esc(error)}</div>` : ""}
    </div>
    ${panel}
  </div>`;
  const val = (id: string) => ui.querySelector<HTMLInputElement>(id)?.value.trim();
  const keep = () => {
    if (ui.querySelector("#name")) name = val("#name") || "";
    if (!lan && ui.querySelector("#server")) serverAddr = val("#server") ?? "";
    joinCode = (val("#code") ?? "").toUpperCase();
    try {
      localStorage.setItem("ftl-arena-name", name);
      localStorage.setItem("ftl-arena-server", serverAddr);
    } catch {}
  };
  for (const id of ["#name", "#server", "#code"]) ui.querySelector(id)?.addEventListener("input", keep);
  // FTL's menu feel: a beep as the highlight moves onto a button (mouse or pad), a click when it's pressed.
  ui.querySelectorAll<HTMLButtonElement>(".mm-btn").forEach((b) => {
    b.addEventListener("mouseenter", () => db && play(db, ["hoverBeep"], 0.7));
    b.addEventListener("focus", () => db && !b.matches(":hover") && play(db, ["hoverBeep"], 0.7));
  });
  ui.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((b) =>
    b.addEventListener("click", () => {
      if (db) play(db, ["acceptUpgrades"], 0.8);
      const m = b.dataset.open as typeof mode;
      // Single player needs no introduction: straight into a practice lobby.
      if (m === "single") {
        mode = "single";
        return void act("practice");
      }
      openModePanel(m);
    }),
  );
  ui.querySelector("[data-back]")?.addEventListener("click", () => closeMenuPanel());
  const firstName = () => {
    name = val("#firstname") || "Captain";
    nameAsked = true;
    try {
      localStorage.setItem("ftl-arena-name", name);
    } catch {}
    render();
  };
  ui.querySelector("#nameok")?.addEventListener("click", firstName);
  ui.querySelector("#firstname")?.addEventListener("keydown", (e) => (e as KeyboardEvent).key === "Enter" && firstName());
  if (askName) queueMicrotask(() => ui.querySelector<HTMLInputElement>("#firstname")?.focus());
  const go = (kind: "create" | "practice" | "join") => () => void act(kind);
  ui.querySelector("#create")?.addEventListener("click", go("create"));
  ui.querySelector("#practice")?.addEventListener("click", go("practice"));
  ui.querySelector("#join")?.addEventListener("click", go("join"));
  ui.querySelector("#code")?.addEventListener("keydown", (e) => (e as KeyboardEvent).key === "Enter" && void act("join"));
  ui.querySelector<HTMLInputElement>("#controller")?.addEventListener("change", (e) => {
    const on = (e.target as HTMLInputElement).checked;
    setControllerEnabled(on);
    net.send({ t: "controller", on });
    render();
  });
}

// Escape backs out of a main-menu panel.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !battle && !lobby && menuOpen) closeMenuPanel();
});

/** Open a mode's panel from the main menu. */
function openModePanel(m: typeof mode): void {
  mode = m;
  menuOpen = true;
  error = "";
  try {
    localStorage.setItem("ftl-arena-mode", mode);
  } catch {}
  render();
}
/** Back to the main menu's buttons. */
function closeMenuPanel(): void {
  menuOpen = false;
  error = "";
  render();
}
/** The main menu shows a mode's panel (else just the buttons); the first-launch name prompt has been answered. */
let menuOpen = false;
let nameAsked = false;

/** The Settings tab: experimental controller support, what pad is connected, and the button map. */
function settingsBody(): string {
  const on = controllerEnabled();
  const st = !pad.connected ? "No controller detected: connect one and press any button." : pad.standard ? `Connected: ${esc(pad.name)}` : `Connected, but not recognised (no standard mapping): ${esc(pad.name)}`;
  return `<label class="kv"><span>Controller support <span class="note">(experimental)</span></span><input type="checkbox" id="controller" ${on ? "checked" : ""}></label>
    <div class="note">${on ? st : "Off. With it on, the AI runs your crew and reactor; you aim weapons, board, hack and mind-control with selector wheels."}</div>
    ${on ? `<div class="padmap">
      <div><b>A / B / X / Y</b> weapons 1-4: tap to power, hold for the target wheel (left stick; the middle powers it without a target)</div>
      <div><b>RB</b> teleport: hold to send a crew member to the pad, tap to beam over</div>
      <div><b>LT</b> hold to bring a boarder back · <b>RT</b> hacking: hold to aim the drone, tap to pulse</div>
      <div><b>Right stick click</b> mind control (hold) · <b>D-pad ←</b> cloak · <b>→</b> battery</div>
      <div><b>D-pad ↑</b> open doors (again: airlocks too) · <b>↓</b> close the doors round your crew (again: all)</div>
      <div><b>LB</b> hold for the systems wheel: point at one, <b>D-pad ↑/↓</b> powers it up/down</div>
      <div><b>LB</b> + a button: power that system or gun down</div>
      <div><b>Start</b> pause · <b>Back/View</b> match menu</div>
      <div>Menus: <b>D-pad</b> moves, <b>A</b> selects (and edits numbers/lists: D-pad to change, A to submit), <b>B</b> backs out, <b>LB / RB</b> previous / next tab</div>
    </div>` : ""}`;
}

/** LAN: find matches by code on the local network; Online: a typed server address (or host here). */
let mode: "single" | "lan" | "online" | "settings" = "single";
try {
  const saved = localStorage.getItem("ftl-arena-mode");
  mode = saved === "online" || saved === "settings" || saved === "lan" ? saved : "single";
} catch {}
let busy = false;
let busyNote = "";
let joinCode = "";
/** What to tell friends once a match is created: the addresses they type, plus a hint. */
let share: { addresses: { label?: string; addr: string }[]; note: string } | null = null;
/** The server address the current match is on ("" = this computer), for the share panel. */
let matchAddr = "";

/**
 * One click does it: work out the server (LAN: this computer to create, or whoever answers for the code;
 * Online: the typed address, blank meaning this computer), reach it, then create, practise or join there.
 * A server that doesn't answer, or a code that isn't there, just shows why; nothing locks up.
 */
async function act(kind: "create" | "practice" | "join"): Promise<void> {
  if (busy) return;
  if (kind === "join" && !/^[A-Z]{4}$/.test(joinCode)) {
    error = "Enter the 4-letter match code to join.";
    return render();
  }
  if (kind === "join" && mode === "online" && !serverAddr) {
    error = "Enter the server address (IP:port) to join online, or use the LAN tab for a game on your network.";
    return render();
  }
  busy = true;
  error = "";
  let addr = mode === "online" && kind !== "practice" ? serverAddr : "";
  const fail = (msg: string) => {
    busy = false;
    busyNote = "";
    error = msg;
    render();
  };
  if (kind === "join" && mode === "lan") {
    busyNote = `Looking for match ${joinCode} on your network (this can take a few seconds)…`;
    render();
    let found: { address: string; port: number; host: string }[] = [];
    try {
      found = await (await fetch(`/api/lan?code=${joinCode}`)).json();
    } catch {}
    if (found.length === 0) return fail(`No match ${joinCode} found on your network. Check the code, and that the host is on the same network (and allowed FTL Arena through their firewall). Or use Online with their address.`);
    if (found.length > 1) return fail(`${found.length} matches on your network use code ${joinCode}: ask the host for their address and use Online.`);
    addr = `${found[0].address}:${found[0].port}`;
  }
  const where = addr || "this computer";
  busyNote = `Connecting to ${where}…`;
  render();
  try {
    net.name = name;
    await net.connectTo(wsFor(addr), 6000, wsFor(""));
  } catch {
    return fail(`Couldn't reach ${where}. Check the address (IP:port, e.g. 81.2.3.4:8787) and that the server is running with its port open.`);
  }
  busy = false;
  busyNote = "";
  matchAddr = addr;
  net.send({ t: "hello", v: PROTOCOL_VERSION, name, token });
  if (kind === "join") net.send({ t: "join", code: joinCode });
  else net.send({ t: "create", practice: kind === "practice" });
  share = null;
  render();
}

/** The addresses friends use: the server's (a dedicated server), or this computer's own (LAN, and public online). */
async function shareFor(addr: string): Promise<void> {
  // Just the addresses (and the code, shown above them): players know what to do with them.
  if (mode === "lan") {
    share = { addresses: [], note: "" };
    render();
    if (addr) return;
  }
  if (addr) {
    share = { addresses: [{ label: "Server", addr }], note: "" };
    return render();
  }
  try {
    const r = (await (await fetch(mode === "online" ? "/api/share?online=1" : "/api/share")).json()) as { port: number; lan: string[]; public: string; upnp: string };
    if (mode === "lan") {
      share = { addresses: r.lan.map((a) => ({ label: "Network", addr: `${a}:${r.port}` })), note: "" };
      return render();
    }
    const list = [...(r.public ? [{ label: "Internet", addr: `${r.public}:${r.port}` }] : []), ...r.lan.map((a) => ({ label: "Network", addr: `${a}:${r.port}` }))];
    // Only what a player can't work out: the router's port isn't open.
    const note = r.public && r.upnp !== "ok" ? `Forward TCP port ${r.port} on your router to this computer for players outside your network.` : "";
    share = { addresses: list, note };
  } catch {
    share = { addresses: [], note: "Couldn't work out this computer's address." };
  }
  render();
}

/** Test hook: logical 1280×720 battle coordinates → page pixels (used by tools/bench browser scripts). */
(window as unknown as { __arena: unknown }).__arena = {
  state: () => (battle ? battle.debugState() : null),
  view: () => lastView,
  toScreen: (x: number, y: number) => (battle ? { x: battle.stage.x + x * battle.stage.scale.x, y: battle.stage.y + y * battle.stage.scale.y } : null),
  // Test helpers: send a command as this player; read HUD hit boxes.
  send: (cmd: unknown) => (battle as unknown as { send(c: unknown): void } | null)?.send(cmd),
  /** The enemy ship's on-screen transform (jump-away checks). */
  enemyRoot: () => {
    const r = (battle as unknown as { enemy?: { root: { alpha: number; visible: boolean; position: { y: number }; scale: { y: number } } } } | null)?.enemy?.root;
    return r ? { alpha: r.alpha, visible: r.visible, y: r.position.y, sy: r.scale.y } : null;
  },
  ui: () => {
    // The system buttons drawn last frame (box, and whether they can be used).
    const b = battle as unknown as { btns: { box: unknown; act?: unknown; why?: string }[]; lay: unknown } | null;
    return b ? { btns: b.btns.map((x) => ({ box: x.box, ok: !!x.act, why: x.why })), lay: b.lay } : null;
  },
  /** Screen position of an enemy room's centre. */
  enemyRoom: (room: number) => {
    const r = (battle as unknown as { enemy?: { root: { toGlobal(p: { x: number; y: number }): { x: number; y: number } }; geo: { roomTiles: Map<number, string[]> } } } | null)?.enemy;
    const tiles = r?.geo.roomTiles.get(room);
    if (!r || !tiles?.length) return null;
    const xs = tiles.map((t) => Number(t.split(",")[0]));
    const ys = tiles.map((t) => Number(t.split(",")[1]));
    return r.root.toGlobal({ x: ((Math.min(...xs) + Math.max(...xs)) / 2 + 0.5) * 35, y: ((Math.min(...ys) + Math.max(...ys)) / 2 + 0.5) * 35 });
  },
};

net.onStatus = (s) => {
  netStatus = s;
  if (battle && lastView && lastView.winner === null && !localEnd) {
    if (s.startsWith("disconnected")) lostAt ??= performance.now();
    else if (s === "connected") lostAt = null;
  }
  if (battle) render();
  if (!battle && !lobby) render();
};
net.connect();
render();
// The menu beep buttons make, for the other controls too: focusing a text box or a dropdown, ticking a box.
document.addEventListener("focusin", (e) => {
  const t = e.target as HTMLElement;
  if (db && ((t instanceof HTMLInputElement && t.type !== "checkbox" && t.type !== "radio" && t.type !== "range") || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement)) play(db, ["hoverBeep"], 0.7);
});
document.addEventListener("change", (e) => {
  const t = e.target as HTMLElement;
  if (db && t instanceof HTMLInputElement && (t.type === "checkbox" || t.type === "radio")) play(db, ["hoverBeep"], 0.7);
});
// Controller: menus with the D-pad (the battle has its own controls, except over its end screens).
startPad();
let padSeen = false;
onPad((p) => {
  if (p.connected !== padSeen) {
    padSeen = p.connected;
    if (!battle && !lobby && mode === "settings") render();
  }
  // Back/View opens (or closes) the match menu; B closes it too.
  if (battle && (p.down(BTN.BACK) || (escMenu && p.down(BTN.B)))) {
    if (escMenu) closeMenu();
    else if (p.down(BTN.BACK)) openMenu();
    return;
  }
  // Survival's reward cards: a button per card (A B X Y, then LB for a fifth) and RB to re-roll.
  const reward = ui.querySelector<HTMLElement>(".overlay.reward");
  if (reward) {
    const picks = [BTN.A, BTN.B, BTN.X, BTN.Y, BTN.LB];
    picks.forEach((b, i) => {
      if (p.down(b)) reward.querySelector<HTMLButtonElement>(`.rcard[data-pick="${i}"]:not(:disabled)`)?.click();
    });
    if (p.down(BTN.RB)) reward.querySelector<HTMLButtonElement>("#reroll:not(:disabled)")?.click();
    return;
  }
  // The main menu: B goes back from a panel; LB / RB step through the four.
  if (!battle && !lobby && menuOpen && !isEditing()) {
    if (p.down(BTN.B)) return closeMenuPanel();
    const i = MENU_ITEMS.findIndex(([m]) => m === mode);
    if (p.down(BTN.LB) && i > 0) return openModePanel(MENU_ITEMS[i - 1][0]);
    if (p.down(BTN.RB) && i < MENU_ITEMS.length - 1) return openModePanel(MENU_ITEMS[i + 1][0]);
  }
  if (!battle || ui.querySelector(".overlay")) menuNav(p, ui);
});
// Count the banners down, and give up on a server that's gone quiet mid-battle.
setInterval(() => {
  if (!battle || (lostAt === null && oppGoneAt === null)) return;
  if (lostAt !== null && performance.now() - lostAt > LOST_FORFEIT_S * 1000) endLocally("Lost the connection to the host: victory by forfeit");
  else render();
}, 500);
