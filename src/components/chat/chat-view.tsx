"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { pollConversation, rateAnswerAction, startNewConversation } from "@/app/chat/actions";
import { MAX_SESSION_MESSAGES, type AgentMessageView, type ChatAction, type ChatMessageView, type TurnEvent, type TurnInput } from "@/domain/chat";
import type { FeedbackRating } from "@/domain/feedback";
import { applyAction, pendingDraftId } from "@/domain/chat-state";
import { TurnAssembler } from "@/domain/turn-assembler";
import styles from "./chat.module.css";
import { AgentMessage, AnalystMessage, SystemLine, UserMessage } from "./message-blocks";
import { TransparencyPanel } from "./transparency-panel";

export function ChatView({
  initialMessages,
  initialUsed,
  initialWithSupport = false,
}: {
  initialMessages: ChatMessageView[];
  /** Messages the employee already sent in this session. */
  initialUsed: number;
  /** The conversation is with the support team (the agent is muted). */
  initialWithSupport?: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [used, setUsed] = useState(initialUsed);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [withSupport, setWithSupport] = useState(initialWithSupport);
  const [pending, setPending] = useState(false);
  const [typing, setTyping] = useState(false);
  /** The agent's answer while it is still being written. */
  const [live, setLive] = useState<AgentMessageView | null>(null);
  /** The answer whose decision is open in the side panel. */
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);
  // Messages already on screen when the page opened do not animate; the ones that arrive later do.
  const [initialIds] = useState(() => new Set(initialMessages.map((m) => m.id)));

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

    // At the session limit: close the old conversation and open a new one; the turn runs in the new one.
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
        body: JSON.stringify(input),
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
          // The server is the one that counts: show its limit.
          setUsed(MAX_SESSION_MESSAGES);
          setError("Você chegou ao limite de mensagens desta sessão.");
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

  // While the support team has the conversation, look for their answers.
  useEffect(() => {
    if (!withSupport) return;
    const tick = async () => {
      try {
        const poll = await pollConversation();
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
          // Keep the greeting, which is not part of the stored conversation.
          setMessages((current) => [...current.filter((m) => m.id === "greeting"), ...poll.messages]);
        }
      } catch {
        // Try again on the next tick.
      }
    };
    void tick();
    const timer = setInterval(tick, 4000);
    return () => clearInterval(timer);
  }, [withSupport]);

  const inspected = messages.find((m): m is AgentMessageView => m.role === "agent" && m.id === inspectedId) ?? null;

  const onAction = (action: ChatAction) => submit(action, action.label, action);

  /** Records the employee's rating of an answer. */
  async function rate(messageId: string, rating: FeedbackRating): Promise<void> {
    try {
      await rateAnswerAction(Number(messageId.slice(1)), rating);
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

  // ⌘↵ / Ctrl+↵ confirms the draft that is waiting for a decision.
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

  return (
    <div className={styles.chat}>
      <div className={styles.messages} ref={listRef} role="log" aria-live="polite" aria-label="Conversa">
        {messages.map((message) => {
          const node = (() => {
            switch (message.role) {
              case "user":
                return <UserMessage message={message} />;
              case "analyst":
                return <AnalystMessage message={message} />;
              case "system":
                return <SystemLine message={message} />;
              case "agent":
                return <AgentMessage message={message} disabled={busy} onAction={onAction} onInspect={(m) => setInspectedId(m.id)} onRate={(messageId, rating) => void rate(messageId, rating)} />;
            }
          })();
          return initialIds.has(message.id) ? (
            <Fragment key={message.id}>{node}</Fragment>
          ) : (
            <div key={message.id} className={message.role === "user" ? styles.enterUser : styles.enter}>
              {node}
            </div>
          );
        })}
        {live && (live.steps.length > 0 || live.blocks.length > 0) && <AgentMessage message={live} disabled onAction={onAction} thinking />}
        {pending && !live?.steps.length && !live?.blocks.length && (
          <div className={styles.agent}>
            <div className={styles.statusLine}>
              <span className={styles.who}>Nexo Assist</span>
              <span className={styles.step}>
                <Loader2 size={12} className={styles.spin} aria-hidden />
                pensando…
              </span>
            </div>
          </div>
        )}
        {error && (
          <div className={styles.agentBubble} role="alert" style={{ borderColor: "#ee343b55" }}>
            <p>{error}</p>
          </div>
        )}
        {typing && (
          <div className={styles.typingLine} role="status" aria-live="polite">
            Analista está digitando…
          </div>
        )}
      </div>

      {inspected && <TransparencyPanel message={inspected} onClose={() => setInspectedId(null)} />}

      <form className={styles.composerArea} onSubmit={onSubmit}>
        <div className={styles.composer}>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={limitReached ? "Limite de mensagens da sessão atingido" : "Escreva para o Nexo…"}
            aria-label="Mensagem para o Nexo Assist"
            disabled={limitReached}
            autoComplete="off"
            maxLength={1000}
          />
          <button type="submit" className={styles.send} disabled={busy || text.trim() === ""}>
            <ArrowUp size={14} aria-hidden />
            Enviar
          </button>
        </div>
        <div className={styles.meta}>
          <span className={limitReached ? styles.metaLimit : undefined}>
            {used}/{MAX_SESSION_MESSAGES} mensagens nesta sessão
          </span>
        </div>
      </form>
    </div>
  );
}
