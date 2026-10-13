/**
 * Chat: one widget outside #ui (so the screens re-rendering under it don't wipe it).
 * - In the hangar: a small log and an input in the lobby sidebar's corner; Enter sends.
 * - In battle: Enter opens the input, Enter sends (Escape closes); messages show for a while and fade.
 * Hotkeys never see what's typed (the input stops its own keys).
 */
export type ChatMode = "off" | "lobby" | "battle";

const SHOW_MS = 8000;

export class Chat {
  readonly el = document.createElement("div");
  private log = document.createElement("div");
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
    this.el.append(this.log, this.input);
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
    this.el.className = `chat chat-${this.mode}${this.open ? " open" : ""}`;
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
    this.input.style.display = this.mode === "lobby" || this.open ? "" : "none";
  }
}
