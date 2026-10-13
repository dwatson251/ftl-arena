/**
 * Chat, in battle only, and out of sight until it's used: no buttons, nothing on screen.
 * - Messages show for a moment in the lower middle of the view (above the weapons bar) and fade.
 * - Enter opens the entry line (a single subtle underline), Enter sends, Escape cancels. While it's open the
 *   recent messages show above it, on a translucent black box with soft edges.
 * - Text is in FTL's font; characters it can't draw are stripped before sending and again on arrival.
 * Hotkeys never see what's typed (the input stops its own keys).
 */
export type ChatMode = "off" | "battle";

const SHOW_MS = 7000;
const FADE_MS = 1200;

/** What FTL's bitmap fonts can draw: printable ASCII (anything else is dropped), spaces collapsed, 200 at most. */
export function cleanChat(s: string): string {
  return String(s ?? "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

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
    this.input.spellcheck = false;
    this.input.autocomplete = "off";
    this.el.append(this.log, this.input);
    document.body.appendChild(this.el);
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const t = cleanChat(this.input.value);
        if (t) this.send(t);
        this.input.value = "";
        this.close();
        e.preventDefault();
      } else if (e.key === "Escape") {
        this.input.value = "";
        this.close();
        e.preventDefault();
      }
    });
    this.input.addEventListener("keyup", (e) => e.stopPropagation());
    // Enter (outside any field, no menu open) opens the entry line.
    window.addEventListener("keydown", (e) => {
      if (this.mode !== "battle" || this.open || e.key !== "Enter") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (document.querySelector("#ui .overlay")) return;
      e.preventDefault();
      this.openInput();
    });
    setInterval(() => this.mode === "battle" && this.render(), 250);
    this.render();
  }

  add(from: string, text: string): void {
    const t = cleanChat(text);
    if (!t) return;
    this.lines.push({ from: cleanChat(from) || "?", text: t, at: Date.now() });
    if (this.lines.length > 40) this.lines.shift();
    this.render();
  }

  setMode(mode: ChatMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode !== "battle") this.close();
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
    const now = Date.now();
    // While typing: the last few lines; otherwise only fresh ones, fading out.
    const shown = this.mode !== "battle" ? [] : this.lines.filter((l) => this.open || now - l.at < SHOW_MS).slice(-4);
    this.el.className = `chat${this.open ? " open" : ""}`;
    this.el.style.display = this.mode === "battle" && (this.open || shown.length) ? "" : "none";
    this.log.replaceChildren(
      ...shown.map((l) => {
        const d = document.createElement("div");
        d.className = "chat-line";
        const age = now - l.at;
        if (!this.open && age > SHOW_MS - FADE_MS) d.style.opacity = String(Math.max(0, (SHOW_MS - age) / FADE_MS));
        const b = document.createElement("b");
        b.textContent = `${l.from}: `;
        d.append(b, document.createTextNode(l.text));
        return d;
      }),
    );
    this.input.style.display = this.open ? "" : "none";
  }
}
