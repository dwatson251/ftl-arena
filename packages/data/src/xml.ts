/**
 * A small tolerant XML reader for FTL's data files. They are fragments (several roots, sometimes no
 * <FTL> wrapper), use `attr ="x"` spacing, keep commented-out duplicate blueprints, and occasionally
 * leave a tag unclosed. Comments are dropped; a stray close tag pops back to its matching open tag.
 */
export interface XNode {
  tag: string;
  attrs: Record<string, string>;
  children: XNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });

export function parseXml(src: string): XNode {
  const root: XNode = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack: XNode[] = [root];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      stack[stack.length - 1].text += decode(src.slice(i));
      break;
    }
    if (lt > i) stack[stack.length - 1].text += decode(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith("<?", lt) || src.startsWith("<!", lt)) {
      const end = src.indexOf(">", lt);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const gt = findTagEnd(src, lt);
    const body = src.slice(lt + 1, gt);
    i = gt + 1;
    if (body.startsWith("/")) {
      const name = body.slice(1).trim();
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === name) {
          stack.length = k;
          break;
        }
      }
      continue;
    }
    const selfClose = body.endsWith("/");
    const inner = selfClose ? body.slice(0, -1) : body;
    const m = /^\s*([^\s/>]+)/.exec(inner);
    if (!m) continue;
    const node: XNode = { tag: m[1], attrs: {}, children: [], text: "" };
    const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    const rest = inner.slice(m[0].length);
    while ((a = attrRe.exec(rest))) node.attrs[a[1]] = decode(a[3] ?? a[4] ?? "");
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

function findTagEnd(src: string, from: number): number {
  let q: string | null = null;
  for (let j = from + 1; j < src.length; j++) {
    const c = src[j];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === ">") return j;
  }
  return src.length - 1;
}

export const kids = (n: XNode | undefined, tag?: string): XNode[] =>
  n ? n.children.filter((c) => !tag || c.tag === tag) : [];
export const kid = (n: XNode | undefined, tag: string): XNode | undefined => n?.children.find((c) => c.tag === tag);
export const txt = (n: XNode | undefined, tag: string): string | undefined => {
  const k = kid(n, tag);
  return k ? k.text.trim() : undefined;
};
export const num = (n: XNode | undefined, tag: string, dflt = 0): number => {
  const t = txt(n, tag);
  const v = t === undefined || t === "" ? NaN : Number(t);
  return Number.isFinite(v) ? v : dflt;
};
/** Every element in document order whose tag matches, at any depth. */
export function walk(n: XNode, tag: string, out: XNode[] = []): XNode[] {
  for (const c of n.children) {
    if (c.tag === tag) out.push(c);
    walk(c, tag, out);
  }
  return out;
}
