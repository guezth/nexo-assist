import { FilePlus, Ticket } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EmployeeShell } from "@/components/employee-shell";
import { can } from "@/domain/access";
import { getSession } from "@/server/auth/session";
import { listMyTickets } from "./actions";
import styles from "./chamados.module.css";

export const metadata = { title: "Meus chamados" };

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function priorityLabel(p: string) {
  switch (p) {
    case "critical": return "Crítica";
    case "high": return "Alta";
    case "medium": return "Média";
    case "low": return "Baixa";
    default: return p;
  }
}

function statusLabel(s: string) {
  switch (s) {
    case "open": return "Aberto";
    case "in_progress": return "Em andamento";
    case "waiting_analyst": return "Aguardando analista";
    case "in_attendance": return "Em atendimento";
    case "approved": return "Aprovado";
    case "resolved": return "Resolvido";
    default: return s;
  }
}

async function ChamadosList() {
  const user = await getSession();
  if (!user || !can(user.accessLevel, "chat")) redirect("/login");

  const items = await listMyTickets();

  return (
    <EmployeeShell user={user} active="ticket" title="Meus chamados">
      <div className={styles.container}>
        <div className={styles.header}>
          <Ticket size={16} aria-hidden />
          <span>{items.length} chamado{items.length !== 1 ? "s" : ""}</span>
          <Link href="/chamados/novo" className={styles.newButton}>
            <FilePlus size={14} aria-hidden />
            Novo chamado
          </Link>
        </div>

        {items.length === 0 ? (
          <div className={styles.empty}>
            <p>Você ainda não abriu nenhum chamado.</p>
            <Link href="/chamados/novo" className={styles.emptyAction}>Abrir primeiro chamado</Link>
          </div>
        ) : (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id} className={styles.item}>
                <div className={styles.row}>
                  <span className={styles.code}>{item.code}</span>
                  <span className={`${styles.badge} ${styles[`priority_${item.priority}`]}`}>
                    {priorityLabel(item.priority)}
                  </span>
                  <span className={`${styles.badge} ${styles[`status_${item.status}`]}`}>
                    {statusLabel(item.status)}
                  </span>
                  <span className={styles.time}>{formatDate(item.updatedAt)}</span>
                </div>
                <p className={styles.title}>{item.title}</p>
                <div className={styles.meta}>
                  <span className={styles.category}>{item.category}</span>
                  <span className={styles.type}>{item.type === "INC" ? "Incidente" : "Requisição"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </EmployeeShell>
  );
}

export default function ChamadosPage() {
  return (
    <Suspense fallback={null}>
      <ChamadosList />
    </Suspense>
  );
}
