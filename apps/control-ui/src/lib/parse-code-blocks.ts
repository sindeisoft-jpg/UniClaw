/**
 * Parse markdown-style code blocks from message text for chat rendering.
 * Returns segments: text or { language, code } for syntax-highlighted blocks.
 */

export type MessageSegment =
  | { type: "text"; value: string }
  | { type: "code"; language: string; value: string };

const CODE_FENCE = /^```(\w*)\s*\n?([\s\S]*?)```/gm;

export function parseMessageSegments(text: string): MessageSegment[] {
  if (!text || typeof text !== "string") return [{ type: "text", value: "" }];

  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  let m: RegExpExecArray | null;
  CODE_FENCE.lastIndex = 0;
  while ((m = CODE_FENCE.exec(text)) !== null) {
    const lang = (m[1] || "").trim().toLowerCase() || "text";
    const code = (m[2] || "").replace(/\n$/, "");

    if (m.index > lastIndex) {
      const before = text.slice(lastIndex, m.index);
      if (before) segments.push({ type: "text", value: before });
    }
    segments.push({ type: "code", language: lang, value: code });
    lastIndex = CODE_FENCE.lastIndex;
  }

  if (lastIndex < text.length) {
    const tail = text.slice(lastIndex);
    if (tail) segments.push({ type: "text", value: tail });
  }

  if (segments.length === 0) segments.push({ type: "text", value: text });
  return segments;
}
