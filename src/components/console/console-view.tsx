"use client";

import {
  ArrowRightLeft,
  Bot,
  CheckCheck,
  CircleCheckBig,
  Hand,
  Info,
  Headset,
  LogOut,
  MessageCircle,
  PanelRight,
  Search,
  SendHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  closeConversationAction,
  heartbeatAction,
  returnToAgentAction,
  sendAnalystMessageAction,
  setTypingAction,
  takeOverAction,
  type ConsoleActionResult,
} from "@/app/console/actions";
import { logoutAction } from "@/app/login/actions";
import type { Tone } from "@/domain/chat";
import type { AvatarView, ConsoleMessageView, ConversationDetailView, ConversationRowView } from "@/domain/console";
import { TransparencyPanel } from "../chat/transparency-panel";
import styles from "./console.module.css";

type Filter = "all" | "queue" | "agent" | "mine";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "queue", label: "Para você" },
  { id: "agent", label: "Com o agent" },
  { id: "mine", label: "Minhas" },
];

const toneClass = (tone: Tone | "muted") => styles[`tone-${tone}`];

function Avatar({ avatar, size, online, ringOnDesk }: { avatar: AvatarView; size: 46 | 40; online?: boolean; ringOnDesk?: boolean }) {
  return (
    <div
      className={size === 46 ? styles.avatarLarge : styles.avatarMedium}
      style={{ background: avatar.background, color: avatar.color }}
      aria-hidden
    >
      {avatar.initials}
      {online && <span className={`${styles.presence} ${ringOnDesk ? styles.presenceOnDesk : ""}`} />}
    </div>
  );
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

export function ConsoleView({
  rows,
  selectedId,
  detail,
  analystName,
}: {
  rows: ConversationRowView[];
  selectedId: number | null;
  detail: ConversationDetailView | null;
  analystName: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [liveRows, setLiveRows] = useState<ConversationRowView[] | null>(null);
  const list = liveRows ?? rows;

  // New messages come from the employees: an SSE subscription to the console events.
  useEffect(() => {
    const source = new EventSource("/console/events");
    source.onmessage = (event) => {
      try {
        const updated = JSON.parse(event.data) as ConversationRowView[];
        if (Array.isArray(updated)) {
          // Sort based on urgency (unread first) and then by update time
          const sorted = [...updated].sort((a, b) => {
            const unreadA = a.unread > 0 ? 0 : 1;
            const unreadB = b.unread > 0 ? 0 : 1;
            if (unreadA !== unreadB) return unreadA - unreadB;
            return b.time.localeCompare(a.time); // Assuming time is ISO or comparable
          });
          setLiveRows(sorted);
        }
      } catch {
        // Keep the last list; try again on the next event.
      }
    };
    return () => source.close();
  }, []);

  // Tells the server this analyst is here (the login screen shows how many are online).
  useEffect(() => {
    void heartbeatAction();
    const timer = setInterval(() => void heartbeatAction(), 15_000);
    return () => clearInterval(timer);
  }, []);

  const waiting = list.reduce((sum, row) => sum + (row.group === "queue" || row.group === "mine" ? row.unread : 0), 0);

  // New messages show in the tab title too, for when the console is in the background.
  useEffect(() => {
    document.title = waiting > 0 ? `(${waiting}) Console · Nexo Assist` : "Console · Nexo Assist";
  }, [waiting]);

  const counts = {
    all: list.length,
    queue: list.filter((r) => r.group === "queue").length,
    agent: list.filter((r) => r.group === "agent").length,
    mine: list.filter((r) => r.group === "mine").length,
  };
  const needle = query.trim().toLowerCase();
  const visible = list.filter((row) => (filter === "all" || row.group === filter) && (!needle || row.searchText.includes(needle)));

  function perform(action: () => Promise<ConsoleActionResult>) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setNotice(result.error);
      else if (result.warning) setNotice(result.warning);
      router.refresh();
    });
  }

  return (
    <div className={styles.console}>
      <nav className={styles.rail} aria-label="Principal">
        <div className={styles.railLogo}>
          <svg viewBox="0 0 28 28" width="22" height="22" aria-hidden>
            <path
              transform="translate(1.806 3.6821)"
              fill="#037AF6"
              d="M21.763 0.24493l-3.374 1.687c-0.623 0.308-0.973 0.903-0.973 1.631l0 6.293-11.193-9.429c-0.623-0.469-1.372-0.553-2.03-0.245l-3.185 1.631c-0.651 0.322-1.008 0.924-1.008 1.673l0 15.218c0 1.477 1.526 2.289 2.716 1.785l3.073-1.617c0.693-0.322 1.057-0.952 1.057-1.722l0-7.7 11.732 10.591c0.602 0.546 1.421 0.679 2.086 0.364l2.786-1.505c0.602-0.315 0.938-0.931 0.938-1.68l0-15.288c0-1.463-1.505-2.275-2.625-1.687z"
            />
          </svg>
        </div>
        <div className={styles.railItem} aria-current="page" title="Conversas">
          <MessageCircle size={19} aria-hidden />
          {counts.queue > 0 && (
            <span key={counts.queue} className={styles.railBadge}>
              {counts.queue}
            </span>
          )}
        </div>
        <div className={styles.railSpacer} />
        <form action={logoutAction}>
          <button type="submit" className={styles.railButton} title="Sair" aria-label="Sair">
            <LogOut size={18} aria-hidden />
          </button>
        </form>
        <div className={styles.me} title={analystName}>
          {initialsOf(analystName)}
          <span className={styles.meOnline} />
        </div>
      </nav>

      <section className={styles.list} aria-label="Conversas">
        <div className={styles.listHeader}>
          <div className={styles.titleRow}>
            <h1 className={styles.listTitle}>Conversas</h1>
            <div className={styles.availability}>
              <span className={styles.availabilityDot} />
              Disponível
            </div>
          </div>
          <label className={styles.search}>
            <Search size={15} aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar conversa ou chamado"
              aria-label="Pesquisar conversa ou chamado"
            />
          </label>
          <div className={styles.filters} role="group" aria-label="Filtros">
            {FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`${styles.filter} ${filter === id ? styles.filterActive : ""}`}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
                {id !== "all" && (
                  <span key={counts[id]} className={styles.filterCount}>
                    {counts[id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.items}>
          {visible.length === 0 && (
            <p className={styles.emptyList}>{rows.length === 0 ? "Nenhuma conversa ainda." : "Nenhuma conversa nesse filtro."}</p>
          )}
          {visible.map((row) => (
            <ConversationItem key={row.id} row={row} selected={row.id === selectedId} />
          ))}
        </div>
      </section>

      {detail ? (
        <ConversationPane
          key={detail.id}
          detail={detail}
          pending={pending}
          notice={notice}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((open) => !open)}
          perform={perform}
        />
      ) : (
        <div className={styles.conversation}>
          <p className={styles.emptyConversation}>Selecione uma conversa.</p>
        </div>
      )}

      {detail && panelOpen && <TicketPanel detail={detail} onClose={() => setPanelOpen(false)} />}
    </div>
  );
}

function ConversationItem({ row, selected }: { row: ConversationRowView; selected: boolean }) {
  const emphasized = row.urgent || row.unread > 0;
  // Something new arrived in this conversation after the list was drawn: flash it once.
  const activityKey = `${row.unread}|${row.time}|${row.preview.text}`;
  const [firstKey] = useState(activityKey);
  return (
    <Link
      href={`/console?c=${row.id}`}
      prefetch={false}
      scroll={false}
      className={`${styles.item} ${selected ? styles.itemSelected : ""}`}
      aria-current={selected ? "true" : undefined}
    >
      {activityKey !== firstKey && <span key={activityKey} className={styles.itemFlash} aria-hidden />}
      <Avatar avatar={row.avatar} size={46} online={row.online} ringOnDesk={selected} />
      <div className={styles.itemText}>
        <div className={styles.itemTop}>
          <span className={`${styles.itemName} ${emphasized ? styles.itemNameStrong : ""}`}>{row.name}</span>
          <span className={`${styles.itemTime} ${row.urgent ? styles.itemTimeUrgent : ""}`}>{row.time}</span>
        </div>
        <div className={styles.itemBottom}>
          {row.preview.prefix && (
            <CheckCheck size={15} className={row.group === "closed" ? styles.ticksMuted : styles.ticks} aria-hidden />
          )}
          <span className={styles.itemLast}>
            {row.preview.prefix}
            {row.preview.text}
          </span>
          {row.unread > 0 && (
            <span key={row.unread} className={styles.unread}>
              {row.unread}
            </span>
          )}
        </div>
        <div className={styles.itemTag}>
          <span className={`${styles.dot} ${toneClass(row.tag.tone)}`} />
          <span className={`${styles.tagLabel} ${styles[`tagLabel-${row.tag.tone}`]}`}>{row.tag.label}</span>
        </div>
      </div>
    </Link>
  );
}

function MessageRow({
  message,
  isNew,
  onInspect,
}: {
  message: ConsoleMessageView;
  isNew: boolean;
  onInspect: (message: ConsoleMessageView) => void;
}) {
  if (message.kind === "system") {
    const Icon = { transfer: ArrowRightLeft, takeover: Headset, return: Bot, close: CircleCheckBig }[message.icon ?? "transfer"];
    return (
      <div className={`${styles.system} ${isNew ? styles.messageNew : ""}`}>
        <span className={styles.systemRule} />
        <span className={styles.systemLabel}>
          <Icon size={13} aria-hidden />
          {message.text}
          {message.time ? ` · ${message.time}` : ""}
        </span>
        <span className={styles.systemRule} />
      </div>
    );
  }

  const spacing = message.firstOfRun ? styles.runStart : styles.runNext;
  if (message.kind === "client") {
    return (
      <div className={`${styles.message} ${spacing} ${isNew ? styles.messageNew : ""}`}>
        <div className={`${styles.bubble} ${styles.bubbleClient} ${message.firstOfRun ? styles.bubbleClientFirst : ""}`}>
          <span className={styles.bubbleText}>{message.text}</span>
          <span className={styles.bubbleMeta}>{message.time}</span>
        </div>
      </div>
    );
  }

  const isAgent = message.kind === "agent";
  return (
    <div className={`${styles.message} ${styles.messageEnd} ${spacing} ${isNew ? styles.messageNew : ""}`}>
      {message.firstOfRun && (
        <div className={styles.sender}>
          <span className={styles.senderName}>{isAgent ? "Nexo Assist" : message.author}</span>
          <span className={isAgent ? styles.tagAi : styles.tagTeam}>{isAgent ? "IA" : message.team}</span>
          {isAgent && (message.decision || (message.steps?.length ?? 0) > 0) && (
            <button type="button" className={styles.inspectLink} onClick={() => onInspect(message)} aria-label="Ver como o Nexo decidiu">
              <Info size={12} aria-hidden />
              detalhes
            </button>
          )}
        </div>
      )}
      <div className={`${styles.bubble} ${isAgent ? styles.bubbleAgent : styles.bubbleHuman}`}>
        <span className={styles.bubbleText}>{message.text}</span>
        <span className={styles.bubbleMeta}>
          {message.time}
          <CheckCheck size={14} className={styles.ticks} aria-hidden />
        </span>
      </div>
    </div>
  );
}

function ConversationPane({
  detail,
  pending,
  notice,
  panelOpen,
  onTogglePanel,
  perform,
}: {
  detail: ConversationDetailView;
  pending: boolean;
  notice: string | null;
  panelOpen: boolean;
  onTogglePanel: () => void;
  perform: (action: () => Promise<ConsoleActionResult>) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  // Messages that were already there when this conversation opened do not animate; the ones that arrive later do.
  const [initialIds] = useState(() => new Set(detail.messages.map((m) => m.id)));
  const inspected = detail.messages.find((m) => m.id === inspectedId && m.kind === "agent") ?? null;
  const mine = detail.group === "mine";
  const canTakeOver = detail.group === "queue" || detail.group === "agent";
  const [typingFocus, setTypingFocus] = useState(false);
  const typingOn = typingFocus || detail.typing;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detail.messages.length]);

  function send(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || pending) return;
    setText("");
    perform(async () => {
      await setTypingAction(detail.id, false);
      return sendAnalystMessageAction(detail.id, value);
    });
  }

  function beginTyping() {
    setTypingFocus(true);
    perform(() => setTypingAction(detail.id, true));
  }

  function endTyping() {
    setTypingFocus(false);
    perform(() => setTypingAction(detail.id, false));
  }

  return (
    <section className={styles.conversation} aria-label={`Conversa com ${detail.name}`}>
      <header className={styles.convHeader}>
        <Avatar avatar={detail.avatar} size={40} />
        <div className={styles.who}>
          <span className={styles.whoName}>{detail.name}</span>
          <span className={styles.whoMeta}>{detail.meta}</span>
        </div>
        {detail.badge && (
          <div className={`${styles.badge} ${styles[`badge-${detail.badge.tone}`]}`}>
            <Bot size={14} aria-hidden />
            {detail.badge.label}
          </div>
        )}
        {typingOn && (
          <div className={styles.typingLine} role="status" aria-live="polite">
            {detail.name.split(" ")[0]} está digitando…
          </div>
        )}
        {mine && (
          <>
            <button
              type="button"
              className={styles.btn}
              disabled={pending}
              onClick={() => perform(() => returnToAgentAction(detail.id))}
            >
              <Bot size={14} aria-hidden />
              Devolver ao agent
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              disabled={pending}
              onClick={() => perform(() => closeConversationAction(detail.id))}
            >
              <CircleCheckBig size={14} aria-hidden />
              Encerrar atendimento
            </button>
          </>
        )}
        <button
          type="button"
          className={`${styles.iconButton} ${panelOpen ? styles.iconButtonOn : ""}`}
          onClick={onTogglePanel}
          aria-pressed={panelOpen}
          aria-label="Chamados da pessoa"
          title="Chamados da pessoa"
        >
          <PanelRight size={18} aria-hidden />
        </button>
      </header>

      <div className={styles.messages} ref={listRef} role="log" aria-label="Mensagens">
        {detail.messages.map((message) => (
          <MessageRow key={message.id} message={message} isNew={!initialIds.has(message.id)} onInspect={(m) => setInspectedId(m.id)} />
        ))}
      </div>

      {inspected && (
        <TransparencyPanel
          message={{ id: inspected.id, role: "agent", steps: inspected.steps ?? [], blocks: [], decision: inspected.decision }}
          onClose={() => setInspectedId(null)}
        />
      )}

      <div className={styles.bar}>
        {notice && (
          <p className={styles.notice} role="alert">
            {notice}
          </p>
        )}
        {detail.bar && (
          <div className={styles.barRow}>
            <div className={`${styles.barIcon} ${detail.bar.tone === "warning" ? styles.barIconWarning : ""}`}>
              {detail.bar.tone === "warning" ? <Hand size={17} aria-hidden /> : <Bot size={17} aria-hidden />}
            </div>
            <div className={styles.barText}>
              <span className={styles.barTitle}>{detail.bar.title}</span>
              <span className={styles.barBody}>{detail.bar.body}</span>
            </div>
            {detail.group === "queue" && (
              <button type="button" className={styles.btn} disabled={pending} onClick={() => perform(() => returnToAgentAction(detail.id))}>
                <Bot size={15} aria-hidden />
                Devolver ao agent
              </button>
            )}
            {canTakeOver && (
              <button type="button" className={styles.btnPrimary} disabled={pending} onClick={() => perform(() => takeOverAction(detail.id))}>
                <Headset size={16} aria-hidden />
                Assumir atendimento
              </button>
            )}
          </div>
        )}
        {mine ? (
          <form className={styles.composer} onSubmit={send}>
            <input
              className={styles.composerInput}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Escreva para a pessoa…"
              aria-label="Mensagem para a pessoa"
              maxLength={2000}
              autoComplete="off"
              onFocus={beginTyping}
              onBlur={endTyping}
            />
            <button type="submit" className={styles.send} disabled={pending || text.trim() === ""} aria-label="Enviar">
              <SendHorizontal size={18} aria-hidden />
            </button>
          </form>
        ) : (
          <div className={styles.composer}>
            <div className={`${styles.composerInput} ${styles.composerLocked}`}>
              {detail.group === "closed" ? "Conversa encerrada" : "Assuma o atendimento para responder"}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function TicketPanel({ detail, onClose }: { detail: ConversationDetailView; onClose: () => void }) {
  const { panel } = detail;
  return (
    <aside className={styles.panel} aria-label={`Chamados de ${panel.firstName}`}>
      <header className={styles.panelHeader}>
        <div className={styles.panelTitle}>
          <span className={styles.panelName}>Chamados da {panel.firstName}</span>
          <span className={styles.panelMeta}>{panel.counts}</span>
        </div>
        <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Fechar painel">
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className={styles.panelBody}>
        {detail.summary && (
          <div className={styles.group}>
            <span className={styles.groupLabel}>Resumo do agent</span>
            <p className={styles.summary}>{detail.summary}</p>
          </div>
        )}
        <div className={styles.group}>
          <span className={styles.groupLabel}>Desta conversa</span>
          {panel.current ? (
            <div className={styles.current}>
              <div className={styles.currentSummary}>
                <div className={styles.currentRow}>
                  <span className={styles.currentNumber}>{panel.current.code}</span>
                  <span className={`${styles.currentStatus} ${styles[`status-${panel.current.statusTone}`]}`}>
                    <span className={`${styles.dotLarge} ${toneClass(panel.current.statusTone)}`} />
                    {panel.current.statusLabel}
                  </span>
                </div>
                <span className={styles.currentTitle}>{panel.current.title}</span>
                <span className={styles.currentMeta}>{panel.current.meta}</span>
              </div>
              {panel.current.lastEvent && (
                <div className={styles.lastEvent}>
                  {panel.current.lastEvent.icon === "takeover" ? (
                    <Headset size={15} aria-hidden />
                  ) : (
                    <ArrowRightLeft size={15} aria-hidden />
                  )}
                  <span className={styles.lastEventText}>{panel.current.lastEvent.text}</span>
                  <span className={styles.lastEventTime}>{panel.current.lastEvent.time}</span>
                </div>
              )}
            </div>
          ) : (
            <p className={styles.panelEmpty}>
              {panel.unavailable ? "Não foi possível consultar os chamados agora. Tente de novo em instantes." : "Nenhum chamado vinculado a esta conversa."}
            </p>
          )}
        </div>
        {panel.others.length > 0 && (
          <div className={styles.group}>
            <span className={styles.groupLabel}>Outros chamados</span>
            <div className={styles.others}>
              {panel.others.map((ticket) => (
                <div key={ticket.code} className={styles.otherRow}>
                  <span className={`${styles.dotLarge} ${toneClass(ticket.dot)}`} />
                  <div className={styles.otherText}>
                    <span className={styles.otherTitle}>{ticket.title}</span>
                    <span className={styles.otherMeta}>{ticket.meta}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
