"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { createTicketAction } from "@/app/chat/actions";
import { TICKET_CATEGORIES, type AffectedScope, type Priority, type TicketCategory, type TicketType } from "@/domain/types";
import styles from "./ticket-form.module.css";

export function TicketForm({ onCreated, onClose }: { onCreated: (code: string) => void; onClose?: () => void }) {
  const [type, setType] = useState<TicketType>("INC");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TicketCategory>("Hardware");
  const [priority, setPriority] = useState<Priority>("medium");
  const [affected, setAffected] = useState<AffectedScope>("self");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await createTicketAction(type, title, description, category, priority, affected);
    setPending(false);
    if (result.ok) {
      onCreated(result.code);
      setTitle("");
      setDescription("");
    } else {
      setError(result.error);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <span className={styles.title}>Novo chamado</span>
          {onClose && (
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar formulário">
              <X size={16} />
            </button>
          )}
        </div>
        <span className={styles.hint}>Abra diretamente, sem esperar o agente.</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Tipo</label>
        <div className={styles.row}>
          {(["INC", "REQ"] as TicketType[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.pill} ${type === t ? styles.pillActive : ""}`}
              onClick={() => setType(t)}
            >
              {t === "INC" ? "Incidente" : "Requisição"}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Título</label>
        <input
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Notebook não liga"
          maxLength={200}
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Descrição</label>
        <textarea
          className={styles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva o problema com o máximo de detalhes..."
          rows={4}
          maxLength={2000}
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Categoria</label>
        <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)}>
          {TICKET_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Prioridade</label>
        <div className={styles.row}>
          {([
            { value: "low", label: "Baixa" },
            { value: "medium", label: "Média" },
            { value: "high", label: "Alta" },
            { value: "critical", label: "Crítica" },
          ] as { value: Priority; label: string }[]).map((p) => (
            <button
              key={p.value}
              type="button"
              className={`${styles.pill} ${priority === p.value ? styles.pillActive : ""}`}
              onClick={() => setPriority(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Quem é afetado?</label>
        <div className={styles.row}>
          {([
            { value: "self", label: "Só eu" },
            { value: "team", label: "Minha equipe" },
            { value: "company", label: "A empresa" },
          ] as { value: AffectedScope; label: string }[]).map((a) => (
            <button
              key={a.value}
              type="button"
              className={`${styles.pill} ${affected === a.value ? styles.pillActive : ""}`}
              onClick={() => setAffected(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <button type="submit" className={styles.submit} disabled={pending || !title.trim() || !description.trim()}>
        {pending ? "Abrindo..." : "Abrir chamado"}
      </button>
    </form>
  );
}
