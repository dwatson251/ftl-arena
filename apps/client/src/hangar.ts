/**
 * The hangar, as a stepped process: 1 Ship, 2 Systems, 3 Weapons, 4 Crew, then Launch. Prices are
 * computed locally for instant feedback; the server re-prices every loadout before it accepts "ready".
 */
import type { GameDB, SystemId } from "@ftl/data";
import { play } from "./audio.ts";
import type { LobbyState, PracticeConfig } from "@ftl/protocol";
import {
  baseLoadout, buyableWeapons, difficultyToBot, hireableRaces, hullSystems, priceLoadout, RACES, randomCrewName, RULES, type Loadout,
  type MatchConfig,
} from "@ftl/sim";

const h = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const STEPS = ["Ship", "Systems", "Weapons", "Crew", "Launch"] as const;
type Step = (typeof STEPS)[number];

export interface HangarHooks {
  setLoadout(l: Loadout): void;
  setConfig(c: Partial<MatchConfig>): void;
  setPractice(p: Partial<PracticeConfig>): void;
  ready(r: boolean): void;
  leave(): void;
}

export class Hangar {
  el = document.createElement("div");
  loadout: Loadout | null = null;
  step: Step = "Ship";
  private lobby: LobbyState | null = null;
  private pendingRender = false;

  constructor(private db: GameDB, private me: () => string, private hooks: HangarHooks, private hasArt: () => boolean) {
    this.el.className = "screen hangar-screen";
    this.el.addEventListener("click", (e) => this.onClick(e));
    this.el.addEventListener("change", (e) => this.onChange(e));
    this.el.addEventListener("input", (e) => this.onInput(e));
    this.el.addEventListener("focusout", () => this.pendingRender && setTimeout(() => this.render(), 0));
    // Drag and drop: store cards and equipped weapons can be dropped on a slot; equipped ones dropped
    // back on the store are sold.
    this.el.addEventListener("dragstart", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-drag]");
      if (!t || !e.dataTransfer) return;
      e.dataTransfer.setData("text/plain", t.dataset.drag!);
      e.dataTransfer.effectAllowed = "move";
      this.el.classList.add("dragging");
    });
    this.el.addEventListener("dragend", () => this.el.classList.remove("dragging"));
    this.el.addEventListener("dragover", (e) => {
      if ((e.target as HTMLElement).closest("[data-slot], .shop-drop")) e.preventDefault();
    });
    this.el.addEventListener("drop", (e) => {
      e.preventDefault();
      this.el.classList.remove("dragging");
      const data = e.dataTransfer?.getData("text/plain") ?? "";
      const slotEl = (e.target as HTMLElement).closest<HTMLElement>("[data-slot]");
      if (slotEl) this.dropOnSlot(data, Number(slotEl.dataset.slot));
      else if ((e.target as HTMLElement).closest(".shop-drop") && data.startsWith("slot:")) this.sellSlot(Number(data.slice(5)));
    });
  }

  private sfx(name: string): void {
    play(this.db, [name], 0.8);
  }

  private dropOnSlot(data: string, slot: number): void {
    if (!this.loadout) return;
    const l = structuredClone(this.loadout);
    const ship = this.db.ships[l.ship];
    if (slot >= ship.weaponSlots) return;
    if (data.startsWith("slot:")) {
      // Reorder: slot order is mount order on the hull.
      const from = Number(data.slice(5));
      if (from === slot || !l.weapons[from]) return;
      const a = l.weapons[from];
      if (slot < l.weapons.length) [l.weapons[from], l.weapons[slot]] = [l.weapons[slot], a];
      else {
        l.weapons.splice(from, 1);
        l.weapons.push(a);
      }
      this.sfx("powerUpSystem");
    } else if (data.startsWith("buy:")) {
      const id = data.slice(4);
      if (slot < l.weapons.length) l.weapons[slot] = id; // replace (the old one is sold)
      else if (l.weapons.length < ship.weaponSlots) l.weapons.push(id);
      this.sfx("powerUpSystem");
    }
    this.change(l);
  }

  private sellSlot(i: number): void {
    if (!this.loadout) return;
    const l = structuredClone(this.loadout);
    l.weapons.splice(i, 1);
    this.sfx("powerDownSystem");
    this.change(l);
  }

  update(lobby: LobbyState): void {
    this.lobby = lobby;
    const mine = lobby.players.find((p) => p.id === this.me());
    if (!this.loadout && mine?.loadout) this.loadout = mine.loadout;
    if (this.loadout && lobby.config.shipPool.length && !lobby.config.shipPool.includes(this.loadout.ship) && mine?.loadout) this.loadout = mine.loadout;
    this.render();
  }

  private change(l: Loadout): void {
    this.loadout = l;
    this.hooks.setLoadout(l);
    this.render();
  }

  // ---------------------------------------------------------------- art helpers (CSS sprites from /assets)

  private sheetCss(file: string, fx: number, fy: number, fw: number, fh: number, sheetW: number, sheetH: number, scale: number): string {
    if (!this.hasArt()) return "";
    return `background:url('/assets/img/${file}') -${fx * scale}px -${fy * scale}px / ${sheetW * scale}px ${sheetH * scale}px no-repeat;width:${fw * scale}px;height:${fh * scale}px`;
  }

  /** A crew portrait (FTL counts sheet rows from the bottom). */
  private portrait(race: string, scale = 1.4): string {
    const a = this.db.anims[`${race}_portrait`] ?? this.db.anims[`${race}_walk_down`];
    const sh = a && this.db.animSheets[a.sheet];
    if (!a || !sh || !this.hasArt()) return `<div class="ph-portrait">${h(race[0].toUpperCase())}</div>`;
    const rows = Math.round(sh.h / sh.fh);
    const fx = a.x * sh.fw;
    const fy = (rows - 1 - a.y) * sh.fh;
    const base = this.sheetCss(sh.file, fx, fy, sh.fw, sh.fh, sh.w, sh.h, scale);
    return `<div class="portrait" style="${base}"></div>`;
  }

  /** A weapon's art with its charge lights on, turned to point right. */
  private weaponArt(id: string, scale = 1): string {
    const bp = this.db.weapons[id];
    const wa = bp && this.db.weaponAnims[bp.weaponArt];
    const sh = wa && this.db.animSheets[wa.sheet];
    if (!wa || !sh || !this.hasArt()) return `<div class="ph-weapon">${h(bp?.type?.[0] ?? "?")}</div>`;
    const css = this.sheetCss(sh.file, wa.chargedFrame * sh.fw, 0, sh.fw, sh.fh, sh.w, sh.h, scale);
    return `<div class="weapon-art" style="width:${sh.fh * scale}px;height:${sh.fw * scale}px"><div style="${css};transform:rotate(90deg) translate(0,-100%);transform-origin:0 0;position:absolute;left:0;top:0"></div></div>`;
  }

  private miniship(img: string): string {
    if (!this.hasArt()) return `<div class="ph-ship"></div>`;
    return `<img class="miniship" src="/assets/img/customizeUI/miniship_${h(img)}.png" onerror="this.src='/assets/img/ship/${h(img)}_base.png'">`;
  }

  private scrapIcon(): string {
    return this.hasArt() ? `<img class="scrap-icon" src="/assets/img/upgradeUI/details_scrap.png" alt="">` : "";
  }

  private sysIcon(id: string): string {
    return this.hasArt() ? `<img class="sysicon" src="/assets/img/icons/s_${id}_green1.png">` : `<span class="sysicon ph">${id.slice(0, 2).toUpperCase()}</span>`;
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    const lobby = this.lobby;
    const l = this.loadout;
    if (!lobby || !l) return;
    const active = document.activeElement;
    if (active && this.el.contains(active) && (active as HTMLElement).tagName === "INPUT" && (active as HTMLInputElement).type === "text") {
      this.pendingRender = true;
      return;
    }
    this.pendingRender = false;
    const db = this.db;
    const cfg = lobby.config;
    const priced = priceLoadout(db, l, cfg.scrap, cfg.shipPool);
    const me = lobby.players.find((p) => p.id === this.me());
    const scrollTop = this.el.querySelector(".hg-main")?.scrollTop ?? 0;
    const body = { Ship: () => this.stepShip(l), Systems: () => this.stepSystems(l), Weapons: () => this.stepWeapons(l), Crew: () => this.stepCrew(l), Launch: () => this.stepLaunch(l, priced) }[this.step]();
    this.el.innerHTML = `
      <div class="hg">
        <div class="hg-steps">${STEPS.map((s, i) => `<button class="hg-step ${s === this.step ? "on" : ""}" data-step="${s}"><b>${i + 1}</b> ${s}</button>`).join("")}
          <div class="hg-scrap">${this.scrapIcon()}<span class="scrap">${cfg.scrap - priced.total}</span> <span class="note">scrap left of ${cfg.scrap}</span></div></div>
        <div class="hg-body">
          <div class="panel hg-side">${this.sidebar(lobby)}</div>
          <div class="panel hg-main">${body}</div>
          <div class="panel hg-summary">${this.summary(l, priced, me?.ready ?? false)}</div>
        </div>
      </div>`;
    const main = this.el.querySelector(".hg-main");
    if (main) main.scrollTop = scrollTop;
  }

  private sidebar(lobby: LobbyState): string {
    const cfg = lobby.config;
    const host = lobby.host === this.me();
    const players = lobby.players
      .map((p) => `<div class="p"><span>${h(p.name)}${p.id === lobby.host ? " ★" : ""}${p.connected ? "" : " (offline)"}</span><span class="${p.ready ? "ready" : "notready"}">${p.ready ? "READY" : "building"}</span></div>`)
      .join("") + (lobby.players.length < 2 ? `<div class="note">Waiting for an opponent: share the code.</div>` : "");
    const pc = lobby.practice;
    const bot = pc ? difficultyToBot(pc.difficulty) : null;
    const botShip = lobby.players.find((p) => p.bot)?.loadout?.ship;
    const pool = cfg.shipPool.length ? cfg.shipPool : this.db.hangar;
    return `
      <h2>Lobby</h2><div class="code">${lobby.code}</div><div class="players">${players}</div>
      <h2 style="margin-top:14px">Rules ${host ? "" : "(host sets these)"}</h2>
      <div class="kv"><span>Win</span><select data-cfg="winCondition" ${host ? "" : "disabled"}>
        <option value="hull" ${cfg.winCondition === "hull" ? "selected" : ""}>Destroy the ship</option>
        <option value="crew" ${cfg.winCondition === "crew" ? "selected" : ""}>Kill the crew</option></select></div>
      <div class="kv"><span>Scrap</span><input data-cfg="scrap" type="number" min="0" max="5000" step="50" value="${cfg.scrap}" ${host ? "" : "disabled"} style="width:90px"></div>
      <div class="kv"><span>Time limit (s)</span><input data-cfg="timeLimit" type="number" min="0" max="3600" step="30" value="${cfg.timeLimit}" ${host ? "" : "disabled"} style="width:90px"></div>
      <div class="note">${cfg.winCondition === "crew" ? "Hulls can't drop below 1: only a dead crew ends it." : "Hull to 0 wins; a dead crew also loses, as in FTL."}</div>
      ${pc && bot ? `
        <h2 style="margin-top:14px">Practice bot</h2>
        <div class="kv"><span>Difficulty</span><b>${pc.difficulty}</b></div>
        <input type="range" min="0" max="100" step="5" value="${pc.difficulty}" data-prac="difficulty" style="width:100%">
        <div class="note">Skill ${Math.round(bot.level * 100)}%${bot.scrapBonus ? ` · +${Math.round(bot.scrapBonus * 100)}% scrap` : ""}. 0-60 raises its play (reaction, targeting, volley sync, crew and power care); above 60 it also gets extra scrap.</div>
        <div class="kv"><span>Opponent</span><select data-prac="botShip">
          <option value="" ${pc.botShip === "" ? "selected" : ""}>Random player cruiser</option>
          <option value="@enemy" ${pc.botShip === "@enemy" ? "selected" : ""}>Random single-player enemy</option>
          <optgroup label="Player cruisers">${pool.map((id) => `<option value="${id}" ${pc.botShip === id ? "selected" : ""}>${h(this.db.ships[id].title)} (${h(this.db.ships[id].className)})</option>`).join("")}</optgroup>
          ${this.db.enemies.length ? `<optgroup label="Single-player enemies">${this.db.enemies.map((id) => `<option value="${id}" ${pc.botShip === id ? "selected" : ""}>${h(this.db.ships[id].className || id)}</option>`).join("")}</optgroup>` : ""}
        </select></div>
        ${botShip ? `<div class="note">Bot flies: ${h(this.db.ships[botShip]?.className || this.db.ships[botShip]?.title || botShip)}${this.db.ships[botShip]?.enemy ? ` · hull ${lobby.players.find((p) => p.bot)?.loadout?.hull ?? ""}` : ""}</div>` : ""}
        <label class="kv"><span>Debug tools in battle</span><input type="checkbox" data-prac="debug" ${pc.debug ? "checked" : ""}></label>` : ""}
      <div style="margin-top:14px"><button data-leave>Leave lobby</button></div>`;
  }

  private summary(l: Loadout, priced: ReturnType<typeof priceLoadout>, ready: boolean): string {
    const db = this.db;
    const ship = db.ships[l.ship];
    const sys = hullSystems(db, l.ship).filter((s) => (l.systems[s.id] ?? s.base) > 0).map((s) => `${s.id} ${l.systems[s.id] ?? s.base}`).join(" · ");
    return `
      <h2>${h(ship.title)}</h2>
      <div class="note">${h(ship.className)}</div>
      ${this.miniship(ship.img)}
      <div class="note">Hull ${ship.health} · reactor ${l.reactor} · ${l.missiles} missiles</div>
      <div class="note">${h(sys)}</div>
      <h2 style="margin-top:10px">Weapons</h2>${l.weapons.map((w) => `<div class="note">• ${h(db.weapons[w]?.title ?? w)}</div>`).join("") || `<div class="note">none</div>`}
      <h2 style="margin-top:10px">Crew (${l.crew.length})</h2>${l.crew.map((c) => `<div class="note">• ${h(c.name)} <span style="opacity:.7">${h(db.crew[c.race]?.title ?? c.race)}</span></div>`).join("")}
      <h2 style="margin-top:10px">Bill</h2>
      ${priced.lines.map((x) => `<div class="kv note"><span>${h(x.item)}</span><span>${x.scrap}</span></div>`).join("") || `<div class="note">Nothing bought yet.</div>`}
      ${priced.errors.map((e) => `<div class="err">${h(e)}</div>`).join("")}
      <button class="primary big" data-ready="${ready ? 0 : 1}" ${priced.ok ? "" : "disabled"}>${ready ? "Unready" : "Ready"}</button>
      ${this.lobby?.phase === "countdown" ? `<div class="code" style="margin-top:12px">Launch in ${this.lobby.countdown}…</div>` : ""}`;
  }

  private nav(back: Step | null, next: Step | null): string {
    return `<div class="hg-nav">${back ? `<button data-step="${back}">← ${back}</button>` : "<span></span>"}${next ? `<button class="primary" data-step="${next}">${next} →</button>` : ""}</div>`;
  }

  private stepShip(l: Loadout): string {
    const db = this.db;
    const pool = this.lobby!.config.shipPool.length ? this.lobby!.config.shipPool : db.hangar;
    const cards = pool
      .map((id) => {
        const s = db.ships[id];
        const races = [...new Set(s.crewRaces)].map((r) => db.crew[r]?.title ?? r).join(", ");
        return `<button class="ship-card ${id === l.ship ? "on" : ""}" data-ship="${id}">
          ${this.miniship(s.img)}
          <b>${h(s.title)}</b><span class="note">${h(s.className || "")}</span>
          <span class="note">${s.weapons.map((w) => h(db.weapons[w]?.title ?? w)).join(", ") || "no weapons"}</span>
          <span class="note">${s.crewRaces.length} crew (${h(races)}) · reactor ${s.maxPower}</span></button>`;
      })
      .join("");
    return `<h2>1 · Choose a hull</h2><div class="note">Switching hulls resets your purchases.</div><div class="ship-grid">${cards}</div>${this.nav(null, "Systems")}`;
  }

  private stepSystems(l: Loadout): string {
    const db = this.db;
    const base = baseLoadout(db, l.ship);
    const rows = hullSystems(db, l.ship)
      .map((s) => {
        const lv = l.systems[s.id] ?? s.base;
        const bp = db.systems[s.id];
        const next = lv >= s.max ? "max" : lv === 0 ? `install ${bp?.cost ?? "?"}` : `next ${bp?.upgradeCost[lv - 1] ?? "?"}`;
        const bars = Array.from({ length: s.max }, (_, i) => `<i class="${i < s.base ? "on" : i < lv ? "new" : ""}"></i>`).join("");
        return `<div class="sys-row">${this.sysIcon(s.id)}<span class="sys-name">${s.id}</span><span class="bars">${bars}</span>
          <button class="small" data-sys="${s.id}" data-d="-1" ${lv <= s.base ? "disabled" : ""}>−</button>
          <button class="small" data-sys="${s.id}" data-d="1" ${lv >= s.max ? "disabled" : ""}>+</button><span class="note">${next}</span></div>`;
      })
      .join("");
    return `<h2>2 · Systems</h2>
      <div class="note">Green bars came with the hull; yellow ones are bought. Shields give a layer per 2 bars; engines give evasion; weapons bars power your guns.</div>
      ${rows}
      <div class="sys-row"><span class="sysicon ph">⚡</span><span class="sys-name">reactor</span><span><b>${l.reactor}</b></span>
        <button class="small" data-reactor="-1" ${l.reactor <= base.reactor ? "disabled" : ""}>−</button>
        <button class="small" data-reactor="1" ${l.reactor >= RULES.reactorMax ? "disabled" : ""}>+</button><span class="note">${RULES.reactorPrice(l.reactor)} per bar</span></div>
      <div class="sys-row"><span class="sysicon ph">⦿</span><span class="sys-name">missiles</span><span><b>${l.missiles}</b></span>
        <button class="small" data-msl="-1" ${l.missiles <= 0 ? "disabled" : ""}>−</button>
        <button class="small" data-msl="1">+</button><span class="note">${RULES.missilePrice} each (missile weapons and bombs use them)</span></div>
      ${this.nav("Ship", "Weapons")}`;
  }

  private stepWeapons(l: Loadout): string {
    const db = this.db;
    const ship = db.ships[l.ship];
    const slots = Array.from({ length: ship.weaponSlots }, (_, i) => {
      const id = l.weapons[i];
      if (!id) return `<div class="wslot empty" data-slot="${i}">${i + 1} · drop a weapon here</div>`;
      const w = db.weapons[id];
      return `<div class="wslot" data-slot="${i}" draggable="true" data-drag="slot:${i}">${this.weaponArt(id, 1)}<div><b>${i + 1}. ${h(w?.title ?? id)}</b><div class="note">${w ? this.stats(id) : ""}</div></div><button class="small" data-sell="${i}" title="Sell / remove">✕</button></div>`;
    }).join("");
    const groups = new Map<string, string[]>();
    for (const id of buyableWeapons(db)) {
      const t = db.weapons[id].type;
      groups.set(t, [...(groups.get(t) ?? []), id]);
    }
    const label: Record<string, string> = { LASER: "Lasers", MISSILES: "Missiles", BEAM: "Beams", BOMB: "Bombs", BURST: "Flak" };
    const full = l.weapons.length >= ship.weaponSlots;
    const shop = [...groups]
      .map(([t, ids]) => `<h3>${label[t] ?? t}</h3><div class="wgrid">${ids
        .map((id) => {
          const w = db.weapons[id];
          return `<div class="wcard" draggable="true" data-drag="buy:${id}">${this.weaponArt(id, 1)}<div class="wcard-body"><b>${h(w.title)}</b><div class="note">${this.stats(id)}</div></div>
            <button class="small buy" data-buy="${id}" ${full ? "disabled" : ""}>${this.scrapIcon()}${w.cost}</button></div>`;
        })
        .join("")}</div>`)
      .join("");
    return `<h2>3 · Weapons</h2>
      <div class="wslots-sticky"><div class="wslots">${slots}</div>
      <div class="note">Drag weapons onto a slot (or click a price). Drag an equipped weapon to another slot to reorder, or back to the store to sell it for half price.</div></div>
      <div class="shop-drop">${shop}</div>${this.nav("Systems", "Crew")}`;
  }

  private stats(id: string): string {
    const w = this.db.weapons[id];
    const parts = [`${w.power} pwr`, `${w.cooldown}s`];
    if (w.type === "BEAM") parts.push(`${w.damage} dmg/room`, `${w.length}px`);
    else if (w.damage) parts.push(`${w.damage} dmg ×${w.shots}`);
    else if (w.type !== "BOMB") parts.push(`×${w.shots}`);
    if (w.ion) parts.push(`ion ${w.ion}`);
    if (w.sysDamage) parts.push(`+${w.sysDamage} sys`);
    if (w.persDamage) parts.push(`${w.persDamage > 0 ? "+" : ""}${w.persDamage} crew`);
    if (w.sp) parts.push(`pierce ${w.sp}`);
    if (w.fireChance) parts.push(`fire ${w.fireChance * 10}%`);
    if (w.breachChance) parts.push(`breach ${w.breachChance * 10}%`);
    if (w.missiles) parts.push(`${w.missiles} missile`);
    if (w.chargeLevels > 1) parts.push(`charges ×${w.chargeLevels}`);
    if (w.boost) parts.push("chain");
    return parts.join(" · ");
  }

  private stepCrew(l: Loadout): string {
    const db = this.db;
    const crew = l.crew
      .map((c, i) => {
        const t = RACES[c.race];
        return `<div class="crew-row">${this.portrait(c.race)}
          <input type="text" maxlength="16" value="${h(c.name)}" data-crewname="${i}">
          <span class="note">${h(db.crew[c.race]?.title ?? c.race)} · ${t?.hp ?? 100} HP</span>
          <button class="small" data-reroll="${i}" title="Random name">↻</button>
          <button class="small" data-fire="${i}" ${l.crew.length <= 1 ? "disabled" : ""} title="Dismiss">✕</button></div>`;
      })
      .join("");
    const full = l.crew.length >= RULES.maxCrew;
    const hire = hireableRaces(db)
      .map((r) => {
        const t = RACES[r];
        return `<div class="race-card">${this.portrait(r, 1.8)}<div><b>${h(db.crew[r].title)}</b> <span class="note">${t.hp} HP${t.speed !== 1 ? ` · speed ×${t.speed}` : ""}${t.repair !== 1 ? ` · repair ×${t.repair}` : ""}</span>
          <div class="note">${h(t.blurb)}</div></div><button class="small" data-hire="${r}" ${full ? "disabled" : ""}>${db.crew[r].cost}</button></div>`;
      })
      .join("");
    return `<h2>4 · Crew (${l.crew.length}/${RULES.maxCrew})</h2>
      <div class="note">Starting crew are free. Rename anyone; dismissing gives no refund. Crew fight fires, repair and man stations: manned helm and engines add evasion, manned weapons charge faster, manned shields recharge faster.</div>
      ${crew}<h3>Hire</h3><div class="race-grid">${hire}</div>${this.nav("Weapons", "Launch")}`;
  }

  private stepLaunch(l: Loadout, priced: ReturnType<typeof priceLoadout>): string {
    return `<h2>5 · Launch</h2>
      <p>${priced.ok ? "Your ship is ready. Press <b>Ready</b>; the battle starts when both captains are ready." : "Fix the problems listed on the right first."}</p>
      <div class="note">Controls: click a weapon (or 1-4) then an enemy room · right-click a weapon to power it down · select crew and right-click a room to move them · click system bars for power · click doors to open/close.</div>
      ${this.nav("Crew", null)}`;
    void l;
  }

  // ---------------------------------------------------------------- events

  private onClick(e: Event): void {
    const b = (e.target as HTMLElement).closest("button");
    if (!b || !this.loadout) return;
    const l = structuredClone(this.loadout);
    const d = b.dataset;
    const ship = this.db.ships[l.ship];
    if (d.step) {
      this.step = d.step as Step;
      this.sfx("hoverBeep");
      return this.render();
    }
    if ("ship" in d && d.ship) {
      if (d.ship !== l.ship) {
        this.sfx("powerUpSystem");
        this.change(baseLoadout(this.db, d.ship));
      }
      return;
    }
    if (d.sys) {
      const id = d.sys as SystemId;
      const base = hullSystems(this.db, l.ship).find((s) => s.id === id)!.base;
      l.systems[id] = Math.max(base, (l.systems[id] ?? base) + Number(d.d));
    } else if (d.reactor) l.reactor += Number(d.reactor);
    else if (d.msl) l.missiles = Math.max(0, l.missiles + Number(d.msl));
    else if (d.buy && l.weapons.length < ship.weaponSlots) l.weapons.push(d.buy);
    else if (d.sell) l.weapons.splice(Number(d.sell), 1);
    else if (d.hire && l.crew.length < RULES.maxCrew) l.crew.push({ race: d.hire, name: randomCrewName(this.db, l.crew.map((c) => c.name), Date.now() & 0xffff) });
    else if (d.fire) l.crew.splice(Number(d.fire), 1);
    else if (d.reroll) l.crew[Number(d.reroll)].name = randomCrewName(this.db, l.crew.map((c) => c.name), (Date.now() * 7) & 0xffff);
    else if (d.ready) {
      this.sfx(d.ready === "1" ? "acceptUpgrades" : "undoUpgrades");
      return this.hooks.ready(d.ready === "1");
    }
    else if ("leave" in d) return this.hooks.leave();
    else return;
    const down = !!(d.sell || d.fire || (d.d && Number(d.d) < 0) || (d.reactor && Number(d.reactor) < 0) || (d.msl && Number(d.msl) < 0));
    this.sfx(down ? "powerDownSystem" : "powerUpSystem");
    this.change(l);
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.dataset.prac === "difficulty") {
      const b = t.parentElement?.querySelector("b");
      if (b) b.textContent = t.value;
    }
  }

  private onChange(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t.dataset.cfg) {
      const k = t.dataset.cfg as keyof MatchConfig;
      this.hooks.setConfig({ [k]: k === "winCondition" ? t.value : Number(t.value) } as Partial<MatchConfig>);
    } else if (t.dataset.prac) {
      const k = t.dataset.prac as keyof PracticeConfig;
      const v = k === "debug" ? (t as HTMLInputElement).checked : k === "difficulty" ? Number(t.value) : t.value;
      this.hooks.setPractice({ [k]: v } as Partial<PracticeConfig>);
    } else if (t.dataset.crewname !== undefined && this.loadout) {
      const l = structuredClone(this.loadout);
      const name = t.value.trim().slice(0, 16);
      if (name) l.crew[Number(t.dataset.crewname)].name = name;
      this.change(l);
    }
  }
}
