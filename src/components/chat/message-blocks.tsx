import { ArrowRightLeft, Check, Info, Loader2, CircleCheckBig, Headset, Bot } from "lucide-react";
import type {
  AgentBlock,
  AgentMessageView,
  AnalystMessageView,
  ChatAction,
  DraftBlock,
  FieldView,
  OptionView,
  StatusView,
  SystemMessageView,
  TicketBlock,
  TicketRowView,
  Tone,
  UserMessageView,
} from "@/domain/chat";
import { formatClock } from "@/lib/format";
import styles from "./chat.module.css";

type OnAction = (action: ChatAction) => void;

const toneClass = (tone: Tone) => styles[`tone-${tone}`];

function Dot({ tone }: { tone: Tone }) {
  return <span className={`${styles.dot} ${toneClass(tone)}`} aria-hidden />;
}

export function UserMessage({ message }: { message: UserMessageView }) {
  return (
    <div className={styles.userRow}>
      <div className={styles.userBubble}>{message.text}</div>
    </div>
  );
}

function Options({
  options,
  disabled,
  onPick,
}: {
  options: OptionView[];
  disabled: boolean;
  onPick: (option: OptionView) => void;
}) {
  return (
    <div className={styles.options}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`${styles.option} ${option.selected ? styles.optionSelected : ""}`}
          disabled={disabled}
          aria-pressed={option.selected ? true : undefined}
          onClick={() => onPick(option)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Fields({ fields }: { fields: FieldView[] }) {
  return (
    <div className={styles.fields}>
      <dl className={styles.grid} style={{ margin: 0 }}>
        {fields.map((field) => (
          <div key={field.label} className={styles.field}>
            <dt className={styles.fieldKey}>{field.label}</dt>
            <dd className={`${styles.fieldValue} ${field.emphasis === "warning" ? styles.fieldValueWarning : ""}`} style={{ margin: 0 }}>
              {field.dot && <Dot tone={field.dot} />}
              {field.value}
              {field.note && <span className={styles.fieldNote}>{field.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CardHeader({
  kind,
  reference,
  state,
  title,
  description,
}: {
  kind: string;
  reference: string;
  state: StatusView;
  title: string;
  description: string;
}) {
  return (
    <div className={styles.cardBody}>
      <div className={styles.eyebrow}>
        <span className={styles.eyebrowKind}>{kind}</span>
        <span className={styles.sep} aria-hidden />
        <span>{reference}</span>
        <span className={styles.eyebrowSpacer} />
        <span className={styles.state} style={state.tone === "warning" ? undefined : { color: "var(--ink-3)" }}>
          <Dot tone={state.tone} />
          {state.label}
        </span>
      </div>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardDescription}>{description}</p>
    </div>
  );
}

const OUTCOME_LABEL: Record<NonNullable<DraftBlock["outcome"]>, string> = {
  confirmed: "Confirmado",
  edited: "Editando",
  cancelled: "Cancelado",
};

function DraftCard({ block, disabled, onAction }: { block: DraftBlock; disabled: boolean; onAction: OnAction }) {
  const decided = block.outcome !== undefined;
  const decide = (decision: "confirm" | "edit" | "cancel", label: string) =>
    onAction({ type: "draft", draftId: block.draftId, decision, label });

  return (
    <section className={styles.card} aria-label={`Rascunho ${block.draftId}`}>
      <CardHeader
        kind={block.effect.kind === "create" ? "Novo chamado" : block.effect.kind === "note" ? "Atualização de chamado" : "Reabertura de chamado"}
        reference={`Rascunho ${block.draftId}`}
        state={decided ? { label: OUTCOME_LABEL[block.outcome!], tone: block.outcome === "confirmed" ? "success" : "neutral" } : { label: "Aguardando confirmação", tone: "warning" }}
        title={block.title}
        description={block.description}
      />
      <Fields fields={block.fields} />
      {!decided && (
        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={disabled} onClick={() => decide("confirm", "Confirmar")}>
            Confirmar
            <span className={styles.kbd}>⌘↵</span>
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} disabled={disabled} onClick={() => decide("edit", "Editar")}>
            Editar
          </button>
          <button type="button" className={styles.btn} disabled={disabled} onClick={() => decide("cancel", "Cancelar")}>
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}

function TicketCard({ block }: { block: TicketBlock }) {
  return (
    <section className={styles.card} aria-label={`Chamado ${block.code}`}>
      <CardHeader kind="Chamado" reference={block.code} state={block.status} title={block.title} description={block.description} />
      <Fields fields={block.fields} />
    </section>
  );
}

function TicketList({
  rows,
  selectedCode,
  disabled,
  onAction,
}: {
  rows: TicketRowView[];
  selectedCode?: string;
  disabled: boolean;
  onAction: OnAction;
}) {
  return (
    <div className={styles.card} role="radiogroup" aria-label="Chamados abertos">
      <div className={styles.list}>
        {rows.map((row) => {
          const selected = row.code === selectedCode;
          return (
            <button
              key={row.code}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`${styles.row} ${selected ? styles.rowSelected : ""}`}
              disabled={disabled}
              onClick={() => onAction({ type: "select-ticket", code: row.code, label: `${row.code} · ${row.title}` })}
            >
              <span className={`${styles.radio} ${selected ? styles.radioOn : ""}`} aria-hidden />
              <span className={styles.rowCode}>{row.code}</span>
              <span className={styles.rowTitle}>{row.title}</span>
              <span className={styles.rowStatus}>
                <Dot tone={row.status.tone} />
                {row.status.label}
              </span>
              <span className={styles.rowDate}>{row.date}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Block({ block, disabled, onAction }: { block: AgentBlock; disabled: boolean; onAction: OnAction }) {
  switch (block.kind) {
    case "bubble":
      return (
        <div className={styles.agentBubble}>
          <p>{block.text}</p>
          {block.question && <p className={styles.question}>{block.question}</p>}
          {block.options && (
            <Options
              options={block.options}
              disabled={disabled || block.options.some((o) => o.selected)}
              onPick={(option) => onAction({ type: "option", optionId: option.id, label: option.label })}
            />
          )}
        </div>
      );
    case "draft":
      return <DraftCard block={block} disabled={disabled} onAction={onAction} />;
    case "ticket":
      return <TicketCard block={block} />;
    case "ticketList":
      return <TicketList rows={block.rows} selectedCode={block.selectedCode} disabled={disabled || block.selectedCode !== undefined} onAction={onAction} />;
  }
}

export function AgentMessage({
  message,
  disabled,
  onAction,
  thinking = false,
  onInspect,
}: {
  message: AgentMessageView;
  disabled: boolean;
  onAction: OnAction;
  /** Opens the transparency panel for this answer. */
  onInspect?: (message: AgentMessageView) => void;
  /** The agent is still working on this message. */
  thinking?: boolean;
}) {
  return (
    <div className={styles.agent}>
      <div className={styles.statusLine}>
        <span className={styles.who}>Nexo Assist</span>
        {message.steps.map((step, index) => (
          <span key={index} className={styles.step} title={step.detail}>
            <Check size={12} aria-hidden />
            {step.label}
          </span>
        ))}
        {thinking && (
          <span className={styles.step}>
            <Loader2 size={12} className={styles.spin} aria-hidden />
            pensando…
          </span>
        )}
        {onInspect && (message.decision || message.steps.length > 0) && (
          <button type="button" className={styles.inspect} onClick={() => onInspect(message)} aria-label="Ver como o Nexo decidiu">
            <Info size={12} aria-hidden />
            detalhes
          </button>
        )}
      </div>
      {message.blocks.map((block, index) => (
        <Block key={index} block={block} disabled={disabled} onAction={onAction} />
      ))}
    </div>
  );
}

/** A person from the support team answering in the conversation. */
export function AnalystMessage({ message }: { message: AnalystMessageView }) {
  return (
    <div className={styles.agent}>
      <div className={styles.statusLine}>
        <span className={styles.who}>{message.author}</span>
        <span className={styles.step}>{message.team}</span>
      </div>
      <div className={`${styles.agentBubble} ${styles.analystBubble}`}>
        <p>{message.text}</p>
      </div>
    </div>
  );
}

const SYSTEM_ICONS = { transfer: ArrowRightLeft, takeover: Headset, return: Bot, close: CircleCheckBig } as const;

/** A line of the timeline: transfers, takeovers. */
export function SystemLine({ message }: { message: SystemMessageView }) {
  const Icon = SYSTEM_ICONS[message.icon];
  return (
    <div className={styles.systemLine}>
      <span className={styles.systemRule} />
      <span className={styles.systemText}>
        <Icon size={13} aria-hidden />
        {message.text}
        {message.at ? ` · ${formatClock(message.at)}` : ""}
      </span>
      <span className={styles.systemRule} />
    </div>
  );
}
