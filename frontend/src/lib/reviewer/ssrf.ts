import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/* ─────────────────────────────────────────────────────────
 * SSRF GUARD — the auditor fetches whatever URL it's given,
 * so every hop is checked: scheme, port, credentials, then a
 * DNS lookup whose every answer must be a public address.
 * The browser re-checks each request through the same guard
 * (see capture.ts), and the fetch fallback follows redirects
 * by hand so each Location is checked too.
 * ───────────────────────────────────────────────────────── */

export type UrlErrorCode = "invalid" | "scheme" | "port" | "private" | "dns";

export class UrlError extends Error {
  code: UrlErrorCode;
  constructor(message: string, code: UrlErrorCode) {
    super(message);
    this.name = "UrlError";
    this.code = code;
  }
}

export const PRIVATE_MESSAGE = "That address points to a private network, so it's blocked.";

const BLOCKED_SCHEMES = /^(javascript|data|file|mailto|ftp|about|blob|vbscript|chrome|view-source|ws|wss|gopher):/i;

/** Normalizes user input to an http(s) URL, or throws a UrlError with copy for the UI. */
export function parseTarget(input: string): URL {
  let raw = input.trim();
  if (!raw) throw new UrlError("Paste a link to a product page.", "invalid");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !BLOCKED_SCHEMES.test(raw)) raw = `https://${raw.replace(/^\/+/, "")}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlError("That doesn't look like a web address.", "invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UrlError("Only http and https links work.", "scheme");
  if (url.username || url.password) throw new UrlError("Links with a username or password aren't allowed.", "invalid");

  const host = bareHost(url.hostname);
  if (host === "localhost" || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) throw new UrlError(PRIVATE_MESSAGE, "private");
  if (!host || (!host.includes(".") && !isIP(host))) throw new UrlError("That doesn't look like a public website.", "invalid");
  if (isIP(host) && isPrivateAddress(host)) throw new UrlError(PRIVATE_MESSAGE, "private");
  if (url.port && url.port !== "80" && url.port !== "443") throw new UrlError("Only standard web ports (80 and 443) are allowed.", "port");

  url.hash = "";
  return url;
}

function bareHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function v4Parts(ip: string): number[] {
  return ip.split(".").map((p) => Number(p));
}

function isPrivateV4(ip: string): boolean {
  const [a, b, c] = v4Parts(ip);
  if (a === 0 || a === 10 || a === 127) return true; // this network, private, loopback
  if (a === 169 && b === 254) return true; // link-local (cloud metadata lives here)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function hexToV4(hi: string, lo: string): string {
  const h = parseInt(hi, 16);
  const l = parseInt(lo, 16);
  return `${h >> 8}.${h & 255}.${l >> 8}.${l & 255}`;
}

function isPrivateV6(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === "::" || x === "::1") return true;
  const dotted = x.match(/^(?:::ffff:|::ffff:0:|::)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateV4(dotted[1]);
  const hex = x.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) return isPrivateV4(hexToV4(hex[1], hex[2]));
  const nat64 = x.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
  if (nat64) return isPrivateV4(nat64[1]);
  const first = parseInt(x.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/** True for loopback, private, link-local, CGNAT, multicast and other non-public ranges. */
export function isPrivateAddress(ip: string): boolean {
  const host = bareHost(ip);
  const v = isIP(host);
  if (v === 4) return isPrivateV4(host);
  if (v === 6) return isPrivateV6(host);
  return true;
}

export type LookupFn = (host: string) => Promise<{ address: string; family: number }[]>;

const defaultLookup: LookupFn = (host) => dnsLookup(host, { all: true, verbatim: true });

/** Resolves a hostname and requires every answer to be public. */
export async function resolvePublic(hostname: string, lookup: LookupFn = defaultLookup): Promise<string[]> {
  const host = bareHost(hostname);
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new UrlError(PRIVATE_MESSAGE, "private");
    return [host];
  }
  let answers: { address: string; family: number }[];
  try {
    answers = await lookup(host);
  } catch {
    throw new UrlError(`Couldn't find ${host}. Check the address.`, "dns");
  }
  if (!answers.length) throw new UrlError(`Couldn't find ${host}. Check the address.`, "dns");
  if (answers.some((a) => isPrivateAddress(a.address))) throw new UrlError(PRIVATE_MESSAGE, "private");
  return answers.map((a) => a.address);
}

/** parseTarget + resolvePublic: the full check for user input. */
export async function validateTarget(input: string, lookup?: LookupFn): Promise<URL> {
  const url = parseTarget(input);
  await resolvePublic(url.hostname, lookup);
  return url;
}

/**
 * A cached yes/no check for every request the headless browser makes,
 * so a public page can't pull in http://169.254.169.254/ as an image.
 */
export function createRequestGuard(lookup?: LookupFn): (url: string) => Promise<boolean> {
  const cache = new Map<string, Promise<boolean>>();
  return async (raw: string) => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return false;
    }
    if (url.protocol === "data:" || url.protocol === "blob:") return true;
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.port && url.port !== "80" && url.port !== "443") return false;
    const host = bareHost(url.hostname);
    let hit = cache.get(host);
    if (!hit) {
      hit = resolvePublic(host, lookup).then(
        () => true,
        () => false,
      );
      cache.set(host, hit);
    }
    return hit;
  };
}
