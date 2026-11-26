import { History } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmployeeShell } from "@/components/employee-shell";
import { getSession } from "@/server/auth/session";
import { listHistory } from "./actions";
import styles from "./historico.module.css";

export const metadata = { title: "Histórico de atendimentos" };

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function HistoricoPage() {
  const user = await getSession();
  if (!user || user.role !== "employee") redirect("/login");

  const items = await listHistory();

  return (
    <EmployeeShell user={user} active="history" title="Histórico de atendimentos">
      <div className={styles.container}>
        <div className={styles.header}>
          <History size={16} aria-hidden />
          <span>{items.length} atendimento{items.length !== 1 ? "s" : ""}</span>
          <Link href="/chat" className={styles.newButton}>Novo atendimento</Link>
        </div>

        {items.length === 0 ? (
          <p className={styles.empty}>Você ainda não iniciou nenhum atendimento.</p>
        ) : (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id} className={styles.item}>
                <div className={styles.row}>
                  <span className={`${styles.badge} ${item.status === "aberta" ? styles.badgeOpen : styles.badgeClosed}`}>
                    {item.status === "aberta" ? (item.mode === "analyst" ? "Com analista" : "Com o agent") : "Encerrada"}
                  </span>
                  <span className={styles.time}>{formatDate(item.updatedAt)}</span>
                </div>
                <p className={styles.preview}>{item.preview ?? "Sem mensagens"}</p>
                {item.ticketCode && <span className={styles.ticket}>Chamado {item.ticketCode}</span>}
                <div className={styles.actions}>
                  {item.status === "aberta" ? (
                    <Link href={`/chat?conversation=${item.id}`} className={styles.action}>Continuar</Link>
                  ) : (
                    <Link href={`/chat?conversation=${item.id}`} className={styles.action}>Ver conversa</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </EmployeeShell>
  );
}
