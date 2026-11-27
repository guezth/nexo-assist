"use client";

import { useRouter } from "next/navigation";
import { startNewConversation } from "@/app/chat/actions";
import { ChatTopBar } from "./chat-top-bar";

export function ChatHeaderActions() {
  const router = useRouter();

  async function handleNewConversation() {
    await startNewConversation();
    window.location.reload();
  }

  function handleNewTicket() {
    router.push("/chamados/novo");
  }

  return (
    <ChatTopBar
      onNewConversation={handleNewConversation}
      onNewTicket={handleNewTicket}
    />
  );
}
