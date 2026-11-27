"use client";

import { useEffect, useRef, useState } from "react";
import { pollConversation, rateAnswerAction, startNewConversation } from "@/app/chat/actions";
import { MAX_SESSION_MESSAGES, type AgentMessageView, type ChatAction, type ChatMessageView, type TurnEvent, type TurnInput } from "@/domain/chat";
import type { FeedbackRating } from "@/domain/feedback";
import { applyAction, pendingDraftId } from "@/domain/chat-state";
import { TurnAssembler } from "@/domain/turn-assembler";

export interface UseChatOptions {
  initialMessages: ChatMessageView[];
  initialUsed: number;
  initialWithSupport: boolean;
  conversationId?: number;
}

export function useChat({
  initialMessages,
  initialUsed,
  initialWithSupport,
  conversationId,
}: UseChatOptions) {
  const [messages, setMessages] = useState(initialMessages);
  const [used, setUsed] = useState(initialUsed);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [withSupport, setWithSupport] = useState(initialWithSupport);
  const [pending, setPending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [live, setLive] = useState<AgentMessageView | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);
  const [initialIds] = useState(() => new Set(initialMessages.map((m) => m.id)));

  useEffect(() => {
    setMessages(initialMessages);
    setUsed(initialUsed);
    setWithSupport(initialWithSupport);
  }, [initialMessages, initialUsed, initialWithSupport]);

  const limitReached = used >= MAX_SESSION_MESSAGES;
  const busy = pending || limitReached;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, live]);

  async function submit(input: TurnInput, shown: string, action?: ChatAction) {
    if (busy) return;
    setError(null);
    setMessages((current) => {
      const marked = action ? applyAction(current, action) : current;
      return [...marked, { id: `user-${++counter.current}`, role: "user", text: shown }];
    });
    setUsed((n) => n + 1);
    setPending(true);

    if (used >= MAX_SESSION_MESSAGES) {
      const poll = await startNewConversation();
      if (poll.status === "open") {
        setUsed(poll.used);
        setMessages((current) => [...current.filter((m) => m.id === "greeting"), ...poll.messages]);
      }
    }

    const assembler = new TurnAssembler();
    try {
      const response = await fetch("/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, conversationId }),
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) handleEvent(JSON.parse(line) as TurnEvent, assembler);
        }
      }
    } catch {
      setError("Não consegui responder agora. Tente de novo em instantes.");
    } finally {
      setPending(false);
      setLive(null);
    }
  }

  function handleEvent(event: TurnEvent, assembler: TurnAssembler) {
    switch (event.type) {
      case "step":
      case "text":
      case "block":
      case "question":
        assembler.apply(event);
        setLive(assembler.snapshot("live"));
        break;
      case "done":
        if (event.message) setMessages((current) => [...current, event.message!]);
        if (event.withSupport) setWithSupport(true);
        break;
      case "error":
        if (event.reason === "limit") {
          setUsed(MAX_SESSION_MESSAGES);
          setError("Você chegou ao limite de mensagens desta sessão.");
        } else if (event.reason === "closed") {
          setError("Esta conversa foi encerrada. Inicie um novo atendimento para continuar.");
        } else {
          setError(
            event.reason === "unavailable"
              ? "O assistente está indisponível no momento. Tente de novo em instantes."
              : "Não consegui responder agora. Tente de novo em instantes.",
          );
        }
        break;
    }
  }

  // SSE + fallback polling while withSupport.
  useEffect(() => {
    if (!withSupport) return;

    const source = new EventSource("/chat/events");
    source.onmessage = async (event) => {
      try {
        const push = JSON.parse(event.data) as { type: string; payload?: { conversationId?: number; typing?: boolean } };
        if (push.payload?.conversationId && push.payload.conversationId !== conversationId) return;
        const poll = await pollConversation(conversationId);
        if (poll.status === "closed") {
          setWithSupport(false);
          setTyping(false);
          setUsed(0);
          setMessages((current) => [
            ...current,
            { id: "closed", role: "system", icon: "close", text: "Atendimento encerrado pela equipe de TI" },
          ]);
        } else {
          setWithSupport(poll.mode === "analyst");
          setTyping(poll.typing);
          setMessages((current) => [...current.filter((m) => m.id === "greeting"), ...poll.messages]);
        }
      } catch {
        // next event retries
      }
    };

    const fallback = setInterval(async () => {
      if (source.readyState === EventSource.CLOSED) {
        try {
          const poll = await pollConversation(conversationId);
          if (poll.status === "closed") {
            setWithSupport(false);
            setTyping(false);
            setUsed(0);
            setMessages((current) => [...current, { id: "closed", role: "system", icon: "close", text: "Atendimento encerrado pela equipe de TI" }]);
          } else {
            setWithSupport(poll.mode === "analyst");
            setTyping(poll.typing);
            setMessages((current) => [...current.filter((m) => m.id === "greeting"), ...poll.messages]);
          }
        } catch {
          // next tick retries
        }
      }
    }, 5000);

    return () => {
      source.close();
      clearInterval(fallback);
    };
  }, [withSupport, conversationId]);

  const inspected = messages.find((m): m is AgentMessageView => m.role === "agent" && m.id === inspectedId) ?? null;

  const onAction = (action: ChatAction) => submit(action, action.label, action);

  // Keyboard shortcut: ⌘↵ / Ctrl+↵ confirms the pending draft.
  const draftId = pendingDraftId(messages);
  useEffect(() => {
    if (!draftId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onAction({ type: "draft", draftId, decision: "confirm", label: "Confirmar" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, busy]);

  async function rate(messageId: string, rating: FeedbackRating): Promise<void> {
    try {
      await rateAnswerAction(Number(messageId.slice(1)), rating, conversationId);
      setMessages((current) => current.map((m) => (m.role === "agent" && m.id === messageId ? { ...m, feedback: { rating } } : m)));
    } catch {
      // Nothing breaks if it fails: the buttons simply stay.
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    submit({ type: "text", text: value }, value);
  }

  return {
    messages,
    used,
    text,
    setText,
    error,
    withSupport,
    typing,
    pending,
    live,
    inspected,
    setInspectedId,
    initialIds,
    limitReached,
    busy,
    listRef,
    onAction,
    rate,
    onSubmit,
  };
}
