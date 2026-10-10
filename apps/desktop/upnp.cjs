// Best-effort automatic port forwarding (UPnP IGD), no dependencies: find the router over SSDP, read its
// description, and ask its WAN connection service to forward a TCP port to this machine.
const dgram = require("node:dgram");
const http = require("node:http");
const os = require("node:os");

const SERVICES = ["urn:schemas-upnp-org:service:WANIPConnection:1", "urn:schemas-upnp-org:service:WANIPConnection:2", "urn:schemas-upnp-org:service:WANPPPConnection:1"];

function localIp() {
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  return "";
}

function discover(timeout = 3000) {
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket("udp4");
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

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => {
      let b = "";
      r.on("data", (d) => (b += d));
      r.on("end", () => resolve(b));
    }).on("error", reject);
  });
}

async function control(location) {
  const xml = await get(location);
  for (const svc of SERVICES) {
    const i = xml.indexOf(`<serviceType>${svc}</serviceType>`);
    if (i < 0) continue;
    const ctl = /<controlURL>([^<]+)<\/controlURL>/.exec(xml.slice(i))?.[1];
    if (ctl) return { url: new URL(ctl, location).toString(), svc };
  }
  throw new Error("the router has no WAN connection service");
}

function soap({ url, svc }, action, args) {
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${svc}">${Object.entries(args).map(([k, v]) => `<${k}>${v}</${k}>`).join("")}</u:${action}></s:Body></s:Envelope>`;
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: "POST", headers: { "content-type": 'text/xml; charset="utf-8"', soapaction: `"${svc}#${action}"`, "content-length": Buffer.byteLength(body) } }, (r) => {
      let b = "";
      r.on("data", (d) => (b += d));
      r.on("end", () => (r.statusCode === 200 ? resolve(b) : reject(new Error(`router said ${r.statusCode}: ${/<errorDescription>([^<]+)/.exec(b)?.[1] ?? "refused"}`))));
    });
    req.on("error", reject);
    req.end(body);
  });
}

let mapped = null;

async function forward(port) {
  const ctl = await control(await discover());
  const ip = localIp();
  await soap(ctl, "AddPortMapping", {
    NewRemoteHost: "", NewExternalPort: port, NewProtocol: "TCP", NewInternalPort: port, NewInternalClient: ip,
    NewEnabled: 1, NewPortMappingDescription: "FTL Arena", NewLeaseDuration: 0,
  });
  mapped = { ctl, port };
  let external = "";
  try {
    external = /<NewExternalIPAddress>([^<]*)/.exec(await soap(ctl, "GetExternalIPAddress", {}))?.[1] ?? "";
  } catch {}
  return { ip, external };
}

async function unforward() {
  if (!mapped) return;
  const m = mapped;
  mapped = null;
  await soap(m.ctl, "DeletePortMapping", { NewRemoteHost: "", NewExternalPort: m.port, NewProtocol: "TCP" }).catch(() => {});
}

module.exports = { forward, unforward, localIp };
