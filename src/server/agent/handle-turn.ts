import type { ChatMessageView, DraftBlock, TurnEvent, TurnInput } from "@/domain/chat";
import { handoffRespondBy } from "@/domain/handoff";
import type { TurnMetric } from "@/domain/metrics";
import { TurnAssembler } from "@/domain/turn-assembler";
import type { ConversationRepository } from "@/server/conversations/repository";
import { MessageLimitError } from "@/server/conversations/repository";
import type { KnowledgeBase } from "@/server/services/knowledge-base";
import type { TicketService } from "@/server/services/ticket-service";
import type { Requester, TurnContext } from "./context";
import { decideDraft } from "./drafts";
import type { AgentModels } from "./models";
import { buildHistory, runAgentTurn } from "./run-turn";
import type { RunAgentTurnResult } from "./run-turn";
import type { HistoryMessage } from "./types";

export type { TurnInput };

export interface TurnDeps {
  conversations: ConversationRepository;
  tickets: TicketService;
  knowledgeBase: KnowledgeBase;
  models: AgentModels;
  now?: () => Date;
  /** Replaceable in tests, so the rules around the model can be checked without one. */
  runAgent?: (ctx: TurnContext, text: string, history: HistoryMessage[], models: AgentModels) => Promise<RunAgentTurnResult | void>;
  /** Waits between retries of the ticket system. Replaceable in tests. */
  sleep?: (ms: number) => Promise<void>;
}

const MAX_TEXT_LENGTH = 1000;

/** What the employee "said": typed text, or the label of the button they pressed. */
function shownText(input: TurnInput): string {
  return input.type === "text" ? input.text.trim().slice(0, MAX_TEXT_LENGTH) : input.label;
}

/**
 * One turn of the conversation, from the employee's message to the stored answer.
 * It owns everything the model must not decide: the message limit, who is
 * allowed to speak (the agent is silent while an analyst has the conversation),
 * what a confirmation does, and when a transfer is carried out.
 */
export async function handleTurn(requester: Requester, input: TurnInput, deps: TurnDeps, send: (event: TurnEvent) => void): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const text = shownText(input);
  if (!text) return void send({ type: "error", reason: "failed" });

  const conversation = await deps.conversations.getOrCreateActive(requester.id);
  try {
    await deps.conversations.addUserMessage(conversation.id, text);
  } catch (error) {
    if (error instanceof MessageLimitError) return void send({ type: "error", reason: "limit" });
    throw error;
  }

  // With the support team the agent stays quiet; the analyst reads the message in the console.
  if (conversation.mode === "analyst") {
    if (input.type !== "text" && input.type !== "draft") await deps.conversations.applyAction(conversation.id, input);
    return void send({ type: "done", message: null, withSupport: true });
  }

  const turn = new TurnAssembler();
  const ctx: TurnContext = {
    requester,
    now,
    tickets: deps.tickets,
    knowledgeBase: deps.knowledgeBase,
    conversations: deps.conversations,
    conversationId: conversation.id,
    turn,
    emit: (event) => {
      if (!turn.accepts(event)) return;
      turn.apply(event);
      send(event);
    },
    state: { handoff: null },
    sleep: deps.sleep,
  };

  let agentResult: RunAgentTurnResult | undefined;
  try {
    const draftAction = input.type === "draft" ? input : null;
    const pendingDraft = draftAction ? findPendingDraft(conversation.messages, draftAction.draftId) : null;

    if (draftAction && draftAction.decision !== "edit" && pendingDraft) {
      await decideDraft(ctx, pendingDraft, draftAction.decision);
    } else if (draftAction && draftAction.decision !== "edit") {
      // The draft is not waiting any more (already decided, or replaced by a newer one).
      ctx.emit({ type: "text", delta: "Esse rascunho não está mais aguardando confirmação." });
    } else {
      if (draftAction) await deps.conversations.setDraftOutcome(conversation.id, draftAction.draftId, "edited");
      else if (input.type !== "text") await deps.conversations.applyAction(conversation.id, input);

      const message = draftAction ? "Quero editar o rascunho do chamado." : text;
      agentResult = (await (deps.runAgent ?? runAgentTurn)(ctx, message, await buildHistory(conversation.messages, deps.models), deps.models)) as RunAgentTurnResult | undefined;
    }
  } catch (error) {
    console.error("[agent] turn failed", error);
    return void send({ type: "error", reason: "unavailable" });
  }

  const built = turn.build();
  // The transfer comes after the answer, so the timeline reads: answer, then "Transferida".
  const handoff = ctx.state.handoff;
  const metric: TurnMetric | null = agentResult ? { conversationId: conversation.id, ...agentResult, transferred: handoff !== null } : null;
  if (metric) built.metrics = metric;
  const stored = built.blocks.length > 0 || built.steps.length > 0 ? await deps.conversations.addAgentMessage(conversation.id, built) : null;
  if (metric) await deps.conversations.recordMetric(metric);

  if (handoff) {
    await deps.conversations.cancelPendingDrafts(conversation.id);
    await deps.conversations.handOff(conversation.id, {
      reason: handoff.reason,
      summary: handoff.summary,
      ticketCode: handoff.ticketCode,
      confidence: handoff.confidence,
      respondBy: handoffRespondBy(handoff.reason, now).toISOString(),
    });
  }

  send({ type: "done", message: stored, withSupport: handoff !== null });
}

function findPendingDraft(messages: ChatMessageView[], draftId: string): DraftBlock | null {
  for (const message of messages) {
    if (message.role !== "agent") continue;
    for (const block of message.blocks) {
      if (block.kind === "draft" && block.draftId === draftId && block.outcome === undefined) return block;
    }
  }
  return null;
}
