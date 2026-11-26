"use server";

import { getSession } from "@/server/auth/session";
import { getConversations } from "@/server/conversations";

export interface HistoryItem {
  id: number;
  status: "aberta" | "encerrada";
  mode: "agent" | "analyst" | "closed";
  updatedAt: string;
  preview: string | null;
  ticketCode: string | null;
}

export async function listHistory(): Promise<HistoryItem[]> {
  const user = await getSession();
  if (!user || user.role !== "employee") throw new Error("Sessão inválida.");

  const summaries = await (await getConversations()).listByEmployee(user.id);
  return summaries.map((s) => ({
    id: s.id,
    status: s.mode === "closed" ? "encerrada" : "aberta",
    mode: s.mode,
    updatedAt: s.updatedAt,
    preview: s.lastMessage
      ? s.lastMessage.role === "user"
        ? s.lastMessage.text.slice(0, 120)
        : s.lastMessage.role === "agent"
          ? "Nexo: " + (s.lastMessage.blocks.find((b) => b.kind === "bubble")?.text ?? "").slice(0, 120)
          : s.lastMessage.role === "analyst"
            ? `${s.lastMessage.author}: ${s.lastMessage.text.slice(0, 120)}`
            : null
      : null,
    ticketCode: s.ticketCode,
  }));
}
