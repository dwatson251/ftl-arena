/**
 * Immediate-mode drawing on a retained scene: call begin(), then sprite()/text()/gfx() with stable keys
 * every frame, then end(). Nodes are reused by key; unused ones are hidden. Avoids re-creating Pixi
 * Text (expensive) and Sprites 60 times a second.
 */
import { Container, Graphics, Sprite, Text, TextStyle, type Texture } from "pixi.js";

export interface SpriteOpts {
  anchor?: number | [number, number];
  scale?: number | [number, number];
  rotation?: number;
  tint?: number;
  alpha?: number;
  w?: number;
  h?: number;
}

const styles = new Map<string, TextStyle>();
export function style(size: number, fill: number, weight: "400" | "700" = "400", align: "left" | "center" | "right" = "left"): TextStyle {
  const k = `${size}|${fill}|${weight}|${align}`;
  let s = styles.get(k);
  if (!s) {
    s = new TextStyle({ fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: size, fill, fontWeight: weight, align, letterSpacing: 0.3 });
    styles.set(k, s);
  }
  return s;
}

export class Imm {
  private sprites = new Map<string, Sprite>();
  private texts = new Map<string, Text>();
  private gfxs = new Map<string, Graphics>();
  private used = new Set<string>();
  private z = 0;

  constructor(public root: Container) {}

  begin(): void {
    this.used.clear();
    this.z = 0;
  }

  private place<T extends Container>(key: string, node: T): T {
    this.used.add(key);
    node.visible = true;
    node.zIndex = this.z++;
    return node;
  }

  sprite(key: string, tex: Texture | null, x: number, y: number, o: SpriteOpts = {}): Sprite | null {
    if (!tex) return null;
    let s = this.sprites.get(key);
    if (!s) {
      s = new Sprite(tex);
      this.sprites.set(key, s);
      this.root.addChild(s);
    }
    if (s.texture !== tex) s.texture = tex;
    s.position.set(x, y);
    const a = o.anchor ?? 0;
    typeof a === "number" ? s.anchor.set(a) : s.anchor.set(a[0], a[1]);
    if (o.w !== undefined || o.h !== undefined) {
      s.width = o.w ?? tex.width;
      s.height = o.h ?? tex.height;
    } else {
      const sc = o.scale ?? 1;
      typeof sc === "number" ? s.scale.set(sc) : s.scale.set(sc[0], sc[1]);
    }
    s.rotation = o.rotation ?? 0;
    s.tint = o.tint ?? 0xffffff;
    s.alpha = o.alpha ?? 1;
    return this.place(key, s);
  }

  text(key: string, str: string, x: number, y: number, st: TextStyle, anchor: [number, number] = [0, 0], rotation = 0): Text {
    let t = this.texts.get(key);
    if (!t) {
      t = new Text({ text: str, style: st });
      this.texts.set(key, t);
      this.root.addChild(t);
    }
    if (t.text !== str) t.text = str;
    if (t.style !== st) t.style = st;
    t.anchor.set(anchor[0], anchor[1]);
    t.position.set(x, y);
    t.rotation = rotation;
    return this.place(key, t);
  }

  gfx(key: string): Graphics {
    let g = this.gfxs.get(key);
    if (!g) {
      g = new Graphics();
      this.gfxs.set(key, g);
      this.root.addChild(g);
    }
    g.clear();
    return this.place(key, g);
  }

  end(): void {
    for (const m of [this.sprites, this.texts, this.gfxs] as Map<string, Container>[])
      for (const [k, n] of m) if (!this.used.has(k)) n.visible = false;
    this.root.sortableChildren = true;
  }
}
