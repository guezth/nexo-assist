import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChatHeaderActions } from "@/components/chat/chat-header-actions";
import { ChatView } from "@/components/chat/chat-view";
import { EmployeeShell } from "@/components/employee-shell";
import type { AgentMessageView } from "@/domain/chat";
import { can } from "@/domain/access";
import { getSession } from "@/server/auth/session";
import { getConversations } from "@/server/conversations";

async function ChatScreen({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const user = await getSession();
  if (!user || !can(user.accessLevel, "chat")) redirect("/login");

  const params = await searchParams;
  const conversations = await getConversations();
  const conversationId = params.conversation ? Number(params.conversation) : undefined;
  const conversation = conversationId ? await conversations.findById(conversationId) : await conversations.findActive(user.id);
  if (conversation && conversation.employeeId !== user.id) redirect("/chat");

  // Shown above every conversation; it is part of the screen, not of the stored history.
  const greeting: AgentMessageView = {
    id: "greeting",
    role: "agent",
    steps: [],
    blocks: [
      {
        kind: "bubble",
        text: `Olá, ${user.name.split(" ")[0]}. Sou o Nexo Assist, do suporte de TI. Conte o que está acontecendo ou pergunte pelo status de um chamado.`,
      },
    ],
  };

  return (
    <EmployeeShell user={user} active="chat" title="Atendimento" topBarRight={<ChatHeaderActions />}>
      <ChatView
        initialMessages={[greeting, ...(conversation?.messages ?? [])]}
        initialUsed={conversation?.used ?? 0}
        initialWithSupport={conversation?.mode === "analyst"}
        conversationId={conversation?.id}
      />
    </EmployeeShell>
  );
}

export default function ChatPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  return (
    <Suspense fallback={null}>
      <ChatScreen searchParams={searchParams} />
    </Suspense>
  );
}
