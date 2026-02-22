"use client";

import { useState, useCallback } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Map common language labels to Prism language id */
function prismLanguage(lang: string): string {
  const lower = lang.toLowerCase();
  const map: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    jsx: "jsx",
    tsx: "tsx",
    py: "python",
    rb: "ruby",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    csharp: "csharp",
    cs: "csharp",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    html: "html",
    css: "css",
    sql: "sql",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
  };
  return map[lower] ?? lower;
}

type ChatCodeBlockProps = {
  language: string;
  code: string;
  className?: string;
};

export function ChatCodeBlock({ language, code, className }: ChatCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      const t = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(t);
    } catch {
      // ignore
    }
  }, [code]);

  const langLabel = language || "text";
  const prismLang = prismLanguage(langLabel);

  return (
    <div
      className={cn(
        "my-3 overflow-hidden rounded-xl border border-border bg-[#1e1e1e] shadow-sm ring-1 ring-black/10 dark:ring-white/5",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-[#2d2d2d] px-3 py-2">
        <span className="text-xs font-medium text-zinc-400">{langLabel}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/15 hover:text-white"
          aria-label="复制"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <Highlight theme={themes.vsDark} code={code} language={prismLang}>
          {({ className: preClassName, style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className={cn(preClassName, "!m-0 !rounded-none !bg-transparent p-4 text-sm")}
              style={style}
            >
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}
