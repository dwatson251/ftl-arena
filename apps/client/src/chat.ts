/**
 * Chat: one widget outside #ui (so the screens re-rendering under it don't wipe it).
 * - In the hangar: a panel docked in the bottom-left corner (the log and an input; Enter sends), which
 *   collapses to its title bar (remembered).
 * - In battle: Enter opens the input, Enter sends (Escape closes); messages show for a while and fade.
 * Hotkeys never see what's typed (the input stops its own keys).
 */
export type ChatMode = "off" | "lobby" | "battle";

const SHOW_MS = 8000;

export class Chat {
  readonly el = document.createElement("div");
  private log = document.createElement("div");
  private head = document.createElement("button");
  /** The hangar's panel folded to its title bar; lines that came in since. */
  private collapsed = false;
  private unread = 0;
  private input = document.createElement("input");
  private lines: { from: string; text: string; at: number }[] = [];
  private mode: ChatMode = "off";
  private open = false;

  constructor(private send: (text: string) => void) {
    this.el.id = "chat";
    this.log.className = "chat-log";
    this.input.className = "chat-input";
    this.input.maxLength = 200;
    this.input.placeholder = "Say something (Enter)";
    this.head.className = "chat-head";
    this.head.addEventListener("click", () => {
      this.collapsed = !this.collapsed;
      if (!this.collapsed) this.unread = 0;
      try {
        localStorage.setItem("ftl-arena-chat-collapsed", this.collapsed ? "1" : "0");
      } catch {}
      this.render();
    });
    try {
      this.collapsed = localStorage.getItem("ftl-arena-chat-collapsed") === "1";
    } catch {}
    this.el.append(this.head, this.log, this.input);
    document.body.appendChild(this.el);
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const t = this.input.value.trim();
        if (t) this.send(t);
        this.input.value = "";
        if (this.mode === "battle") this.close();
        e.preventDefault();
      } else if (e.key === "Escape") {
        this.input.value = "";
        if (this.mode === "battle") this.close();
        else this.input.blur();
      }
    });
    this.input.addEventListener("keyup", (e) => e.stopPropagation());
    // In battle, Enter (outside any field, no menu open) opens the input.
    window.addEventListener("keydown", (e) => {
      if (this.mode !== "battle" || this.open || e.key !== "Enter") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (document.querySelector("#ui .overlay")) return;
      e.preventDefault();
      this.openInput();
    });
    setInterval(() => this.mode === "battle" && this.render(), 500);
    this.render();
  }

  add(from: string, text: string): void {
    this.lines.push({ from, text, at: Date.now() });
    if (this.lines.length > 40) this.lines.shift();
    if (this.mode === "lobby" && this.collapsed) this.unread++;
    this.render();
  }

  setMode(mode: ChatMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.open = false;
    this.render();
  }

  private openInput(): void {
    this.open = true;
    this.render();
    this.input.focus();
  }

  private close(): void {
    this.open = false;
    this.input.blur();
    this.render();
  }

  private render(): void {
    this.el.className = `chat chat-${this.mode}${this.open ? " open" : ""}${this.mode === "lobby" && this.collapsed ? " collapsed" : ""}`;
    document.body.classList.toggle("chat-docked", this.mode === "lobby" && !this.collapsed);
    document.body.classList.toggle("chat-docked-min", this.mode === "lobby" && this.collapsed);
    this.head.textContent = `Chat ${this.collapsed ? "▸" : "▾"}${this.collapsed && this.unread ? ` (${this.unread} new)` : ""}`;
    this.head.style.display = this.mode === "lobby" ? "" : "none";
    const now = Date.now();
    // The hangar shows the last few lines; a battle only recent ones (or all, while typing).
    const shown = this.mode === "lobby" ? this.lines.slice(-6) : this.lines.filter((l) => this.open || now - l.at < SHOW_MS).slice(-6);
    this.log.replaceChildren(
      ...shown.map((l) => {
        const d = document.createElement("div");
        d.className = "chat-line";
        const age = now - l.at;
        if (this.mode === "battle" && !this.open && age > SHOW_MS - 1500) d.style.opacity = String(Math.max(0, (SHOW_MS - age) / 1500));
        const b = document.createElement("b");
        b.textContent = `${l.from}: `;
        d.append(b, document.createTextNode(l.text));
        return d;
      }),
    );
    this.input.style.display = (this.mode === "lobby" && !this.collapsed) || this.open ? "" : "none";
    this.log.style.display = this.mode === "lobby" && this.collapsed ? "none" : "";
  }
}
