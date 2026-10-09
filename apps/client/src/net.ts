import { decode, encode, PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from "@ftl/protocol";

type Handler = (m: ServerMsg) => void;

/** One WebSocket to the arena server, with session resume across reloads and reconnects. */
export class Net {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private queue: ClientMsg[] = [];
  connected = false;
  onStatus: (s: string) => void = () => {};

  constructor(public url: string, public name: string) {}

  connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.onStatus("connected");
      let token: string | undefined;
      try {
        token = sessionStorage.getItem("ftl-arena-token") ?? undefined;
      } catch {}
      ws.send(encode({ t: "hello", v: PROTOCOL_VERSION, name: this.name, token }));
      for (const m of this.queue.splice(0)) ws.send(encode(m));
    };
    ws.onmessage = (ev) => {
      const m = decode<ServerMsg>(String(ev.data));
      if (m.t === "welcome") {
        try {
          sessionStorage.setItem("ftl-arena-token", m.token);
        } catch {}
      }
      for (const h of this.handlers) h(m);
    };
    ws.onclose = () => {
      this.connected = false;
      this.onStatus("disconnected - retrying");
      setTimeout(() => this.connect(), 1500);
    };
  }

  send(m: ClientMsg): void {
    if (this.ws && this.connected) this.ws.send(encode(m));
    else this.queue.push(m);
  }

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }
}
