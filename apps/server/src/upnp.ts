/**
 * Best-effort automatic port forwarding (UPnP IGD), no dependencies: find the router over SSDP, read its
 * description, and ask its WAN connection service to forward a TCP port here. Also the public address lookup.
 */
import { createSocket } from "node:dgram";
import { get as httpGet, request } from "node:http";
import { get as httpsGet } from "node:https";
import { networkInterfaces } from "node:os";

const SERVICES = ["urn:schemas-upnp-org:service:WANIPConnection:1", "urn:schemas-upnp-org:service:WANIPConnection:2", "urn:schemas-upnp-org:service:WANPPPConnection:1"];

/** This machine's addresses on its local networks (IPv4, not loopback). */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces()).flat().filter((a) => a && a.family === "IPv4" && !a.internal).map((a) => a!.address);
}

function discover(timeout = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = createSocket("udp4");
    const msg = Buffer.from(["M-SEARCH * HTTP/1.1", "HOST: 239.255.255.250:1900", 'MAN: "ssdp:discover"', "MX: 2", "ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1", "", ""].join("\r\n"));
    const t = setTimeout(() => {
      s.close();
      reject(new Error("no router answered (UPnP may be off)"));
    }, timeout);
    s.on("message", (m) => {
      const loc = /^location:\s*(.+)$/im.exec(m.toString())?.[1]?.trim();
      if (!loc) return;
      clearTimeout(t);
      s.close();
      resolve(loc);
    });
    s.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    s.send(msg, 1900, "239.255.255.250");
  });
}

const fetchText = (url: string): Promise<string> =>
  new Promise((resolve, reject) => {
    (url.startsWith("https") ? httpsGet : httpGet)(url, { timeout: 4000 }, (r) => {
      let b = "";
      r.on("data", (d) => (b += d));
      r.on("end", () => resolve(b));
    }).on("error", reject).on("timeout", function (this: { destroy(): void }) {
      this.destroy();
      reject(new Error("timed out"));
    });
  });

interface Control {
  url: string;
  svc: string;
}

async function control(location: string): Promise<Control> {
  const xml = await fetchText(location);
  for (const svc of SERVICES) {
    const i = xml.indexOf(`<serviceType>${svc}</serviceType>`);
    if (i < 0) continue;
    const ctl = /<controlURL>([^<]+)<\/controlURL>/.exec(xml.slice(i))?.[1];
    if (ctl) return { url: new URL(ctl, location).toString(), svc };
  }
  throw new Error("the router has no WAN connection service");
}

function soap(c: Control, action: string, args: Record<string, string | number>): Promise<string> {
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${c.svc}">${Object.entries(args).map(([k, v]) => `<${k}>${v}</${k}>`).join("")}</u:${action}></s:Body></s:Envelope>`;
  const u = new URL(c.url);
  return new Promise((resolve, reject) => {
    const req = request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: "POST", timeout: 4000, headers: { "content-type": 'text/xml; charset="utf-8"', soapaction: `"${c.svc}#${action}"`, "content-length": Buffer.byteLength(body) } }, (r) => {
      let b = "";
      r.on("data", (d) => (b += d));
      r.on("end", () => (r.statusCode === 200 ? resolve(b) : reject(new Error(`router said ${r.statusCode}: ${/<errorDescription>([^<]+)/.exec(b)?.[1] ?? "refused"}`))));
    });
    req.on("error", reject);
    req.end(body);
  });
}

let mapped: { c: Control; port: number } | null = null;

/** Ask the router to forward TCP `port` here; resolves with the router's public address when it says. */
export async function forwardPort(port: number): Promise<{ external: string }> {
  const c = await control(await discover());
  const ip = lanAddresses()[0] ?? "";
  await soap(c, "AddPortMapping", {
    NewRemoteHost: "", NewExternalPort: port, NewProtocol: "TCP", NewInternalPort: port, NewInternalClient: ip,
    NewEnabled: 1, NewPortMappingDescription: "FTL Arena", NewLeaseDuration: 0,
  });
  mapped = { c, port };
  let external = "";
  try {
    external = /<NewExternalIPAddress>([^<]*)/.exec(await soap(c, "GetExternalIPAddress", {}))?.[1] ?? "";
  } catch {}
  return { external };
}

/** Undo forwardPort (on shutdown). */
export async function unforwardPort(): Promise<void> {
  if (!mapped) return;
  const m = mapped;
  mapped = null;
  await soap(m.c, "DeletePortMapping", { NewRemoteHost: "", NewExternalPort: m.port, NewProtocol: "TCP" }).catch(() => {});
}

/** This network's public address, as an outside echo service sees it ("" if it can't be reached). */
export async function publicAddress(): Promise<string> {
  try {
    const ip = (await fetchText("https://api.ipify.org")).trim();
    return /^[0-9a-f.:]+$/i.test(ip) ? ip : "";
  } catch {
    return "";
  }
}
