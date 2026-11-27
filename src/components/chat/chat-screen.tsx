"use client";

import { ChatTopBar } from "./chat-top-bar";
import { ChatView } from "./chat-view";
import type { ChatMessageView } from "@/domain/chat";
import { useState } from "react";

export function ChatScreenClient({
  initialMessages,
  initialUsed,
  initialWithSupport,
  conversationId,
}: {
  initialMessages: ChatMessageView[];
  initialUsed: number;
  initialWithSupport?: boolean;
  conversationId?: number;
}) {
  const [showTicketForm, setShowTicketForm] = useState(false);

  return (
    <>
      <ChatTopBar onNewTicket={() => setShowTicketForm(true)} />
      <ChatView
        initialMessages={initialMessages}
        initialUsed={initialUsed}
        initialWithSupport={initialWithSupport}
        conversationId={conversationId}
        showTicketForm={showTicketForm}
        onTicketFormClose={() => setShowTicketForm(false)}
      />
    </>
  );
}
