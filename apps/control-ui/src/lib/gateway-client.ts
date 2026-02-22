"use client";

import { buildDeviceAuthPayload } from "./device-auth-payload";
import {
  clearDeviceAuthToken,
  loadDeviceAuthToken,
  storeDeviceAuthToken,
} from "./device-auth-store";
import type { DeviceIdentity } from "./device-identity";
import { loadOrCreateDeviceIdentity, signDevicePayload } from "./device-identity";

export type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  features?: { methods?: string[]; events?: string[] };
  snapshot?: unknown;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
    issuedAtMs?: number;
  };
};

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

export type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
};

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type GatewayClientOptions = {
  url: string;
  token?: string;
  password?: string;
  onHello?: (hello: GatewayHelloOk) => void;
  onEvent?: (evt: GatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string }) => void;
};

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

const CLIENT_NAME = "openclaw-control-ui";
const CLIENT_MODE = "webchat";
const ROLE = "operator";
const SCOPES = ["operator.admin", "operator.approvals", "operator.pairing"];

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private connectSent = false;
  private connectNonce: string | null = null;
  private backoffMs = 800;

  constructor(private opts: GatewayClientOptions) {}

  start() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connectSent = false;
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
    for (const [, p] of this.pending) p.reject(new Error("gateway stopped"));
    this.pending.clear();
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private connect() {
    if (this.closed) return;
    this.ws = new WebSocket(this.opts.url);
    this.ws.onopen = () => this.sendConnect();
    this.ws.onmessage = (ev) => this.handleMessage(String(ev.data ?? ""));
    this.ws.onclose = (ev) => {
      this.ws = null;
      for (const [, p] of this.pending) p.reject(new Error(`closed: ${ev.reason}`));
      this.pending.clear();
      this.opts.onClose?.({ code: ev.code, reason: ev.reason || "" });
      this.scheduleReconnect();
    };
    this.ws.onerror = () => {};
  }

  private scheduleReconnect() {
    if (this.closed) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15000);
    setTimeout(() => this.connect(), delay);
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const frame = parsed as { type?: string };
    if (frame.type === "event") {
      const evt = parsed as GatewayEventFrame;
      if (evt.event === "connect.challenge") {
        const nonce =
          evt.payload && typeof evt.payload === "object" && "nonce" in evt.payload
            ? String((evt.payload as { nonce?: string }).nonce ?? "")
            : "";
        this.connectNonce = nonce || null;
        this.connectSent = false;
        setTimeout(() => this.sendConnect(), 0);
        return;
      }
      this.opts.onEvent?.(evt);
      return;
    }
    if (frame.type === "res") {
      const res = parsed as GatewayResponseFrame;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      if (res.ok) p.resolve(res.payload);
      else p.reject(new Error(res.error?.message ?? "request failed"));
    }
  }

  private async sendConnect() {
    if (this.connectSent) return;
    const isSecureContext =
      typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";

    let deviceIdentity: DeviceIdentity | null = null;
    let authToken = this.opts.token ?? undefined;
    let canFallbackToShared = false;

    if (isSecureContext) {
      try {
        deviceIdentity = await loadOrCreateDeviceIdentity();
        const stored = loadDeviceAuthToken({
          deviceId: deviceIdentity.deviceId,
          role: ROLE,
        });
        if (stored?.token) {
          authToken = stored.token;
          canFallbackToShared = Boolean(this.opts.token);
        }
      } catch {
        // proceed without device identity (token-only; server may reject)
      }
    }

    const auth =
      authToken || this.opts.password
        ? { token: authToken, password: this.opts.password }
        : undefined;

    let device:
      | {
          id: string;
          publicKey: string;
          signature: string;
          signedAt: number;
          nonce: string | undefined;
        }
      | undefined;

    if (deviceIdentity) {
      const signedAtMs = Date.now();
      const nonce = this.connectNonce ?? undefined;
      const payload = buildDeviceAuthPayload({
        deviceId: deviceIdentity.deviceId,
        clientId: CLIENT_NAME,
        clientMode: CLIENT_MODE,
        role: ROLE,
        scopes: SCOPES,
        signedAtMs,
        token: authToken ?? null,
        nonce,
      });
      const signature = await signDevicePayload(
        deviceIdentity.privateKey,
        payload
      );
      device = {
        id: deviceIdentity.deviceId,
        publicKey: deviceIdentity.publicKey,
        signature,
        signedAt: signedAtMs,
        nonce,
      };
    }

    this.connectSent = true;
    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: CLIENT_NAME,
        version: "1.0",
        platform: typeof navigator !== "undefined" ? navigator.platform : "web",
        mode: CLIENT_MODE,
      },
      role: ROLE,
      scopes: SCOPES,
      device,
      auth,
    };

    this.request<GatewayHelloOk>("connect", params)
      .then((hello) => {
        if (hello?.auth?.deviceToken && deviceIdentity) {
          storeDeviceAuthToken({
            deviceId: deviceIdentity.deviceId,
            role: hello.auth.role ?? ROLE,
            token: hello.auth.deviceToken,
            scopes: hello.auth.scopes ?? [],
          });
        }
        this.backoffMs = 800;
        this.opts.onHello?.(hello);
      })
      .catch(() => {
        if (canFallbackToShared && deviceIdentity) {
          clearDeviceAuthToken({ deviceId: deviceIdentity.deviceId, role: ROLE });
        }
        this.ws?.close(4008, "connect failed");
      });
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("not connected"));
    }
    const id = generateId();
    const frame = { type: "req", id, method, params };
    const p = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
    });
    this.ws.send(JSON.stringify(frame));
    return p;
  }
}
