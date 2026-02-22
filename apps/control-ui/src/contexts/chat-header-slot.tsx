"use client";

import { createContext, useContext, type ReactNode } from "react";

type ChatHeaderSlotContextValue = {
  content: ReactNode;
  setContent: (node: ReactNode) => void;
};

const ChatHeaderSlotContext = createContext<ChatHeaderSlotContextValue>({
  content: null,
  setContent: () => {},
});

export function useChatHeaderSlot() {
  return useContext(ChatHeaderSlotContext);
}

export function ChatHeaderSlotProvider({
  content,
  setContent,
  children,
}: {
  content: ReactNode;
  setContent: (node: ReactNode) => void;
  children: ReactNode;
}) {
  return (
    <ChatHeaderSlotContext.Provider value={{ content, setContent }}>
      {children}
    </ChatHeaderSlotContext.Provider>
  );
}
