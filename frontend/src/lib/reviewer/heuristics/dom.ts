import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element, Text } from "domhandler";

/* ─────────────────────────────────────────────────────────
 * DOM helpers that give cheerio the BeautifulSoup semantics
 * heuristic.py relied on.
 *
 *  - get_text()          → pageText(): every text node, minus
 *                          script/style/noscript/template (modern
 *                          bs4 skips those too)
 *  - get_text(strip=True)→ textOf(): text nodes joined with a
 *                          space. bs4 glued them ("Add" + "to cart"
 *                          became "Addto cart"); we don't.
 *  - find_all(string=re) → stringsMatching(): text nodes whose
 *                          content matches, counted one per node
 *  - class_=re           → classMatches(): any class token, or the
 *                          whole class string, matches
 * ───────────────────────────────────────────────────────── */

export type { CheerioAPI, Element };

const SKIP = new Set(["script", "style", "noscript", "template"]);

export function load(html: string): CheerioAPI {
  return cheerio.load(html);
}

export function isElement(node: AnyNode | null | undefined): node is Element {
  return !!node && (node.type === "tag" || node.type === "script" || node.type === "style");
}

function isText(node: AnyNode): node is Text {
  return node.type === "text";
}

/** Text nodes under `root`, skipping code containers. */
export function textNodes(root: AnyNode): Text[] {
  const out: Text[] = [];
  const stack: AnyNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (isText(node)) {
      out.push(node);
      continue;
    }
    if (isElement(node) && SKIP.has(node.name)) continue;
    const kids = (node as { children?: AnyNode[] }).children;
    if (kids) for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i]);
  }
  return out;
}

export function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/* textOf is called for the same elements many times over (the CTA search
 * walks every span/div once per keyword), so each element's text is built
 * once from its children's cached text. */
const TEXT_CACHE = new WeakMap<AnyNode, string>();

/** get_text(strip=True), but with words kept apart. */
export function textOf(node: AnyNode | null | undefined): string {
  if (!node) return "";
  if (isText(node)) return normalize(node.data);
  if (isElement(node) && SKIP.has(node.name)) return "";
  const cached = TEXT_CACHE.get(node);
  if (cached !== undefined) return cached;
  const kids = (node as { children?: AnyNode[] }).children ?? [];
  const parts: string[] = [];
  for (const k of kids) {
    if (isText(k)) parts.push(k.data);
    else if (isElement(k) || k.type === "root") parts.push(textOf(k));
  }
  const out = normalize(parts.join(" "));
  TEXT_CACHE.set(node, out);
  return out;
}

/** The whole document's readable text (title included), normalized. */
export function pageText($: CheerioAPI): string {
  return textOf($.root()[0]);
}

/** Text nodes (not in code containers) whose content matches. */
export function stringsMatching($: CheerioAPI, re: RegExp): string[] {
  const flags = re.flags.replace("g", "");
  const test = new RegExp(re.source, flags);
  return textNodes($.root()[0])
    .map((t) => t.data)
    .filter((s) => test.test(s));
}

export function attr(el: Element, name: string): string | undefined {
  return el.attribs?.[name];
}

export function classList(el: Element): string[] {
  const c = el.attribs?.class;
  return c ? c.split(/\s+/).filter(Boolean) : [];
}

/** bs4's class_=regex: any single class, or the full class string. */
export function classMatches(el: Element, re: RegExp): boolean {
  const flags = re.flags.replace("g", "");
  const test = new RegExp(re.source, flags);
  const list = classList(el);
  if (list.some((c) => test.test(c))) return true;
  const whole = el.attribs?.class;
  return !!whole && test.test(whole);
}

export function parentOf(node: AnyNode): Element | null {
  const p = node.parent;
  return isElement(p as AnyNode) ? (p as Element) : null;
}

export function ancestors(node: AnyNode): Element[] {
  const out: Element[] = [];
  let p = parentOf(node);
  while (p) {
    out.push(p);
    p = parentOf(p);
  }
  return out;
}

export function hasAncestor(node: AnyNode, names: string[]): boolean {
  return ancestors(node).some((a) => names.includes(a.name));
}

/** All descendant elements of `root` in document order. */
export function descendants(root: AnyNode): Element[] {
  const out: Element[] = [];
  const stack: AnyNode[] = [];
  const kids = (root as { children?: AnyNode[] }).children ?? [];
  for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i]);
  while (stack.length) {
    const node = stack.pop()!;
    if (!isElement(node)) continue;
    out.push(node);
    const ch = node.children;
    for (let i = ch.length - 1; i >= 0; i -= 1) stack.push(ch[i]);
  }
  return out;
}

/** Hidden by markup alone (we can't see CSS here): hidden, aria-hidden, inline display:none. */
export function isAttrHidden(el: Element): boolean {
  const chain = [el, ...ancestors(el)];
  return chain.some((e) => {
    const a = e.attribs ?? {};
    if ("hidden" in a) return true;
    if (a["aria-hidden"] === "true") return true;
    const style = (a.style ?? "").replace(/\s+/g, "").toLowerCase();
    return style.includes("display:none") || style.includes("visibility:hidden");
  });
}

/** Max element nesting depth, where <html> is 1 (as get_depth(soup) counted it). */
export function maxDepth(root: AnyNode): number {
  let max = 0;
  const stack: { node: AnyNode; d: number }[] = [{ node: root, d: 0 }];
  while (stack.length) {
    const { node, d } = stack.pop()!;
    if (d > max) max = d;
    const kids = (node as { children?: AnyNode[] }).children;
    if (!kids) continue;
    for (const k of kids) if (isElement(k)) stack.push({ node: k, d: d + 1 });
  }
  return max;
}

/** Elements whose own text (only text children, like bs4's .string) matches. */
export function elementsWithOwnString($: CheerioAPI, selector: string, re: RegExp): Element[] {
  const test = new RegExp(re.source, re.flags.replace("g", ""));
  return $(selector)
    .toArray()
    .filter(isElement)
    .filter((el) => {
      const kids = el.children;
      if (kids.length === 0) return false;
      if (!kids.every((k) => k.type === "text")) return false;
      return test.test(kids.map((k) => (k as Text).data).join(""));
    });
}

export function count($: CheerioAPI, selector: string): number {
  return $(selector).length;
}

/** Words with at least one letter or digit ("Add to Cart - $100" is 4). */
export function words(s: string): number {
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
