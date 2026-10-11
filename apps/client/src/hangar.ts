/**
 * The hangar, as a stepped process: Presets (saved builds), Ship, Systems, Weapons, Drones, Crew, Augments,
 * then Launch. Prices are
 * computed locally for instant feedback; the server re-prices every loadout before it accepts "ready".
 */
import { SUBSYSTEMS, type GameDB, type SystemId } from "@ftl/data";
import { battleTrackSetting, play, setBattleTrack } from "./audio.ts";
import { hasImg } from "./assets.ts";
import { copyName, isSame, presets } from "./presets.ts";
import { drawSnapshot } from "./snapshot.ts";
import { HangarBay } from "./bay.ts";
import type { LobbyState, PracticeConfig } from "@ftl/protocol";
import {
  baseLoadout, buildShip, buyableDrones, reactorUsed, usable, fullPowerNeed, reactorCap, buyableWeapons, difficultyToBot, hireableRaces, hullSystems, MAX_AUGMENTS, priceLoadout, RACES, randomCrewName, RULES, type Loadout,
  type MatchConfig, stockLoadout, SURVIVAL,
} from "@ftl/sim";

const h = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const ALL_STEPS = ["Rules", "Presets", "Ship", "Systems", "Weapons", "Drones", "Crew", "Augments", "Launch"] as const;
type Step = (typeof ALL_STEPS)[number];
/** The steps where the ship summary panel shows on the right (the shopping ones). */
const BUILD_STEPS: Step[] = ["Ship", "Systems", "Weapons", "Drones", "Crew", "Augments"];
const SUBSYSTEM_IDS: SystemId[] = SUBSYSTEMS;

/**
 * Hangar sounds in one place, to try alternatives after a playtest. Spending and refunding scrap use FTL's
 * upgrade-screen sounds (bp_upgrade_1 / select_down2); FTL's store uses `buy` / `sell` (bp_purchase_1) for
 * purchases, the other thing worth trying.
 */
/** A small gamepad beside players on a controller (so opponents know). */
const PAD_ICON = `<svg class="pad-icon" viewBox="0 0 24 16" width="20" height="13" aria-label="Playing with a controller"><title>Playing with a controller</title><path fill="currentColor" d="M6 1h12a5 5 0 0 1 5 5v1.5a6.5 6.5 0 0 1-11.3 4.4h-1.4A6.5 6.5 0 0 1 1 7.5V6a5 5 0 0 1 5-5Zm0 3.5v2H4v1.5h2v2h1.5v-2h2V6.5h-2v-2H6Zm11 1a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm-2.5 2.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/></svg>`;

const SFX = { spend: "upgradeSystem", refund: "undoUpgrades", pick: "acceptUpgrades", nav: "hoverBeep" };

/** Set when a battle starts: the hangar after it (a rematch) opens on Launch, the ship already built. */
let backFromBattle = false;
export function hangarAfterBattle(): void {
  backFromBattle = true;
}

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
  /** Chosen on the first lobby update (the host starts on Rules); see update(). */
  step: Step = "Ship";
  private stepChosen = false;
  /** The Launch step's hangar-bay view (made on first use, kept across renders). */
  private bay: HangarBay | null = null;
  /** The preset this build came from (unchanged = no "save as preset" offer). */
  private loaded: { id: string; name: string; loadout: Loadout } | null = null;
  /** The name typed into "Save as preset" (null = the default), and what was last saved. */
  private saveName: string | null = null;
  private savedNote = "";
  /** A preset waiting for "delete?" confirmation; "New ship" waiting for "discard your changes?". */
  private confirmDel: string | null = null;
  private confirmNew = false;
  /** The FTL import (or FTL-made preset) this build came from: while unchanged it keeps its "ftl" origin. */
  private ftlBase: Loadout | null = null;
  /** Host: turning "Bring your own ship" on would clear other captains' builds, so it asks first. */
  private confirmFtlOnly = false;
  private wasFtlOnly = false;
  /** This machine's FTL save in progress, as the server read it (asked for each time Presets opens). */
  private ftl: { ok: boolean; loadout?: Loadout; notes?: string[]; shipName?: string; title?: string; className?: string; savedAt?: number } | null = null;
  private ftlAsked = false;
  private confirmFtl = false;
  /** What an FTL import left behind, shown on Launch until the build changes. */
  private importNotes: { loadout: Loadout; notes: string[] } | null = null;
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

  /** The hangar is going away (battle, menu): free the bay's WebGL context. */
  destroy(): void {
    this.bay?.destroy();
    this.bay = null;
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
      this.sfx(SFX.nav);
    } else if (data.startsWith("buy:")) {
      const id = data.slice(4);
      if (slot < l.weapons.length) l.weapons[slot] = id; // replace (the old one is sold)
      else if (l.weapons.length < ship.weaponSlots) l.weapons.push(id);
      this.sfx(SFX.spend);
    }
    this.change(l);
  }

  private sellSlot(i: number): void {
    if (!this.loadout) return;
    const l = structuredClone(this.loadout);
    l.weapons.splice(i, 1);
    this.sfx(SFX.refund);
    this.change(l);
  }

  update(lobby: LobbyState): void {
    // The launch countdown beeps once a second (a sharper warning on the last).
    const n = lobby.phase === "countdown" ? lobby.countdown : 0;
    if (n > 0 && n !== this.lastCountdown) this.sfx(n === 1 ? "environWarning" : "hoverBeep");
    this.lastCountdown = n;
    this.lobby = lobby;
    if (!this.stepChosen) {
      // The host sets the rules first; everyone else starts on their presets (or the hull, with none).
      // Back from a battle, everyone already has a ship: straight to Launch.
      this.stepChosen = true;
      this.step = backFromBattle ? "Launch" : lobby.host === this.me() ? "Rules" : presets.list().length ? "Presets" : "Ship";
      backFromBattle = false;
    }
    // Lost the host's chair (or never had it): the Rules step isn't yours.
    if (this.step === "Rules" && lobby.host !== this.me()) this.step = "Presets";
    const mine = lobby.players.find((p) => p.id === this.me());
    // "Bring your own ship" just switched on: the server cleared everyone else's build; start over on Presets.
    const ftlOnly = !!lobby.config.ftlOnly;
    if (ftlOnly && !this.wasFtlOnly && lobby.host !== this.me() && mine?.loadout && this.loadout?.origin !== "ftl") {
      this.loadout = mine.loadout;
      this.loaded = null;
      this.importNotes = null;
      this.ftlBase = null;
      this.step = "Presets";
    }
    this.wasFtlOnly = ftlOnly;
    if (!this.loadout && mine?.loadout) this.loadout = mine.loadout;
    if (this.loadout && lobby.config.shipPool.length && !lobby.config.shipPool.includes(this.loadout.ship) && mine?.loadout) this.loadout = mine.loadout;
    // Survival: the server flies the stock ship, so take its copy (it replaces any build when the mode starts).
    if (lobby.config.survival && mine?.loadout && (!this.loadout || !isSame(mine.loadout, this.loadout))) this.loadout = mine.loadout;
    // A step this rule closes (e.g. Launch before a save's ship is loaded): back to Presets (Survival: Ship).
    if (this.loadout && !this.stepOpen(this.step)) this.step = lobby.config.survival ? "Ship" : "Presets";
    this.render();
  }

  private change(l: Loadout): void {
    // The FTL origin lasts only while the ship is exactly as it came from the save.
    if (l.origin && !(this.ftlBase && isSame(l, this.ftlBase) && l.ship === this.ftlBase.ship)) delete l.origin;
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
    // (Checkboxes hold nothing half-typed, so they never hold a render back.)
    const box = active instanceof HTMLInputElement && (active.type === "checkbox" || active.type === "radio");
    if (active && !box && this.el.contains(active) && ["INPUT", "SELECT", "TEXTAREA"].includes((active as HTMLElement).tagName)) {
      this.pendingRender = true;
      return;
    }
    this.pendingRender = false;
    const db = this.db;
    const cfg = lobby.config;
    const priced = priceLoadout(db, l, this.budget(), cfg.shipPool, cfg.unlimited, cfg.winCondition === "auto");
    const me = lobby.players.find((p) => p.id === this.me());
    const scrollTop = this.el.querySelector(".hg-main")?.scrollTop ?? 0;
    if (this.step === "Presets" && !this.ftlAsked) {
      this.ftlAsked = true;
      void fetch("/api/ftl-save")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((j) => {
          this.ftl = j;
          if (this.step === "Presets") this.render();
        });
    } else if (this.step !== "Presets") this.ftlAsked = false;
    const body = { Rules: () => this.stepRules(lobby), Presets: () => this.stepPresets(), Ship: () => this.stepShip(l), Systems: () => this.stepSystems(l), Weapons: () => this.stepWeapons(l), Drones: () => this.stepDrones(l), Crew: () => this.stepCrew(l), Augments: () => this.stepAugments(l), Launch: () => this.stepLaunch(l, priced) }[this.step]();
    this.el.innerHTML = `
      <div class="hg">
        <div class="hg-steps">${this.steps().map((s, i) => `<button class="hg-step ${s === this.step ? "on" : ""} ${this.stepOpen(s) ? "" : "locked"}" data-step="${s}" ${this.stepOpen(s) ? "" : `disabled title="${cfg.survival ? "Off in Survival: you fly the stock ship and earn upgrades between battles" : s === "Launch" ? "Load your ship from an FTL save first (Presets)" : "Off in Bring your own ship: ships come from FTL saves"}"`}><b>${i + 1}</b> ${s}</button>`).join("")}
          <div class="hg-scrap">${cfg.survival ? `<span class="note">Survival: the stock ship, upgraded by rewards after each win</span>` : cfg.ftlOnly ? `<span class="note">Bring your own ship: FTL saves only, no scrap limit</span>` : `${this.scrapIcon()}<span class="scrap">${cfg.scrap - priced.total}</span> <span class="note">scrap left of ${cfg.scrap}</span>`}</div></div>
        <div class="hg-body ${BUILD_STEPS.includes(this.step) ? "" : "wide"} step-${this.step.toLowerCase()}">
          <div class="panel hg-side">${this.sidebar(lobby)}</div>
          <div class="panel hg-main">${body}</div>
          ${BUILD_STEPS.includes(this.step) ? `<div class="panel hg-summary">${this.summary(l, priced, me?.ready ?? false)}</div>` : ""}
        </div>
      </div>`;
    const main = this.el.querySelector(".hg-main");
    if (main) main.scrollTop = scrollTop;
    // The hangar bay (Launch): one canvas kept across renders, re-seated in its placeholder.
    const slot = this.el.querySelector("[data-bay]");
    if (slot) {
      this.bay ??= new HangarBay(db);
      slot.replaceWith(this.bay.el);
      this.bay.show(l);
      this.bay.pause(false);
    } else this.bay?.pause(true);
    for (const c of this.el.querySelectorAll<HTMLCanvasElement>("canvas[data-snap]")) {
      const p = presets.get(c.dataset.snap!);
      if (p) void drawSnapshot(c, db, p.loadout, p.look, this.hasArt(), p.id);
    }
  }

  /** The lobby: code, how to invite, who's here, a one-glance rules summary, and the way out. */
  private sidebar(lobby: LobbyState): string {
    const players = lobby.players
      .map((p) => `<div class="p"><span>${h(p.name)}${p.id === lobby.host ? " ★" : ""}${p.controller ? ` ${PAD_ICON}` : ""}${p.connected ? "" : " (offline)"}</span><span class="${p.ready ? "ready" : "notready"}">${p.ready ? "READY" : "building"}</span></div>`)
      .join("") + (lobby.players.length < 2 ? `<div class="note">Waiting for an opponent: share the code.</div>` : "");
    return `
      <h2>Lobby</h2><div class="code">${lobby.code}</div>${this.sharePanel(lobby)}<div class="players">${players}</div>
      <h2 style="margin-top:14px">Rules</h2>${this.rulesSummary(lobby, true)}
      <div style="margin-top:14px"><button data-leave>Leave lobby</button></div>`;
  }

  /** The rules in a few small read-only lines (the host can jump to the Rules step to change them). */
  private rulesSummary(lobby: LobbyState, link: boolean): string {
    const cfg = lobby.config;
    const hazard: Record<string, string> = { none: "none", random: "random", sun: "red giant", pulsar: "pulsar", asteroids: "asteroids", nebula: "nebula", storm: "ion storm", asb: "anti-ship batteries" };
    const pause: Record<string, string> = { off: "off", tactical: `tactical timeouts every ${cfg.tacticalEvery ?? 0}s`, clock: "pause clock" };
    if (cfg.survival) {
      const lines = ["Survival: battle after battle", "Stock ship · rewards after each win", `Boss every ${SURVIVAL.bossEvery} battles`, `Pausing: ${pause[cfg.pause ?? "off"] ?? cfg.pause}`];
      const host = lobby.host === this.me();
      return `<div class="rules-summary">${lines.map((x) => `<div>${h(x)}</div>`).join("")}${link && host && this.step !== "Rules" ? `<button class="small link" data-step="Rules">Change rules</button>` : ""}</div>`;
    }
    const lines = [
      cfg.winCondition === "auto" ? "Destroy the ship · autonomous ships" : "Destroy the ship (or its crew)",
      cfg.ftlOnly ? "Bring your own ship (FTL saves only)" : `${cfg.scrap} scrap${cfg.unlimited ? " · unrestricted systems" : ""}`,
      cfg.timeLimit ? `${cfg.timeLimit}s time limit` : "No time limit",
      `Hazard: ${hazard[cfg.hazard ?? "none"] ?? cfg.hazard}`,
      `Pausing: ${pause[cfg.pause ?? "off"] ?? cfg.pause}`,
    ];
    const pc = lobby.practice;
    if (pc) {
      const botShip = lobby.players.find((p) => p.bot)?.loadout?.ship;
      lines.push(`Bot ${pc.difficulty}${botShip ? ` · ${this.db.ships[botShip]?.className || this.db.ships[botShip]?.title || botShip}` : ""}`);
    }
    const host = lobby.host === this.me();
    return `<div class="rules-summary">${lines.map((x) => `<div>${h(x)}</div>`).join("")}${link && host && this.step !== "Rules" ? `<button class="small link" data-step="Rules">Change rules</button>` : ""}</div>`;
  }

  /** Host only: the match rules (and the practice bot), set once before everyone builds. */
  private stepRules(lobby: LobbyState): string {
    const cfg = lobby.config;
    const pc = lobby.practice;
    return `<h2>${this.num("Rules")} · Rules</h2>
      <div class="note">You're the host: set the match up, then everyone builds a ship. Changing a rule unreadies both captains.</div>
      <div class="rules-form">
      <div class="kv"><span>Game mode</span><select data-cfg="winCondition">
        <option value="hull" ${cfg.survival ? "" : "selected"}>Destroy the ship</option>
        ${pc ? `<option value="survival" ${cfg.survival ? "selected" : ""}>Survival (single player)</option>` : ""}</select></div>
      ${cfg.survival ? this.survivalRules(lobby) : `
      <div class="kv"><span>Scrap${cfg.ftlOnly ? ` <span class="note">(not used: FTL saves)</span>` : ""}</span><input data-cfg="scrap" type="number" min="0" max="10000" step="50" value="${cfg.scrap}" ${cfg.ftlOnly ? "disabled" : ""} style="width:90px"></div>
      <div class="kv"><span>Time limit (s)</span><input data-cfg="timeLimit" type="number" min="0" max="3600" step="30" value="${cfg.timeLimit}" style="width:90px"></div>
      <label class="kv"><span>Autonomous ships</span><input type="checkbox" data-auto ${cfg.winCondition === "auto" ? "checked" : ""}></label>
      <div class="note">${cfg.winCondition === "auto" ? "Only destroying the ship wins: with no crew a ship runs itself, like FTL's drone ships and the flagship (systems repair on their own, the helm flies itself). Ships may launch with no crew at all." : "Hull to 0 wins; a dead crew also loses, as in FTL."}</div>
      <div class="kv"><span>Hazard</span><select data-cfg="hazard">
        ${([["none", "None"], ["random", "Random"], ["sun", "Red giant (solar flares)"], ["pulsar", "Pulsar (ion pulses)"], ["asteroids", "Asteroid field"], ["nebula", "Nebula (no sensors)"], ["storm", "Ion storm (half reactor)"], ["asb", "Anti-ship batteries"]] as const).map(([v, l]) => `<option value="${v}" ${(cfg.hazard ?? "none") === v ? "selected" : ""}>${l}</option>`).join("")}
      </select></div>
      ${this.pauseRules(cfg, true, !!pc)}
      ${this.buildRules(lobby)}`}
      </div>
      ${this.nav(null, cfg.survival ? "Ship" : "Presets")}`;
  }

  /** Survival's own rules: no build or bot settings (the run picks its enemies), just how it works. */
  private survivalRules(lobby: LobbyState): string {
    const pc = lobby.practice;
    return `<label class="kv"><span>Autonomous ships <span class="note">(not in Survival)</span></span><input type="checkbox" disabled></label>
      <div class="note">Pick a ship and fly its stock loadout. Battles come one after another against random enemies that get tougher each jump, with the Rebel flagship every ${SURVIVAL.bossEvery} battles and the odd hazard. Your hull, crew, damage and supplies carry over. After each win you have ${SURVIVAL.aftermath} s to patch the ship up (${SURVIVAL.aftermathBoarders} s if enemy boarders are still aboard), then choose one reward: gear (rare finds are gold), an upgrade, or repairs and supplies. Lose the ship and the run ends with a score.</div>
      ${this.pauseRules(lobby.config, true, true)}
      ${pc ? `<label class="kv"><span>Debug tools in battle</span><input type="checkbox" data-prac="debug" ${pc.debug ? "checked" : ""}></label>` : ""}`;
  }

  /** The rules for building and fighting (everything but Survival). */
  private buildRules(lobby: LobbyState): string {
    const cfg = lobby.config;
    const pc = lobby.practice;
    const bot = pc ? difficultyToBot(pc.difficulty) : null;
    const botShip = lobby.players.find((p) => p.bot)?.loadout?.ship;
    const pool = cfg.shipPool.length ? cfg.shipPool : this.db.hangar;
    return `
      <label class="kv"><span>Unrestricted systems</span><input type="checkbox" data-cfg="unlimited" ${cfg.unlimited ? "checked" : ""}></label>
      <div class="kv"><span>Ships</span><select data-cfg="ftlOnly">
        <option value="" ${cfg.ftlOnly ? "" : "selected"}>Build in the hangar</option>
        <option value="1" ${cfg.ftlOnly ? "selected" : ""}>Bring your own ship (FTL saves only)</option></select></div>
      <div class="note">${cfg.ftlOnly ? "Every captain flies the ship from their own FTL run: Load from FTL (or a preset saved from one, unchanged). No building and no scrap limit." : "Captains build ships with the scrap allowance."}</div>
      ${this.confirmFtlOnly ? `<div class="warnbox"><b>Switch to Bring your own ship?</b><div class="err">This clears the ship ${h(this.othersBuilding().join(", ") || "the other captain")} ${this.othersBuilding().length > 1 ? "have" : "has"} been building and sends them back to Presets to load an FTL save.</div><div class="row"><button class="primary" data-ftlonly-yes>Switch</button><button data-ftlonly-no>Keep building</button></div></div>` : ""}
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
        <label class="kv"><span>Debug tools in battle</span><input type="checkbox" data-prac="debug" ${pc.debug ? "checked" : ""}></label>` : ""}`;
  }

  /** The current build at a glance while shopping (no bill: the scrap counter at the top has the total). */
  private summary(l: Loadout, priced: ReturnType<typeof priceLoadout>, ready: boolean): string {
    const db = this.db;
    const ship = db.ships[l.ship];
    const st = this.shipStats(l);
    return `
      <h2>${h(ship.title)}</h2>
      <div class="note">${h(ship.className)}</div>
      ${this.miniship(ship.img)}
      <div class="note">Hull ${ship.health} · power ${st.used}/${st.reactor} · evasion ${st.evasion}% · shields ${st.layers}</div>
      <div class="sum-list"><b>Weapons</b> ${l.weapons.map((w) => h(db.weapons[w]?.title ?? w)).join(", ") || "none"}</div>
      ${(l.drones ?? []).length ? `<div class="sum-list"><b>Drones</b> ${(l.drones ?? []).map((d) => h(db.droneBPs[d]?.title ?? d)).join(", ")}</div>` : ""}
      <div class="sum-list"><b>Crew</b> ${l.crew.map((c) => `${h(c.name)} <span class="note">${h(db.crew[c.race]?.title ?? c.race)}</span>${this.skills(c)}`).join(", ")}</div>
      ${(l.augments ?? []).length ? `<div class="sum-list"><b>Augments</b> ${(l.augments ?? []).map((a) => h(db.augments[a]?.title ?? a)).join(", ")}</div>` : ""}
      <div class="sum-list"><b>Stores</b> ${l.missiles} missiles · ${l.droneParts ?? 0} drone parts</div>
      ${priced.errors.map((e) => `<div class="err small">${h(e)}</div>`).join("")}
      ${this.readyButton(l, priced, ready)}`;
  }

  /** Numbers for the summary and Launch: power use, evasion and shield layers as the ship would start. */
  private shipStats(l: Loadout): { used: number; reactor: number; evasion: number; layers: number; unpowered: string[]; weaponNeed: number; weaponCap: number } {
    try {
      const st = buildShip(this.db, l, 0, "", () => "x");
      const eng = st.systems.engines ? Math.min(st.systems.engines.power, usable(st.systems.engines)) : 0;
      const sh = st.systems.shields ? Math.min(st.systems.shields.power, usable(st.systems.shields)) : 0;
      const unpowered = [
        ...Object.values(st.systems).filter((x) => x && !SUBSYSTEM_IDS.includes(x.id) && x.level > 0 && x.power < x.level).map((x) => `${x!.id} ${x!.power}/${x!.level}`),
        ...st.weapons.filter((w) => !w.powered).map((w) => `${this.db.weapons[w.bp]?.title ?? w.bp} (off)`),
      ];
      const weaponNeed = l.weapons.reduce((a, w) => a + (this.db.weapons[w]?.power ?? 0), 0);
      return { used: reactorUsed(st), reactor: st.reactor, evasion: RULES.engineEvasion[Math.min(8, eng)] ?? 0, layers: Math.floor(sh / 2), unpowered, weaponNeed, weaponCap: st.systems.weapons ? usable(st.systems.weapons) : 0 };
    } catch {
      return { used: 0, reactor: l.reactor, evasion: 0, layers: 0, unpowered: [], weaponNeed: 0, weaponCap: 0 };
    }
  }

  /** Until the last step the button walks you forward; Ready only appears on Launch. */
  private readyButton(l: Loadout, priced: ReturnType<typeof priceLoadout>, ready: boolean): string {
    const steps = this.steps();
    const i = steps.indexOf(this.step);
    if (i < steps.length - 1) {
      const next = steps.slice(i + 1).find((s) => this.stepOpen(s));
      return next ? `<button class="primary big" data-step="${next}">Next: ${next} →</button>` : "";
    }
    const warn = this.warnings(l);
    if (this.confirming && !ready && warn.length)
      return `<div class="warnbox"><b>Launch anyway?</b>${warn.map((w) => `<div class="err">${h(w)}</div>`).join("")}
        <div class="row"><button class="primary" data-ready="1" data-force="1">Ready anyway</button><button data-cancel-ready>Back</button></div></div>`;
    const needSave = !!this.lobby?.config.ftlOnly && l.origin !== "ftl" && !ready;
    return `<button class="primary big" data-ready="${ready ? 0 : 1}" ${priced.ok && !needSave ? "" : "disabled"} ${needSave ? `title="Load your ship from an FTL save first"` : ""}>${ready ? "Unready" : "Ready"}</button>`;
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

  private nav(back: Step | null, next0: Step | null): string {
    const next = next0 && this.stepOpen(next0) ? next0 : null;
    return `<div class="hg-nav">${back ? `<button data-step="${back}">← ${back}</button>` : "<span></span>"}${next ? `<button class="primary" data-step="${next}">${next} →</button>` : ""}</div>`;
  }

  /** "Bring your own ship" has no scrap allowance. */
  private budget(): number {
    return this.lobby?.config.ftlOnly || this.lobby?.config.survival ? Number.MAX_SAFE_INTEGER : (this.lobby?.config.scrap ?? 0);
  }

  /** In "Bring your own ship" only Rules, Presets and (once a save's ship is loaded) Launch are open. */
  private stepOpen(s: Step): boolean {
    // Survival flies the stock ship: pick a hull and go.
    if (this.lobby?.config.survival) return s === "Rules" || s === "Ship" || s === "Launch";
    if (!this.lobby?.config.ftlOnly) return true;
    if (s === "Rules" || s === "Presets") return true;
    return s === "Launch" && this.loadout?.origin === "ftl";
  }

  /** Has anyone else in the lobby started on a ship (or readied)? Turning the save-only rule on clears theirs. */
  private othersBuilding(): string[] {
    const lobby = this.lobby!;
    return lobby.players
      .filter((p) => !p.bot && p.id !== this.me() && p.loadout && (p.ready || !isSame(p.loadout, baseLoadout(this.db, p.loadout.ship)) || p.loadout.ship !== (lobby.config.shipPool[0] ?? this.db.hangar[0])))
      .map((p) => p.name);
  }

  /** This viewer's steps: Rules is the host's alone. */
  private steps(): Step[] {
    return ALL_STEPS.filter((s) => s !== "Rules" || this.lobby?.host === this.me());
  }

  /** A step's number as the tabs show it. */
  private num(step: Step): number {
    return this.steps().indexOf(step) + 1;
  }

  /** Saved builds: pick one (straight to Launch), start a new ship, or delete one (after a confirmation). */
  /** The battle music picker (a personal setting, so it lives on Launch). */
  private musicPicker(): string {
    return `<div class="kv"><span>Battle music</span><select data-music>
      <option value="" ${battleTrackSetting() === "" ? "selected" : ""}>Random</option>
      <option value="off" ${battleTrackSetting() === "off" ? "selected" : ""}>Off</option>
      ${this.db.music.filter((t) => t.combat).map((t) => `<option value="${h(t.name)}" ${battleTrackSetting() === t.name ? "selected" : ""}>${h(t.name)}</option>`).join("")}
      </select></div>`;
  }

  private stepPresets(): string {
    const db = this.db;
    const cfg = this.lobby!.config;
    const pool = cfg.shipPool.length ? cfg.shipPool : db.hangar;
    const list = presets.list();
    const cards = list
      .map((p) => {
        const ship = db.ships[p.loadout.ship];
        // "Bring your own ship": only presets saved unchanged from an FTL import fly.
        const notSave = !!cfg.ftlOnly && p.loadout.origin !== "ftl";
        const allowed = !!ship && pool.includes(p.loadout.ship) && !notSave;
        const priced = ship ? priceLoadout(db, p.loadout, this.budget(), cfg.shipPool, cfg.unlimited, cfg.winCondition === "auto") : null;
        const over = !cfg.ftlOnly && !!priced && priced.total > cfg.scrap;
        const other = priced?.errors.find((e) => !/budget/.test(e));
        const warn = notSave ? "Not from an FTL save: this lobby flies saves only" : !allowed ? (ship ? "Not allowed in this lobby" : "Ship not found in your game data") : over ? `Costs ${priced!.total} (allowance ${cfg.scrap})` : other ?? "";
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
      <div class="note">${cfg.ftlOnly
        ? this.ftl?.ok
          ? "This lobby flies ships from FTL saves: load your run in progress below, or a preset saved from one (unchanged)."
          : "This lobby flies ships from FTL saves, and no FTL run in progress was found on this computer. Start (or continue) a run in FTL, save and quit to the menu, then come back to this step."
        : list.length ? "Pick a saved ship to fly it (straight to Launch), or build a new one." : "No presets yet: build a ship, then save it from the Launch step to see it here."}</div>
      <div class="preset-grid">
        <div class="preset-card preset-new-card"><button class="preset-new" data-preset-new ${this.lobby!.config.ftlOnly ? "disabled" : ""}><span class="plus">+</span><span>New ship</span><span class="note">${this.lobby!.config.ftlOnly ? "Off: this lobby flies ships from FTL saves only" : "Start again from a bare hull"}</span></button>${
          this.confirmNew
            ? `<div class="preset-confirm"><div>Discard the unsaved changes to this build?</div><div class="note">Save it from Launch first to keep it.</div><div class="row"><button class="small danger" data-preset-new-yes>Discard</button><button class="small" data-preset-new-no>Keep</button></div></div>`
            : ""
        }</div>
        ${this.ftlCard()}
        ${cards}
      </div>${this.nav(null, "Ship")}`;
  }

  /** "Load from FTL": only when this machine has an FTL run in progress that reads as an arena ship. */
  private ftlCard(): string {
    const f = this.ftl;
    if (!f?.ok || !f.loadout) return "";
    const when = f.savedAt ? new Date(f.savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
    const confirm = this.confirmFtl
      ? `<div class="preset-confirm"><div>Discard the unsaved changes to this build?</div><div class="note">Save it from Launch first to keep it.</div><div class="row"><button class="small danger" data-ftl-yes>Discard</button><button class="small" data-ftl-no>Keep</button></div></div>`
      : "";
    return `<div class="preset-card preset-new-card"><button class="preset-new preset-ftl" data-ftl-load>
        <span class="plus">⇩</span><span>Load from FTL</span>
        <span class="pc-ftl-ship">${h(f.shipName ?? "")}</span>
        <span class="note">${f.title && f.title !== f.shipName ? `${h(f.title)} · ` : ""}${h(f.className ?? "")}</span>
        ${when ? `<span class="note">Your run in progress · saved ${h(when)}</span>` : ""}
      </button>${confirm}</div>`;
  }

  /** Bring in the FTL run: not a preset and not saved (save it from Launch like any build). */
  private loadFtl(): void {
    const f = this.ftl;
    if (!f?.loadout) return;
    this.loaded = null;
    this.savedNote = "";
    this.saveName = f.shipName || null;
    this.confirmFtl = false;
    this.confirmNew = false;
    this.confirmDel = null;
    this.importNotes = { loadout: structuredClone(f.loadout), notes: f.notes ?? [] };
    this.ftlBase = structuredClone(f.loadout);
    this.step = "Launch";
    this.sfx(SFX.pick);
    this.change(structuredClone(f.loadout));
  }

  /** Skill levels as FTL's two-step bars, for crew that have any experience (FTL imports). */
  private skills(c: Loadout["crew"][number]): string {
    const names: Record<string, string> = { pilot: "Pilot", engines: "Engines", shields: "Shields", weapons: "Weapons", repair: "Repair", combat: "Combat" };
    const out = Object.entries(c.xp ?? {})
      .filter(([, v]) => (v ?? 0) > 0)
      .map(([k, v]) => {
        const [a, b] = RULES.skillXp[k as keyof typeof RULES.skillXp] ?? [1, 2];
        const lv = (v ?? 0) >= b ? 2 : (v ?? 0) >= a ? 1 : 0;
        return `<span class="skill" title="${names[k] ?? k}: ${v}/${b} experience">${names[k] ?? k} <i class="${lv >= 1 ? "on" : ""}"></i><i class="${lv >= 2 ? "on" : ""}"></i></span>`;
      })
      .join("");
    return out ? `<span class="skills">${out}</span>` : "";
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

  /** Has this build changed since it was loaded (a preset) or since the hull was picked (nothing bought)? */
  private unsaved(l: Loadout): boolean {
    return !isSame(l, this.loaded ? this.loaded.loadout : baseLoadout(this.db, l.ship));
  }

  /** "New ship": forget the preset and start over from the lobby's default hull, untouched. */
  private newShip(): void {
    const cfg = this.lobby!.config;
    this.loaded = null;
    this.savedNote = "";
    this.saveName = null;
    this.confirmNew = false;
    this.confirmDel = null;
    this.step = "Ship";
    this.sfx("hoverBeep");
    this.change(baseLoadout(this.db, cfg.shipPool[0] ?? this.db.hangar[0]));
  }

  private savePreset(): void {
    if (!this.loadout) return;
    const input = this.el.querySelector<HTMLInputElement>("[data-preset-name]");
    const name = (input?.value ?? this.saveName ?? "").trim() || (this.db.ships[this.loadout.ship]?.title ?? "My ship");
    const p = presets.save(name, this.loadout);
    this.loaded = { id: p.id, name: p.name, loadout: structuredClone(p.loadout) };
    this.saveName = null;
    this.savedNote = `Saved as preset “${p.name}”.`;
    this.sfx(SFX.pick);
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
          <span class="note">${h(db.crew[c.race]?.title ?? c.race)} · ${t?.hp ?? 100} HP ${this.skills(c)}</span>
          <button class="small" data-reroll="${i}" title="Random name">↻</button>
          <button class="small" data-fire="${i}" ${l.crew.length <= 1 && this.lobby?.config.winCondition !== "auto" ? "disabled" : ""} title="${l.crew.length <= 1 && this.lobby?.config.winCondition !== "auto" ? "A ship needs crew (unless Autonomous ships is on in the rules)" : "Dismiss"}">✕</button></div>`;
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

  /**
   * Launch, full width: the ship parked in FTL's hangar bay (rooms, guns and crew as they'll fight), Ready,
   * and the pre-flight check: problems, power and defences, crew, stores, the rules and the opponent.
   */
  private stepLaunch(l: Loadout, priced: ReturnType<typeof priceLoadout>): string {
    const db = this.db;
    const lobby = this.lobby!;
    const ready = !!lobby.players.find((p) => p.id === this.me())?.ready;
    const cd = lobby.phase === "countdown" ? `<div class="code launch-count">Launch in ${lobby.countdown}…</div>` : "";
    const st = this.shipStats(l);
    const ship = db.ships[l.ship];
    const surv = !!lobby.config.survival;
    const over = lobby.config.ftlOnly || surv ? 0 : priced.total - lobby.config.scrap;
    const opp = lobby.players.find((p) => p.id !== this.me());
    const row = (k: string, v: string, warn = false) => `<div class="kv pf"><span>${k}</span><span class="${warn ? "warnc" : ""}">${v}</span></div>`;
    const crew = l.crew.map((c) => `<div class="pf-crew">${this.portrait(c.race, 1.2)}<span>${h(c.name)} <span class="note">${h(db.crew[c.race]?.title ?? c.race)}</span></span>${this.skills(c)}</div>`).join("");
    return `<h2>${this.num("Launch")} · Launch <span class="note">${h(ship.title)} · ${h(ship.className)}</span></h2>
      ${this.importNotes && isSame(l, this.importNotes.loadout) ? `<div class="import-notes"><b>Loaded from your FTL run.</b> Not saved yet: save it as a preset below to keep it.${this.importNotes.notes.map((n) => `<div class="note">${h(n)}</div>`).join("")}</div>` : ""}
      <div class="launch-grid">
        <div class="launch-left">
          <div data-bay></div>
          <div class="pf-cols">
            <div><h3>Crew (${l.crew.length})</h3>${crew}</div>
            <div><h3>Weapons</h3>${l.weapons.map((w) => `<div class="note">• ${h(db.weapons[w]?.title ?? w)} <span class="dim">${db.weapons[w]?.power ?? "?"} power</span></div>`).join("") || `<div class="note">none</div>`}
              ${(l.drones ?? []).length ? `<h3>Drones</h3>${(l.drones ?? []).map((d) => `<div class="note">• ${h(db.droneBPs[d]?.title ?? d)} <span class="dim">${db.droneBPs[d]?.power ?? "?"} power</span></div>`).join("")}` : ""}
              ${(l.augments ?? []).length ? `<h3>Augments</h3>${(l.augments ?? []).map((a) => `<div class="note">• ${h(db.augments[a]?.title ?? a)}</div>`).join("")}` : ""}</div>
          </div>
        </div>
        <div class="launch-right">
          ${priced.errors.length ? `<div class="warnbox"><b>Fix before launch</b>${priced.errors.map((e) => `<div class="err">${h(e)}</div>`).join("")}${over > 0 ? `<div class="note">Over the allowance by ${over} scrap.</div>` : ""}</div>` : ""}
          <div class="launch-ready">${this.readyButton(l, priced, ready)}${cd}</div>
          <div class="note">${surv ? `Survival, battle 1: a random enemy waits. Win to choose a reward, then jump to the next fight.` : `${opp ? `${h(opp.name)} is ${opp.ready ? "<b class='ready'>ready</b>" : "still building"}.` : "No opponent yet: share the lobby code."} The battle starts when both captains are ready.`}</div>
          <h3>Pre-flight</h3>
          ${row("Hull", String(ship.health))}
          ${row("Reactor", `${st.used} / ${st.reactor} in use`)}
          ${row("Shields", `${st.layers} layer${st.layers === 1 ? "" : "s"}`)}
          ${row("Evasion", `${st.evasion}%`)}
          ${row("Weapon power", `${st.weaponNeed} needed / ${st.weaponCap} system`, st.weaponNeed > st.weaponCap)}
          ${row("Missiles · drone parts", `${l.missiles} · ${l.droneParts ?? 0}`)}
          ${surv ? row("Ship", "stock loadout") : lobby.config.ftlOnly ? row("Ship", "from your FTL save") : row("Scrap left", String(lobby.config.scrap - priced.total), over > 0)}
          ${st.unpowered.length ? `<div class="note warnc">Starts unpowered: ${h(st.unpowered.join(", "))}</div>` : ""}
          <h3>Rules</h3>${this.rulesSummary(lobby, true)}
          ${this.musicPicker()}
          ${surv ? "" : this.saveBox(l)}
        </div>
      </div>
      <div class="note small-print">Controls: click a weapon (or 1-4) then an enemy room · right-click a weapon to power it down · select crew and right-click a room to move them · click system bars for power · click doors to open/close.</div>
      ${this.nav(surv ? "Ship" : lobby.config.ftlOnly ? "Presets" : "Augments", null)}`;
  }

  // ---------------------------------------------------------------- events

  private onClick(e: Event): void {
    const b = (e.target as HTMLElement).closest("button");
    if (!b || !this.loadout) return;
    const l = structuredClone(this.loadout);
    const d = b.dataset;
    const ship = this.db.ships[l.ship];
    if (d.step) {
      if (!this.stepOpen(d.step as Step)) return this.sfx("powerUpFail");
      this.step = d.step as Step;
      this.sfx("hoverBeep");
      return this.render();
    }
    if (d.preset) {
      const p = presets.get(d.preset);
      if (!p) return;
      this.loaded = { id: p.id, name: p.name, loadout: structuredClone(p.loadout) };
      this.ftlBase = p.loadout.origin === "ftl" ? structuredClone(p.loadout) : null;
      this.savedNote = "";
      this.saveName = null;
      this.confirmDel = null;
      this.confirmNew = false;
      this.step = "Launch";
      this.sfx(SFX.pick);
      return this.change(structuredClone(p.loadout));
    }
    if ("presetNew" in d) {
      if (!this.unsaved(this.loadout)) return this.newShip();
      this.confirmNew = true;
      this.sfx("hoverBeep");
      return this.render();
    }
    if ("presetNewYes" in d) return this.newShip();
    if ("ftlonlyYes" in d) {
      this.confirmFtlOnly = false;
      this.sfx(SFX.pick);
      return this.hooks.setConfig({ ftlOnly: true });
    }
    if ("ftlonlyNo" in d) {
      this.confirmFtlOnly = false;
      return this.render();
    }
    if ("ftlLoad" in d) {
      if (!this.unsaved(this.loadout)) return this.loadFtl();
      this.confirmFtl = true;
      this.confirmNew = false;
      this.sfx("hoverBeep");
      return this.render();
    }
    if ("ftlYes" in d) return this.loadFtl();
    if ("ftlNo" in d) {
      this.confirmFtl = false;
      return this.render();
    }
    if ("presetNewNo" in d) {
      this.confirmNew = false;
      return this.render();
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
      this.sfx(SFX.refund);
      return this.render();
    }
    if ("presetSave" in d) return this.savePreset();
    if (d.copy) {
      void navigator.clipboard?.writeText(d.copy).catch(() => {});
      this.sfx("hoverBeep");
      return;
    }
    if ("ship" in d && d.ship) {
      if (this.lobby?.config.survival) {
        // Survival: the stock ship, straight to Launch.
        this.sfx(SFX.pick);
        this.step = "Launch";
        return this.change(stockLoadout(this.db, d.ship));
      }
      if (d.ship !== l.ship) {
        this.sfx(SFX.pick);
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
    // Renaming costs nothing: just a blip. Everything else spends or refunds scrap.
    this.sfx(d.reroll ? SFX.nav : down ? SFX.refund : SFX.spend);
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
    const steps = this.steps();
    const i = steps.indexOf(this.step);
    const go = (d: number) => {
      // Step over closed steps (Bring your own ship).
      let n = i + d;
      while (n >= 0 && n < steps.length && !this.stepOpen(steps[n])) n += d;
      if (n < 0 || n >= steps.length || n === i) return;
      this.step = steps[n];
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
      if (i < steps.length - 1) return go(1);
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
    if (e.key === "Escape" && (this.confirmDel || this.confirmNew || this.confirmFtl)) {
      e.preventDefault();
      this.confirmDel = null;
      this.confirmNew = false;
      this.confirmFtl = false;
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
    // A picked option is final: let go of the dropdown so the page repaints at once (the focus guard holds
    // renders back only for fields still being typed in).
    if (t instanceof HTMLSelectElement) setTimeout(() => {
      t.blur();
      this.render();
    }, 0);
    if ("auto" in t.dataset) {
      // Autonomous ships: only the hull counts, and builds may go without crew.
      this.hooks.setConfig({ winCondition: (t as HTMLInputElement).checked ? "auto" : "hull" });
    } else if ("music" in t.dataset) {
      setBattleTrack(t.value);
      this.sfx("hoverBeep");
    } else if (t.dataset.cfg) {
      const k = t.dataset.cfg as keyof MatchConfig;
      if (k === "ftlOnly" && t.value === "1" && this.othersBuilding().length) {
        // Turning it on would wipe someone's build: ask first (the select goes back until confirmed).
        this.confirmFtlOnly = true;
        (t as HTMLSelectElement).value = "";
        this.sfx("powerUpFail");
        t.blur();
        return this.render();
      }
      // Survival rides on the Game mode box but is a rule of its own (each battle plays as "Destroy the ship").
      if (k === "winCondition") return this.hooks.setConfig(t.value === "survival" ? { survival: true, winCondition: "hull" } : { survival: false });
      const v = k === "pause" || k === "hazard" ? t.value : k === "unlimited" ? (t as HTMLInputElement).checked : k === "ftlOnly" ? t.value === "1" : Number(t.value);
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
