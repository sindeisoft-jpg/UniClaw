import {
  DEFAULT_INPUT_FILE_MAX_CHARS,
  DEFAULT_INPUT_FILE_MIMES,
  DEFAULT_INPUT_PDF_MAX_PAGES,
  DEFAULT_INPUT_PDF_MAX_PIXELS,
  DEFAULT_INPUT_PDF_MIN_TEXT_CHARS,
  extractFileContentFromSource,
  normalizeMimeList,
} from "../media/input-files.js";
import { detectMime } from "../media/mime.js";

export type ChatAttachment = {
  type?: string;
  mimeType?: string;
  fileName?: string;
  content?: unknown;
};

export type ChatImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

export type ParsedMessageWithImages = {
  message: string;
  images: ChatImageContent[];
};

type AttachmentLog = {
  warn: (message: string) => void;
};

const CHAT_DOCUMENT_MIMES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
  "application/json",
];

function normalizeMime(mime?: string): string | undefined {
  if (!mime) {
    return undefined;
  }
  const cleaned = mime.split(";")[0]?.trim().toLowerCase();
  return cleaned || undefined;
}

async function sniffMimeFromBase64(base64: string): Promise<string | undefined> {
  const trimmed = base64.trim();
  if (!trimmed) {
    return undefined;
  }

  const take = Math.min(256, trimmed.length);
  const sliceLen = take - (take % 4);
  if (sliceLen < 8) {
    return undefined;
  }

  try {
    const head = Buffer.from(trimmed.slice(0, sliceLen), "base64");
    return await detectMime({ buffer: head });
  } catch {
    return undefined;
  }
}

function isImageMime(mime?: string): boolean {
  return typeof mime === "string" && mime.startsWith("image/");
}

/**
 * Parse attachments: images become vision content; PDF/text documents are extracted
 * and merged into the message text (and PDF pages as images when text is insufficient).
 * Returns the message text and an array of image content blocks for the model.
 */
export async function parseMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  opts?: { maxBytes?: number; maxChars?: number; log?: AttachmentLog },
): Promise<ParsedMessageWithImages> {
  const maxBytes = opts?.maxBytes ?? 5_000_000; // decoded bytes (5 MB)
  const maxChars = opts?.maxChars ?? 200_000;
  const log = opts?.log;
  if (!attachments || attachments.length === 0) {
    return { message, images: [] };
  }

  const allowedDocMimes = normalizeMimeList(CHAT_DOCUMENT_MIMES, CHAT_DOCUMENT_MIMES);
  const images: ChatImageContent[] = [];
  const docBlocks: string[] = [];

  for (const [idx, att] of attachments.entries()) {
    if (!att) {
      continue;
    }
    const mime = att.mimeType ?? "";
    const content = att.content;
    const label = att.fileName || att.type || `attachment-${idx + 1}`;

    if (typeof content !== "string") {
      throw new Error(`attachment ${label}: content must be base64 string`);
    }

    let b64 = content.trim();
    const dataUrlMatch = /^data:[^;]+;base64,(.*)$/.exec(b64);
    if (dataUrlMatch) {
      b64 = dataUrlMatch[1];
    }
    if (b64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(b64)) {
      throw new Error(`attachment ${label}: invalid base64 content`);
    }
    let sizeBytes = 0;
    try {
      sizeBytes = Buffer.from(b64, "base64").byteLength;
    } catch {
      throw new Error(`attachment ${label}: invalid base64 content`);
    }
    if (sizeBytes <= 0 || sizeBytes > maxBytes) {
      throw new Error(`attachment ${label}: exceeds size limit (${sizeBytes} > ${maxBytes} bytes)`);
    }

    const providedMime = normalizeMime(mime);
    const sniffedMime = normalizeMime(await sniffMimeFromBase64(b64));

    // Image: add to vision content
    const effectiveImageMime = sniffedMime ?? providedMime;
    if (isImageMime(sniffedMime) || isImageMime(providedMime)) {
      if (sniffedMime && !isImageMime(sniffedMime)) {
        log?.warn(`attachment ${label}: detected non-image (${sniffedMime}), dropping`);
        continue;
      }
      if (!sniffedMime && !isImageMime(providedMime)) {
        log?.warn(`attachment ${label}: unable to detect image mime type, dropping`);
        continue;
      }
      if (sniffedMime && providedMime && sniffedMime !== providedMime) {
        log?.warn(
          `attachment ${label}: mime mismatch (${providedMime} -> ${sniffedMime}), using sniffed`,
        );
      }
      images.push({
        type: "image",
        data: b64,
        mimeType: effectiveImageMime ?? providedMime ?? mime,
      });
      continue;
    }

    // Document (PDF, text, etc.): extract and merge into message
    const docMime = sniffedMime ?? providedMime;
    if (!docMime || !allowedDocMimes.has(docMime)) {
      log?.warn(`attachment ${label}: unsupported type (${docMime ?? "unknown"}), skipping`);
      continue;
    }

    try {
      const extracted = await extractFileContentFromSource({
        source: {
          type: "base64",
          data: b64,
          mediaType: docMime,
          filename: typeof att.fileName === "string" ? att.fileName : label,
        },
        limits: {
          allowUrl: false,
          allowedMimes: allowedDocMimes,
          maxBytes,
          maxChars: maxChars,
          maxRedirects: 0,
          timeoutMs: 10_000,
          pdf: {
            maxPages: DEFAULT_INPUT_PDF_MAX_PAGES,
            maxPixels: DEFAULT_INPUT_PDF_MAX_PIXELS,
            minTextChars: DEFAULT_INPUT_PDF_MIN_TEXT_CHARS,
          },
        },
      });

      if (extracted.text?.trim()) {
        const safeName = (extracted.filename ?? label).replace(/[\r\n\t]+/g, " ").trim();
        docBlocks.push(`[文件: ${safeName}]\n${extracted.text.trim()}`);
      }
      if (extracted.images?.length) {
        for (const img of extracted.images) {
          images.push({ type: "image", data: img.data, mimeType: img.mimeType });
        }
      }
    } catch (err) {
      log?.warn(`attachment ${label}: extract failed: ${String(err)}`);
    }
  }

  const combinedMessage =
    docBlocks.length > 0 ? `${message.trim()}\n\n${docBlocks.join("\n\n")}`.trim() : message;
  return { message: combinedMessage, images };
}

/**
 * @deprecated Use parseMessageWithAttachments instead.
 * This function converts images to markdown data URLs which Claude API cannot process as images.
 */
export function buildMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  opts?: { maxBytes?: number },
): string {
  const maxBytes = opts?.maxBytes ?? 2_000_000; // 2 MB
  if (!attachments || attachments.length === 0) {
    return message;
  }

  const blocks: string[] = [];

  for (const [idx, att] of attachments.entries()) {
    if (!att) {
      continue;
    }
    const mime = att.mimeType ?? "";
    const content = att.content;
    const label = att.fileName || att.type || `attachment-${idx + 1}`;

    if (typeof content !== "string") {
      throw new Error(`attachment ${label}: content must be base64 string`);
    }
    if (!mime.startsWith("image/")) {
      throw new Error(`attachment ${label}: only image/* supported`);
    }

    let sizeBytes = 0;
    const b64 = content.trim();
    // Basic base64 sanity: length multiple of 4 and charset check.
    if (b64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(b64)) {
      throw new Error(`attachment ${label}: invalid base64 content`);
    }
    try {
      sizeBytes = Buffer.from(b64, "base64").byteLength;
    } catch {
      throw new Error(`attachment ${label}: invalid base64 content`);
    }
    if (sizeBytes <= 0 || sizeBytes > maxBytes) {
      throw new Error(`attachment ${label}: exceeds size limit (${sizeBytes} > ${maxBytes} bytes)`);
    }

    const safeLabel = label.replace(/\s+/g, "_");
    const dataUrl = `![${safeLabel}](data:${mime};base64,${content})`;
    blocks.push(dataUrl);
  }

  if (blocks.length === 0) {
    return message;
  }
  const separator = message.trim().length > 0 ? "\n\n" : "";
  return `${message}${separator}${blocks.join("\n\n")}`;
}
