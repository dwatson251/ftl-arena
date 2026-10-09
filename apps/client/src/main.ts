import { Application, Container } from "pixi.js";
import type { GameDB } from "@ftl/data";
import type { LobbyState, ServerMsg } from "@ftl/protocol";
import type { MatchView } from "@ftl/sim";
import { preload } from "./assets.ts";
import { Battle, LOGICAL } from "./battle.ts";
import { Hangar } from "./hangar.ts";
import { Net } from "./net.ts";
import { ShipRenderer } from "./render/ship.ts";

const ui = document.getElementById("ui")!;
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
let preview: { r: ShipRenderer; ship: string } | null = null;
let lastView: MatchView | null = null;
let error = "";
let hasArt = false;
// The hangar preview is its own small canvas, re-attached into #preview after each hangar re-render.
const previewApp = new Application();
await previewApp.init({ width: 560, height: 350, backgroundAlpha: 0, antialias: true });
previewApp.canvas.style.width = "100%";
previewApp.canvas.style.height = "100%";
const previewLayer = new Container();
previewApp.stage.addChild(previewLayer);

const net = new Net(wsUrl, name || "Captain");
net.on(onMsg);

function onMsg(m: ServerMsg): void {
  switch (m.t) {
    case "welcome":
      db = m.db;
      token = m.token;
      void preload(db).then((ok) => {
        hasArt = ok;
        render();
      });
      break;
    case "lobby":
      lobby = m.lobby;
      if (!lobby || lobby.phase === "lobby" || lobby.phase === "countdown") {
        if (battle && (!lobby || lobby.phase === "lobby")) endBattle();
      }
      break;
    case "start":
      startBattle(m.you);
      break;
    case "snap":
      lastView = m.view;
      if (!battle) startBattle(m.view.you);
      battle!.onSnapshot(m.view);
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

function startBattle(you: 0 | 1): void {
  if (battle || !db) return;
  hangar?.el.remove();
  hangar = null;
  clearPreview();
  battle = new Battle(app, db, (cmd) => net.send({ t: "cmd", cmd }), you);
  app.stage.addChild(battle.stage);
  layoutBattle();
}

function endBattle(): void {
  if (!battle) return;
  app.stage.removeChild(battle.stage);
  battle.destroy();
  battle = null;
  lastView = null;
}

function layoutBattle(): void {
  if (!battle) return;
  const s = Math.min(app.screen.width / LOGICAL.W, app.screen.height / LOGICAL.H);
  battle.stage.scale.set(s);
  battle.stage.position.set((app.screen.width - LOGICAL.W * s) / 2, (app.screen.height - LOGICAL.H * s) / 2);
}
window.addEventListener("resize", () => {
  layoutBattle();
  render();
});

function clearPreview(): void {
  if (preview) {
    previewLayer.removeChild(preview.r.root);
    preview.r.root.destroy({ children: true });
    preview = null;
  }
}

/** Draw the selected hull into the hangar's preview box (the canvas sits behind the DOM). */
function drawPreview(): void {
  if (!db || !hangar?.loadout || !hangar.previewRect) return clearPreview();
  const ship = hangar.loadout.ship;
  if (!preview || preview.ship !== ship) {
    clearPreview();
    preview = { r: new ShipRenderer(db, ship, false), ship };
    previewLayer.addChild(preview.r.root);
  }
  const box = hangar.el.querySelector("#preview");
  if (box && previewApp.canvas.parentElement !== box) box.appendChild(previewApp.canvas);
  const W = previewApp.screen.width;
  const H = previewApp.screen.height;
  const b = preview.r.bounds();
  const s = Math.min(W / b.w, H / b.h) * 0.95;
  preview.r.root.scale.set(s);
  preview.r.root.position.set(W / 2 - (b.x + b.w / 2) * s, H / 2 - (b.y + b.h / 2) * s);
}

app.ticker.add((t) => {
  battle?.frame(t.deltaMS / 1000);
  if (preview && db && hangar?.loadout) {
    const lo = hangar.loadout;
    const fake = {
      ...({} as object), idx: 0, player: "", bp: lo.ship, layout: db.ships[lo.ship].layout, hull: 1, maxHull: 1, reactor: lo.reactor,
      systems: {}, rooms: db.layouts[db.ships[lo.ship].layout].rooms.map((r) => ({ id: r.id, o2: 100, fires: {}, breaches: {} })),
      doors: db.layouts[db.ships[lo.ship].layout].doors.map(() => false), crew: [], weapons: lo.weapons.map((bp, slot) => ({ slot, bp, powered: true, charge: 0, volleys: 0, target: null, autofire: false, boost: 0 })),
      missiles: 0, shieldLayers: 0, shieldCharge: 0, evasion: 0, stats: { shotsFired: 0, hits: 0, misses: 0, blocked: 0, damageDealt: 0 },
      visibleRooms: null, interior: true, weaponsKnown: true,
    };
    preview.r.update(fake as never, [], performance.now() / 1000, { room: -1, door: -1 });
  }
});

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function render(): void {
  // Battle overlays (countdown, end)
  if (battle) {
    ui.innerHTML = "";
    const v = lastView;
    if (v && v.winner !== null) {
      const you = v.you;
      const won = v.winner === you;
      const s = v.ships[you].stats;
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
      });
    }
    if (error) ui.insertAdjacentHTML("beforeend", `<div class="toast">${esc(error)}</div>`);
    return;
  }
  if (lobby && db) {
    if (!hangar) {
      ui.innerHTML = "";
      hangar = new Hangar(db, () => token, {
        setLoadout: (l) => net.send({ t: "loadout", loadout: l }),
        setConfig: (c) => net.send({ t: "config", config: c }),
        ready: (r) => net.send({ t: "ready", ready: r }),
        leave: () => net.send({ t: "leave" }),
      });
      ui.appendChild(hangar.el);
    }
    hangar.update(lobby);
    ui.querySelector(".toast")?.remove();
    if (error) ui.insertAdjacentHTML("beforeend", `<div class="toast">${esc(error)}</div>`);
    drawPreview();
    return;
  }
  hangar?.el.remove();
  hangar = null;
  clearPreview();
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

net.onStatus = () => render();
net.connect();
render();
