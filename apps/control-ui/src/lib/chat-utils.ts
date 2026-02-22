/**
 * Message normalization utilities for chat rendering.
 */

import type { NormalizedMessage, MessageContentItem, ChatItem, MessageGroup } from "@/types/chat";

/**
 * Normalize a raw message object into a consistent structure.
 */
export function normalizeMessage(message: unknown): NormalizedMessage {
  const m = message as Record<string, unknown>;
  let role = typeof m.role === "string" ? m.role : "unknown";

  // Detect tool messages by common gateway shapes.
  // Some tool events come through as assistant role with tool_* items in the content array.
  const hasToolId = typeof m.toolCallId === "string" || typeof m.tool_call_id === "string";

  const contentRaw = m.content;
  const contentItems = Array.isArray(contentRaw) ? contentRaw : null;
  const hasToolContent =
    Array.isArray(contentItems) &&
    contentItems.some((item) => {
      const x = item as Record<string, unknown>;
      const t = (typeof x.type === "string" ? x.type : "").toLowerCase();
      return t === "toolresult" || t === "tool_result";
    });

  const hasToolName = typeof m.toolName === "string" || typeof m.tool_name === "string";

  if (hasToolId || hasToolContent || hasToolName) {
    role = "toolResult";
  }

  // Extract content
  let content: MessageContentItem[] = [];

  if (typeof m.content === "string") {
    content = [{ type: "text", text: m.content }];
  } else if (Array.isArray(m.content)) {
    content = m.content.map((item: Record<string, unknown>) => ({
      type: (item.type as MessageContentItem["type"]) || "text",
      text: item.text as string | undefined,
      name: item.name as string | undefined,
      args: item.args || item.arguments,
    }));
  } else if (typeof m.text === "string") {
    content = [{ type: "text", text: m.text }];
  }

  const timestamp = typeof m.timestamp === "number" ? m.timestamp : Date.now();
  const id = typeof m.id === "string" ? m.id : undefined;

  return { role, content, timestamp, id };
}

/**
 * Normalize role for grouping purposes.
 */
export function normalizeRoleForGrouping(role: string): string {
  const lower = role.toLowerCase();
  // Preserve original casing when it's already a core role.
  if (role === "user" || role === "User") {
    return role;
  }
  if (role === "assistant") {
    return "assistant";
  }
  if (role === "system") {
    return "system";
  }
  // Keep tool-related roles distinct so the UI can style/toggle them.
  if (
    lower === "toolresult" ||
    lower === "tool_result" ||
    lower === "tool" ||
    lower === "function"
  ) {
    return "tool";
  }
  return role;
}

/**
 * Check if a message is a tool result message based on its role.
 */
export function isToolResultMessage(message: unknown): boolean {
  const m = message as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role.toLowerCase() : "";
  return role === "toolresult" || role === "tool_result";
}

/**
 * Generate a unique key for a message.
 */
export function messageKey(message: unknown, index: number): string {
  const m = message as Record<string, unknown>;
  const toolCallId = typeof m.toolCallId === "string" ? m.toolCallId : "";
  if (toolCallId) {
    return `tool:${toolCallId}`;
  }
  const id = typeof m.id === "string" ? m.id : "";
  if (id) {
    return `msg:${id}`;
  }
  const messageId = typeof m.messageId === "string" ? m.messageId : "";
  if (messageId) {
    return `msg:${messageId}`;
  }
  const timestamp = typeof m.timestamp === "number" ? m.timestamp : null;
  const role = typeof m.role === "string" ? m.role : "unknown";
  if (timestamp != null) {
    return `msg:${role}:${timestamp}:${index}`;
  }
  return `msg:${role}:${index}`;
}

/**
 * Group messages by role for Slack-style layout.
 */
export function groupMessages(items: ChatItem[]): Array<ChatItem | MessageGroup> {
  const result: Array<ChatItem | MessageGroup> = [];
  let currentGroup: MessageGroup | null = null;

  for (const item of items) {
    if (item.kind !== "message") {
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = null;
      }
      result.push(item);
      continue;
    }

    const normalized = normalizeMessage(item.message);
    const role = normalizeRoleForGrouping(normalized.role);
    const timestamp = normalized.timestamp || Date.now();

    if (!currentGroup || currentGroup.role !== role) {
      if (currentGroup) {
        result.push(currentGroup);
      }
      currentGroup = {
        kind: "group",
        key: `group:${role}:${item.key}`,
        role,
        messages: [{ message: item.message, key: item.key }],
        timestamp,
        isStreaming: false,
      };
    } else {
      currentGroup.messages.push({ message: item.message, key: item.key });
    }
  }

  if (currentGroup) {
    result.push(currentGroup);
  }
  return result;
}

/**
 * Build chat items from props.
 */
const CHAT_HISTORY_RENDER_LIMIT = 200;

export function buildChatItems(
  messages: unknown[],
  toolMessages: unknown[],
  stream: string | null,
  streamStartedAt: number | null,
  sessionKey: string,
  showThinking: boolean,
  streamPending?: boolean
): Array<ChatItem | MessageGroup> {
  const items: ChatItem[] = [];
  const history = Array.isArray(messages) ? messages : [];
  const tools = Array.isArray(toolMessages) ? toolMessages : [];
  const historyStart = Math.max(0, history.length - CHAT_HISTORY_RENDER_LIMIT);
  
  if (historyStart > 0) {
    items.push({
      kind: "message",
      key: "chat:history:notice",
      message: {
        role: "system",
        content: `仅显示最近 ${CHAT_HISTORY_RENDER_LIMIT} 条消息（已隐藏 ${historyStart} 条）。`,
        timestamp: Date.now(),
      },
    });
  }
  
  let lastAssistantText: string | null = null;
  for (let i = historyStart; i < history.length; i++) {
    const msg = history[i];
    const normalized = normalizeMessage(msg);
    const raw = msg as Record<string, unknown>;
    const marker = raw.__openclaw as Record<string, unknown> | undefined;
    
    if (marker && marker.kind === "compaction") {
      items.push({
        kind: "divider",
        key:
          typeof marker.id === "string"
            ? `divider:compaction:${marker.id}`
            : `divider:compaction:${normalized.timestamp}:${i}`,
        label: "压缩",
        timestamp: normalized.timestamp ?? Date.now(),
      });
      continue;
    }

    if (!showThinking && normalized.role.toLowerCase() === "toolresult") {
      continue;
    }

    // Skip duplicate assistant message (same text as previous assistant), e.g. after compaction or double-append.
    const roleLower = normalized.role.toLowerCase();
    if (roleLower === "assistant") {
      const text = extractText(msg);
      const textNorm = normalizeTextForDedup(typeof text === "string" ? text : "");
      if (textNorm && lastAssistantText !== null && lastAssistantText === textNorm) {
        continue;
      }
      lastAssistantText = textNorm || null;
    } else {
      lastAssistantText = null;
    }

    items.push({
      kind: "message",
      key: messageKey(msg, i),
      message: msg,
    });
  }
  
  if (showThinking) {
    for (let i = 0; i < tools.length; i++) {
      items.push({
        kind: "message",
        key: messageKey(tools[i], i + history.length),
        message: tools[i],
      });
    }
  }

  if (stream !== null) {
    const key = `stream:${sessionKey}:${streamStartedAt ?? "live"}`;
    if (stream.trim().length > 0) {
      const streamTextNorm = normalizeTextForDedup(stream);
      // Avoid showing same reply twice: if last history item is assistant with same text as stream, remove it.
      const lastItem = items[items.length - 1];
      if (
        lastItem?.kind === "message" &&
        normalizeMessage(lastItem.message).role.toLowerCase() === "assistant" &&
        normalizeTextForDedup(extractText(lastItem.message) ?? "") === streamTextNorm
      ) {
        items.pop();
      }
      items.push({
        kind: "stream",
        key,
        text: stream,
        startedAt: streamStartedAt ?? Date.now(),
        showCursor: streamPending === true,
      });
    } else {
      items.push({ kind: "reading-indicator", key });
    }
  }

  return groupMessages(items);
}

/** Normalize text for duplicate detection (collapse whitespace, trim). */
function normalizeTextForDedup(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Generate a unique ID for attachments.
 */
export function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Detect text direction for RTL/LTR support.
 */
export function detectTextDirection(text: string): "ltr" | "rtl" {
  // Simple heuristic: if text contains any RTL character, assume RTL
  const rtlRegex = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  return rtlRegex.test(text) ? "rtl" : "ltr";
}

/**
 * Extract plain text from a chat message (for stream delta display).
 * Matches gateway chat event message shape.
 */
export function extractText(message: unknown): string | null {
  const m = message as Record<string, unknown>;
  const content = m.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        const item = p as Record<string, unknown>;
        if (item.type === "text" && typeof item.text === "string") return item.text;
        return null;
      })
      .filter((v): v is string => typeof v === "string");
    if (parts.length > 0) return parts.join("\n");
  }
  if (typeof m.text === "string") return m.text;
  return null;
}
