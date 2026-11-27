"use client";

import { useRouter } from "next/navigation";
import { TicketForm } from "@/components/chat/ticket-form";
import { useState } from "react";
import styles from "./novo-chamado.module.css";

export function NovoChamadoClient() {
  const router = useRouter();
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  return (
    <div className={styles.page}>
      {createdCode ? (
        <div className={styles.successCard}>
          <h2 className={styles.successTitle}>Chamado aberto com sucesso!</h2>
          <p className={styles.successCode}>
            Seu chamado é <strong>{createdCode}</strong>
          </p>
          <div className={styles.successActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => router.push("/historico")}
            >
              Ver histórico
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                setCreatedCode(null);
                router.refresh();
              }}
            >
              Abrir outro
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.card}>
          <TicketForm
            onCreated={(code) => setCreatedCode(code)}
          />
        </div>
      )}
    </div>
  );
}
