/**
 * Birim testleri için sahte WebSocket ve çevrimiçi kaynağı. `LiveSocket`'in
 * `createSocket` / `online` seçenekleriyle verilir.
 */
import type { OnlineSource } from "~/components/realtime/live-socket";

export class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  binaryType = "blob";
  sent: (string | Uint8Array)[] = [];
  closedWith: { code: number; reason: string } | null = null;
  onopen: ((ev: Event) => unknown) | null = null;
  onclose: ((ev: CloseEvent) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;
  onmessage: ((ev: MessageEvent) => unknown) | null = null;

  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }

  static get last(): FakeSocket {
    return FakeSocket.all[FakeSocket.all.length - 1]!;
  }

  static reset() {
    FakeSocket.all = [];
  }

  send(data: string | Uint8Array) {
    if (this.readyState !== 1) throw new Error("kapalı");
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.closedWith = { code, reason };
    this.readyState = 3;
  }

  /* Sunucu tarafı (test) */
  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  receive(data: string | Uint8Array) {
    const payload =
      typeof data === "string"
        ? data
        : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    this.onmessage?.({ data: payload } as MessageEvent);
  }

  serverClose(code = 1006, reason = "") {
    this.readyState = 3;
    this.onclose?.({ code, reason } as CloseEvent);
  }

  get json(): unknown[] {
    return this.sent.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d));
  }

  get binary(): Uint8Array[] {
    return this.sent.filter((d): d is Uint8Array => typeof d !== "string");
  }
}

export function fakeOnline(initial = true) {
  let online = initial;
  const listeners = new Set<(online: boolean) => void>();
  const source: OnlineSource = {
    isOnline: () => online,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return {
    source,
    set(next: boolean) {
      online = next;
      listeners.forEach((l) => l(next));
    },
  };
}

export const createFake = (url: string) => new FakeSocket(url);
