import { describe, expect, it, vi } from "vitest";
import { createRequestGuard, isPrivateAddress, parseTarget, resolvePublic, UrlError, validateTarget } from "../ssrf";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err instanceof UrlError ? err.code : "other";
  }
  return null;
};

describe("parseTarget", () => {
  it("adds https to bare domains and drops the hash", () => {
    expect(parseTarget("allbirds.com/products/mens-tree-runners#top").href).toBe("https://allbirds.com/products/mens-tree-runners");
    expect(parseTarget("  http://example.com/a  ").href).toBe("http://example.com/a");
  });

  it("allows only http and https", () => {
    expect(codeOf(() => parseTarget("ftp://example.com/file"))).toBe("scheme");
    expect(codeOf(() => parseTarget("javascript:alert(1)"))).toBe("scheme");
    expect(codeOf(() => parseTarget("file:///etc/passwd"))).toBe("scheme");
    expect(codeOf(() => parseTarget("data:text/html,hi"))).toBe("scheme");
  });

  it("rejects credentials and odd ports", () => {
    expect(codeOf(() => parseTarget("https://user:pw@example.com/"))).toBe("invalid");
    expect(codeOf(() => parseTarget("http://example.com:8080/"))).toBe("port");
    expect(codeOf(() => parseTarget("example.com:6379"))).toBe("port");
    expect(parseTarget("https://example.com:443/x").href).toBe("https://example.com/x");
  });

  it("blocks loopback, private and metadata hosts, however they're spelled", () => {
    for (const raw of [
      "http://localhost/",
      "http://app.localhost/",
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://0x7f.1/",
      "http://[::1]/",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.8/",
      "http://192.168.1.1/",
      "http://printer.local/",
    ]) {
      expect(codeOf(() => parseTarget(raw)), raw).toBe("private");
    }
  });

  it("rejects things that aren't public hostnames", () => {
    expect(codeOf(() => parseTarget(""))).toBe("invalid");
    expect(codeOf(() => parseTarget("intranet"))).toBe("invalid");
    expect(codeOf(() => parseTarget("http://"))).toBe("invalid");
  });
});

describe("isPrivateAddress", () => {
  it.each([
    ["127.0.0.1", true],
    ["10.1.2.3", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["172.32.0.1", false],
    ["192.168.0.10", true],
    ["169.254.169.254", true],
    ["100.64.0.1", true],
    ["0.0.0.0", true],
    ["224.0.0.1", true],
    ["8.8.8.8", false],
    ["151.101.1.140", false],
    ["::1", true],
    ["::", true],
    ["fc00::1", true],
    ["fd12:3456::1", true],
    ["fe80::1", true],
    ["::ffff:127.0.0.1", true],
    ["::ffff:7f00:1", true],
    ["::ffff:8.8.8.8", false],
    ["2606:4700:4700::1111", false],
    ["not-an-ip", true],
  ])("%s → %s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });
});

describe("resolvePublic", () => {
  const answers = (...ips: string[]) => async () => ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

  it("passes when every answer is public", async () => {
    await expect(resolvePublic("shop.example", answers("93.184.216.34"))).resolves.toEqual(["93.184.216.34"]);
  });

  it("blocks a name that resolves to a private address, even alongside public ones", async () => {
    await expect(resolvePublic("rebind.example", answers("93.184.216.34", "10.0.0.5"))).rejects.toMatchObject({ code: "private" });
    await expect(resolvePublic("meta.example", answers("169.254.169.254"))).rejects.toMatchObject({ code: "private" });
  });

  it("reports DNS failures plainly", async () => {
    const lookup = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(resolvePublic("nope.example", lookup)).rejects.toMatchObject({ code: "dns" });
    await expect(resolvePublic("empty.example", answers())).rejects.toMatchObject({ code: "dns" });
  });

  it("validates input end to end", async () => {
    await expect(validateTarget("shop.example/p/1", answers("93.184.216.34"))).resolves.toBeInstanceOf(URL);
    await expect(validateTarget("http://127.0.0.1/", answers("93.184.216.34"))).rejects.toMatchObject({ code: "private" });
  });
});

describe("createRequestGuard", () => {
  it("checks each host once and blocks private and non-web URLs", async () => {
    const lookup = vi.fn(async (host: string) => [{ address: host === "evil.example" ? "127.0.0.1" : "93.184.216.34", family: 4 }]);
    const guard = createRequestGuard(lookup);
    expect(await guard("https://cdn.example/a.js")).toBe(true);
    expect(await guard("https://cdn.example/b.css")).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(await guard("https://evil.example/x.png")).toBe(false);
    expect(await guard("http://169.254.169.254/latest")).toBe(false);
    expect(await guard("http://cdn.example:8080/")).toBe(false);
    expect(await guard("file:///etc/hosts")).toBe(false);
    expect(await guard("data:image/png;base64,AAAA")).toBe(true);
  });
});
