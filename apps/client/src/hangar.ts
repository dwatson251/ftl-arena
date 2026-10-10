/**
 * The hangar, as a stepped process: Presets (saved builds), Ship, Systems, Weapons, Drones, Crew, Augments,
 * then Launch. Prices are
 * computed locally for instant feedback; the server re-prices every loadout before it accepts "ready".
 */
import type { GameDB, SystemId } from "@ftl/data";
import { battleTrackSetting, play, setBattleTrack } from "./audio.ts";
import { hasImg } from "./assets.ts";
import { copyName, isSame, presets } from "./presets.ts";
import { drawSnapshot } from "./snapshot.ts";
import type { LobbyState, PracticeConfig } from "@ftl/protocol";
import {
  baseLoadout, buyableDrones, fullPowerNeed, reactorCap, buyableWeapons, difficultyToBot, hireableRaces, hullSystems, MAX_AUGMENTS, priceLoadout, RACES, randomCrewName, RULES, type Loadout,
  type MatchConfig,
} from "@ftl/sim";

const h = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const STEPS = ["Presets", "Ship", "Systems", "Weapons", "Drones", "Crew", "Augments", "Launch"] as const;
type Step = (typeof STEPS)[number];

export interface HangarHooks {
  setLoadout(l: Loadout): void;
  setConfig(c: Partial<MatchConfig>): void;
  setPractice(p: Partial<PracticeConfig>): void;
  ready(r: boolean): void;
  leave(): void;
  /** For the host: the addresses friends use to join, and a hint (null until known; none for practice). */
  share?(): { addresses: string[]; note: string } | null;
}

export class Hangar {
  el = document.createElement("div");
  loadout: Loadout | null = null;
  /** Saved presets open on Presets; with none yet, straight to the hull (Presets is still a tab). */
  step: Step = presets.list().length ? "Presets" : "Ship";
  /** The preset this build came from (unchanged = no "save as preset" offer). */
  private loaded: { id: string; name: string; loadout: Loadout } | null = null;
  /** The name typed into "Save as preset" (null = the default), and what was last saved. */
  private saveName: string | null = null;
  private savedNote = "";
  /** A preset waiting for "delete?" confirmation. */
  private confirmDel: string | null = null;
  private lobby: LobbyState | null = null;
  private pendingRender = false;

  constructor(private db: GameDB, private me: () => string, private hooks: HangarHooks, private hasArt: () => boolean) {
    this.el.className = "screen hangar-screen";
    this.el.addEventListener("click", (e) => this.onClick(e));
    this.el.addEventListener("change", (e) => this.onChange(e));
    this.el.addEventListener("input", (e) => this.onInput(e));
    this.el.addEventListener("focusout", () => this.pendingRender && setTimeout(() => this.render(), 0));
    window.addEventListener("keydown", (e) => this.onKey(e));
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
    // The launch countdown beeps once a second (a sharper warning on the last).
    const n = lobby.phase === "countdown" ? lobby.countdown : 0;
    if (n > 0 && n !== this.lastCountdown) this.sfx(n === 1 ? "environWarning" : "hoverBeep");
    this.lastCountdown = n;
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
    const sh = a && (a.sheetDef ?? this.db.animSheets[a.sheet]);
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
    const sh = wa && (wa.sheetDef ?? this.db.animSheets[wa.sheet]);
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
    return this.hasArt() ? `<img class="sysicon" src="/assets/img/icons/s_${id}.png">` : `<span class="sysicon ph">${id.slice(0, 2).toUpperCase()}</span>`;
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    const lobby = this.lobby;
    const l = this.loadout;
    if (!lobby || !l) return;
    const active = document.activeElement;
    // Don't rebuild under the user's cursor: a focused field (text, scrap number, slider, select) would
    // lose focus on every lobby update. Re-render once it loses focus.
    if (active && this.el.contains(active) && ["INPUT", "SELECT", "TEXTAREA"].includes((active as HTMLElement).tagName)) {
      this.pendingRender = true;
      return;
    }
    this.pendingRender = false;
    const db = this.db;
    const cfg = lobby.config;
    const priced = priceLoadout(db, l, cfg.scrap, cfg.shipPool, cfg.unlimited);
    const me = lobby.players.find((p) => p.id === this.me());
    const scrollTop = this.el.querySelector(".hg-main")?.scrollTop ?? 0;
    const body = { Presets: () => this.stepPresets(), Ship: () => this.stepShip(l), Systems: () => this.stepSystems(l), Weapons: () => this.stepWeapons(l), Drones: () => this.stepDrones(l), Crew: () => this.stepCrew(l), Augments: () => this.stepAugments(l), Launch: () => this.stepLaunch(l, priced) }[this.step]();
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
    for (const c of this.el.querySelectorAll<HTMLCanvasElement>("canvas[data-snap]")) {
      const p = presets.get(c.dataset.snap!);
      if (p) void drawSnapshot(c, db, p.loadout, p.look, this.hasArt(), p.id);
    }
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
      <h2>Lobby</h2><div class="code">${lobby.code}</div>${this.sharePanel(lobby)}<div class="players">${players}</div>
      <h2 style="margin-top:14px">Rules ${host ? "" : "(host sets these)"}</h2>
      <div class="kv"><span>Win</span><select data-cfg="winCondition" ${host ? "" : "disabled"}>
        <option value="hull" ${cfg.winCondition === "hull" ? "selected" : ""}>Destroy the ship</option>
        <option value="auto" ${cfg.winCondition === "auto" ? "selected" : ""}>Autonomous ships</option></select></div>
      <div class="kv"><span>Scrap</span><input data-cfg="scrap" type="number" min="0" max="10000" step="50" value="${cfg.scrap}" ${host ? "" : "disabled"} style="width:90px"></div>
      <div class="kv"><span>Time limit (s)</span><input data-cfg="timeLimit" type="number" min="0" max="3600" step="30" value="${cfg.timeLimit}" ${host ? "" : "disabled"} style="width:90px"></div>
      <div class="note">${cfg.winCondition === "auto" ? "Only destroying the ship wins: with its crew dead a ship runs itself, like FTL's drone ships and the flagship (systems repair on their own, the helm flies itself)." : "Hull to 0 wins; a dead crew also loses, as in FTL."}</div>
      <div class="kv"><span>Hazard</span><select data-cfg="hazard" ${host ? "" : "disabled"}>
        ${([["none", "None"], ["random", "Random"], ["sun", "Red giant (solar flares)"], ["pulsar", "Pulsar (ion pulses)"], ["asteroids", "Asteroid field"], ["nebula", "Nebula (no sensors)"], ["storm", "Ion storm (half reactor)"], ["asb", "Anti-ship batteries"]] as const).map(([v, l]) => `<option value="${v}" ${(cfg.hazard ?? "none") === v ? "selected" : ""}>${l}</option>`).join("")}
      </select></div>
      ${this.pauseRules(cfg, host, !!pc)}
      <label class="kv"><span>Unrestricted systems</span><input type="checkbox" data-cfg="unlimited" ${cfg.unlimited ? "checked" : ""} ${host ? "" : "disabled"}></label>
      <div class="kv"><span>Battle music</span><select data-music>
        <option value="" ${battleTrackSetting() === "" ? "selected" : ""}>Random</option>
        <option value="off" ${battleTrackSetting() === "off" ? "selected" : ""}>Off</option>
        ${this.db.music.filter((t) => t.combat).map((t) => `<option value="${h(t.name)}" ${battleTrackSetting() === t.name ? "selected" : ""}>${h(t.name)}</option>`).join("")}
      </select></div>
      ${pc && bot ? `
        <h2 style="margin-top:14px">Practice bot</h2>
        <div class="kv"><span>Difficulty</span><b>${pc.difficulty}</b></div>
        <input type="range" min="0" max="100" step="5" value="${pc.difficulty}" data-prac="difficulty" style="width:100%">
        <div class="note">Skill ${Math.round(bot.level * 100)}%${bot.scrapBonus ? ` · +${Math.round(bot.scrapBonus * 100)}% scrap` : ""}. 0-60 raises its play (reaction, targeting, volley sync, crew and power care); above 60 it also gets extra scrap.</div>
        <div class="kv"><span>Opponent</span><select data-prac="botShip">
          <option value="" ${pc.botShip === "" ? "selected" : ""}>Random player cruiser</option>
          <option value="@enemy" ${pc.botShip === "@enemy" ? "selected" : ""}>Random single-player enemy</option>
          <optgroup label="Player cruisers">${pool.map((id) => `<option value="${id}" ${pc.botShip === id ? "selected" : ""}>${h(this.db.ships[id].title)} (${h(this.db.ships[id].className)})</option>`).join("")}</optgroup>
          ${(() => {
            const opt = (id: string) => `<option value="${id}" ${pc.botShip === id ? "selected" : ""}>${h((/^BOSS_/.test(id) ? this.db.ships[id].title : this.db.ships[id].className) || id)}</option>`;
            const group = (label: string, ids: string[]) => (ids.length ? `<optgroup label="${label}">${ids.map(opt).join("")}</optgroup>` : "");
            const en = this.db.enemies;
            return group("Single-player enemies", en.filter((id) => !this.db.ships[id].auto && !/^BOSS_/.test(id))) + group("Automated ships (no crew)", en.filter((id) => this.db.ships[id].auto)) + group("Rebel flagship (hard layout above 70)", en.filter((id) => /^BOSS_/.test(id)));
          })()}
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
      <h2 style="margin-top:10px">Drones</h2>${(l.drones ?? []).map((d) => `<div class="note">• ${h(db.droneBPs[d]?.title ?? d)}</div>`).join("") || `<div class="note">none</div>`}<div class="note">${l.droneParts ?? 0} drone parts</div>
      <h2 style="margin-top:10px">Augments</h2>${(l.augments ?? []).map((a) => `<div class="note">• ${h(db.augments[a]?.title ?? a)}</div>`).join("") || `<div class="note">none</div>`}
      <h2 style="margin-top:10px">Bill</h2>
      ${priced.lines.map((x) => `<div class="kv note"><span>${h(x.item)}</span><span>${x.scrap}</span></div>`).join("") || `<div class="note">Nothing bought yet.</div>`}
      ${priced.errors.map((e) => `<div class="err">${h(e)}</div>`).join("")}
      ${this.readyButton(l, priced, ready)}
      ${this.lobby?.phase === "countdown" ? `<div class="code" style="margin-top:12px">Launch in ${this.lobby.countdown}…</div>` : ""}`;
  }

  /** Until the last step the button walks you forward; Ready only appears on Launch. */
  private readyButton(l: Loadout, priced: ReturnType<typeof priceLoadout>, ready: boolean): string {
    const i = STEPS.indexOf(this.step);
    if (i < STEPS.length - 1) return `<button class="primary big" data-step="${STEPS[i + 1]}">Next: ${STEPS[i + 1]} →</button>`;
    const warn = this.warnings(l);
    if (this.confirming && !ready && warn.length)
      return `<div class="warnbox"><b>Launch anyway?</b>${warn.map((w) => `<div class="err">${h(w)}</div>`).join("")}
        <div class="row"><button class="primary" data-ready="1" data-force="1">Ready anyway</button><button data-cancel-ready>Back</button></div></div>`;
    return `<button class="primary big" data-ready="${ready ? 0 : 1}" ${priced.ok ? "" : "disabled"}>${ready ? "Unready" : "Ready"}</button>`;
  }

  /**
   * Pausing (experimental). Off; forced tactical timeouts for both players; or a pause clock each player
   * spends to stop everyone (unlimited in practice, like FTL's own pause).
   */
  private pauseRules(cfg: MatchConfig, host: boolean, practice: boolean): string {
    const dis = host ? "" : "disabled";
    const mode = cfg.pause ?? "off";
    const num = (k: keyof MatchConfig, v: number | undefined, min: number, max: number, step: number) =>
      `<input data-cfg="${k}" type="number" min="${min}" max="${max}" step="${step}" value="${v ?? 0}" ${dis} style="width:70px">`;
    const sel = (v: string, label: string) => `<option value="${v}" ${mode === v ? "selected" : ""}>${label}</option>`;
    let more = "";
    if (mode === "tactical")
      more = `<div class="kv"><span>Timeout every (s)</span>${num("tacticalEvery", cfg.tacticalEvery, 15, 600, 15)}</div>
        <div class="kv"><span>Timeout length (s)</span>${num("tacticalLength", cfg.tacticalLength, 3, 60, 1)}</div>
        <div class="note">Time stops for both captains: give orders, then press Space when ready (it ends early once both are).</div>`;
    else if (mode === "clock")
      more = `<div class="kv"><span>Pause time each (s)</span>${num("pauseBank", cfg.pauseBank, practice ? 0 : 10, 600, 10)}</div>
        <div class="kv"><span>Regained per minute (s)</span>${num("pauseRegen", cfg.pauseRegen, 0, 60, 1)}</div>
        <div class="note">Space pauses everyone and spends your clock; Space again resumes. ${practice ? "0 = unlimited, like FTL." : ""}</div>`;
    return `<div class="kv"><span>Pausing <span class="note">(experimental)</span></span><select data-cfg="pause" ${dis}>
        ${sel("off", "Off")}${sel("tactical", "Tactical timeouts")}${sel("clock", "Pause clock")}</select></div>${more}`;
  }

  /** Host of a real match: what friends type to join (server address + this code), with copy buttons. */
  private sharePanel(lobby: LobbyState): string {
    const s = this.hooks.share?.();
    if (!s || lobby.practice || lobby.players.length >= 2) return "";
    const rows = s.addresses.map((a) => `<div class="kv"><code class="share-addr">${h(a)}</code><button class="small" data-copy="${h(a)}">Copy</button></div>`).join("");
    return `<div class="share"><div class="note">Friends join with the address and code ${h(lobby.code)}:</div>${rows}<div class="note">${h(s.note)}</div></div>`;
  }

  private confirming = false;
  private lastCountdown = 0;

  /** Things worth a second look before launching (FTL would let you, but you'd regret it). */
  private warnings(l: Loadout): string[] {
    const db = this.db;
    const out: string[] = [];
    const ws = l.weapons.map((id) => db.weapons[id]).filter(Boolean);
    if (!ws.length) out.push("No weapons are fitted.");
    const needsMissiles = ws.filter((w) => w.missiles > 0);
    if (needsMissiles.length && l.missiles < 4) out.push(`${needsMissiles.map((w) => w.short ?? w.title).join(", ")} use missiles, but you only have ${l.missiles}.`);
    const bars = l.systems.weapons ?? 0;
    if (ws.length && !ws.some((w) => w.power <= bars)) out.push(`Weapon system level ${bars} can't power any fitted weapon.`);
    // Like missiles without a launcher's ammo: drones can be bought, but without the system there's no drone panel.
    if ((l.drones ?? []).length && !(l.systems.drones ?? 0)) out.push("Drones are fitted but there's no drone control system, so they can't be launched.");
    return out;
  }

  private nav(back: Step | null, next: Step | null): string {
    return `<div class="hg-nav">${back ? `<button data-step="${back}">← ${back}</button>` : "<span></span>"}${next ? `<button class="primary" data-step="${next}">${next} →</button>` : ""}</div>`;
  }

  /** A step's number as the tabs show it. */
  private num(step: Step): number {
    return STEPS.indexOf(step) + 1;
  }

  /** Saved builds: pick one (straight to Launch), start a new ship, or delete one (after a confirmation). */
  private stepPresets(): string {
    const db = this.db;
    const cfg = this.lobby!.config;
    const pool = cfg.shipPool.length ? cfg.shipPool : db.hangar;
    const list = presets.list();
    const cards = list
      .map((p) => {
        const ship = db.ships[p.loadout.ship];
        const allowed = !!ship && pool.includes(p.loadout.ship);
        const priced = ship ? priceLoadout(db, p.loadout, cfg.scrap, cfg.shipPool, cfg.unlimited) : null;
        const over = !!priced && priced.total > cfg.scrap;
        const other = priced?.errors.find((e) => !/budget/.test(e));
        const warn = !allowed ? (ship ? "Not allowed in this lobby" : "Ship not found in your game data") : over ? `Costs ${priced!.total} (allowance ${cfg.scrap})` : other ?? "";
        const confirm = this.confirmDel === p.id
          ? `<div class="preset-confirm"><div>Delete “${h(p.name)}”? This can't be undone.</div><div class="row"><button class="small danger" data-preset-del-yes="${h(p.id)}">Delete</button><button class="small" data-preset-del-no>Keep</button></div></div>`
          : "";
        return `<div class="preset-card ${warn ? "warn" : ""} ${allowed ? "" : "off"}">
          <button class="preset-pick" data-preset="${h(p.id)}" ${allowed ? "" : "disabled"}>
            <canvas class="preset-snap" data-snap="${h(p.id)}"></canvas>
            <span class="pc-name">${h(p.name)}</span>
            <span class="note pc-ship">${h(ship?.title ?? p.loadout.ship)}${ship?.className ? ` · ${h(ship.className)}` : ""}</span>
            <span class="pc-cost">${this.scrapIcon()}<b>${priced?.total ?? "?"}</b> <span class="note">scrap</span>${warn ? `<span class="pc-warn">${h(warn)}</span>` : ""}</span>
          </button>
          <button class="small preset-del" data-preset-ask="${h(p.id)}" title="Delete this preset">✕</button>${confirm}
        </div>`;
      })
      .join("");
    return `<h2>${this.num("Presets")} · Presets</h2>
      <div class="note">${list.length ? "Pick a saved ship to fly it (straight to Launch), or build a new one." : "No presets yet: build a ship, then save it from the Launch step to see it here."}</div>
      <div class="preset-grid">
        <button class="preset-new" data-step="Ship"><span class="plus">+</span><span>New ship</span><span class="note">Choose a hull and build from scratch</span></button>
        ${cards}
      </div>${this.nav(null, "Ship")}`;
  }

  /** "Save as preset" on Launch: hidden while the build is an unchanged loaded preset. */
  private saveBox(l: Loadout): string {
    if (this.loaded && isSame(l, this.loaded.loadout))
      return `<div class="note save-note">${h(this.savedNote || `Flying your preset “${this.loaded.name}”.`)}</div>`;
    const def = this.loaded ? copyName(this.loaded.name) : (this.db.ships[l.ship]?.title ?? "My ship");
    return `<div class="save-box"><h2>Save as preset</h2>
      <div class="row"><input data-preset-name maxlength="40" placeholder="Preset name" value="${h(this.saveName ?? def)}"><button data-preset-save>Save preset</button></div>
      <div class="note">Saved on this computer; pick it from Presets next time.</div></div>`;
  }

  private savePreset(): void {
    if (!this.loadout) return;
    const input = this.el.querySelector<HTMLInputElement>("[data-preset-name]");
    const name = (input?.value ?? this.saveName ?? "").trim() || (this.db.ships[this.loadout.ship]?.title ?? "My ship");
    const p = presets.save(name, this.loadout);
    this.loaded = { id: p.id, name: p.name, loadout: structuredClone(p.loadout) };
    this.saveName = null;
    this.savedNote = `Saved as preset “${p.name}”.`;
    this.sfx("powerUpSystem");
    input?.blur();
    this.render();
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
    return `<h2>${this.num("Ship")} · Choose a hull</h2><div class="note">Switching hulls resets your purchases.</div><div class="ship-grid">${cards}</div>${this.nav("Presets", "Systems")}`;
  }

  private stepSystems(l: Loadout): string {
    const db = this.db;
    const base = baseLoadout(db, l.ship);
    const unl = !!this.lobby?.config.unlimited;
    const isSub = (id: string) => ["pilot", "sensors", "doors", "battery"].includes(id);
    const installed = hullSystems(db, l.ship, unl).filter((s) => !isSub(s.id) && (l.systems[s.id] ?? s.base) > 0).length;
    const atCap = installed >= RULES.maxSystems;
    const rows = hullSystems(db, l.ship, unl)
      .map((s) => {
        const lv = l.systems[s.id] ?? s.base;
        // FTL's 8-system limit: a new (main) system can't go in once 8 are installed (a bay swap is fine).
        const capped = lv === 0 && !isSub(s.id) && atCap && !this.bayPair(s.id);
        const bp = db.systems[s.id];
        const next = lv >= s.max ? "max" : lv === 0 ? `install ${bp?.cost ?? "?"}` : `next ${bp?.upgradeCost[lv - 1] ?? bp?.upgradeCost[bp.upgradeCost.length - 1] ?? "?"}`;
        const bars = Array.from({ length: s.max }, (_, i) => `<i class="${i < Math.min(s.base, lv) ? "on" : i < lv ? "new" : ""}"></i>`).join("");
        return `<div class="sys-row">${this.sysIcon(s.id)}<span class="sys-name">${s.id}</span><span class="bars">${bars}</span>
          <button class="small" data-sys="${s.id}" data-d="-1" ${lv <= s.base && !(this.bayPair(s.id) && lv > 0 && hullSystems(db, l.ship).some((x) => x.id === this.bayPair(s.id) && x.base > 0)) ? "disabled" : ""}>−</button>
          <button class="small" data-sys="${s.id}" data-d="1" ${lv >= s.max || capped ? "disabled" : ""}>+</button><span class="note">${capped ? "system limit reached" : next}</span></div>
          ${this.sysInfo(s.id, lv, s.max)}`;
      })
      .join("");
    return `<h2>${this.num("Systems")} · Systems <span class="note">${installed}/${RULES.maxSystems} systems</span></h2>
      <div class="note">Green bars came with the hull; yellow ones are bought. Shields give a layer per 2 bars; engines give evasion; weapons bars power your guns. The medbay and clone bay share a room: installing one replaces the other.</div>
      ${rows}
      <div class="sys-row"><span class="sysicon ph">⚡</span><span class="sys-name">reactor</span><span><b>${l.reactor}</b></span>
        <button class="small" data-reactor="-1" ${l.reactor <= base.reactor ? "disabled" : ""}>−</button>
        <button class="small" data-reactor="1" ${l.reactor >= reactorCap(db, l.ship, unl) ? "disabled" : ""}>+</button><span class="note">${RULES.reactorPrice(l.reactor)} per bar</span></div>
      ${db.reactorDesc ? `<div class="sys-info"><div>${h(db.reactorDesc)}</div></div>` : ""}
      ${this.powerNote(l)}
      ${this.nav("Ship", "Weapons")}`;
  }

  /**
   * FTL's own description of a system and its "Level N" lines (from the player's install), with the numbers
   * in FTL's templates filled from the arena's rules. The level you have is highlighted.
   */
  private sysInfo(id: SystemId, lv: number, max: number): string {
    const bp = this.db.systems[id];
    if (!bp?.desc && !bp?.levels) return "";
    const fill = (t: string, n: number): string => {
      const v: Record<string, (n: number) => (number | string)[]> = {
        cloaking: (n) => [RULES.cloakDuration[n] ?? "?"],
        teleporter: (n) => [RULES.teleCooldown[n] ?? "?"],
        engines: (n) => [`${RULES.engineEvasion[n] ?? "?"}%`],
        medbay: (n) => [+((RULES.medbayHeal[n] ?? 0) / RULES.medbayHeal[1]).toFixed(1)],
        oxygen: (n) => [+((RULES.o2Refill[n] ?? 0) / RULES.o2Refill[1]).toFixed(1)],
        hacking: (n) => [RULES.hackPulse[n] ?? "?"],
        battery: (n) => [RULES.batteryPower[n] ?? "?"],
        clonebay: (n) => [RULES.cloneTime[n] ?? "?"],
      };
      const vals = v[id]?.(n) ?? [];
      // There's no FTL jump in the arena, so the engines' "/ FTL: \2x" half is dropped.
      const base = id === "engines" ? t.replace(/\s*\/\s*FTL:.*$/, "") : t;
      return base.replace(/\\(\d)/g, (_, i) => String(vals[Number(i) - 1] ?? "?"));
    };
    // Group runs of the same line ("More System Power" for every weapons level) into one "Lv 2-8" entry.
    const lines = (bp.levels ?? []).slice(0, max).map((t, i) => (t ? fill(t, i + 1) : ""));
    const runs: { from: number; to: number; text: string }[] = [];
    lines.forEach((text, i) => {
      if (!text) return;
      const last = runs[runs.length - 1];
      if (last && last.text === text && last.to === i) last.to = i + 1;
      else runs.push({ from: i + 1, to: i + 1, text });
    });
    const chips = runs
      .map((r) => {
        const cls = lv >= r.from && lv <= r.to ? "now" : lv > r.to ? "have" : "";
        return `<span class="lvl ${cls}"><b>Lv ${r.from === r.to ? r.from : `${r.from}-${r.to}`}</b> ${h(r.text)}</span>`;
      })
      .join("");
    return `<div class="sys-info">${bp.desc ? `<div>${h(bp.desc)}</div>` : ""}${chips ? `<div class="lvls">${chips}</div>` : ""}</div>`;
  }

  private bayPair(id: SystemId): SystemId | null {
    return id === "medbay" ? "clonebay" : id === "clonebay" ? "medbay" : null;
  }

  /** Reactor vs what running everything at once would need. */
  private powerNote(l: Loadout): string {
    const need = fullPowerNeed(this.db, l);
    const short = need - l.reactor;
    return `<div class="note power-need">Full power needs <b>${need}</b> reactor bars · you have <b>${l.reactor}</b>${short > 0 ? ` <span class="err">(${short} short: some systems will run underpowered)</span>` : short < 0 ? ` (${-short} spare)` : ""}</div>`;
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
    return `<h2>${this.num("Weapons")} · Weapons</h2>
      <div class="wslots-sticky"><div class="wslots">${slots}</div>
      <div class="sys-row"><span class="sysicon ph">⦿</span><span class="sys-name">missiles</span><span><b>${l.missiles}</b></span>
        <button class="small" data-msl="-1" ${l.missiles <= 0 ? "disabled" : ""}>−</button>
        <button class="small" data-msl="1">+</button><span class="note">${RULES.missilePrice} scrap each</span></div>
      ${this.powerNote(l)}
      <div class="note">Drag weapons onto a slot (or click a price). Drag an equipped weapon to another slot to reorder, or back to the store to sell it for half price.</div></div>
      <div class="shop-drop">${shop}</div>${this.nav("Systems", "Drones")}`;
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
    return `<h2>${this.num("Crew")} · Crew (${l.crew.length}/${RULES.maxCrew})</h2>
      <div class="note">Starting crew are free. Rename anyone; dismissing gives no refund. Crew fight fires, repair and man stations: manned helm and engines add evasion, manned weapons charge faster, manned shields recharge faster.</div>
      ${crew}<h3>Hire</h3><div class="race-grid">${hire}</div>${this.nav("Drones", "Augments")}`;
  }

  private droneArt(id: string): string {
    const bp = this.db.droneBPs[id];
    if (!bp || !this.hasArt()) return `<div class="ph-weapon">D</div>`;
    // Interior drones fly no sprite: show their crew-style portrait (anti-personnel, repair, ion intruder)
    // or FTL's drone icon.
    if (!bp.image) {
      const sheet = { BATTLE: "battle", REPAIR: "repair" }[bp.type as string] ?? (bp.id === "BOARDER_ION" ? "boarder_ion" : "");
      if (sheet && this.db.anims[`${sheet}_portrait`]) return this.portrait(sheet, 1.2);
      const icon = `systemUI/weapbox_icon_D_${bp.icon}.png`;
      return bp.icon && hasImg(icon) ? `<img class="drone-art" src="/assets/img/${h(icon)}">` : `<div class="ph-weapon">D</div>`;
    }
    const f = [`ship/drones/${bp.image}_base.png`, `ship/drones/${bp.image}_off.png`].find(hasImg);
    if (!f) return `<div class="ph-weapon">D</div>`;
    return `<img class="drone-art" src="/assets/img/${h(f)}" onerror="this.style.visibility='hidden'">`;
  }

  private stepDrones(l: Loadout): string {
    const db = this.db;
    const ship = db.ships[l.ship];
    const slots = ship.droneSlots ?? 0;
    const has = (l.systems.drones ?? 0) > 0;
    const fitted = Array.from({ length: slots }, (_, i) => {
      const id = (l.drones ?? [])[i];
      if (!id) return `<div class="wslot empty">drone slot ${i + 1}</div>`;
      const d = db.droneBPs[id];
      return `<div class="wslot">${this.droneArt(id)}<div><b>${i + 1}. ${h(d?.title ?? id)}</b><div class="note">${d ? this.droneStats(id) : ""}</div></div><button class="small" data-undrone="${i}" title="Sell / remove">✕</button></div>`;
    }).join("");
    const full = (l.drones ?? []).length >= slots;
    const cards = buyableDrones(db)
      .map((id) => {
        const d = db.droneBPs[id];
        const ok = ["COMBAT", "DEFENSE", "SHIP_REPAIR", "BATTLE", "REPAIR", "BOARDER", "SHIELD"].includes(d.type);
        return `<div class="wcard ${ok ? "" : "inert"}">${this.droneArt(id)}<div class="wcard-body"><b>${h(d.title)}</b><div class="note">${this.droneStats(id)}</div>
          ${ok ? "" : `<div class="note noeffect">Not in the arena yet (a later update).</div>`}</div>
          <button class="small buy" data-drone="${id}" ${full || !slots ? "disabled" : ""}>${this.scrapIcon()}${d.cost}</button></div>`;
      })
      .join("");
    const base = baseLoadout(db, l.ship);
    return `<h2>${this.num("Drones")} · Drones</h2>
      ${slots ? "" : `<p class="note">This hull has no drone slots.</p>`}
      ${slots && !has ? `<p class="err">No drone control system: you can still buy drones, but they can't be launched until it's installed (Systems step).</p>` : ""}
      <div class="wslots-sticky"><div class="wslots">${fitted}</div>
      <div class="sys-row"><span class="sysicon ph">⚙</span><span class="sys-name">drone parts</span><span><b>${l.droneParts ?? 0}</b></span>
        <button class="small" data-parts="-1" ${(l.droneParts ?? 0) <= 0 ? "disabled" : ""}>−</button>
        <button class="small" data-parts="1">+</button><span class="note">${RULES.dronePartPrice} each; each launch uses one (hull came with ${base.droneParts ?? 0})</span></div>
      ${this.powerNote(l)}</div>
      <div class="race-grid">${cards}</div>${this.nav("Weapons", "Crew")}`;
  }

  private droneStats(id: string): string {
    const d = this.db.droneBPs[id];
    const what = { COMBAT: "attacks the enemy", DEFENSE: d.antiDrone ? "shoots enemy drones" : d.id === "DEFENSE_1" ? "shoots down missiles" : "shoots down missiles and lasers", SHIP_REPAIR: "repairs hull", REPAIR: "repairs systems", BATTLE: "fights boarders", BOARDER: "boards the enemy", HACKING: "hacks", SHIELD: "builds a super shield" }[d.type] ?? d.type;
    return `${d.power} pwr · ${what}`;
  }

  private stepAugments(l: Loadout): string {
    const db = this.db;
    const augs = l.augments ?? [];
    const base = baseLoadout(db, l.ship).augments ?? [];
    const full = augs.length >= MAX_AUGMENTS;
    const fitted = Array.from({ length: MAX_AUGMENTS }, (_, i) => {
      const id = augs[i];
      if (!id) return `<div class="wslot empty">augment slot ${i + 1}</div>`;
      const a = db.augments[id];
      return `<div class="wslot"><div><b>${h(a?.title ?? id)}</b>${base.includes(id) ? ` <span class="note">(came with the hull)</span>` : ""}<div class="note">${h(a?.desc ?? "")}</div></div><button class="small" data-unaug="${i}" title="Remove">✕</button></div>`;
    }).join("");
    const all = Object.values(db.augments).sort((a, b) => a.title.localeCompare(b.title));
    const cards = all
      .map((a) => {
        const has = augs.includes(a.id);
        return `<div class="wcard aug"><div class="wcard-body"><b>${h(a.title)}</b>${a.stackable ? ` <span class="note">stacks</span>` : ""}
          <div class="note">${h(a.desc)}</div></div>
          <button class="small buy" data-aug="${a.id}" ${full || (has && !a.stackable) ? "disabled" : ""}>${this.scrapIcon()}${a.cost}</button></div>`;
      })
      .join("");
    return `<h2>${this.num("Augments")} · Augments (${augs.length}/${MAX_AUGMENTS})</h2>
      <div class="wslots-sticky"><div class="wslots">${fitted}</div>
      <div class="note">Up to ${MAX_AUGMENTS}. Starting augments are free; removing one gives no refund.</div></div>
      <div class="race-grid">${cards}</div>${this.nav("Crew", "Launch")}`;
  }

  private stepLaunch(l: Loadout, priced: ReturnType<typeof priceLoadout>): string {
    const ready = !!this.lobby?.players.find((p) => p.id === this.me())?.ready;
    const cd = this.lobby?.phase === "countdown" ? `<div class="code launch-count">Launch in ${this.lobby.countdown}…</div>` : "";
    return `<h2>${this.num("Launch")} · Launch</h2>
      <p>${priced.ok ? "Your ship is ready. Press <b>Ready</b> (or Enter); the battle starts when both captains are ready." : "Fix the problems listed on the right first."}</p>
      <div class="launch-ready">${this.readyButton(l, priced, ready)}${cd}</div>
      ${this.saveBox(l)}
      <div class="note">Controls: click a weapon (or 1-4) then an enemy room · right-click a weapon to power it down · select crew and right-click a room to move them · click system bars for power · click doors to open/close.</div>
      ${this.nav("Augments", null)}`;
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
    if (d.preset) {
      const p = presets.get(d.preset);
      if (!p) return;
      this.loaded = { id: p.id, name: p.name, loadout: structuredClone(p.loadout) };
      this.savedNote = "";
      this.saveName = null;
      this.confirmDel = null;
      this.step = "Launch";
      this.sfx("powerUpSystem");
      return this.change(structuredClone(p.loadout));
    }
    if (d.presetAsk) {
      this.confirmDel = d.presetAsk;
      this.sfx("hoverBeep");
      return this.render();
    }
    if ("presetDelNo" in d) {
      this.confirmDel = null;
      return this.render();
    }
    if (d.presetDelYes) {
      presets.remove(d.presetDelYes);
      if (this.loaded?.id === d.presetDelYes) this.loaded = null;
      this.confirmDel = null;
      this.sfx("powerDownSystem");
      return this.render();
    }
    if ("presetSave" in d) return this.savePreset();
    if (d.copy) {
      void navigator.clipboard?.writeText(d.copy).catch(() => {});
      this.sfx("hoverBeep");
      return;
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
      const base = hullSystems(this.db, l.ship, !!this.lobby?.config.unlimited).find((s) => s.id === id)!.base;
      // Medbay and clone bay share a room: installing one removes the other, and removing a swapped-in
      // one puts the hull's original back.
      const pair = this.bayPair(id);
      const pairBase = pair ? (hullSystems(this.db, l.ship).find((s) => s.id === pair)?.base ?? 0) : 0;
      const floor = pair && pairBase > 0 ? 0 : base;
      l.systems[id] = Math.max(floor, (l.systems[id] ?? base) + Number(d.d));
      if (pair && Number(d.d) > 0) l.systems[pair] = 0;
      if (pair && l.systems[id] === 0 && pairBase > 0) l.systems[pair] = pairBase;
    } else if (d.reactor) l.reactor += Number(d.reactor);
    else if (d.msl) l.missiles = Math.max(0, l.missiles + Number(d.msl));
    else if (d.buy && l.weapons.length < ship.weaponSlots) l.weapons.push(d.buy);
    else if (d.sell) l.weapons.splice(Number(d.sell), 1);
    else if (d.hire && l.crew.length < RULES.maxCrew) l.crew.push({ race: d.hire, name: randomCrewName(this.db, l.crew.map((c) => c.name), Date.now() & 0xffff) });
    else if (d.fire) l.crew.splice(Number(d.fire), 1);
    else if (d.aug) l.augments = [...(l.augments ?? []), d.aug];
    else if (d.drone && (l.drones ?? []).length < (ship.droneSlots ?? 0)) l.drones = [...(l.drones ?? []), d.drone];
    else if (d.undrone) l.drones = (l.drones ?? []).filter((_, i) => i !== Number(d.undrone));
    else if (d.parts) l.droneParts = Math.max(0, (l.droneParts ?? 0) + Number(d.parts));
    else if (d.unaug) l.augments = (l.augments ?? []).filter((_, i) => i !== Number(d.unaug));
    else if (d.reroll) l.crew[Number(d.reroll)].name = randomCrewName(this.db, l.crew.map((c) => c.name), (Date.now() * 7) & 0xffff);
    else if (d.ready) {
      if (d.ready === "1" && !d.force && this.warnings(l).length) {
        this.confirming = true;
        this.sfx("powerUpFail");
        return this.render();
      }
      this.confirming = false;
      this.sfx(d.ready === "1" ? "acceptUpgrades" : "undoUpgrades");
      return this.hooks.ready(d.ready === "1");
    } else if ("cancelReady" in d) {
      this.confirming = false;
      return this.render();
    }
    else if ("leave" in d) return this.hooks.leave();
    else return;
    const down = !!(d.sell || d.fire || d.unaug || d.undrone || (d.parts && Number(d.parts) < 0) || (d.d && Number(d.d) < 0) || (d.reactor && Number(d.reactor) < 0) || (d.msl && Number(d.msl) < 0));
    this.sfx(down ? "powerDownSystem" : "powerUpSystem");
    this.change(l);
  }

  /**
   * Builder shortcuts. Enter in a text box submits it (it loses focus); otherwise Enter moves to the next
   * page, and on the last page it's the only key that readies up. Tab moves forward, Shift+Tab, Backspace
   * and Escape go back; Escape unreadies first if you're ready.
   */
  private onKey(e: KeyboardEvent): void {
    if (!this.el.isConnected || !this.loadout || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    const typing = !!t && ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName) && this.el.contains(t);
    const i = STEPS.indexOf(this.step);
    const go = (d: number) => {
      const n = Math.max(0, Math.min(STEPS.length - 1, i + d));
      if (n === i) return;
      this.step = STEPS[n];
      this.confirming = false;
      this.sfx("hoverBeep");
      this.render();
    };
    const me = this.lobby?.players.find((p) => p.id === this.me());
    const press = (sel: string) => this.el.querySelector<HTMLButtonElement>(`${sel}:not(:disabled)`)?.click();
    if (e.key === "Enter") {
      e.preventDefault();
      if (typing && "presetName" in t!.dataset) return this.savePreset();
      if (typing) return t!.blur();
      if (i < STEPS.length - 1) return go(1);
      // The last page: ready (or, past a warning, "Ready anyway").
      if (!me?.ready) press('button[data-ready="1"]');
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (typing) t!.blur();
      return go(e.shiftKey ? -1 : 1);
    }
    if (typing) {
      if (e.key === "Escape") t!.blur();
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      return go(-1);
    }
    if (e.key === "Escape" && this.confirmDel) {
      e.preventDefault();
      this.confirmDel = null;
      return this.render();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (this.confirming) {
        this.confirming = false;
        return this.render();
      }
      if (me?.ready) {
        this.sfx("undoUpgrades");
        return this.hooks.ready(false);
      }
      return go(-1);
    }
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    if ("presetName" in t.dataset) this.saveName = t.value;
    if (t.dataset.prac === "difficulty") {
      const b = t.parentElement?.querySelector("b");
      if (b) b.textContent = t.value;
    }
  }

  private onChange(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if ("music" in t.dataset) {
      setBattleTrack(t.value);
      this.sfx("hoverBeep");
    } else if (t.dataset.cfg) {
      const k = t.dataset.cfg as keyof MatchConfig;
      const v = k === "winCondition" || k === "pause" || k === "hazard" ? t.value : k === "unlimited" ? (t as HTMLInputElement).checked : Number(t.value);
      this.hooks.setConfig({ [k]: v } as Partial<MatchConfig>);
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
