/** The hangar: pick a hull, spend scrap on systems, reactor, weapons, crew and missiles, then ready up. */
import type { GameDB, SystemId } from "@ftl/data";
import type { LobbyState } from "@ftl/protocol";
import { baseLoadout, buyableWeapons, hullSystems, priceLoadout, RULES, type Loadout, type MatchConfig } from "@ftl/sim";

const h = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface HangarHooks {
  setLoadout(l: Loadout): void;
  setConfig(c: Partial<MatchConfig>): void;
  ready(r: boolean): void;
  leave(): void;
}

export class Hangar {
  el = document.createElement("div");
  loadout: Loadout | null = null;
  private lobby: LobbyState | null = null;
  previewRect: DOMRect | null = null;

  constructor(private db: GameDB, private me: () => string, private hooks: HangarHooks) {
    this.el.className = "screen";
    this.el.addEventListener("click", (e) => this.onClick(e));
    this.el.addEventListener("change", (e) => this.onChange(e));
  }

  update(lobby: LobbyState): void {
    this.lobby = lobby;
    const mine = lobby.players.find((p) => p.id === this.me());
    if (!this.loadout || (mine?.loadout && mine.loadout.ship !== this.loadout.ship && this.loadout.ship === "")) this.loadout = mine?.loadout ?? null;
    if (mine?.loadout && this.loadout && mine.loadout.ship !== this.loadout.ship && lobby.config.shipPool.length && !lobby.config.shipPool.includes(this.loadout.ship))
      this.loadout = mine.loadout;
    this.render();
  }

  private change(l: Loadout): void {
    this.loadout = l;
    this.hooks.setLoadout(l);
    this.render();
  }

  private render(): void {
    const lobby = this.lobby;
    const l = this.loadout;
    if (!lobby || !l) return;
    const db = this.db;
    const cfg = lobby.config;
    const host = lobby.host === this.me();
    const me = lobby.players.find((p) => p.id === this.me());
    const priced = priceLoadout(db, l, cfg.scrap, cfg.shipPool);
    const ship = db.ships[l.ship];
    const pool = cfg.shipPool.length ? cfg.shipPool : db.hangar;
    const bars = (base: number, lv: number, max: number) =>
      `<span class="bars">${Array.from({ length: max }, (_, i) => `<i class="${i < base ? "on" : i < lv ? "new" : ""}"></i>`).join("")}</span>`;
    const sysRows = hullSystems(db, l.ship)
      .map((s) => {
        const lv = l.systems[s.id] ?? s.base;
        return `<div class="kv"><span>${s.id}</span><span>${bars(s.base, lv, s.max)}
          <button class="small" data-sys="${s.id}" data-d="-1" ${lv <= s.base ? "disabled" : ""}>−</button>
          <button class="small" data-sys="${s.id}" data-d="1" ${lv >= s.max ? "disabled" : ""}>+</button></span></div>`;
      })
      .join("");
    const base = baseLoadout(db, l.ship);
    const shop = buyableWeapons(db)
      .map((id) => db.weapons[id])
      .map(
        (w) => `<div class="weap"><span><b>${h(w.title)}</b><br><span class="stats">${w.type === "BURST" ? "FLAK" : w.type} · ${w.power} pwr · ${w.damage} dmg ×${w.shots}${w.ion ? ` · ion ${w.ion}` : ""}${w.sp ? ` · pierce ${w.sp}` : ""} · ${w.cooldown}s${w.missiles ? " · missile" : ""}</span></span>
        <button class="small" data-buy="${w.id}" ${l.weapons.length >= ship.weaponSlots ? "disabled" : ""}>${w.cost}</button></div>`,
      )
      .join("");
    const equipped = l.weapons
      .map((id, i) => `<div class="weap"><span>${i + 1}. ${h(db.weapons[id]?.title ?? id)}</span><button class="small" data-sell="${i}">✕</button></div>`)
      .join("") || `<div class="note">No weapons. Buy some →</div>`;
    const players = lobby.players
      .map((p) => `<div class="p"><span>${h(p.name)}${p.id === lobby.host ? " ★" : ""}${p.connected ? "" : " (offline)"}</span><span class="${p.ready ? "ready" : "notready"}">${p.ready ? "READY" : "building"}</span></div>`)
      .join("") + (lobby.players.length < 2 ? `<div class="note">Waiting for an opponent — share the code.</div>` : "");
    this.el.innerHTML = `
      <div class="hangar">
        <div class="panel">
          <h2>Lobby</h2>
          <div class="code">${lobby.code}</div>
          <div class="players">${players}</div>
          <h2 style="margin-top:14px">Rules ${host ? "" : "(host sets these)"}</h2>
          <div class="kv"><span>Win condition</span><select data-cfg="winCondition" ${host ? "" : "disabled"}>
            <option value="hull" ${cfg.winCondition === "hull" ? "selected" : ""}>Destroy the ship</option>
            <option value="crew" ${cfg.winCondition === "crew" ? "selected" : ""}>Kill the crew</option></select></div>
          <div class="kv"><span>Scrap budget</span><input data-cfg="scrap" type="number" min="0" max="5000" step="50" value="${cfg.scrap}" ${host ? "" : "disabled"} style="width:90px"></div>
          <div class="kv"><span>Time limit (s, 0 = none)</span><input data-cfg="timeLimit" type="number" min="0" max="3600" step="30" value="${cfg.timeLimit}" ${host ? "" : "disabled"} style="width:90px"></div>
          <div class="note">${cfg.winCondition === "crew" ? "Hulls can't drop below 1: only a dead crew ends it." : "Hull to 0 wins; a dead crew also loses, as in FTL."}</div>
          <div style="margin-top:16px;display:flex;gap:8px">
            <button class="primary" data-ready="${me?.ready ? 0 : 1}" ${priced.ok ? "" : "disabled"}>${me?.ready ? "Unready" : "Ready"}</button>
            <button data-leave>Leave</button>
          </div>
          ${lobby.phase === "countdown" ? `<div class="code" style="margin-top:12px">Launch in ${lobby.countdown}…</div>` : ""}
        </div>
        <div class="panel">
          <h2>Hull</h2>
          <select data-ship style="width:100%">${pool.map((id) => `<option value="${id}" ${id === l.ship ? "selected" : ""}>${h(db.ships[id].title)} (${id.replace("PLAYER_SHIP_", "")})</option>`).join("")}</select>
          <div class="preview" id="preview"></div>
          <div class="note">Hull ${ship.health} · ${ship.weaponSlots} weapon slots · base reactor ${base.reactor} · v1 crews are human; drones, cloak and teleporters come in v2.</div>
          <h2 style="margin-top:10px">Systems</h2>
          ${sysRows}
          <div class="kv"><span>reactor</span><span>${l.reactor}
            <button class="small" data-reactor="-1" ${l.reactor <= base.reactor ? "disabled" : ""}>−</button>
            <button class="small" data-reactor="1" ${l.reactor >= RULES.reactorMax ? "disabled" : ""}>+</button> <span class="note">${RULES.reactorPrice(l.reactor)}/bar</span></span></div>
          <div class="kv"><span>crew</span><span>${l.crew}
            <button class="small" data-crew="-1" ${l.crew <= 1 ? "disabled" : ""}>−</button>
            <button class="small" data-crew="1" ${l.crew >= RULES.maxCrew ? "disabled" : ""}>+</button> <span class="note">${db.crew.human?.cost ?? 45} each</span></span></div>
          <div class="kv"><span>missiles</span><span>${l.missiles}
            <button class="small" data-msl="-1" ${l.missiles <= 0 ? "disabled" : ""}>−</button>
            <button class="small" data-msl="1">+</button> <span class="note">${RULES.missilePrice} each</span></span></div>
        </div>
        <div class="panel">
          <h2>Scrap</h2>
          <div class="scrap">${cfg.scrap - priced.total} <span class="note">of ${cfg.scrap} left</span></div>
          ${priced.errors.map((e) => `<div class="err">${h(e)}</div>`).join("")}
          <h2 style="margin-top:10px">Equipped (${l.weapons.length}/${ship.weaponSlots})</h2>
          ${equipped}
          <h2 style="margin-top:10px">Weapon store</h2>
          <div class="shop">${shop}</div>
        </div>
      </div>`;
    this.previewRect = this.el.querySelector("#preview")?.getBoundingClientRect() ?? null;
  }

  private onClick(e: Event): void {
    const b = (e.target as HTMLElement).closest("button");
    if (!b || !this.loadout) return;
    const l = structuredClone(this.loadout);
    const d = b.dataset;
    const ship = this.db.ships[l.ship];
    if (d.sys) {
      const id = d.sys as SystemId;
      const base = hullSystems(this.db, l.ship).find((s) => s.id === id)!.base;
      l.systems[id] = Math.max(base, (l.systems[id] ?? base) + Number(d.d));
    } else if (d.reactor) l.reactor += Number(d.reactor);
    else if (d.crew) l.crew = Math.max(1, Math.min(RULES.maxCrew, l.crew + Number(d.crew)));
    else if (d.msl) l.missiles = Math.max(0, l.missiles + Number(d.msl));
    else if (d.buy && l.weapons.length < ship.weaponSlots) l.weapons.push(d.buy);
    else if (d.sell) l.weapons.splice(Number(d.sell), 1);
    else if (d.ready) return this.hooks.ready(d.ready === "1");
    else if ("leave" in d) return this.hooks.leave();
    else return;
    this.change(l);
  }

  private onChange(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if ("ship" in t.dataset) {
      this.change(baseLoadout(this.db, t.value));
    } else if (t.dataset.cfg) {
      const k = t.dataset.cfg as keyof MatchConfig;
      this.hooks.setConfig({ [k]: k === "winCondition" ? t.value : Number(t.value) } as Partial<MatchConfig>);
    }
  }
}
