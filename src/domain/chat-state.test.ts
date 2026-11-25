import { describe, expect, it } from "vitest";
import type { AgentMessageView, ChatMessageView } from "@/domain/chat";
import { applyAction, pendingDraftId } from "./chat-state";

const agent = (over: Partial<AgentMessageView>): AgentMessageView => ({ id: "a", role: "agent", steps: [], blocks: [], ...over });

describe("chat state", () => {
  it("marks the chosen option and no other", () => {
    const messages: ChatMessageView[] = [
      agent({ blocks: [{ kind: "bubble", text: "?", options: [{ id: "self", label: "Só eu" }, { id: "team", label: "Minha equipe" }] }] }),
    ];
    const next = applyAction(messages, { type: "option", optionId: "team", label: "Minha equipe" });
    const block = (next[0] as AgentMessageView).blocks[0];
    expect(block.kind === "bubble" && block.options?.map((o) => o.selected)).toEqual([false, true]);
  });

  it("records the decision on a draft and stops it from being pending", () => {
    const draft = { kind: "draft" as const, draftId: "D-381", effect: { kind: "note" as const, code: "INC-1", text: "x" }, title: "t", description: "d", fields: [] };
    const messages: ChatMessageView[] = [agent({ blocks: [draft] })];
    expect(pendingDraftId(messages)).toBe("D-381");
    const next = applyAction(messages, { type: "draft", draftId: "D-381", decision: "confirm", label: "Confirmar" });
    expect(pendingDraftId(next)).toBeNull();
    expect((next[0] as AgentMessageView).blocks[0]).toMatchObject({ outcome: "confirmed" });
  });

  it("marks the chosen ticket in the list", () => {
    const rows = [{ code: "INC-1", title: "a", status: { label: "x", tone: "primary" as const }, date: "01 out" }];
    const next = applyAction([agent({ blocks: [{ kind: "ticketList", rows }] })], { type: "select-ticket", code: "INC-1", label: "" });
    expect((next[0] as AgentMessageView).blocks[0]).toMatchObject({ selectedCode: "INC-1" });
  });
});
