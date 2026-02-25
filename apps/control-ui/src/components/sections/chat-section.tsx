"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useGateway } from "@/contexts/gateway-context";
import { useChatHeaderSlot } from "@/contexts/chat-header-slot";
import {
  buildChatItems,
  generateAttachmentId,
  detectTextDirection,
  normalizeMessage,
  messageKey,
  extractText,
} from "@/lib/chat-utils";
import { parseMessageSegments } from "@/lib/parse-code-blocks";
import { ChatCodeBlock } from "@/components/chat-code-block";
import type { 
  ChatAttachment, 
  ChatQueueItem, 
  CompactionIndicatorStatus,
  ChatItem,
  MessageGroup
} from "@/types/chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Brain,
  Paperclip,
  ArrowUp,
  X,
  Loader2,
  Check,
  ArrowDown,
  ChevronDown,
  Sparkles,
  Square,
  FileText,
} from "lucide-react";

function generateSessionId(): string {
  return `main:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const COMPACTION_TOAST_DURATION_MS = 5000;

function CompactionIndicator({
  status,
}: {
  status: CompactionIndicatorStatus | null | undefined;
}) {
  if (!status) return null;

  if (status.active) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-blue-500/10 px-3 py-2 text-[15px] text-blue-600 dark:text-blue-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在压缩上下文…
      </div>
    );
  }

  if (status.completedAt) {
    const elapsed = Date.now() - status.completedAt;
    if (elapsed < COMPACTION_TOAST_DURATION_MS) {
      return (
        <div className="flex items-center gap-2 rounded-xl bg-green-500/10 px-3 py-2 text-[15px] text-green-600 dark:text-green-400">
          <Check className="h-4 w-4" />
          上下文已压缩
        </div>
      );
    }
  }

  return null;
}

function AttachmentPreview({
  attachments,
  onRemove,
}: {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((att) => {
        const isImage = att.mimeType.startsWith("image/");
        return (
          <div key={att.id} className="relative group">
            <div className="h-14 w-14 overflow-hidden rounded-lg border border-border flex items-center justify-center bg-muted/50">
              {isImage ? (
                <img
                  src={att.dataUrl}
                  alt="附件预览"
                  className="h-full w-full object-cover"
                />
              ) : (
                <FileText className="h-6 w-6 text-muted-foreground shrink-0" />
              )}
            </div>
            {!isImage && (
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 truncate text-center rounded-b-md">
                {att.fileName ?? "文档"}
              </span>
            )}
            <button
              type="button"
              className="absolute -right-1 -top-1 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => onRemove(att.id)}
              aria-label="移除附件"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ChatQueue({
  queue,
  onRemove,
}: {
  queue: ChatQueueItem[];
  onRemove: (id: string) => void;
}) {
  if (queue.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
      <div className="mb-1.5 text-[14px] font-medium">排队中 ({queue.length})</div>
      <div className="space-y-1.5">
        {queue.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-lg bg-background px-3 py-2"
          >
            <div className="truncate text-[15px]">
              {item.text ||
                (item.attachments?.length
                  ? `附件 (${item.attachments.length})`
                  : "")}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8"
              onClick={() => onRemove(item.id)}
              aria-label="移除排队消息"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Renders message text with parsed code blocks (markdown ```) and syntax highlight + copy */
function MessageContentWithCode({
  text,
  isUser,
  showCursor,
}: {
  text: string;
  isUser: boolean;
  showCursor?: boolean;
}) {
  const segments = parseMessageSegments(text);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          if (!seg.value) return null;
          return (
            <div
              key={i}
              className="chat-message-text whitespace-pre-wrap break-words"
            >
              {seg.value}
              {showCursor && i === segments.length - 1 && (
                <span
                  className="stream-typewriter-cursor ml-0.5 inline-block h-4 w-0.5 align-middle bg-foreground/80"
                  style={{ animation: "stream-cursor-blink 0.7s step-end infinite" }}
                  aria-hidden
                />
              )}
            </div>
          );
        }
        return (
          <ChatCodeBlock
            key={i}
            language={seg.language}
            code={seg.value}
            className={isUser ? "border-white/20" : ""}
          />
        );
      })}
    </>
  );
}

/* ChatGPT-style: 16px message text, consistent padding per message block */
function MessageGroupComponent({ group }: { group: MessageGroup }) {
  const isUser = group.role === "user" || group.role === "User";

  return (
    <div
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"} py-4`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-emerald-500/90 dark:bg-emerald-600/90 text-white"
            : "bg-muted"
        }`}
      >
        {group.messages.map(({ message, key }) => {
          const normalized = normalizeMessage(message);
          const content = normalized.content
            .filter((item) => item.type === "text")
            .map((item) => item.text ?? "")
            .join("");

          return (
            <div key={key} className="mb-2 last:mb-0">
              <MessageContentWithCode text={content} isUser={isUser} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatItemComponent({ item }: { item: ChatItem | MessageGroup }) {
  if ("kind" in item && item.kind === "group") {
    return <MessageGroupComponent group={item} />;
  }

  if ("kind" in item) {
    switch (item.kind) {
      case "divider":
        return (
          <div className="flex items-center py-4">
            <Separator className="flex-1" />
            <span className="px-3 text-[13px] text-muted-foreground">
              {item.label}
            </span>
            <Separator className="flex-1" />
          </div>
        );
      case "stream":
        return (
          <div className="flex justify-start py-4">
            <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-3">
              <MessageContentWithCode
                text={item.text}
                isUser={false}
                showCursor={item.showCursor}
              />
              {item.showCursor && (
                <div className="mt-1 text-[13px] text-muted-foreground">
                  流式响应中…
                </div>
              )}
            </div>
          </div>
        );
      case "reading-indicator":
        return (
          <div className="flex justify-start py-4">
            <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="chat-message-text">正在思考…</span>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  }

  return null;
}

type ChatEventPayload = {
  runId?: string;
  sessionKey?: string;
  state?: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

/** Gateway may send canonical sessionKey (e.g. "main") while we use "main:xxx-yyy". Treat as same session. */
function isSameSession(payloadKey: string | undefined, ourKey: string): boolean {
  if (!payloadKey || !ourKey) return false;
  if (payloadKey === ourKey) return true;
  const p = payloadKey.toLowerCase().trim();
  const o = ourKey.toLowerCase().trim();
  if (p === "main" && (o === "main" || o.startsWith("main:"))) return true;
  if (o === "main" && (p === "main" || p.startsWith("main:"))) return true;
  return false;
}

export function ChatSection({ initialSessionKey }: { initialSessionKey?: string | null } = {}) {
  const { client, connected, addEventListener } = useGateway();
  const [sessionKey, setSessionKey] = useState(() => {
    const fromUrl = initialSessionKey?.trim();
    return fromUrl ? fromUrl : generateSessionId();
  });
  // Sync session from URL when ?session= changes (e.g. link or refresh with session param).
  useEffect(() => {
    const next = initialSessionKey?.trim();
    if (next && next !== sessionKey) {
      setSessionKey(next);
      setMessages([]);
      setToolMessages([]);
      setStream(null);
      setStreamStartedAt(null);
      runIdRef.current = null;
      setError(null);
    }
  }, [initialSessionKey, sessionKey]);

  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Persist current session in URL when chat has no ?session= so refresh keeps same session and model.
  useEffect(() => {
    const urlSession = searchParams.get("session")?.trim();
    if (urlSession) return; // URL already has session (e.g. link or post-refresh), do not overwrite.
    if (!sessionKey) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("session", sessionKey);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams, sessionKey]);

  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<unknown[]>([]);
  const [toolMessages, setToolMessages] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<string | null>(null);
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null);
  const [streamDisplayedLength, setStreamDisplayedLength] = useState(0);
  const [queue, setQueue] = useState<ChatQueueItem[]>([]);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [showThinking, setShowThinking] = useState(false);
  const [compactionStatus, setCompactionStatus] = useState<CompactionIndicatorStatus | null>(null);
  const [showNewMessages, setShowNewMessages] = useState(false);
  const [modelList, setModelList] = useState<Array<{ provider: string; id: string; name: string }>>([]);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [modelListLoading, setModelListLoading] = useState(false);
  const [modelSwitchLoading, setModelSwitchLoading] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelFilter, setModelFilter] = useState("");
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const chatThreadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const runIdRef = useRef<string | null>(null);
  const finalReceivedRef = useRef(false);
  const sessionKeyRef = useRef(sessionKey);
  const loadHistoryRef = useRef<
    (opts?: { updateModel?: boolean }) => Promise<void>
  >(() => Promise.resolve());
  sessionKeyRef.current = sessionKey;

  const loadHistory = useCallback(
    async (opts?: { updateModel?: boolean }) => {
      if (!client || !connected) return;
      const updateModel = opts?.updateModel !== false;
      setLoading(true);
      setError(null);
      try {
        const res = await client.request<{
          messages?: unknown[];
          toolMessages?: unknown[];
          thinkingLevel?: string;
          modelProvider?: string;
          model?: string;
        }>("chat.history", { sessionKey, limit: 200 });
        setMessages(Array.isArray(res?.messages) ? res.messages : []);
        setToolMessages(Array.isArray(res?.toolMessages) ? res.toolMessages : []);
        if (updateModel && res?.modelProvider != null && res?.model != null) {
          setCurrentModel(`${res.modelProvider}/${res.model}`);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [client, connected, sessionKey],
  );
  loadHistoryRef.current = loadHistory;

  useEffect(() => {
    if (connected) void loadHistory();
  }, [connected, loadHistory]);

  // Load model list (only configured models). Refetch when dropdown opens so list stays in sync with backend (e.g. Ollama models removed).
  const loadModelList = useCallback(() => {
    if (!client || !connected) return;
    setModelListLoading(true);
    client
      .request<{ models?: Array<{ provider?: string; id?: string; name?: string }> }>("models.list", {
        configuredOnly: true,
      })
      .then((res) => {
        const list = Array.isArray(res?.models) ? res.models : [];
        setModelList(
          list
            .filter((m) => m && typeof m.provider === "string" && typeof m.id === "string")
            .map((m) => ({
              provider: String(m.provider),
              id: String(m.id),
              name: typeof m.name === "string" && m.name ? m.name : `${m.provider}/${m.id}`,
            })),
        );
      })
      .catch(() => setModelList([]))
      .finally(() => setModelListLoading(false));
  }, [client, connected]);

  useEffect(() => {
    if (connected) void loadModelList();
  }, [connected, loadModelList]);

  // Refresh model list when user opens dropdown so backend changes (e.g. removed Ollama models) are reflected.
  useEffect(() => {
    if (modelDropdownOpen && client && connected) void loadModelList();
  }, [modelDropdownOpen, client, connected, loadModelList]);

  // Close model dropdown when clicking outside or pressing Escape.
  useEffect(() => {
    if (!modelDropdownOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (modelDropdownRef.current?.contains(e.target as Node)) return;
      setModelDropdownOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModelDropdownOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modelDropdownOpen]);

  const handleSwitchModel = useCallback(
    async (modelRef: string) => {
      if (!client || !connected || !sessionKey) return;
      setModelSwitchLoading(true);
      try {
        const res = await client.request<{
          ok?: boolean;
          resolved?: { modelProvider?: string; model?: string };
        }>("sessions.patch", { key: sessionKey, model: modelRef });
        if (res?.ok && res?.resolved?.modelProvider != null && res?.resolved?.model != null) {
          setCurrentModel(`${res.resolved.modelProvider}/${res.resolved.model}`);
        }
        setModelDropdownOpen(false);
      } catch {
        // keep dropdown open on error; user can retry
      } finally {
        setModelSwitchLoading(false);
      }
    },
    [client, connected, sessionKey],
  );

  const { setContent: setChatHeaderContent } = useChatHeaderSlot();
  const modelDropdownForHeader = useMemo(
    () => (
      <div className="relative shrink-0" ref={modelDropdownRef}>
        <Button
          variant="outline"
          size="sm"
          disabled={!connected || modelListLoading}
          onClick={() => {
            setModelDropdownOpen((o) => !o);
            if (!modelDropdownOpen) setModelFilter("");
          }}
          className="h-9 min-w-[140px] max-w-[200px] rounded-lg border-border bg-background px-3 text-left text-sm font-medium shadow-sm hover:bg-accent/50"
          title="点击切换模型"
        >
          {modelListLoading ? (
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2 shrink-0 text-primary" />
              <span className="truncate">
                {currentModel ?? "选择模型"}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
            </>
          )}
        </Button>
        {modelDropdownOpen && !modelListLoading && (
          <div className="absolute left-0 top-full z-50 mt-2 min-w-[260px] max-h-[320px] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            {modelList.length > 8 && (
              <div className="border-b border-border p-2">
                <input
                  type="text"
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  placeholder="搜索模型…"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>
            )}
            <div className="max-h-[260px] overflow-auto py-1">
              {modelList.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  暂无已配置模型。请在「配置」→「模型」中添加后再选。
                </div>
              ) : (() => {
                const q = modelFilter.trim().toLowerCase();
                const filtered =
                  q === ""
                    ? modelList
                    : modelList.filter(
                        (m) =>
                          `${m.provider}/${m.id}`.toLowerCase().includes(q) ||
                          (m.name && m.name.toLowerCase().includes(q)) ||
                          m.provider.toLowerCase().includes(q),
                      );
                return filtered.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    无匹配模型
                  </div>
                ) : (
                  filtered.map((m) => {
                    const ref = `${m.provider}/${m.id}`;
                    const isActive = currentModel === ref;
                    return (
                      <button
                        key={ref}
                        type="button"
                        disabled={modelSwitchLoading}
                        onClick={() => handleSwitchModel(ref)}
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent ${isActive ? "bg-accent font-medium text-foreground" : ""}`}
                      >
                        {modelSwitchLoading ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        ) : isActive ? (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        ) : null}
                        <span className="truncate">{m.name || ref}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{m.provider}</span>
                      </button>
                    );
                  })
                );
              })()}
            </div>
          </div>
        )}
      </div>
    ),
    [
      connected,
      modelListLoading,
      modelDropdownOpen,
      currentModel,
      modelList,
      modelFilter,
      modelSwitchLoading,
      handleSwitchModel,
    ],
  );
  useEffect(() => {
    setChatHeaderContent(modelDropdownForHeader);
    return () => setChatHeaderContent(null);
  }, [modelDropdownForHeader, setChatHeaderContent]);

  // Tab 从后台切回前台时刷新聊天：后台时浏览器可能不重绘或延迟交付 WebSocket，导致回复不显示；切回时拉取最新历史即可正确展示。
  useEffect(() => {
    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void loadHistoryRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Subscribe once; handler reads from refs so it always sees latest sessionKey/loadHistory.
  // On "final": if we have message text, drive typewriter with it (so non-streaming models
  // still get Grok-style effect); when typewriter catches up we clear and load history.
  useEffect(() => {
    const handler = (payload: unknown) => {
      const p = payload as ChatEventPayload | undefined;
      const currentKey = sessionKeyRef.current;
      if (!p?.sessionKey || !isSameSession(p.sessionKey, currentKey)) return;

      if (p.state === "final") {
        const finalText = extractText(p.message);
        runIdRef.current = null;
        if (typeof finalText === "string" && finalText.trim().length > 0) {
          setStream(finalText);
          setStreamStartedAt((prev) => prev ?? Date.now());
          finalReceivedRef.current = true;
          return;
        }
        setStream(null);
        setStreamStartedAt(null);
        finalReceivedRef.current = false;
        // Refresh messages only; do not overwrite currentModel so user's selection stays (avoids flipping to default e.g. gpt-oss:20b).
        void loadHistoryRef.current({ updateModel: false });
        return;
      }
      if (p.state === "aborted" || p.state === "error") {
        setStream(null);
        setStreamStartedAt(null);
        runIdRef.current = null;
        finalReceivedRef.current = false;
        if (p.state === "error") setError(p.errorMessage ?? "对话出错");
        void loadHistoryRef.current({ updateModel: false });
        return;
      }

      if (p.state === "delta") {
        if (p.runId && runIdRef.current && p.runId !== runIdRef.current) return;
        const next = extractText(p.message);
        if (typeof next === "string") {
          setStream((current) =>
            !current || next.length >= current.length ? next : current,
          );
        }
      }
    };
    return addEventListener("chat", handler);
  }, [addEventListener]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems: DataTransferItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        imageItems.push(item);
      }
    }

    if (imageItems.length === 0) return;

    e.preventDefault();

    imageItems.forEach((item) => {
      const file = item.getAsFile();
      if (!file) return;

      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const dataUrl = reader.result as string;
        const newAttachment: ChatAttachment = {
          id: generateAttachmentId(),
          dataUrl,
          mimeType: file.type,
        };
        setAttachments(prev => [...prev, newAttachment]);
      });
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const accepted = Array.from(files).filter((f) => {
      const t = f.type.toLowerCase();
      return (
        t.startsWith("image/") ||
        t === "application/pdf" ||
        t === "text/plain" ||
        t === "text/markdown" ||
        t === "text/html" ||
        t === "text/csv" ||
        t === "application/json"
      );
    });
    if (accepted.length === 0) {
      e.target.value = "";
      return;
    }

    let pending = accepted.length;
    const newAttachments: ChatAttachment[] = [];

    accepted.forEach((file) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        newAttachments.push({
          id: generateAttachmentId(),
          dataUrl: reader.result as string,
          mimeType: file.type || "application/octet-stream",
          fileName: file.name,
        });
        if (--pending === 0) {
          setAttachments((prev) => [...prev, ...newAttachments]);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      });
      reader.readAsDataURL(file);
    });
  }, []);

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    const hasAttachments = attachments.length > 0;

    if (!client || !connected || (!msg && !hasAttachments) || sending) return;

    setSending(true);
    setError(null);

    const userMsg = {
      role: "user",
      content: msg ? [{ type: "text", text: msg }] : [],
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    const idempotencyKey = crypto.randomUUID();
    runIdRef.current = idempotencyKey;
    finalReceivedRef.current = false;
    setStream("");
    setStreamStartedAt(Date.now());
    setStreamDisplayedLength(0);

    try {
      const attachmentPayload = hasAttachments
        ? attachments.map((att) => {
            const match = /^data:([^;]+);base64,(.+)$/.exec(att.dataUrl);
            const content = match ? match[2] : att.dataUrl;
            const isImage = att.mimeType.startsWith("image/");
            return {
              type: (isImage ? "image" : "file") as "image" | "file",
              mimeType: att.mimeType,
              content,
              ...(att.fileName ? { fileName: att.fileName } : {}),
            };
          })
        : undefined;

      await client.request("chat.send", {
        sessionKey,
        message: msg ?? "",
        idempotencyKey,
        // 普通模式传 thinking: "off" 减少模型“深度思考”时间，加快首字返回；深度思考时不传，用会话/默认级别。
        ...(showThinking ? {} : { thinking: "off" }),
        ...(attachmentPayload?.length ? { attachments: attachmentPayload } : {}),
      });

      setAttachments([]);
    } catch (e) {
      setError(String(e));
      setStream(null);
      setStreamStartedAt(null);
      runIdRef.current = null;
    } finally {
      setSending(false);
    }
  }, [client, connected, input, attachments, sending, sessionKey, showThinking]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleStop = useCallback(async () => {
    if (!client || !connected || !sessionKey) return;
    try {
      await client.request("chat.abort", { sessionKey });
    } catch {
      // still clear local state so UI resets
    }
    setSending(false);
    setStream(null);
    setStreamStartedAt(null);
    runIdRef.current = null;
    void loadHistoryRef.current({ updateModel: false });
  }, [client, connected, sessionKey]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  }, []);

  const removeQueuedMessage = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  }, []);

  const scrollToBottom = useCallback(() => {
    if (chatThreadRef.current) {
      chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight;
      setShowNewMessages(false);
    }
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    setShowNewMessages(!isNearBottom);
  }, []);

  // Grok-style typewriter: time-based so characters appear at a steady pace (chars/sec).
  const streamRef = useRef(stream);
  const accumulatedLenRef = useRef(0);
  streamRef.current = stream;
  const TYPEWRITER_CHARS_PER_SEC = 48;
  const TYPEWRITER_CATCHUP_MAX = 120;
  useEffect(() => {
    if (stream === null) {
      setStreamDisplayedLength(0);
      accumulatedLenRef.current = 0;
      return;
    }
    if (stream.length === 0) {
      accumulatedLenRef.current = 0;
      setStreamDisplayedLength(0);
      return;
    }
    // Grok-style: show first character immediately, then typewriter for the rest
    if (accumulatedLenRef.current === 0) {
      accumulatedLenRef.current = 1;
      setStreamDisplayedLength(1);
    }
    let lastTs = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const deltaMs = now - lastTs;
      lastTs = now;
      const targetLen = streamRef.current?.length ?? 0;
      if (targetLen === 0) return;
      const behind = targetLen - accumulatedLenRef.current;
      const speed =
        behind > 30
          ? Math.min(TYPEWRITER_CATCHUP_MAX, TYPEWRITER_CHARS_PER_SEC + behind * 0.8)
          : TYPEWRITER_CHARS_PER_SEC;
      accumulatedLenRef.current = Math.min(
        targetLen,
        accumulatedLenRef.current + (deltaMs / 1000) * speed,
      );
      setStreamDisplayedLength(Math.floor(accumulatedLenRef.current));
    }, 16);
    return () => clearInterval(id);
  }, [stream]);

  // When typewriter has finished and we drove it from "final" (no deltas), clear stream and load history.
  useEffect(() => {
    if (
      stream === null ||
      stream.length === 0 ||
      streamDisplayedLength < stream.length ||
      !finalReceivedRef.current
    ) {
      return;
    }
    const t = window.setTimeout(() => {
      finalReceivedRef.current = false;
      setStream(null);
      setStreamStartedAt(null);
      runIdRef.current = null;
      void loadHistoryRef.current({ updateModel: false });
    }, 400);
    return () => window.clearTimeout(t);
  }, [stream, streamDisplayedLength]);

  // Auto-scroll to bottom when conversation content updates (new messages or streaming).
  useEffect(() => {
    const el = chatThreadRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      setShowNewMessages(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, toolMessages, stream, streamDisplayedLength]);

  const streamTextForDisplay =
    stream === null ? null : stream.slice(0, Math.min(streamDisplayedLength, stream.length));
  const streamPending = stream !== null && streamDisplayedLength < stream.length;
  const chatItems = buildChatItems(
    messages,
    toolMessages,
    streamTextForDisplay,
    streamStartedAt,
    sessionKey,
    showThinking,
    streamPending
  );

  const hasAttachments = attachments.length > 0;
  const canCompose = connected;
  const isBusy = sending || stream !== null;
  const composePlaceholder = connected
    ? hasAttachments
      ? "输入消息或继续添加附件…"
      : "尽管问，可上传图片、PDF、文档"
    : "连接网关后即可开始聊天。";

  if (!connected) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center px-4">
        <p className="chat-message-text text-muted-foreground">
          请先连接网关后在概览中配置连接。
        </p>
      </div>
    );
  }

  /* Scrollbar at right edge: scroll container is full width; content inside is centered with max-w-6xl */
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="shrink-0 px-3 md:px-6">
        {error && (
          <div className="mx-auto max-w-6xl rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-[16px] text-destructive">
            {error}
          </div>
        )}
        <div className="mx-auto max-w-6xl">
          <CompactionIndicator status={compactionStatus} />
          <ChatQueue queue={queue} onRemove={removeQueuedMessage} />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col min-w-0">
        <div
          ref={chatThreadRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain w-full"
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
        >
          <div className="flex w-full flex-col items-center shrink-0">
            <div className="w-full max-w-6xl px-3 py-4 md:px-6">
            {loading ? (
              <div className="flex flex-1 items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 chat-message-text text-muted-foreground">
                  加载聊天中…
                </span>
              </div>
            ) : chatItems.length === 0 ? (
              <div className="flex flex-1 items-center justify-center py-12 text-center chat-message-text text-muted-foreground">
                暂无消息，发送一条开始对话。
              </div>
            ) : (
              chatItems.map((item, index) => {
                const key = "key" in item ? item.key : `group-${index}`;
                return <ChatItemComponent key={key} item={item} />;
              })
            )}
            </div>
          </div>
        </div>

        {showNewMessages && (
          <Button
            variant="secondary"
            size="sm"
            className="absolute bottom-24 right-3 min-h-[44px] shadow-md md:right-6 md:min-h-0"
            onClick={scrollToBottom}
          >
            <ArrowDown className="h-4 w-4 mr-2" />
            新消息
          </Button>
        )}
      </div>

      <div className="shrink-0 space-y-3 px-3 pt-3 pb-2 md:px-6" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto w-full max-w-6xl space-y-3">
          <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />

          {/* Kimi-style: one rounded input box, top = text area, bottom = full-width bar (attach left, send right) */}
          <div className="flex flex-1">
            <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-input bg-background shadow-sm">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={composePlaceholder}
                disabled={!connected}
                className="chat-input-text chat-placeholder min-h-[80px] max-h-[200px] resize-none rounded-none border-0 border-b border-border/50 py-3.5 pl-4 pr-4 focus-visible:ring-0"
                dir={detectTextDirection(input)}
              />
              <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*,.pdf,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,text/html,text/csv,application/json"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={!connected}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="min-h-[44px] min-w-[44px] h-11 w-11 shrink-0 rounded-full md:h-9 md:w-9 md:min-h-0 md:min-w-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!connected}
                    title="添加图片或文档 (PDF、图片、文本等)"
                    aria-label="添加附件"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </div>
                {isBusy ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={handleStop}
                    className="min-h-[44px] min-w-[44px] h-11 w-11 shrink-0 rounded-full md:h-10 md:w-10 md:min-h-0 md:min-w-0"
                    title="停止当前回复"
                    aria-label="停止"
                  >
                    <Square className="h-4 w-4 fill-current" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    onClick={handleSend}
                    disabled={
                      !connected ||
                      (!input.trim() && !hasAttachments) ||
                      sending
                    }
                    className="min-h-[44px] min-w-[44px] h-11 w-11 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 md:h-10 md:w-10 md:min-h-0 md:min-w-0"
                    title="发送"
                    aria-label="发送"
                  >
                    <ArrowUp className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowThinking(!showThinking)}
              className={`h-8 text-[14px] ${showThinking ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
            >
              <Brain className="h-4 w-4 mr-2" />
              {showThinking ? "深度思考" : "普通模式"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const newKey = generateSessionId();
                setSessionKey(newKey);
                setMessages([]);
                setToolMessages([]);
                setStream(null);
                setStreamStartedAt(null);
                runIdRef.current = null;
                setError(null);
                setCurrentModel(null);
                const params = new URLSearchParams(searchParams.toString());
                params.set("session", newKey);
                router.replace(`${pathname}?${params.toString()}`, { scroll: false });
              }}
              className="h-8 text-[14px] text-muted-foreground"
            >
              新会话
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            <span>内容由 AI 生成，请仔细甄别</span>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
