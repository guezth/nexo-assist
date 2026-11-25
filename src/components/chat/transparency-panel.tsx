"use client";

import { Bot, Check, Cpu, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { AgentMessageView } from "@/domain/chat";
import styles from "./chat.module.css";

const SOURCE_LABEL = {
  main: "Modelo principal",
  fast: "Modelo leve",
  code: "Regra do sistema (sem modelo)",
} as const;

function confidenceLabel(confidence: number): { label: string; tone: "high" | "mid" | "low" } {
  if (confidence >= 0.8) return { label: "alta", tone: "high" };
  if (confidence >= 0.6) return { label: "média", tone: "mid" };
  return { label: "baixa: nesse caso o agent transfere para um analista", tone: "low" };
}

/** Side panel with what the agent understood, did, how sure it was and why, for one answer. */
export function TransparencyPanel({ message, onClose }: { message: AgentMessageView; onClose: () => void }) {
  const { decision, steps } = message;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const confidence = decision ? confidenceLabel(decision.confidence) : null;
  const percent = decision ? Math.round(decision.confidence * 100) : 0;

  return (
    <aside className={styles.inspector} aria-label="Como o Nexo decidiu">
      <header className={styles.inspectorHeader}>
        <div className={styles.inspectorTitle}>
          <span className={styles.inspectorName}>Como o Nexo decidiu</span>
          <span className={styles.inspectorMeta}>Esta resposta, passo a passo</span>
        </div>
        <button ref={closeRef} type="button" className={styles.inspectorClose} onClick={onClose} aria-label="Fechar painel">
          <X size={18} aria-hidden />
        </button>
      </header>

      <div className={styles.inspectorBody}>
        {decision && confidence ? (
          <>
            <section className={styles.inspectorGroup}>
              <h3>O que entendi</h3>
              <p>{decision.understood}</p>
            </section>
            <section className={styles.inspectorGroup}>
              <h3>O que fiz</h3>
              <p>{decision.action}</p>
            </section>
            <section className={styles.inspectorGroup}>
              <h3>Com que segurança</h3>
              <div className={styles.confidence}>
                <div className={styles.confidenceBar} role="img" aria-label={`Confiança de ${percent}%`}>
                  <span className={`${styles.confidenceFill} ${styles[`confidence-${confidence.tone}`]}`} style={{ width: `${percent}%` }} />
                </div>
                <span className={styles.confidenceValue}>{percent}%</span>
              </div>
              <p className={styles.inspectorNote}>Confiança {confidence.label}</p>
            </section>
            <section className={styles.inspectorGroup}>
              <h3>Por quê</h3>
              <p>{decision.reason}</p>
            </section>
            {decision.source && (
              <section className={styles.inspectorGroup}>
                <h3>Quem decidiu</h3>
                <p className={styles.source}>
                  {decision.source === "code" ? <Cpu size={14} aria-hidden /> : <Bot size={14} aria-hidden />}
                  {SOURCE_LABEL[decision.source]}
                  {decision.model && <span className={styles.modelId}>{decision.model}</span>}
                </p>
              </section>
            )}
          </>
        ) : (
          <p className={styles.inspectorNote}>Esta resposta não tem o registro da decisão, só os passos abaixo.</p>
        )}

        {message.metrics && (
          <section className={styles.inspectorGroup}>
            <h3>Métricas do turno</h3>
            <p className={styles.inspectorNote}>
              {message.metrics.durationMs !== undefined && `Latência: ${message.metrics.durationMs} ms. `}
              {message.metrics.model && message.metrics.modelId && (
                <>
                  Modelo: {message.metrics.model === "main" ? "principal" : "leve"} <span className={styles.modelId}>{message.metrics.modelId}</span> ·{" "}
                </>
              )}
              {message.metrics.steps !== undefined && `${message.metrics.steps} passos. `}
              {message.metrics.costUsd !== undefined && `Custo estimado: ${message.metrics.costUsd.toFixed(6)} USD.`}
            </p>
          </section>
        )}

        <section className={styles.inspectorGroup}>
          <h3>O que consultei e fiz</h3>
          {steps.length === 0 ? (
            <p className={styles.inspectorNote}>Nenhuma consulta: respondi com o que já estava na conversa.</p>
          ) : (
            <ol className={styles.stepList}>
              {steps.map((step, index) => (
                <li key={index}>
                  <Check size={13} aria-hidden />
                  <div>
                    <span className={styles.stepLabel}>{step.label}</span>
                    {step.detail && <span className={styles.stepDetail}>{step.detail}</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </aside>
  );
}
