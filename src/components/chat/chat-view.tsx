"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { Fragment } from "react";
import { MAX_SESSION_MESSAGES, type ChatMessageView } from "@/domain/chat";
import styles from "./chat.module.css";
import { AgentMessage, AnalystMessage, SystemLine, UserMessage } from "./message-blocks";
import { TransparencyPanel } from "./transparency-panel";
import { useChat } from "./use-chat";

export function ChatView({
  initialMessages,
  initialUsed,
  initialWithSupport = false,
  conversationId,
}: {
  initialMessages: ChatMessageView[];
  initialUsed: number;
  initialWithSupport?: boolean;
  conversationId?: number;
}) {
  const {
    messages,
    used,
    text,
    setText,
    error,
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
  } = useChat({
    initialMessages,
    initialUsed,
    initialWithSupport,
    conversationId,
  });

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
                return (
                  <AgentMessage
                    message={message}
                    disabled={busy}
                    onAction={onAction}
                    onInspect={(m) => setInspectedId(m.id)}
                    onRate={(messageId, rating) => void rate(messageId, rating)}
                  />
                );
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
        {live && (live.steps.length > 0 || live.blocks.length > 0) && (
          <AgentMessage message={live} disabled onAction={onAction} thinking />
        )}
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
