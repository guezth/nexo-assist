import { ChevronRight, FilePlus, History, LogOut, MessageSquare, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/login/actions";
import type { SessionUser } from "@/server/auth/users";
import styles from "./employee-shell.module.css";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

export function EmployeeShell({
  user,
  active,
  title,
  topBarRight,
  children,
}: {
  user: SessionUser;
  active: "chat" | "history" | "profile" | "ticket";
  title: string;
  topBarRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <svg className={styles.logoMark} viewBox="0 0 28 28" aria-hidden>
            <path
              transform="translate(1.806 3.6821)"
              fill="#037AF6"
              d="M21.763 0.24493l-3.374 1.687c-0.623 0.308-0.973 0.903-0.973 1.631l0 6.293-11.193-9.429c-0.623-0.469-1.372-0.553-2.03-0.245l-3.185 1.631c-0.651 0.322-1.008 0.924-1.008 1.673l0 15.218c0 1.477 1.526 2.289 2.716 1.785l3.073-1.617c0.693-0.322 1.057-0.952 1.057-1.722l0-7.7 11.732 10.591c0.602 0.546 1.421 0.679 2.086 0.364l2.786-1.505c0.602-0.315 0.938-0.931 0.938-1.68l0-15.288c0-1.463-1.505-2.275-2.625-1.687z"
            />
          </svg>
          <span className={styles.logoName}>Nexo Assist</span>
        </div>

        <nav className={styles.nav} aria-label="Principal">
          <Link
            href="/chat"
            className={`${styles.navItem} ${active === "chat" ? styles.navItemActive : ""}`}
            aria-current={active === "chat" ? "page" : undefined}
          >
            <MessageSquare size={16} aria-hidden />
            Atendimento
          </Link>
          <Link
            href="/chamados/novo"
            className={`${styles.navItem} ${active === "ticket" ? styles.navItemActive : ""}`}
            aria-current={active === "ticket" ? "page" : undefined}
          >
            <FilePlus size={16} aria-hidden />
            Chamados
          </Link>
          <Link
            href="/historico"
            className={`${styles.navItem} ${active === "history" ? styles.navItemActive : ""}`}
            aria-current={active === "history" ? "page" : undefined}
          >
            <History size={16} aria-hidden />
            Histórico
          </Link>
          <Link
            href="/perfil"
            className={`${styles.navItem} ${active === "profile" ? styles.navItemActive : ""}`}
            aria-current={active === "profile" ? "page" : undefined}
          >
            <UserRound size={16} aria-hidden />
            Meu perfil
          </Link>
        </nav>

        <div className={styles.spacer} />

        <div className={styles.user}>
          <div className={styles.avatar} aria-hidden>
            {initialsOf(user.name)}
          </div>
          <div className={styles.userText}>
            <span className={styles.userName}>{user.name}</span>
            <span className={styles.userEmail}>{user.email}</span>
          </div>
        </div>
        <form action={logoutAction}>
          <button type="submit" className={`${styles.navItem} ${styles.signOut}`}>
            <LogOut size={16} aria-hidden />
            Sair
          </button>
        </form>
      </aside>

      <div className={styles.main}>
        <header className={styles.topBar}>
          <div className={styles.breadcrumb}>
            <span>Service desk de TI</span>
            <ChevronRight size={14} aria-hidden />
            <span className={styles.here}>{title}</span>
          </div>
          {topBarRight}
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
