"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { GatewayClient, type GatewayHelloOk } from "@/lib/gateway-client";
import type { GatewayEventFrame } from "@/lib/gateway-client";
import type { ExecApprovalRequest } from "@/lib/exec-approval";
import {
  parseExecApprovalRequested,
  addExecApproval,
  removeExecApproval,
} from "@/lib/exec-approval";

const DEFAULT_WS_URL = "ws://127.0.0.1:18789";

const GATEWAY_STORAGE_KEY = "openclaw.control-ui.gateway.v1";

function readStoredGateway(): { url: string; token: string } {
  if (typeof window === "undefined") {
    return { url: DEFAULT_WS_URL, token: "" };
  }
  try {
    const raw = window.localStorage.getItem(GATEWAY_STORAGE_KEY);
    if (!raw) return { url: DEFAULT_WS_URL, token: "" };
    const j = JSON.parse(raw) as unknown;
    if (j && typeof j === "object" && "url" in j && "token" in j) {
      const url = typeof (j as { url: unknown }).url === "string" ? (j as { url: string }).url : DEFAULT_WS_URL;
      const token = typeof (j as { token: unknown }).token === "string" ? (j as { token: string }).token : "";
      return { url: url.trim() || DEFAULT_WS_URL, token };
    }
  } catch {
    // ignore
  }
  return { url: DEFAULT_WS_URL, token: "" };
}

function writeStoredGateway(url: string, token: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GATEWAY_STORAGE_KEY, JSON.stringify({ url, token }));
  } catch {
    // ignore
  }
}

export type ExecApprovalDecision = "allow-once" | "allow-always" | "deny";

type GatewayEventHandler = (payload: unknown) => void;

type GatewayContextValue = {
  client: GatewayClient | null;
  connected: boolean;
  connectedUrl: string | null;
  hello: GatewayHelloOk | null;
  error: string | null;
  url: string;
  token: string;
  setUrl: (url: string) => void;
  setToken: (token: string) => void;
  /** Persist current url and token to localStorage (e.g. after user clicks Save). */
  persistGatewayCredentials: () => void;
  reconnect: () => void;
  /** Call when user clicks connect; may show gateway URL confirmation or reconnect. */
  requestConnect: () => void;
  /** Subscribe to a gateway event (e.g. "chat"). Returns unsubscribe. */
  addEventListener: (event: string, handler: GatewayEventHandler) => () => void;
  // Exec approval (run_command)
  execApprovalQueue: ExecApprovalRequest[];
  execApprovalBusy: boolean;
  execApprovalError: string | null;
  handleExecApprovalDecision: (decision: ExecApprovalDecision) => Promise<void>;
  // Gateway URL confirmation (before switching gateway)
  pendingGatewayUrl: string | null;
  setPendingGatewayUrl: (url: string | null) => void;
  confirmGatewayUrl: () => void;
  cancelGatewayUrl: () => void;
};

const GatewayContext = createContext<GatewayContextValue | null>(null);

export function GatewayProvider({
  children,
  initialUrl = DEFAULT_WS_URL,
}: {
  children: ReactNode;
  initialUrl?: string;
}) {
  const [client, setClient] = useState<GatewayClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectedUrl, setConnectedUrl] = useState<string | null>(null);
  const [hello, setHello] = useState<GatewayHelloOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState(initialUrl);
  const [token, setToken] = useState("");
  const [execApprovalQueue, setExecApprovalQueue] = useState<ExecApprovalRequest[]>([]);

  // Restore saved url/token from localStorage on mount (client-only, avoids hydration mismatch).
  useEffect(() => {
    const s = readStoredGateway();
    setUrl(s.url || initialUrl);
    setToken(s.token);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);
  const [execApprovalBusy, setExecApprovalBusy] = useState(false);
  const [execApprovalError, setExecApprovalError] = useState<string | null>(null);
  const [pendingGatewayUrl, setPendingGatewayUrlState] = useState<string | null>(null);
  const clientRef = useRef<GatewayClient | null>(null);
  const eventListenersRef = useRef<Map<string, Set<GatewayEventHandler>>>(new Map());
  const persistSkippedFirstRunRef = useRef(false);

  const addEventListener = useCallback((event: string, handler: GatewayEventHandler) => {
    const map = eventListenersRef.current;
    let set = map.get(event);
    if (!set) {
      set = new Set();
      map.set(event, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) map.delete(event);
    };
  }, []);

  const reconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.stop();
      clientRef.current.start();
    }
  }, []);

  const handleEvent = useCallback((evt: GatewayEventFrame) => {
    if (evt.event === "exec.approval.requested") {
      const entry = parseExecApprovalRequested(evt.payload);
      if (entry) {
        setExecApprovalQueue((q) => addExecApproval(q, entry));
        setExecApprovalError(null);
        const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500);
        window.setTimeout(() => {
          setExecApprovalQueue((q) => removeExecApproval(q, entry.id));
        }, delay);
      }
    }
    if (evt.event === "exec.approval.resolved") {
      const payload = evt.payload as { id?: string } | undefined;
      const id = typeof payload?.id === "string" ? payload.id.trim() : "";
      if (id) {
        setExecApprovalQueue((q) => removeExecApproval(q, id));
      }
    }
    const listeners = eventListenersRef.current.get(evt.event);
    if (listeners) {
      for (const fn of listeners) fn(evt.payload);
    }
  }, []);

  const handleExecApprovalDecision = useCallback(
    async (decision: ExecApprovalDecision) => {
      const c = clientRef.current;
      const active = execApprovalQueue[0];
      if (!active || !c?.connected || execApprovalBusy) {
        return;
      }
      setExecApprovalBusy(true);
      setExecApprovalError(null);
      try {
        await c.request("exec.approval.resolve", { id: active.id, decision });
        setExecApprovalQueue((q) => removeExecApproval(q, active.id));
      } catch (err) {
        setExecApprovalError(
          `执行审批失败: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setExecApprovalBusy(false);
      }
    },
    [execApprovalQueue, execApprovalBusy],
  );

  const confirmGatewayUrl = useCallback(() => {
    const next = pendingGatewayUrl;
    setPendingGatewayUrlState(null);
    if (next != null && next.trim()) {
      setUrl(next.trim());
      // Reconnect will happen in useEffect when url changes
    }
  }, [pendingGatewayUrl]);

  const cancelGatewayUrl = useCallback(() => {
    setPendingGatewayUrlState(null);
  }, []);

  const requestConnect = useCallback(() => {
    const trimmed = url.trim();
    const current = (connectedUrl ?? "").trim();
    if (
      trimmed &&
      (connected || current) &&
      trimmed !== current
    ) {
      setPendingGatewayUrlState(trimmed);
      return;
    }
    reconnect();
  }, [url, connected, connectedUrl, reconnect]);

  const persistGatewayCredentials = useCallback(() => {
    writeStoredGateway(url, token);
  }, [url, token]);

  useEffect(() => {
    const gw = new GatewayClient({
      url,
      token: token || undefined,
      onHello: (h) => {
        setHello(h);
        setConnected(true);
        setConnectedUrl(url);
        setError(null);
      },
      onClose: ({ code, reason }) => {
        setConnected(false);
        setHello(null);
        if (code !== 1000) setError(reason || `Code ${code}`);
      },
      onEvent: (evt) => handleEvent(evt),
    });
    clientRef.current = gw;
    setClient(gw);
    gw.start();
    return () => {
      gw.stop();
      clientRef.current = null;
    };
  }, [url, token, handleEvent]);

  // Persist url and token when they change; skip first run to avoid overwriting with defaults before restore.
  useEffect(() => {
    if (!persistSkippedFirstRunRef.current) {
      persistSkippedFirstRunRef.current = true;
      return;
    }
    writeStoredGateway(url, token);
  }, [url, token]);

  const value: GatewayContextValue = {
    client,
    connected,
    connectedUrl,
    hello,
    error,
    url,
    token,
    setUrl,
    setToken,
    persistGatewayCredentials,
    reconnect,
    requestConnect,
    addEventListener,
    execApprovalQueue,
    execApprovalBusy,
    execApprovalError,
    handleExecApprovalDecision,
    pendingGatewayUrl,
    setPendingGatewayUrl: setPendingGatewayUrlState,
    confirmGatewayUrl,
    cancelGatewayUrl,
  };

  return (
    <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>
  );
}

export function useGateway(): GatewayContextValue {
  const ctx = useContext(GatewayContext);
  if (!ctx) throw new Error("useGateway must be used within GatewayProvider");
  return ctx;
}
