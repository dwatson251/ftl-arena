import { Application } from "pixi.js";
import type { GameDB } from "@ftl/data";
import type { DebugInfo, DebugOp, LobbyState, ServerMsg } from "@ftl/protocol";
import type { MatchView } from "@ftl/sim";
import { artReady, preload, registerOfflineCache } from "./assets.ts";
import { loadFtlFonts } from "./ftlfonts.ts";
import { music, preloadSounds } from "./audio.ts";
import { Battle, LOGICAL } from "./battle.ts";
import { Hangar } from "./hangar.ts";
import { Net } from "./net.ts";

const ui = document.getElementById("ui")!;
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
const wsUrl = params.get("server")
  ? `ws://${params.get("server")}/ws`
  : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
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

const net = new Net(wsUrl, name || "Captain");
artReady.push(() => render());
net.on(onMsg);

function onMsg(m: ServerMsg): void {
  switch (m.t) {
    case "welcome":
      db = m.db;
      token = m.token;
      if (document.getElementById("loading")) {
        // Everything (art, fonts, sound effects) loads behind FTL's loading bar before the first menu.
        let fonts = false;
        loadingProgress(0, "");
        void preload(db, (k) => loadingProgress(k), [async () => (fonts = await loadFtlFonts()), ...preloadSounds(db)]).then((ok) => {
          hasArt = ok;
          document.body.classList.toggle("ftl-fonts", fonts);
          loadingProgress(1);
          loadingDone();
          render();
        });
      }
      break;
    case "lobby":
      lobby = m.lobby;
      if (battle && (!lobby || lobby.phase === "lobby")) endBattle();
      break;
    case "start":
      if (battle) endBattle(); // debug restart
      startBattle(m.you);
      break;
    case "snap": {
      const wasOver = lastView?.winner != null;
      lastView = m.view;
      debugInfo = m.debug ?? null;
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

function startBattle(you: 0 | 1): void {
  if (battle || !db) return;
  hangar?.el.remove();
  hangar = null;
  battle = new Battle(app, db, (cmd) => net.send({ t: "cmd", cmd }), you);
  battle.onEndReady = () => render();
  app.stage.addChild(battle.stage);
  layoutBattle();
}

function endBattle(): void {
  if (!battle) return;
  app.stage.removeChild(battle.stage);
  battle.destroy();
  battle = null;
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
  layoutBattle();
  render();
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
      else if (a.op === "fire") dbg({ op: "fire", ship: who });
      else if (a.op === "damage") dbg({ op: "damage", ship: who });
      else if (a.op === "ion") dbg({ op: "ion", ship: who });
      else if (a.op === "hurt") dbg({ op: "hurt", ship: who });
      else if (a.op === "kill") dbg({ op: "kill", ship: who });
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
        <div class="row"><span class="note">Me</span><button class="small" data-op="hull" data-who="me" data-delta="-5">−5 hull</button><button class="small" data-op="hull" data-who="me" data-delta="5">+5 hull</button><button class="small" data-op="breach" data-who="me">breach</button><button class="small" data-op="fire" data-who="me">fire</button><button class="small" data-op="damage" data-who="me">break system</button><button class="small" data-op="ion" data-who="me">ion</button><button class="small" data-op="hurt" data-who="me">hurt crew</button><button class="small" data-op="kill" data-who="me">kill one</button></div>
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
  if (battle) {
    for (const n of [...ui.children]) if (n.id !== "debug") n.remove();
    const v = lastView;
    if (v && v.winner !== null && battle.endReady()) {
      const won = v.winner === v.you;
      const s = v.ships[v.you].stats;
      const o = document.createElement("div");
      o.className = "overlay";
      o.innerHTML = `<div class="menu"><h1>${v.winner === -1 ? "DRAW" : won ? "VICTORY" : "DEFEAT"}</h1>
        <p>${esc(v.endReason)}</p>
        <p class="note">You fired ${s.shotsFired} shots: ${s.hits} hit, ${s.misses} missed, ${s.blocked} blocked · ${s.damageDealt} hull damage dealt</p>
        <div class="row" style="justify-content:center"><button class="primary" id="rematch">Back to hangar</button><button id="leave">Leave</button></div></div>`;
      ui.appendChild(o);
      o.querySelector("#rematch")!.addEventListener("click", () => net.send({ t: "rematch" }));
      o.querySelector("#leave")!.addEventListener("click", () => {
        net.send({ t: "leave" });
        endBattle();
        render();
      });
    }
    if (error) ui.insertAdjacentHTML("beforeend", `<div class="toast">${esc(error)}</div>`);
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
      }, () => hasArt);
      ui.appendChild(hangar.el);
    }
    hangar.update(lobby);
    ui.querySelector(".toast")?.remove();
    if (error) ui.insertAdjacentHTML("beforeend", `<div class="toast">${esc(error)}</div>`);
    return;
  }
  hangar?.el.remove();
  hangar = null;
  ui.innerHTML = `<div class="screen"><div class="menu">
    <h1>FTL ARENA</h1>
    <div class="note">1v1 real-time FTL combat. ${db ? (db.source === "ftl" ? (hasArt ? "Using your own FTL data and art." : "Using FTL data from the server; no local art found, drawing placeholders.") : "No FTL data on the server: placeholder ships. Run <code>npm run extract</code>.") : "Connecting…"}</div>
    <div class="row"><input id="name" placeholder="Captain name" maxlength="24" value="${esc(name)}"></div>
    <div class="row"><button class="primary" id="create" ${db ? "" : "disabled"}>Create match</button>
      <button id="practice" ${db ? "" : "disabled"}>Practice vs bot</button></div>
    <div class="row"><input id="code" placeholder="CODE" maxlength="4" style="text-transform:uppercase;max-width:110px"><button id="join" ${db ? "" : "disabled"}>Join</button></div>
    <div class="err">${esc(error)}</div>
    <div class="note">Server: ${esc(wsUrl)}</div>
  </div></div>`;
  const nameEl = ui.querySelector<HTMLInputElement>("#name")!;
  const saveName = () => {
    name = nameEl.value.trim() || "Captain";
    try {
      localStorage.setItem("ftl-arena-name", name);
    } catch {}
    net.name = name;
    net.send({ t: "hello", v: 1, name, token });
  };
  ui.querySelector("#create")!.addEventListener("click", () => {
    saveName();
    net.send({ t: "create" });
  });
  ui.querySelector("#practice")!.addEventListener("click", () => {
    saveName();
    net.send({ t: "create", practice: true });
  });
  ui.querySelector("#join")!.addEventListener("click", () => {
    saveName();
    net.send({ t: "join", code: ui.querySelector<HTMLInputElement>("#code")!.value.trim().toUpperCase() });
  });
}

/** Test hook: logical 1280×720 battle coordinates → page pixels (used by tools/bench browser scripts). */
(window as unknown as { __arena: unknown }).__arena = {
  state: () => (battle ? battle.debugState() : null),
  view: () => lastView,
  toScreen: (x: number, y: number) => (battle ? { x: battle.stage.x + x * battle.stage.scale.x, y: battle.stage.y + y * battle.stage.scale.y } : null),
  // Test helpers: send a command as this player; read HUD hit boxes.
  send: (cmd: unknown) => (battle as unknown as { send(c: unknown): void } | null)?.send(cmd),
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

net.onStatus = () => render();
net.connect();
render();
